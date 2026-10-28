import { expect, test } from "@playwright/test";

import { shopifyAdmin } from "../../src/lib/shopify/admin.server";

test("Admin API exchanges app credentials once and reuses the generated token", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    domain: process.env.SHOPIFY_ADMIN_STORE_DOMAIN,
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
    token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    version: process.env.SHOPIFY_ADMIN_API_VERSION,
  };
  process.env.SHOPIFY_ADMIN_STORE_DOMAIN = "example.myshopify.com";
  process.env.SHOPIFY_STORE_DOMAIN = "example.myshopify.com";
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "";
  process.env.SHOPIFY_CLIENT_ID = "client-id";
  process.env.SHOPIFY_CLIENT_SECRET = "client-secret";
  process.env.SHOPIFY_ADMIN_API_VERSION = "2026-07";

  let tokenRequests = 0;
  let graphRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/admin/oauth/access_token")) {
      tokenRequests += 1;
      expect(String(init?.body)).toContain("grant_type=client_credentials");
      return Response.json({
        access_token: "generated-admin-token",
        expires_in: 86_399,
        scope: "read_products,write_products",
      });
    }

    graphRequests += 1;
    expect(init?.headers).toMatchObject({
      "X-Shopify-Access-Token": "generated-admin-token",
    });
    return Response.json({ data: { shop: { name: "Example" } } });
  };

  try {
    await shopifyAdmin("query { shop { name } }");
    await shopifyAdmin("query { shop { name } }");
    expect(tokenRequests).toBe(1);
    expect(graphRequests).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("SHOPIFY_ADMIN_STORE_DOMAIN", originalEnv.domain);
    restore("SHOPIFY_STORE_DOMAIN", originalEnv.storeDomain);
    restore("SHOPIFY_ADMIN_ACCESS_TOKEN", originalEnv.token);
    restore("SHOPIFY_CLIENT_ID", originalEnv.clientId);
    restore("SHOPIFY_CLIENT_SECRET", originalEnv.clientSecret);
    restore("SHOPIFY_ADMIN_API_VERSION", originalEnv.version);
  }
});
