import { CART_FRAGMENT, PRODUCT_CARD_FRAGMENT, PRODUCT_DETAIL_FRAGMENT } from "./fragments";
import { shopifyStorefront } from "./storefront.server";
import type { ShopifyCart, ShopifyCollection, ShopifyProduct } from "./types";
import { getActiveShopifyCountryCode } from "./markets.server";

type Connection<T> = {
  nodes: T[];
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

type ProductConnectionShape = Omit<ShopifyProduct, "variants" | "images" | "technicalDetails"> & {
  variants: Connection<ShopifyProduct["variants"][number]>;
  images?: Connection<ShopifyProduct["images"][number]>;
  metafields?: Array<ProductMetafieldShape | null>;
};

type MetafieldReferenceShape = {
  __typename?: string;
  id?: string;
  url?: string | null;
  alt?: string | null;
  mimeType?: string | null;
  title?: string | null;
  onlineStoreUrl?: string | null;
  image?: { url: string } | null;
  sources?: Array<{ url: string; mimeType?: string | null }> | null;
};

type ProductMetafieldShape = {
  namespace: string;
  key: string;
  value: string;
  type: string;
  reference?: MetafieldReferenceShape | null;
  references?: { nodes: Array<MetafieldReferenceShape | null> } | null;
};

type CollectionConnectionShape = Omit<ShopifyCollection, "products"> & {
  products: Connection<ProductConnectionShape>;
};

type CartConnectionShape = Omit<ShopifyCart, "lines"> & {
  lines: Connection<ShopifyCart["lines"][number]>;
};

type CartUserError = {
  field: string[] | null;
  message: string;
};

type CustomerUserError = {
  code?: string | null;
  field: string[] | null;
  message: string;
};

type CustomerCreateInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  acceptsMarketing?: boolean;
};

type CustomerAccessTokenCreateInput = {
  email: string;
  password: string;
};

function assertCartMutation(cart: ShopifyCart | null, errors: CartUserError[] = []) {
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join("; "));
  }
  if (!cart) {
    throw new Error("The cart could not be loaded.");
  }
  return cart;
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function fileNameFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    const { pathname } = new URL(value);
    return decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

function referenceUrl(reference?: MetafieldReferenceShape | null) {
  if (!reference) return null;
  return (
    reference.url ??
    reference.image?.url ??
    reference.sources?.[0]?.url ??
    reference.onlineStoreUrl ??
    null
  );
}

function referenceLabel(reference: MetafieldReferenceShape, url: string) {
  return reference.alt || reference.title || fileNameFromUrl(url);
}

function referenceLink(reference?: MetafieldReferenceShape | null) {
  const url = safeExternalUrl(referenceUrl(reference));
  if (!url || !reference) return null;
  return { label: referenceLabel(reference, url), url };
}

/** Reference-backed metafields (file_reference, list.file_reference, …) carry a GID in
 * `value`; the resolved file lives on `reference` / `references` instead. */
function metafieldReferences(field?: ProductMetafieldShape | null) {
  if (!field) return [];
  const list = (field.references?.nodes ?? []).filter(
    (node): node is MetafieldReferenceShape => Boolean(node),
  );
  if (list.length) return list;
  return field.reference ? [field.reference] : [];
}

function parseResourceLinks(field?: ProductMetafieldShape | null) {
  const references = metafieldReferences(field);
  if (references.length) {
    return references
      .map((reference, index) => {
        const link = referenceLink(reference);
        return link ? { label: link.label || `Resource ${index + 1}`, url: link.url } : null;
      })
      .filter((link): link is { label: string; url: string } => Boolean(link));
  }

  const value = field?.value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values
      .map((item, index) => {
        if (typeof item === "string") {
          const url = safeExternalUrl(item);
          return url ? { label: `Resource ${index + 1}`, url } : null;
        }
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const url = typeof record.url === "string" ? record.url : "";
          const label =
            typeof record.label === "string"
              ? record.label
              : typeof record.name === "string"
                ? record.name
                : `Resource ${index + 1}`;
          const safeUrl = safeExternalUrl(url);
          return safeUrl ? { label, url: safeUrl } : null;
        }
        return null;
      })
      .filter((link): link is { label: string; url: string } => Boolean(link?.url));
  } catch {
    const url = safeExternalUrl(value);
    return url ? [{ label: "Resource", url }] : [];
  }
}

function parseProductResource(field?: ProductMetafieldShape | null) {
  const [reference] = metafieldReferences(field);
  const referenced = referenceLink(reference);
  if (referenced) {
    return { text: referenced.label, url: referenced.url };
  }

  const value = field?.value;
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.url === "string" &&
      typeof parsed.text === "string"
    ) {
      const url = safeExternalUrl(parsed.url);
      return url ? { text: parsed.text, url } : null;
    }
  } catch {
    // Not JSON: fall through to the plain-URL metafield types (url, single_line_text_field).
  }

  const url = safeExternalUrl(value);
  return url ? { text: fileNameFromUrl(url), url } : null;
}

function normalizeTechnicalDetails(product: ProductConnectionShape) {
  const metafields = new Map(
    (product.metafields ?? [])
      .filter((field): field is ProductMetafieldShape => Boolean(field))
      .map((field) => [field.key, field] as const),
  );

  return {
    brand: metafields.get("brand")?.value ?? product.vendor ?? null,
    mpnRange: metafields.get("mpn_range")?.value ?? product.variants.nodes[0]?.sku ?? null,
    setupVideoUrl: safeExternalUrl(metafields.get("setup_video_url")?.value),
    videoGuide: parseProductResource(metafields.get("video_guide")),
    pdfGuide: parseProductResource(metafields.get("pdf_guide")),
    datasheets: parseResourceLinks(metafields.get("datasheets")),
    manuals: parseResourceLinks(metafields.get("manuals")),
  };
}

function normalizeProduct(product: ProductConnectionShape): ShopifyProduct {
  return {
    ...product,
    variants: product.variants.nodes,
    images: product.images?.nodes ?? [],
    technicalDetails: normalizeTechnicalDetails(product),
  };
}

function normalizeCollection(collection: CollectionConnectionShape): ShopifyCollection {
  return {
    ...collection,
    products: collection.products.nodes.map(normalizeProduct),
  };
}

function normalizeCart(cart: CartConnectionShape): ShopifyCart {
  return {
    ...cart,
    lines: cart.lines.nodes,
  };
}

function assertAndNormalizeCart(cart: CartConnectionShape | null, errors: CartUserError[] = []) {
  return normalizeCart(
    assertCartMutation(
      cart as unknown as ShopifyCart | null,
      errors,
    ) as unknown as CartConnectionShape,
  );
}

export async function getCollectionByHandle(handle: string, first = 24) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    collection: CollectionConnectionShape | null;
  }>(
    `#graphql
      ${PRODUCT_CARD_FRAGMENT}
      query CollectionByHandle($handle: String!, $first: Int!, $country: CountryCode!)
        @inContext(country: $country) {
        collection(handle: $handle) {
          id
          handle
          title
          description
          image {
            url
            altText
            width
            height
          }
          products(first: $first, sortKey: MANUAL) {
            nodes {
              ...ProductCardFields
            }
          }
        }
      }
    `,
    { handle, first, country },
  );

  if (!data.collection) return null;
  return normalizeCollection(data.collection);
}

export async function getProducts(first = 24, query?: string) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    products: Connection<ProductConnectionShape>;
  }>(
    `#graphql
      ${PRODUCT_CARD_FRAGMENT}
      query Products($first: Int!, $query: String, $country: CountryCode!)
        @inContext(country: $country) {
        products(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            ...ProductCardFields
          }
        }
      }
    `,
    { first, query, country },
  );

  return data.products.nodes.map(normalizeProduct);
}

export async function getProductsWithResources(first = 100) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    products: Connection<ProductConnectionShape>;
  }>(
    `#graphql
      ${PRODUCT_DETAIL_FRAGMENT}
      query ProductsWithResources($first: Int!, $country: CountryCode!)
        @inContext(country: $country) {
        products(first: $first, sortKey: TITLE) {
          nodes {
            ...ProductDetailFields
          }
        }
      }
    `,
    { first, country },
  );

  return data.products.nodes.map(normalizeProduct);
}

export async function getProductsPage(first = 48, query?: string, after?: string) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    products: Connection<ProductConnectionShape> & { pageInfo: PageInfo };
  }>(
    `#graphql
      ${PRODUCT_CARD_FRAGMENT}
      query ProductsPage(
        $first: Int!
        $query: String
        $after: String
        $country: CountryCode!
      ) @inContext(country: $country) {
        products(first: $first, query: $query, after: $after, sortKey: CREATED_AT, reverse: true) {
          nodes { ...ProductCardFields }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { first, query, after, country },
  );
  return { products: data.products.nodes.map(normalizeProduct), pageInfo: data.products.pageInfo };
}

export async function getProductByHandle(handle: string) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    product: ProductConnectionShape | null;
  }>(
    `#graphql
      ${PRODUCT_DETAIL_FRAGMENT}
      query ProductByHandle($handle: String!, $country: CountryCode!)
        @inContext(country: $country) {
        product(handle: $handle) {
          ...ProductDetailFields
        }
      }
    `,
    { handle, country },
  );

  return data.product ? normalizeProduct(data.product) : null;
}

export async function getCart(cartId: string) {
  const data = await shopifyStorefront<{ cart: CartConnectionShape | null }>(
    `#graphql
      ${CART_FRAGMENT}
      query Cart($cartId: ID!) {
        cart(id: $cartId) {
          ...CartFields
        }
      }
    `,
    { cartId },
  );

  return data.cart ? normalizeCart(data.cart) : null;
}

export async function createCart(variantId: string, quantity: number) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    cartCreate: {
      cart: CartConnectionShape | null;
      userErrors: CartUserError[];
    };
  }>(
    `#graphql
      ${CART_FRAGMENT}
      mutation CreateCart($variantId: ID!, $quantity: Int!, $country: CountryCode!) {
        cartCreate(
          input: {
            buyerIdentity: { countryCode: $country }
            lines: [{ merchandiseId: $variantId, quantity: $quantity }]
          }
        ) {
          cart {
            ...CartFields
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { variantId, quantity, country },
  );

  return assertAndNormalizeCart(data.cartCreate.cart, data.cartCreate.userErrors);
}

export async function addCartLines(cartId: string, variantId: string, quantity: number) {
  const data = await shopifyStorefront<{
    cartLinesAdd: {
      cart: CartConnectionShape | null;
      userErrors: CartUserError[];
    };
  }>(
    `#graphql
      ${CART_FRAGMENT}
      mutation AddCartLines($cartId: ID!, $variantId: ID!, $quantity: Int!) {
        cartLinesAdd(cartId: $cartId, lines: [{ merchandiseId: $variantId, quantity: $quantity }]) {
          cart {
            ...CartFields
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { cartId, variantId, quantity },
  );

  return assertAndNormalizeCart(data.cartLinesAdd.cart, data.cartLinesAdd.userErrors);
}

export async function updateCartLine(cartId: string, lineId: string, quantity: number) {
  const data = await shopifyStorefront<{
    cartLinesUpdate: {
      cart: CartConnectionShape | null;
      userErrors: CartUserError[];
    };
  }>(
    `#graphql
      ${CART_FRAGMENT}
      mutation UpdateCartLine($cartId: ID!, $lineId: ID!, $quantity: Int!) {
        cartLinesUpdate(cartId: $cartId, lines: [{ id: $lineId, quantity: $quantity }]) {
          cart {
            ...CartFields
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { cartId, lineId, quantity },
  );

  return assertAndNormalizeCart(data.cartLinesUpdate.cart, data.cartLinesUpdate.userErrors);
}

export async function removeCartLine(cartId: string, lineId: string) {
  const data = await shopifyStorefront<{
    cartLinesRemove: {
      cart: CartConnectionShape | null;
      userErrors: CartUserError[];
    };
  }>(
    `#graphql
      ${CART_FRAGMENT}
      mutation RemoveCartLine($cartId: ID!, $lineId: ID!) {
        cartLinesRemove(cartId: $cartId, lineIds: [$lineId]) {
          cart {
            ...CartFields
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { cartId, lineId },
  );

  return assertAndNormalizeCart(data.cartLinesRemove.cart, data.cartLinesRemove.userErrors);
}

export async function createCustomer(input: CustomerCreateInput) {
  const data = await shopifyStorefront<{
    customerCreate: {
      customer: { id: string } | null;
      customerUserErrors: CustomerUserError[];
    };
  }>(
    `#graphql
      mutation CustomerCreate($input: CustomerCreateInput!) {
        customerCreate(input: $input) {
          customer {
            id
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `,
    { input },
  );

  return data.customerCreate;
}

export async function createCustomerAccessToken(input: CustomerAccessTokenCreateInput) {
  const data = await shopifyStorefront<{
    customerAccessTokenCreate: {
      customerAccessToken?: {
        accessToken: string;
        expiresAt: string;
      } | null;
      customerUserErrors: CustomerUserError[];
    };
  }>(
    `#graphql
      mutation CustomerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `,
    { input },
  );

  return data.customerAccessTokenCreate;
}

export async function recoverCustomerPassword(email: string) {
  const data = await shopifyStorefront<{
    customerRecover: { customerUserErrors: CustomerUserError[] };
  }>(
    `#graphql
      mutation CustomerRecover($email: String!) {
        customerRecover(email: $email) {
          customerUserErrors { code field message }
        }
      }
    `,
    { email },
  );
  return data.customerRecover;
}

export async function resetCustomerPassword(
  customerId: string,
  resetToken: string,
  password: string,
) {
  const data = await shopifyStorefront<{
    customerReset: {
      customerAccessToken?: {
        accessToken: string;
        expiresAt: string;
      } | null;
      customerUserErrors: CustomerUserError[];
    };
  }>(
    `#graphql
      mutation CustomerReset($id: ID!, $input: CustomerResetInput!) {
        customerReset(id: $id, input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `,
    {
      id: `gid://shopify/Customer/${customerId}`,
      input: { password, resetToken },
    },
  );

  return data.customerReset;
}

export async function resetCustomerPasswordByUrl(resetUrl: string, password: string) {
  const data = await shopifyStorefront<{
    customerResetByUrl: {
      customerAccessToken?: {
        accessToken: string;
        expiresAt: string;
      } | null;
      customerUserErrors: CustomerUserError[];
    };
  }>(
    `#graphql
      mutation CustomerResetByUrl($resetUrl: URL!, $password: String!) {
        customerResetByUrl(resetUrl: $resetUrl, password: $password) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `,
    { resetUrl, password },
  );

  return data.customerResetByUrl;
}

export async function activateCustomerByUrl(activationUrl: string, password: string) {
  const data = await shopifyStorefront<{
    customerActivateByUrl: {
      customerAccessToken?: {
        accessToken: string;
        expiresAt: string;
      } | null;
      customerUserErrors: CustomerUserError[];
    };
  }>(
    `#graphql
      mutation CustomerActivateByUrl($activationUrl: URL!, $password: String!) {
        customerActivateByUrl(activationUrl: $activationUrl, password: $password) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `,
    { activationUrl, password },
  );

  return data.customerActivateByUrl;
}

export async function activateCustomer(
  customerId: string,
  activationToken: string,
  password: string,
) {
  const data = await shopifyStorefront<{
    customerActivate: {
      customerAccessToken?: {
        accessToken: string;
        expiresAt: string;
      } | null;
      customerUserErrors: CustomerUserError[];
    };
  }>(
    `#graphql
      mutation CustomerActivate($id: ID!, $input: CustomerActivateInput!) {
        customerActivate(id: $id, input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            field
            message
          }
        }
      }
    `,
    {
      id: `gid://shopify/Customer/${customerId}`,
      input: { activationToken, password },
    },
  );

  return data.customerActivate;
}

export async function getCustomer(customerAccessToken: string) {
  const data = await shopifyStorefront<{
    customer?: {
      id: string;
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      tags?: string[];
      defaultAddress?: {
        company?: string | null;
        phone?: string | null;
      } | null;
      companyMetafield?: { value: string } | null;
    } | null;
  }>(
    `#graphql
      query Customer($customerAccessToken: String!) {
        customer(customerAccessToken: $customerAccessToken) {
          id
          displayName
          firstName
          lastName
          email
          phone
          tags
          defaultAddress {
            company
            phone
          }
          companyMetafield: metafield(namespace: "spares_automation", key: "company") {
            value
          }
        }
      }
    `,
    { customerAccessToken },
  );

  return data.customer;
}

export async function getCollectionProductsPage(handle: string, first = 48, after?: string) {
  const country = getActiveShopifyCountryCode();
  const data = await shopifyStorefront<{
    collection: { products: Connection<ProductConnectionShape> & { pageInfo: PageInfo } } | null;
  }>(
    `#graphql
      ${PRODUCT_CARD_FRAGMENT}
      query CollectionProductsPage(
        $handle: String!
        $first: Int!
        $after: String
        $country: CountryCode!
      ) @inContext(country: $country) {
        collection(handle: $handle) {
          products(first: $first, after: $after, sortKey: CREATED) {
            nodes { ...ProductCardFields }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `,
    { handle, first, after, country },
  );

  if (!data.collection) {
    return { products: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }

  return {
    products: data.collection.products.nodes.map(normalizeProduct),
    pageInfo: data.collection.products.pageInfo,
  };
}

export async function getCustomerOrders(customerAccessToken: string) {
  const data = await shopifyStorefront<{
    customer?: {
      orders: Connection<{
        id: string;
        name: string;
        orderNumber: number;
        processedAt: string;
        financialStatus?: string | null;
        fulfillmentStatus: string;
        statusUrl: string;
        totalPrice: { amount: string; currencyCode: string };
        lineItems: Connection<{
          title: string;
          quantity: number;
          variant?: { title: string } | null;
        }>;
      }>;
    } | null;
  }>(
    `#graphql
      query CustomerOrders($customerAccessToken: String!) {
        customer(customerAccessToken: $customerAccessToken) {
          orders(first: 20, reverse: true) {
            nodes {
              id
              name
              orderNumber
              processedAt
              financialStatus
              fulfillmentStatus
              statusUrl
              totalPrice {
                amount
                currencyCode
              }
              lineItems(first: 20) {
                nodes {
                  title
                  quantity
                  variant {
                    title
                  }
                }
              }
            }
          }
        }
      }
    `,
    { customerAccessToken },
  );

  return (data.customer?.orders.nodes ?? []).map((order) => ({
    ...order,
    lineItems: order.lineItems.nodes,
  }));
}
