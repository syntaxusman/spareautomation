type AdminResult<T> = { data?: T; errors?: Array<{ message: string }> };

const apply = process.argv.includes("--apply");
const domain = (process.env.SHOPIFY_ADMIN_STORE_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN)?.trim();
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
const version = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-07";
const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/$/, "");

if (!domain || !token || !appUrl) {
  throw new Error(
    "Set SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, and SHOPIFY_APP_URL in .env.",
  );
}
if (!appUrl.startsWith("https://")) throw new Error("SHOPIFY_APP_URL must use HTTPS.");

async function admin<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as AdminResult<T>;
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(
      payload.errors?.map((item) => item.message).join("; ") ||
        `Shopify request failed with ${response.status}.`,
    );
  }
  return payload.data;
}

const uri = `${appUrl}/api/shopify/orders-create`;
const current = await admin<{
  webhookSubscriptions: { nodes: Array<{ id: string; topic: string; uri: string }> };
}>(`#graphql
  query OrderAutomationWebhooks {
    webhookSubscriptions(first: 100) {
      nodes { id topic uri }
    }
  }
`);

const matching = current.webhookSubscriptions.nodes.find(
  (item) => item.topic === "ORDERS_CREATE" && item.uri === uri,
);
if (matching) {
  console.info(`Order invoice webhook is already registered: ${matching.uri}`);
} else if (!apply) {
  console.info(`Preview: register ORDERS_CREATE -> ${uri}`);
  console.info("Run again with --apply to create the Shopify webhook subscription.");
} else {
  const result = await admin<{
    webhookSubscriptionCreate: {
      webhookSubscription: { id: string; topic: string; uri: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    `#graphql
      mutation RegisterOrderInvoiceWebhook(
        $topic: WebhookSubscriptionTopic!
        $subscription: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
          webhookSubscription { id topic uri }
          userErrors { message }
        }
      }
    `,
    { topic: "ORDERS_CREATE", subscription: { uri, format: "JSON" } },
  );
  const errors = result.webhookSubscriptionCreate.userErrors;
  if (errors.length || !result.webhookSubscriptionCreate.webhookSubscription) {
    throw new Error(errors.map((item) => item.message).join("; ") || "Webhook was not created.");
  }
  console.info(
    `Registered ${result.webhookSubscriptionCreate.webhookSubscription.topic} -> ${uri}`,
  );
}
