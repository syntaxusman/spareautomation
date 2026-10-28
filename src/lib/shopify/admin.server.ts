import { getServerConfig } from "../config.server";
import {
  clearInstalledAdminTokenCache,
  getInstalledAdminAccessToken,
} from "./admin-installation.server";

type ShopifyGraphQLError = {
  message: string;
};

type ShopifyAdminResponse<T> = {
  data?: T;
  errors?: ShopifyGraphQLError[];
};

type ClientCredentialsResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  errors?: string;
};

type CachedAdminToken = {
  key: string;
  token: string;
  expiresAt: number;
};

type AdminCredentials = {
  token: string;
  source: "configured" | "installation" | "client_credentials";
};

let cachedAdminToken: CachedAdminToken | null = null;
let pendingAdminToken: { key: string; promise: Promise<string> } | null = null;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

function clientCredentialsError(payload: ClientCredentialsResponse, status: number) {
  return (
    payload.error_description ||
    payload.errors ||
    payload.error ||
    `Shopify Admin authentication failed with ${status}`
  );
}

async function requestClientCredentialsToken(
  domain: string,
  clientId: string,
  clientSecret: string,
) {
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const responseBody = await response.text();
  let payload: ClientCredentialsResponse = {};
  try {
    payload = JSON.parse(responseBody) as ClientCredentialsResponse;
  } catch {
    if (responseBody.includes("app_not_installed")) {
      payload.error_description = "The CustomFrontend app is not installed on this Shopify store.";
    }
  }

  if (!response.ok || !payload.access_token || !payload.expires_in) {
    throw new Error(clientCredentialsError(payload, response.status));
  }

  cachedAdminToken = {
    key: `${domain}:${clientId}`,
    token: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1_000,
  };
  return payload.access_token;
}

async function getAdminAccessToken(
  config: ReturnType<typeof getServerConfig>,
  forceRefresh = false,
): Promise<AdminCredentials> {
  const configuredToken = config.shopifyAdminAccessToken?.trim();
  if (configuredToken) return { token: configuredToken, source: "configured" };

  const domain = config.shopifyAdminStoreDomain?.trim();
  if (domain && config.databaseUrl && !forceRefresh) {
    const installedToken = await getInstalledAdminAccessToken(domain);
    if (installedToken) return { token: installedToken, source: "installation" };
  }

  const clientId = config.shopifyClientId?.trim();
  const clientSecret = config.shopifyClientSecret?.trim();
  if (!domain || !clientId || !clientSecret) {
    throw new Error(
      "Shopify Admin API is not configured. Set an Admin access token or the app client ID and secret.",
    );
  }

  const key = `${domain}:${clientId}`;
  if (forceRefresh && cachedAdminToken?.key === key) cachedAdminToken = null;
  if (
    !forceRefresh &&
    cachedAdminToken?.key === key &&
    cachedAdminToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()
  ) {
    return { token: cachedAdminToken.token, source: "client_credentials" };
  }

  if (!pendingAdminToken || pendingAdminToken.key !== key) {
    const promise = requestClientCredentialsToken(domain, clientId, clientSecret).finally(() => {
      if (pendingAdminToken?.promise === promise) pendingAdminToken = null;
    });
    pendingAdminToken = { key, promise };
  }

  return { token: await pendingAdminToken.promise, source: "client_credentials" };
}

async function requestAdminGraphQL<T>(
  endpoint: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as ShopifyAdminResponse<T>;
  return { response, payload };
}

export async function shopifyAdmin<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const config = getServerConfig();
  const domain = config.shopifyAdminStoreDomain?.trim();

  if (!domain) throw new Error("Shopify Admin store domain is not configured.");

  const endpoint = `https://${domain}/admin/api/${config.shopifyAdminApiVersion}/graphql.json`;
  let credentials = await getAdminAccessToken(config);
  let { response, payload } = await requestAdminGraphQL<T>(
    endpoint,
    credentials.token,
    query,
    variables,
  );

  // Client-credentials tokens expire after 24 hours. Refresh once if Shopify
  // rejects a cached generated token before its advertised expiry time.
  if (credentials.source === "client_credentials" && response.status === 401) {
    credentials = await getAdminAccessToken(config, true);
    ({ response, payload } = await requestAdminGraphQL<T>(
      endpoint,
      credentials.token,
      query,
      variables,
    ));
  }

  if (credentials.source === "installation" && response.status === 401) {
    clearInstalledAdminTokenCache(domain);
  }

  if (!response.ok || payload.errors?.length) {
    const message =
      payload.errors?.map((error) => error.message).join("; ") ||
      `Shopify Admin API request failed with ${response.status}`;
    throw new Error(message);
  }

  if (!payload.data) {
    throw new Error("Shopify returned no data.");
  }

  return payload.data;
}
