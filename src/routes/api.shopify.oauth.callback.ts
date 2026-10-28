import { createFileRoute } from "@tanstack/react-router";

import { getServerConfig } from "@/lib/config.server";
import { ensureOrderInvoiceWebhook } from "@/lib/shopify/commerce.server";
import {
  exchangeShopifyAuthorizationCode,
  isConfiguredShop,
  verifyShopifyOAuthHmac,
} from "@/lib/shopify/oauth.server";

const STATE_COOKIE = "sa_shopify_oauth_state";
const CLEAR_STATE_COOKIE = `${STATE_COOKIE}=; Path=/api/shopify/oauth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function failure(message: string, status = 400) {
  return new Response(message, {
    status,
    headers: { "set-cookie": CLEAR_STATE_COOKIE, "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/shopify/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = url.searchParams;
        const state = params.get("state");
        const expectedState = cookieValue(request, STATE_COOKIE);
        if (!state || !expectedState || state !== expectedState) {
          return failure("The Shopify installation session expired. Start the connection again.");
        }

        const config = getServerConfig();
        if (!config.shopifyClientSecret) return failure("Shopify app credentials are missing.", 503);
        if (!verifyShopifyOAuthHmac(params, config.shopifyClientSecret)) {
          return failure("Shopify callback signature is invalid.", 401);
        }

        const shop = params.get("shop") ?? "";
        const code = params.get("code") ?? "";
        if (params.get("error")) {
          return failure(params.get("error_description") || "Shopify installation was declined.");
        }
        if (!isConfiguredShop(shop) || !code) {
          return failure("Shopify returned an unexpected store or authorization response.", 403);
        }

        try {
          await exchangeShopifyAuthorizationCode(shop, code);
          const destination = new URL("/admin/pricing", config.shopifyAppUrl ?? request.url);
          destination.searchParams.set("shopify", "connected");
          try {
            await ensureOrderInvoiceWebhook();
          } catch (error) {
            destination.searchParams.set("automation", "review");
            console.warn(
              "[shopify-oauth] Admin access connected, but order webhook setup needs review:",
              error instanceof Error ? error.message : error,
            );
          }
          return new Response(null, {
            status: 302,
            headers: {
              location: destination.toString(),
              "set-cookie": CLEAR_STATE_COOKIE,
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Shopify connection failed.";
          return failure(message, 502);
        }
      },
    },
  },
});
