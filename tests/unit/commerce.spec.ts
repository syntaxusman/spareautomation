import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

import { adjustPriceByPercentage } from "../../src/lib/shopify/commerce";
import { normalizeShopDomain, verifyShopifyWebhook } from "../../src/lib/shopify/webhook.server";
import { normalizeCountryCode } from "../../src/lib/shopify/markets";

test("percentage price adjustments are deterministic and rounded to pennies", () => {
  expect(adjustPriceByPercentage("100.00", 12.5)).toBe("112.50");
  expect(adjustPriceByPercentage("19.99", -10)).toBe("17.99");
  expect(adjustPriceByPercentage("0.01", -90)).toBe("0.01");
});

test("Shopify webhook verification uses the exact raw body", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ id: 123, name: "#1001" });
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  expect(verifyShopifyWebhook(body, signature, secret)).toBe(true);
  expect(verifyShopifyWebhook(`${body}\n`, signature, secret)).toBe(false);
});

test("Shopify domains are normalized before source checks", () => {
  expect(normalizeShopDomain("HTTPS://Example.MyShopify.Com/")).toBe("example.myshopify.com");
});

test("Shopify market country codes are normalized and rejected when malformed", () => {
  expect(normalizeCountryCode(" gb ")).toBe("GB");
  expect(normalizeCountryCode("USA")).toBeNull();
  expect(normalizeCountryCode("1!")).toBeNull();
});
