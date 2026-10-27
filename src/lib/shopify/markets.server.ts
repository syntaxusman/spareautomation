import { getCookie, setCookie } from "@tanstack/react-start/server";

import { getServerConfig } from "../config.server";
import { shopifyStorefront } from "./storefront.server";
import {
  normalizeCountryCode,
  SHOPIFY_MARKET_COOKIE,
  type ShopifyLocalization,
  type ShopifyMarketCountry,
} from "./markets";

type LocalizationShape = {
  localization: {
    country: ShopifyMarketCountry;
    availableCountries: ShopifyMarketCountry[];
  };
};

export function getActiveShopifyCountryCode() {
  let cookieCountry: string | null = null;
  try {
    cookieCountry = normalizeCountryCode(getCookie(SHOPIFY_MARKET_COOKIE));
  } catch {
    // CLI catalogue checks run without an active HTTP request.
  }

  return cookieCountry ?? normalizeCountryCode(getServerConfig().shopifyDefaultCountry) ?? "GB";
}

export async function getShopifyLocalization(
  countryCode = getActiveShopifyCountryCode(),
): Promise<ShopifyLocalization> {
  const data = await shopifyStorefront<LocalizationShape>(
    `#graphql
      query StorefrontLocalization($country: CountryCode!) @inContext(country: $country) {
        localization {
          country {
            isoCode
            name
            currency { isoCode name symbol }
          }
          availableCountries {
            isoCode
            name
            currency { isoCode name symbol }
          }
        }
      }
    `,
    { country: countryCode },
  );

  return {
    activeCountry: data.localization.country,
    availableCountries: [...data.localization.availableCountries].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}

async function updateCartCountry(cartId: string, countryCode: string) {
  const data = await shopifyStorefront<{
    cartBuyerIdentityUpdate: {
      cart: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    `#graphql
      mutation UpdateCartMarket($cartId: ID!, $country: CountryCode!) {
        cartBuyerIdentityUpdate(
          cartId: $cartId
          buyerIdentity: { countryCode: $country }
        ) {
          cart { id }
          userErrors { message }
        }
      }
    `,
    { cartId, country: countryCode },
  );

  const result = data.cartBuyerIdentityUpdate;
  if (!result.cart || result.userErrors.length) {
    throw new Error(
      result.userErrors.map((error) => error.message).join("; ") ||
        "The cart market could not be updated.",
    );
  }
}

export async function selectShopifyMarketCountry(countryCode: string, cartId?: string) {
  const requestedCountry = normalizeCountryCode(countryCode);
  if (!requestedCountry) throw new Error("Choose a valid market country.");

  const localization = await getShopifyLocalization(requestedCountry);
  if (!localization.availableCountries.some((country) => country.isoCode === requestedCountry)) {
    throw new Error("That country is not enabled in Shopify Markets.");
  }

  setCookie(SHOPIFY_MARKET_COOKIE, requestedCountry, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  let resetCart = false;
  if (cartId) {
    try {
      await updateCartCountry(cartId, requestedCountry);
    } catch {
      // An expired cart must not prevent the visitor from changing markets.
      resetCart = true;
    }
  }

  return {
    activeCountry: localization.activeCountry,
    resetCart,
  };
}
