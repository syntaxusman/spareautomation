import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import { verifyShopifyOAuthHmac } from "../../src/lib/shopify/oauth.server";

test("Shopify OAuth callbacks require an exact HMAC signature", () => {
  const secret = "oauth-test-secret";
  const params = new URLSearchParams({
    code: "temporary-code",
    shop: "example.myshopify.com",
    state: "state-value",
    timestamp: "1793130000",
  });
  const message = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));

  expect(verifyShopifyOAuthHmac(params, secret)).toBe(true);
  params.set("code", "tampered-code");
  expect(verifyShopifyOAuthHmac(params, secret)).toBe(false);
});
