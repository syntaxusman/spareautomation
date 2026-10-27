export const MIN_PRICE_PERCENTAGE = -90;
export const MAX_PRICE_PERCENTAGE = 500;

/**
 * Shopify's shop-currency prices are written to two decimal places here. The
 * calculation is integer-based so a preview and the eventual mutation always
 * agree and floating-point tails never reach the Admin API.
 */
export function adjustPriceByPercentage(price: string, percentage: number): string {
  if (!Number.isFinite(percentage)) throw new Error("Percentage must be a finite number.");
  if (percentage < MIN_PRICE_PERCENTAGE || percentage > MAX_PRICE_PERCENTAGE) {
    throw new Error(
      `Percentage must be between ${MIN_PRICE_PERCENTAGE}% and ${MAX_PRICE_PERCENTAGE}%.`,
    );
  }

  const amount = Number(price);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Price must be zero or greater.");

  const pennies = Math.round(amount * 100);
  const basisPoints = Math.round(percentage * 100);
  const adjustedPennies = Math.round((pennies * (10_000 + basisPoints)) / 10_000);
  return (Math.max(1, adjustedPennies) / 100).toFixed(2);
}

export function moneyAmount(amount: string, currencyCode: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
  }).format(Number(amount));
}
