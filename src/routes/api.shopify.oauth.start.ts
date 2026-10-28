import { createFileRoute } from "@tanstack/react-router";

import { requireAdminRole } from "@/lib/admin/auth.server";
import {
  buildShopifyAuthorizationUrl,
  createShopifyOAuthState,
} from "@/lib/shopify/oauth.server";

const STATE_COOKIE = "sa_shopify_oauth_state";

export const Route = createFileRoute("/api/shopify/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminRole();
        } catch {
          const loginUrl = new URL("/admin/login", request.url);
          loginUrl.searchParams.set("redirect", "/admin/pricing");
          return Response.redirect(loginUrl, 302);
        }

        try {
          const state = createShopifyOAuthState();
          const authorizationUrl = buildShopifyAuthorizationUrl(state);
          return new Response(null, {
            status: 302,
            headers: {
              location: authorizationUrl,
              "set-cookie": `${STATE_COOKIE}=${state}; Path=/api/shopify/oauth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Shopify connection failed.";
          return new Response(message, { status: 503 });
        }
      },
    },
  },
});
