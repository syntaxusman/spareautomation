import { createHash } from "node:crypto";

import { shopifyAdmin } from "./admin.server";
import { adjustPriceByPercentage } from "./commerce";

type Money = { amount: string; currencyCode: string };

export type AdminQuoteLine = {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: Money;
  total: Money;
};

export type AdminQuote = {
  id: string;
  name: string;
  status: "OPEN" | "INVOICE_SENT" | "COMPLETED";
  email: string | null;
  customerName: string;
  company: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  invoiceSentAt: string | null;
  invoiceUrl: string | null;
  total: Money;
  lines: AdminQuoteLine[];
};

type DraftOrderNode = {
  id: string;
  name: string;
  status: AdminQuote["status"];
  email: string | null;
  note2: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  invoiceSentAt: string | null;
  invoiceUrl: string | null;
  totalPriceSet: { shopMoney: Money };
  customer: { displayName: string; defaultAddress: { company: string | null } | null } | null;
  customAttributes: Array<{ key: string; value: string | null }>;
  lineItems: {
    nodes: Array<{
      name: string;
      sku: string | null;
      quantity: number;
      originalUnitPriceSet: { shopMoney: Money };
      originalTotalSet: { shopMoney: Money };
    }>;
  };
};

export async function listAdminQuotes(search = ""): Promise<AdminQuote[]> {
  const query = search.trim() || undefined;
  const result = await shopifyAdmin<{
    draftOrders: { nodes: DraftOrderNode[] };
  }>(
    `#graphql
      query AdminQuotes($query: String) {
        draftOrders(first: 100, reverse: true, sortKey: UPDATED_AT, query: $query) {
          nodes {
            id
            name
            status
            email
            note2
            tags
            createdAt
            updatedAt
            invoiceSentAt
            invoiceUrl
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { displayName defaultAddress { company } }
            customAttributes { key value }
            lineItems(first: 50) {
              nodes {
                name
                sku
                quantity
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                originalTotalSet { shopMoney { amount currencyCode } }
              }
            }
          }
        }
      }
    `,
    { query },
  );

  return result.draftOrders.nodes.map((draft) => {
    const firstName = draft.customAttributes.find((item) => item.key === "First name")?.value ?? "";
    const lastName = draft.customAttributes.find((item) => item.key === "Last name")?.value ?? "";
    const company =
      draft.customAttributes.find((item) => item.key === "Company")?.value ??
      draft.customer?.defaultAddress?.company ??
      "";
    return {
      id: draft.id,
      name: draft.name,
      status: draft.status,
      email: draft.email,
      customerName: draft.customer?.displayName ?? `${firstName} ${lastName}`.trim(),
      company,
      note: draft.note2 ?? "",
      tags: draft.tags,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      invoiceSentAt: draft.invoiceSentAt,
      invoiceUrl: draft.invoiceUrl,
      total: draft.totalPriceSet.shopMoney,
      lines: draft.lineItems.nodes.map((line) => ({
        name: line.name,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.originalUnitPriceSet.shopMoney,
        total: line.originalTotalSet.shopMoney,
      })),
    };
  });
}

export async function sendAdminQuoteEmail(input: {
  id: string;
  to: string;
  subject: string;
  message: string;
}) {
  const result = await shopifyAdmin<{
    draftOrderInvoiceSend: {
      draftOrder: { id: string; name: string; invoiceSentAt: string | null } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    `#graphql
      mutation SendBrandedQuote($id: ID!, $email: EmailInput!) {
        draftOrderInvoiceSend(id: $id, email: $email) {
          draftOrder { id name invoiceSentAt }
          userErrors { field message }
        }
      }
    `,
    {
      id: input.id,
      email: {
        to: input.to,
        subject: input.subject,
        customMessage: input.message,
      },
    },
  );
  const errors = result.draftOrderInvoiceSend.userErrors;
  if (errors.length || !result.draftOrderInvoiceSend.draftOrder) {
    throw new Error(
      errors.map((item) => item.message).join("; ") || "Shopify did not send the quote.",
    );
  }
  return result.draftOrderInvoiceSend.draftOrder;
}

export async function sendOrderInvoiceEmail(input: {
  orderId: string;
  orderName: string;
  email: string;
}) {
  const result = await shopifyAdmin<{
    orderInvoiceSend: {
      order: { id: string; name: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    `#graphql
      mutation SendAutomaticOrderInvoice($orderId: ID!, $email: EmailInput!) {
        orderInvoiceSend(id: $orderId, email: $email) {
          order { id name }
          userErrors { message }
        }
      }
    `,
    {
      orderId: input.orderId,
      email: {
        to: input.email,
        subject: `Invoice ${input.orderName} | Spares Automation`,
        customMessage:
          "Thank you for your order. Your itemised invoice is included below for your records.",
      },
    },
  );
  const errors = result.orderInvoiceSend.userErrors;
  if (errors.length || !result.orderInvoiceSend.order) {
    throw new Error(
      errors.map((item) => item.message).join("; ") || "Shopify did not send the invoice.",
    );
  }
  return result.orderInvoiceSend.order;
}

type PricingVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
};

type PricingProduct = {
  id: string;
  title: string;
  status: string;
  variants: PricingVariant[];
};

export type PricingProductOption = {
  id: string;
  title: string;
  status: string;
  vendor: string;
  productType: string;
};

export type PricePreviewItem = PricingVariant & {
  productId: string;
  productTitle: string;
  newPrice: string;
  currencyCode: string;
};

export type PricePreview = {
  productIds: string[];
  percentage: number;
  productCount: number;
  variantCount: number;
  skippedZeroPrices: number;
  currencyCode: string;
  fingerprint: string;
  items: PricePreviewItem[];
};

const MAX_PRICE_VARIANTS = 5_000;
const MAX_PRICING_PRODUCTS = 10_000;

export async function listProductsForPriceSelection(): Promise<PricingProductOption[]> {
  const products: PricingProductOption[] = [];
  let after: string | undefined;

  do {
    const result = await shopifyAdmin<{
      products: {
        nodes: PricingProductOption[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(
      `#graphql
        query ProductsForPriceSelection($after: String) {
          products(first: 250, after: $after, sortKey: TITLE) {
            nodes { id title status vendor productType }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
      { after },
    );

    products.push(...result.products.nodes);
    if (products.length > MAX_PRICING_PRODUCTS) {
      throw new Error(
        `The store has more than ${MAX_PRICING_PRODUCTS.toLocaleString("en-GB")} products. Contact the developer to raise the catalogue selection limit.`,
      );
    }
    after = result.products.pageInfo.hasNextPage
      ? (result.products.pageInfo.endCursor ?? undefined)
      : undefined;
  } while (after);

  return products;
}

async function getRemainingVariants(productId: string, after: string): Promise<PricingVariant[]> {
  const variants: PricingVariant[] = [];
  let cursor: string | undefined = after;
  while (cursor) {
    const result: {
      product: {
        variants: {
          nodes: PricingVariant[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    } = await shopifyAdmin(
      `#graphql
        query MorePricingVariants($id: ID!, $after: String!) {
          product(id: $id) {
            variants(first: 250, after: $after) {
              nodes { id title sku price }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `,
      { id: productId, after: cursor },
    );
    if (!result.product) throw new Error("A Shopify product disappeared while prices were loaded.");
    variants.push(...result.product.variants.nodes);
    cursor = result.product.variants.pageInfo.hasNextPage
      ? (result.product.variants.pageInfo.endCursor ?? undefined)
      : undefined;
  }
  return variants;
}

async function loadPricingProductsByIds(
  productIds: string[],
): Promise<{ products: PricingProduct[]; currencyCode: string }> {
  const products: PricingProduct[] = [];
  let currencyCode = "GBP";
  let variantCount = 0;

  for (let offset = 0; offset < productIds.length; offset += 250) {
    const ids = productIds.slice(offset, offset + 250);
    const result = await shopifyAdmin<{
      shop: { currencyCode: string };
      nodes: Array<{
        id: string;
        title: string;
        status: string;
        variants: {
          nodes: PricingVariant[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null>;
    }>(
      `#graphql
        query SelectedProductsForPriceUpdate($ids: [ID!]!) {
          shop { currencyCode }
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              status
              variants(first: 250) {
                nodes { id title sku price }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }
      `,
      { ids },
    );
    currencyCode = result.shop.currencyCode;

    for (const product of result.nodes) {
      if (!product) continue;
      const variants = [...product.variants.nodes];
      if (product.variants.pageInfo.hasNextPage && product.variants.pageInfo.endCursor) {
        variants.push(
          ...(await getRemainingVariants(product.id, product.variants.pageInfo.endCursor)),
        );
      }
      products.push({ id: product.id, title: product.title, status: product.status, variants });
      variantCount += variants.length;
      if (variantCount > MAX_PRICE_VARIANTS) {
        throw new Error(
          `The selected products exceed the ${MAX_PRICE_VARIANTS.toLocaleString("en-GB")} variant safety limit. Select fewer products and run them in batches.`,
        );
      }
    }
  }

  products.sort((a, b) => a.title.localeCompare(b.title));
  return { products, currencyCode };
}

export async function buildPricePreview(
  productIds: string[],
  percentage: number,
): Promise<PricePreview> {
  const uniqueProductIds = [...new Set(productIds)].sort();
  const { products, currencyCode } = await loadPricingProductsByIds(uniqueProductIds);
  if (products.length !== uniqueProductIds.length) {
    throw new Error(
      "One or more selected Shopify products are no longer available. Reload the product list and select again.",
    );
  }
  const items: PricePreviewItem[] = [];
  let skippedZeroPrices = 0;

  for (const product of products) {
    for (const variant of product.variants) {
      if (Number(variant.price) <= 0) {
        skippedZeroPrices += 1;
        continue;
      }
      items.push({
        ...variant,
        productId: product.id,
        productTitle: product.title,
        newPrice: adjustPriceByPercentage(variant.price, percentage),
        currencyCode,
      });
    }
  }

  return {
    productIds: uniqueProductIds,
    percentage,
    productCount: products.length,
    variantCount: items.length,
    skippedZeroPrices,
    currencyCode,
    fingerprint: createHash("sha256")
      .update(items.map((item) => `${item.id}:${item.price}:${item.newPrice}`).join("|"))
      .digest("hex"),
    items,
  };
}

export async function applyPricePreview(preview: PricePreview) {
  const groups = new Map<string, PricePreviewItem[]>();
  for (const item of preview.items) {
    const group = groups.get(item.productId) ?? [];
    group.push(item);
    groups.set(item.productId, group);
  }

  let updatedVariants = 0;
  for (const [productId, variants] of groups) {
    for (let offset = 0; offset < variants.length; offset += 250) {
      const batch = variants.slice(offset, offset + 250);
      const result = await shopifyAdmin<{
        productVariantsBulkUpdate: {
          productVariants: Array<{ id: string; price: string }> | null;
          userErrors: Array<{ field: string[] | null; message: string }>;
        };
      }>(
        `#graphql
          mutation ApplyPercentagePrices($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(
              productId: $productId
              variants: $variants
              allowPartialUpdates: false
            ) {
              productVariants { id price }
              userErrors { field message }
            }
          }
        `,
        {
          productId,
          variants: batch.map((item) => ({ id: item.id, price: item.newPrice })),
        },
      );
      const errors = result.productVariantsBulkUpdate.userErrors;
      if (errors.length) {
        throw new Error(
          `Shopify stopped after ${updatedVariants} variants: ${errors.map((item) => item.message).join("; ")}`,
        );
      }
      updatedVariants += result.productVariantsBulkUpdate.productVariants?.length ?? batch.length;
    }
  }
  return { updatedVariants, updatedProducts: groups.size };
}
