import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getServerConfig } from "../config.server";
import { saveInstalledAdminAccessToken } from "./admin-installation.server";
import { normalizeShopDomain } from "./webhook.server";

export const SHOPIFY_ADMIN_SCOPES = [
  "read_products",
  "write_products",
  "read_publications",
  "write_publications",
  "read_draft_orders",
  "write_draft_orders",
  "read_orders",
  "write_orders",
  "read_customers",
  "write_customers",
].join(",");

type OAuthTokenResponse = {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export function createShopifyOAuthState() {
  return randomBytes(32).toString("hex");
}

export function shopifyOAuthCallbackUrl() {
  const appUrl = getServerConfig().shopifyAppUrl?.trim();
  if (!appUrl) throw new Error("SHOPIFY_APP_URL is not configured.");
  return new URL("/api/shopify/oauth/callback", appUrl).toString();
}

export function configuredShopDomain() {
  const config = getServerConfig();
  const domain = normalizeShopDomain(
    config.shopifyAdminStoreDomain ?? config.shopifyStoreDomain,
  );
  if (!domain) throw new Error("Shopify Admin store domain is not configured.");
  return domain;
}

export function buildShopifyAuthorizationUrl(state: string) {
  const config = getServerConfig();
  const clientId = config.shopifyClientId?.trim();
  if (!clientId) throw new Error("SHOPIFY_CLIENT_ID is not configured.");

  const url = new URL(`https://${configuredShopDomain()}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SHOPIFY_ADMIN_SCOPES);
  url.searchParams.set("redirect_uri", shopifyOAuthCallbackUrl());
  url.searchParams.set("state", state);
  return url.toString();
}

export function verifyShopifyOAuthHmac(params: URLSearchParams, secret: string) {
  const suppliedHmac = params.get("hmac");
  if (!suppliedHmac || !/^[a-f0-9]{64}$/i.test(suppliedHmac)) return false;

  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return timingSafeEqual(Buffer.from(suppliedHmac, "hex"), Buffer.from(expected, "hex"));
}

export function isConfiguredShop(shop: string) {
  const normalized = normalizeShopDomain(shop);
  if (!normalized) return false;
  const config = getServerConfig();
  return [config.shopifyStoreDomain, config.shopifyAdminStoreDomain]
    .map(normalizeShopDomain)
    .filter(Boolean)
    .includes(normalized);
}

export async function exchangeShopifyAuthorizationCode(shop: string, code: string) {
  const config = getServerConfig();
  const clientId = config.shopifyClientId?.trim();
  const clientSecret = config.shopifyClientSecret?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Shopify app credentials are not configured.");
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const payload = (await response.json()) as OAuthTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || payload.error || "Shopify did not issue an Admin API token.",
    );
  }

  await saveInstalledAdminAccessToken(
    configuredShopDomain(),
    payload.access_token,
    payload.scope ?? "",
  );
  return { shop, scopes: payload.scope ?? "" };
}
