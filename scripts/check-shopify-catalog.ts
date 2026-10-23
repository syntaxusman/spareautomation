type Money = { amount: string; currencyCode: string };
type CatalogProduct = {
  title: string;
  handle: string;
  featuredImage: { url: string } | null;
  priceRange: { minVariantPrice: Money };
  variants: { nodes: Array<{ availableForSale: boolean; price: Money }> };
};

type ProductsResponse = {
  data?: {
    products: {
      nodes: CatalogProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
};

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const privateToken = process.env.SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN;
const publicToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
const token = privateToken || publicToken;
const apiVersion = process.env.SHOPIFY_STOREFRONT_API_VERSION ?? "2026-01";

if (!domain || !token) {
  throw new Error("Catalogue quality check requires Shopify Storefront domain and token variables.");
}

const query = `#graphql
  query CatalogueQuality($after: String) {
    products(first: 100, after: $after, sortKey: TITLE) {
      nodes {
        title
        handle
        featuredImage { url }
        priceRange { minVariantPrice { amount currencyCode } }
        variants(first: 100) { nodes { availableForSale price { amount currencyCode } } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const products: CatalogProduct[] = [];
let after: string | null = null;

do {
  const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(privateToken
        ? { "Shopify-Storefront-Private-Token": privateToken }
        : { "X-Shopify-Storefront-Access-Token": token }),
    },
    body: JSON.stringify({ query, variables: { after } }),
  });
  const payload = (await response.json()) as ProductsResponse;
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(
      payload.errors?.map((error) => error.message).join("; ") ||
        `Catalogue request failed with ${response.status}`,
    );
  }

  products.push(...payload.data.products.nodes);
  after = payload.data.products.pageInfo.hasNextPage
    ? payload.data.products.pageInfo.endCursor
    : null;
} while (after);

const issues = products.flatMap((product) => {
  const productIssues: string[] = [];
  if (!product.featuredImage) productIssues.push("missing primary image");
  if (!(Number(product.priceRange.minVariantPrice.amount) > 0)) {
    productIssues.push("zero or invalid price");
  }
  if (
    !product.variants.nodes.some(
      (variant) => variant.availableForSale && Number(variant.price.amount) > 0,
    )
  ) {
    productIssues.push("no purchasable positive-price variant");
  }
  return productIssues.length
    ? [{ handle: product.handle, title: product.title, issues: productIssues.join(", ") }]
    : [];
});

console.log(`Checked ${products.length} Shopify products.`);
if (issues.length === 0) {
  console.log("Catalogue quality check passed.");
} else {
  console.table(issues);
  console.error(`${issues.length} product(s) must be corrected before publication.`);
  process.exitCode = 1;
}
