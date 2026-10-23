import { expect, test } from "@playwright/test";

import {
  addVat,
  calculateVat,
  formatMoney,
  formatProductPrice,
  getProductQualityIssues,
  hasPositivePrice,
  isVariantPurchasable,
  STANDARD_VAT_RATE,
} from "../../src/lib/shopify/format";

test("adds standard VAT to a Shopify money value", () => {
  const inclusive = addVat({
    amount: "545.00",
    currencyCode: "GBP",
  });

  expect(STANDARD_VAT_RATE).toBe(0.2);
  expect(inclusive).toEqual({
    amount: "654.00",
    currencyCode: "GBP",
  });
  expect(formatMoney(inclusive)).toBe("£654.00");
});

test("calculates the VAT amount separately", () => {
  const vat = calculateVat({
    amount: "545.00",
    currencyCode: "GBP",
  });

  expect(vat).toEqual({
    amount: "109.00",
    currencyCode: "GBP",
  });
});

test("zero prices become an enquiry state instead of a free product", () => {
  const money = { amount: "0.00", currencyCode: "GBP" };
  expect(hasPositivePrice(money)).toBe(false);
  expect(formatProductPrice({ priceRange: { minVariantPrice: money, maxVariantPrice: money } })).toBe(
    "Request price",
  );
  expect(isVariantPurchasable({ availableForSale: true, price: money })).toBe(false);
});

test("catalogue quality checks identify incomplete product records", () => {
  const money = { amount: "0.00", currencyCode: "GBP" };
  expect(
    getProductQualityIssues({
      featuredImage: null,
      priceRange: { minVariantPrice: money, maxVariantPrice: money },
      variants: [{ availableForSale: true, price: money }],
    }),
  ).toEqual(["missing-image", "missing-price", "no-purchasable-variant"]);
});
