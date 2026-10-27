export const SHOPIFY_MARKET_COOKIE = "sa_shopify_market";

export type ShopifyMarketCountry = {
  isoCode: string;
  name: string;
  currency: {
    isoCode: string;
    name: string;
    symbol: string;
  };
};

export type ShopifyLocalization = {
  activeCountry: ShopifyMarketCountry;
  availableCountries: ShopifyMarketCountry[];
};

export function normalizeCountryCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}
