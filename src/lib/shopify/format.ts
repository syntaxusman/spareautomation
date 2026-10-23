import type { ShopifyMoney, ShopifyProduct, ShopifyVariant } from "./types";

export const STANDARD_VAT_RATE = 0.2;

export function formatMoney(money: ShopifyMoney) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: money.currencyCode,
  }).format(Number(money.amount));
}

export function addVat(
  money: ShopifyMoney,
  vatRate = STANDARD_VAT_RATE,
): ShopifyMoney {
  return {
    amount: (Number(money.amount) * (1 + vatRate)).toFixed(2),
    currencyCode: money.currencyCode,
  };
}

export function calculateVat(
  money: ShopifyMoney,
  vatRate = STANDARD_VAT_RATE,
): ShopifyMoney {
  return {
    amount: (Number(money.amount) * vatRate).toFixed(2),
    currencyCode: money.currencyCode,
  };
}

export function formatProductPrice(product: Pick<ShopifyProduct, "priceRange">) {
  const min = product.priceRange.minVariantPrice;
  const max = product.priceRange.maxVariantPrice;

  if (!hasPositivePrice(min)) return "Request price";

  if (min.amount === max.amount && min.currencyCode === max.currencyCode) {
    return formatMoney(min);
  }

  return `From ${formatMoney(min)}`;
}

export function hasPositivePrice(money: ShopifyMoney | null | undefined): boolean {
  if (!money) return false;
  const amount = Number(money.amount);
  return Number.isFinite(amount) && amount > 0;
}

export function isVariantPurchasable(
  variant: Pick<ShopifyVariant, "availableForSale" | "price"> | null | undefined,
): boolean {
  return Boolean(variant?.availableForSale && hasPositivePrice(variant.price));
}

export function getProductQualityIssues(
  product: Pick<ShopifyProduct, "featuredImage" | "priceRange" | "variants">,
): string[] {
  const issues: string[] = [];
  if (!product.featuredImage) issues.push("missing-image");
  if (!hasPositivePrice(product.priceRange.minVariantPrice)) issues.push("missing-price");
  if (!product.variants.some((variant) => isVariantPurchasable(variant))) {
    issues.push("no-purchasable-variant");
  }
  return issues;
}

export function shopifyImageUrl(url: string, width: number) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("shopify.com")) return url;
    parsed.searchParams.set("width", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}
