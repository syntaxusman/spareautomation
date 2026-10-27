import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { getServerConfig } from "@/lib/config.server";
import { getDb } from "@/lib/db/index.server";
import { shopifyWebhookDeliveries } from "@/lib/db/schema";
import { sendOrderInvoiceEmail } from "@/lib/shopify/commerce.server";
import { normalizeShopDomain, verifyShopifyWebhook } from "@/lib/shopify/webhook.server";

type OrderCreatePayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  email?: string | null;
  contact_email?: string | null;
  customer?: { email?: string | null } | null;
};

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1_000;

export const Route = createFileRoute("/api/shopify/orders-create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = getServerConfig();
        if (!config.shopifyWebhookSecret) {
          console.error("[shopify-webhook] SHOPIFY_WEBHOOK_SECRET is not configured.");
          return new Response("Webhook is not configured", { status: 503 });
        }

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_WEBHOOK_BYTES)
          return new Response("Payload too large", { status: 413 });

        const rawBody = await request.text();
        if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }

        if (
          !verifyShopifyWebhook(
            rawBody,
            request.headers.get("x-shopify-hmac-sha256"),
            config.shopifyWebhookSecret,
          )
        ) {
          return new Response("Invalid signature", { status: 401 });
        }

        const topic = request.headers.get("x-shopify-topic")?.toLowerCase();
        const shopDomain = normalizeShopDomain(request.headers.get("x-shopify-shop-domain"));
        const expectedShop = normalizeShopDomain(config.shopifyStoreDomain);
        if (topic !== "orders/create" || !shopDomain || shopDomain !== expectedShop) {
          return new Response("Unexpected webhook source", { status: 403 });
        }

        const webhookId = request.headers.get("x-shopify-webhook-id")?.trim();
        if (!webhookId || webhookId.length > 160) {
          return new Response("Missing webhook id", { status: 400 });
        }

        let payload: OrderCreatePayload;
        try {
          payload = JSON.parse(rawBody) as OrderCreatePayload;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const numericId = payload.id != null ? String(payload.id) : "";
        const orderId =
          payload.admin_graphql_api_id ?? (numericId ? `gid://shopify/Order/${numericId}` : "");
        const orderName = payload.name?.trim() || (numericId ? `#${numericId}` : "Shopify order");
        const email =
          payload.email?.trim() ||
          payload.contact_email?.trim() ||
          payload.customer?.email?.trim() ||
          "";
        if (!orderId.startsWith("gid://shopify/Order/")) {
          return new Response("Missing order id", { status: 400 });
        }

        const db = getDb();
        const [existing] = await db
          .select()
          .from(shopifyWebhookDeliveries)
          .where(eq(shopifyWebhookDeliveries.id, webhookId))
          .limit(1);
        if (existing?.status === "sent" || existing?.status === "skipped") {
          return new Response(null, { status: 204 });
        }
        if (
          existing?.status === "processing" &&
          Date.now() - existing.updatedAt.getTime() < PROCESSING_TIMEOUT_MS
        ) {
          return new Response(null, { status: 202 });
        }

        if (existing) {
          await db
            .update(shopifyWebhookDeliveries)
            .set({ status: "processing", error: null, updatedAt: new Date() })
            .where(eq(shopifyWebhookDeliveries.id, webhookId));
        } else {
          await db.insert(shopifyWebhookDeliveries).values({
            id: webhookId,
            topic,
            shopDomain,
            resourceId: orderId,
          });
        }

        if (!email) {
          await db
            .update(shopifyWebhookDeliveries)
            .set({ status: "skipped", processedAt: new Date(), updatedAt: new Date() })
            .where(eq(shopifyWebhookDeliveries.id, webhookId));
          console.info(`[shopify-webhook] ${orderName} has no customer email; invoice skipped.`);
          return new Response(null, { status: 204 });
        }

        try {
          await sendOrderInvoiceEmail({ orderId, orderName, email });
          await db
            .update(shopifyWebhookDeliveries)
            .set({ status: "sent", processedAt: new Date(), updatedAt: new Date(), error: null })
            .where(eq(shopifyWebhookDeliveries.id, webhookId));
          console.info(`[shopify-webhook] Automatic invoice sent for ${orderName}.`);
          return new Response(null, { status: 204 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown invoice error";
          await db
            .update(shopifyWebhookDeliveries)
            .set({ status: "failed", error: message.slice(0, 2_000), updatedAt: new Date() })
            .where(eq(shopifyWebhookDeliveries.id, webhookId));
          console.error(`[shopify-webhook] Invoice failed for ${orderName}: ${message}`);
          // A non-2xx response asks Shopify to retry. The saved delivery id
          // prevents a successful earlier attempt from being sent twice.
          return new Response("Invoice delivery failed", { status: 500 });
        }
      },
    },
  },
});
