import { getServerConfig } from "../config.server";

type ShopifyGraphQLError = {
  message: string;
  extensions?: {
    code?: string;
  };
};

type ShopifyResponse<T> = {
  data?: T;
  errors?: ShopifyGraphQLError[] | string;
};

function errorMessage<T>(payload: ShopifyResponse<T>, status: number) {
  if (typeof payload.errors === "string") return payload.errors;

  const messages = payload.errors
    ?.map((error) => error.message.trim())
    .filter(Boolean)
    .join("; ");

  return messages || `Catalogue request failed with ${status}`;
}

function hasOnlyOptionalAccessErrors<T>(payload: ShopifyResponse<T>, query: string) {
  return (
    !/\bmutation\b/i.test(query) &&
    Boolean(payload.data) &&
    Array.isArray(payload.errors) &&
    payload.errors.length > 0 &&
    payload.errors.every((error) => error.extensions?.code === "ACCESS_DENIED")
  );
}

async function requestStorefront<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  authenticationHeader?: Record<string, string>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authenticationHeader,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as ShopifyResponse<T>;
  return { response, payload };
}

function tokenlessQuery(query: string) {
  // Exact inventory counts require unauthenticated_read_product_inventory.
  // Availability and all other catalogue data remain available without it.
  return query.replace(/^\s*quantityAvailable\s*$/gim, "");
}

export async function shopifyStorefront<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const config = getServerConfig();
  const domain = config.shopifyStoreDomain;
  const privateToken = config.shopifyStorefrontPrivateAccessToken;
  const publicToken = config.shopifyStorefrontAccessToken;
  const token = privateToken || publicToken;
  const apiVersion = config.shopifyStorefrontApiVersion;

  if (!domain) {
    throw new Error("Missing catalogue store domain configuration.");
  }

  const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;
  let authenticationHeader: Record<string, string> | undefined;
  if (privateToken) {
    authenticationHeader = { "Shopify-Storefront-Private-Token": privateToken };
  } else if (publicToken) {
    authenticationHeader = { "X-Shopify-Storefront-Access-Token": publicToken };
  }

  let { response, payload } = await requestStorefront<T>(
    endpoint,
    token ? query : tokenlessQuery(query),
    variables,
    authenticationHeader,
  );

  // A stale or accidentally supplied Admin API token must not take down the
  // public catalogue. Shopify supports tokenless product, collection, search,
  // and cart requests, so retry those queries without the rejected credential.
  if (token && (response.status === 401 || response.status === 403)) {
    ({ response, payload } = await requestStorefront<T>(
      endpoint,
      tokenlessQuery(query),
      variables,
    ));
  }

  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  if (payload.errors && !hasOnlyOptionalAccessErrors(payload, query)) {
    throw new Error(errorMessage(payload, response.status));
  }

  if (!payload.data) {
    throw new Error("The catalogue returned no data.");
  }

  return payload.data;
}
