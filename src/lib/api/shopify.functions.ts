import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  addCartLines,
  activateCustomer,
  activateCustomerByUrl,
  createCart,
  createCustomer,
  createCustomerAccessToken,
  getCart,
  getCollectionByHandle,
  getCollectionProductsPage,
  getCustomer,
  getCustomerOrders,
  getProductByHandle,
  getProducts,
  getProductsPage,
  getProductsWithResources,
  removeCartLine,
  recoverCustomerPassword,
  resetCustomerPassword,
  resetCustomerPasswordByUrl,
  updateCartLine,
} from "../shopify/queries.server";
import { shopifyAdmin } from "../shopify/admin.server";
import { getServerConfig } from "../config.server";
import { clearSession, useSession as getServerSessionManager } from "@tanstack/react-start/server";
import {
  getActiveShopifyCountryCode,
  getShopifyLocalization,
  selectShopifyMarketCountry,
} from "../shopify/markets.server";

const positiveQuantity = z.number().int().min(1).max(99);

export const getStorefrontLocalization = createServerFn({ method: "GET" }).handler(() =>
  getShopifyLocalization(),
);

export const selectStorefrontMarket = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      countryCode: z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
      cartId: z.string().min(1).max(2048).optional(),
    }),
  )
  .handler(({ data }) => selectShopifyMarketCountry(data.countryCode, data.cartId));

export const getCollection = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      handle: z.string().min(1),
      first: z.number().int().min(1).max(100).default(24),
    }),
  )
  .handler(async ({ data }) => getCollectionByHandle(data.handle, data.first));

export const getCategoryCollections = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      categoryHandle: z.string().min(1),
      lineHandle: z.string().min(1).optional(),
      first: z.number().int().min(1).max(100).default(48),
    }),
  )
  .handler(async ({ data }) => {
    const [collection, lineCollection] = await Promise.all([
      getCollectionByHandle(data.categoryHandle, data.first),
      data.lineHandle ? getCollectionByHandle(data.lineHandle, data.first) : null,
    ]);

    return { collection, lineCollection };
  });

export const getLatestProducts = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      first: z.number().int().min(1).max(100).default(24),
      query: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => getProducts(data.first, data.query));

export const getResourceProducts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ first: z.number().int().min(1).max(100).default(100) }))
  .handler(async ({ data }) => getProductsWithResources(data.first));

export const getPaginatedProducts = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      first: z.number().int().min(1).max(100).default(48),
      query: z.string().optional(),
      after: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => getProductsPage(data.first, data.query, data.after));

export const getCatalogProductsPage = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      first: z.number().int().min(1).max(100).default(48),
      collectionHandle: z.string().min(1).optional(),
      after: z.string().optional(),
    }),
  )
  .handler(async ({ data }) =>
    data.collectionHandle
      ? getCollectionProductsPage(data.collectionHandle, data.first, data.after)
      : getProductsPage(data.first, undefined, data.after),
  );

export const getProduct = createServerFn({ method: "GET" })
  .inputValidator(z.object({ handle: z.string().min(1) }))
  .handler(async ({ data }) => getProductByHandle(data.handle));

export const getShopifyCart = createServerFn({ method: "GET" })
  .inputValidator(z.object({ cartId: z.string().min(1) }))
  .handler(async ({ data }) => getCart(data.cartId));

export const addToShopifyCart = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      cartId: z.string().optional(),
      variantId: z.string().min(1),
      quantity: positiveQuantity,
    }),
  )
  .handler(async ({ data }) => {
    if (data.cartId) {
      return addCartLines(data.cartId, data.variantId, data.quantity);
    }
    return createCart(data.variantId, data.quantity);
  });

export const updateShopifyCartLine = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      cartId: z.string().min(1),
      lineId: z.string().min(1),
      quantity: z.number().int().min(0).max(99),
    }),
  )
  .handler(async ({ data }) => {
    if (data.quantity === 0) {
      return removeCartLine(data.cartId, data.lineId);
    }
    return updateCartLine(data.cartId, data.lineId, data.quantity);
  });

export const removeShopifyCartLine = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      cartId: z.string().min(1),
      lineId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => removeCartLine(data.cartId, data.lineId));

const quoteLineSchema = z.object({
  variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/),
  quantity: positiveQuantity,
});

export const submitShopifyQuote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().trim().email("Enter a valid email address").max(254),
      firstName: z.string().trim().min(1, "First name is required").max(80),
      lastName: z.string().trim().min(1, "Last name is required").max(80),
      company: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(30).optional(),
      additionalInformation: z.string().trim().max(3000).optional(),
      website: z.string().max(0),
      lines: z.array(quoteLineSchema).min(1, "Add at least one product").max(50),
    }),
  )
  .handler(async ({ data }) => {
    const marketCountry = getActiveShopifyCountryCode();
    let marketCurrency: string | undefined;
    try {
      marketCurrency = (await getShopifyLocalization(marketCountry)).activeCountry.currency.isoCode;
    } catch {
      // The Admin API can still create the quote in shop currency if the
      // Storefront localization endpoint is temporarily unavailable.
    }
    let authenticatedCustomerId: string | undefined;
    try {
      const sessionData = await getCustomerAccessTokenSession();
      if (sessionData?.customerAccessToken) {
        const authenticatedCustomer = await getCustomer(sessionData.customerAccessToken);
        authenticatedCustomerId = authenticatedCustomer?.id;
      }
    } catch {
      // Quote submission can still proceed using the supplied email if the
      // authenticated Shopify customer lookup is temporarily unavailable.
    }

    const note = [
      "Website quote request",
      `Storefront market: ${marketCountry}`,
      marketCurrency ? `Presentment currency: ${marketCurrency}` : "",
      `Customer: ${data.firstName} ${data.lastName}`,
      data.company ? `Company: ${data.company}` : "",
      data.phone ? `Phone: ${data.phone}` : "",
      data.additionalInformation ? `Additional information:\n${data.additionalInformation}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await shopifyAdmin<{
      draftOrderCreate: {
        draftOrder: { id: string; name: string } | null;
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(
      `#graphql
        mutation CreateWebsiteQuote($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        input: {
          ...(authenticatedCustomerId ? { customerId: authenticatedCustomerId } : {}),
          ...(marketCurrency ? { presentmentCurrencyCode: marketCurrency } : {}),
          email: data.email,
          note,
          tags: ["Website quote request", "Awaiting sales review"],
          lineItems: data.lines,
          customAttributes: [
            { key: "Storefront market", value: marketCountry },
            { key: "First name", value: data.firstName },
            { key: "Last name", value: data.lastName },
            ...(data.company ? [{ key: "Company", value: data.company }] : []),
            ...(data.phone ? [{ key: "Phone", value: data.phone }] : []),
          ],
        },
      },
    );

    const errors = result.draftOrderCreate.userErrors;
    if (errors.length || !result.draftOrderCreate.draftOrder) {
      throw new Error(
        errors.map((error) => error.message).join("; ") || "The quote could not be created.",
      );
    }

    return {
      id: result.draftOrderCreate.draftOrder.id,
      reference: result.draftOrderCreate.draftOrder.name,
    };
  });

const CUSTOMER_ACCESS_TOKEN_SESSION_COOKIE = "sa_customer_access_token_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function sessionConfig(secret: string) {
  return {
    name: CUSTOMER_ACCESS_TOKEN_SESSION_COOKIE,
    password: secret,
    maxAge: SESSION_MAX_AGE,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

async function getCustomerAccessTokenSession() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) return null;
  const session = await getServerSessionManager<{
    customerAccessToken?: string;
    expiresAt?: number;
  }>(sessionConfig(secret));
  if (!session.data.customerAccessToken) return null;
  if (session.data.expiresAt && session.data.expiresAt <= Date.now()) {
    await session.clear();
    return null;
  }
  return session.data;
}

async function clearCustomerAccessTokenSession() {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) return;
  await clearSession({
    name: CUSTOMER_ACCESS_TOKEN_SESSION_COOKIE,
    password: secret,
    cookie: { path: "/" },
  });
}

async function saveCustomerAccessTokenSession(token: { accessToken: string; expiresAt: string }) {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) return;

  const session = await getServerSessionManager<{
    customerAccessToken?: string;
    expiresAt?: number;
  }>(sessionConfig(secret));
  await session.update({
    customerAccessToken: token.accessToken,
    expiresAt: new Date(token.expiresAt).getTime(),
  });
}

function assertCustomerActionUrl(value: string, action: "activate" | "reset") {
  const url = new URL(value);
  const configuredDomain = getServerConfig().shopifyStoreDomain?.toLowerCase();
  const expectedPath = `/account/${action}/`;

  if (
    url.protocol !== "https:" ||
    !configuredDomain ||
    url.hostname.toLowerCase() !== configuredDomain ||
    !url.pathname.includes(expectedPath)
  ) {
    throw new Error(`This ${action} link is invalid.`);
  }

  return url.toString();
}

export const loginShopifyCustomer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().trim().email("Enter a valid email address"),
      password: z.string().min(1, "Password is required"),
    }),
  )
  .handler(async ({ data }) => {
    const result = await createCustomerAccessToken({
      email: data.email,
      password: data.password,
    });

    if (result.customerAccessToken)
      await saveCustomerAccessTokenSession(result.customerAccessToken);

    return {
      authenticated: Boolean(result.customerAccessToken),
      errors: result.customerUserErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });

export const getShopifyCustomer = createServerFn({ method: "GET" }).handler(async () => {
  const sessionData = await getCustomerAccessTokenSession();
  if (!sessionData?.customerAccessToken) return null;
  const customer = await getCustomer(sessionData.customerAccessToken);
  if (!customer) return null;

  try {
    const orders = await getCustomerOrders(sessionData.customerAccessToken);
    return { ...customer, orders, orderHistoryAvailable: true as const };
  } catch {
    return { ...customer, orders: [], orderHistoryAvailable: false as const };
  }
});

export const logoutShopifyCustomer = createServerFn({ method: "POST" }).handler(async () => {
  await clearCustomerAccessTokenSession();
  return { ok: true };
});

export const requestShopifyPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().trim().email("Enter a valid email address") }))
  .handler(async ({ data }) => {
    const result = await recoverCustomerPassword(data.email);
    return {
      errors: result.customerUserErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });

export const resetShopifyCustomerPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      customerId: z.string().regex(/^\d+$/, "Invalid password-reset link"),
      resetToken: z
        .string()
        .min(16, "Invalid password-reset link")
        .max(256, "Invalid password-reset link")
        .regex(/^[A-Za-z0-9_-]+$/, "Invalid password-reset link"),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
    }),
  )
  .handler(async ({ data }) => {
    const result = await resetCustomerPassword(data.customerId, data.resetToken, data.password);

    if (result.customerAccessToken)
      await saveCustomerAccessTokenSession(result.customerAccessToken);

    return {
      reset: Boolean(result.customerAccessToken),
      errors: result.customerUserErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });

export const resetShopifyCustomerPasswordByUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      resetUrl: z.string().url("Invalid password-reset link").max(2048),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
    }),
  )
  .handler(async ({ data }) => {
    const resetUrl = assertCustomerActionUrl(data.resetUrl, "reset");
    const result = await resetCustomerPasswordByUrl(resetUrl, data.password);

    if (result.customerAccessToken)
      await saveCustomerAccessTokenSession(result.customerAccessToken);

    return {
      reset: Boolean(result.customerAccessToken),
      errors: result.customerUserErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });

export const activateShopifyCustomer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      customerId: z.string().regex(/^\d+$/, "Invalid activation link"),
      activationToken: z
        .string()
        .min(16, "Invalid activation link")
        .max(256, "Invalid activation link")
        .regex(/^[A-Za-z0-9_-]+$/, "Invalid activation link"),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
    }),
  )
  .handler(async ({ data }) => {
    const result = await activateCustomer(data.customerId, data.activationToken, data.password);

    if (result.customerAccessToken)
      await saveCustomerAccessTokenSession(result.customerAccessToken);

    return {
      activated: Boolean(result.customerAccessToken),
      errors: result.customerUserErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });

export const activateShopifyCustomerByUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      activationUrl: z.string().url("Invalid activation link").max(2048),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
    }),
  )
  .handler(async ({ data }) => {
    const activationUrl = assertCustomerActionUrl(data.activationUrl, "activate");
    const result = await activateCustomerByUrl(activationUrl, data.password);

    if (result.customerAccessToken)
      await saveCustomerAccessTokenSession(result.customerAccessToken);

    return {
      activated: Boolean(result.customerAccessToken),
      errors: result.customerUserErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });

export const createShopifyCustomer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      firstName: z.string().trim().min(1, "First name is required").max(80),
      lastName: z.string().trim().min(1, "Last name is required").max(80),
      email: z.string().trim().email("Enter a valid email address"),
      phone: z
        .string()
        .trim()
        .max(20)
        .optional()
        .refine((phone) => !phone || /^\+[1-9]\d{6,14}$/.test(phone), {
          message: "Phone must be in international format, for example +923027458952",
        }),
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
      acceptsMarketing: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const result = await createCustomer({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || undefined,
      acceptsMarketing: data.acceptsMarketing,
    });

    const activationRequired = result.customerUserErrors.some(
      (error) => error.code === "CUSTOMER_DISABLED",
    );
    const creationErrors = result.customerUserErrors.filter(
      (error) => error.code !== "CUSTOMER_DISABLED",
    );

    if (!result.customer || creationErrors.length || activationRequired) {
      return {
        customerId: result.customer?.id ?? null,
        authenticated: false,
        activationRequired,
        errors: creationErrors.map((error) => ({
          code: error.code,
          message: error.message,
          field: error.field,
        })),
      };
    }

    const access = await createCustomerAccessToken({
      email: data.email,
      password: data.password,
    });
    const loginActivationRequired = access.customerUserErrors.some(
      (error) => error.code === "CUSTOMER_DISABLED",
    );
    const loginErrors = access.customerUserErrors.filter(
      (error) => error.code !== "CUSTOMER_DISABLED",
    );

    if (access.customerAccessToken) {
      await saveCustomerAccessTokenSession(access.customerAccessToken);
    }

    return {
      customerId: result.customer?.id ?? null,
      authenticated: Boolean(access.customerAccessToken),
      activationRequired: loginActivationRequired,
      errors: loginErrors.map((error) => ({
        code: error.code,
        message: error.message,
        field: error.field,
      })),
    };
  });
