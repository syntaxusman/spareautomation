import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CreditCard,
  Globe,
  Menu,
  Phone,
  Search,
  ShoppingCart,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  getShopifyCart,
  getShopifyCustomer,
  getStorefrontLocalization,
  selectStorefrontMarket,
} from "@/lib/api/shopify.functions";
import { navTarget } from "@/lib/content/nav";
import { useEditable } from "@/lib/content/edit-mode";
import { clearStoredCartId, getStoredCartId } from "@/lib/shopify/cart";
import type { ShopifyLocalization } from "@/lib/shopify/markets";
import { useContent } from "@/lib/content/ContentContext";

export function SiteHeader() {
  const content = useContent();
  const edit = useEditable();
  // Carry the registry index so a hidden entry cannot shift the edit paths.
  const navigation = content.navigation.header
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.visible);
  const [cartCount, setCartCount] = useState(0);
  const [customer, setCustomer] = useState<Awaited<ReturnType<typeof getShopifyCustomer>>>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [localization, setLocalization] = useState<ShopifyLocalization | null>(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const [marketError, setMarketError] = useState("");

  useEffect(() => {
    setHydrated(true);
    let mounted = true;
    async function refreshCartCount() {
      const cartId = getStoredCartId();
      if (!cartId) return setCartCount(0);
      try {
        const cart = await getShopifyCart({ data: { cartId } });
        if (mounted) setCartCount(cart?.totalQuantity ?? 0);
      } catch {
        if (mounted) setCartCount(0);
      }
    }
    async function checkAuth() {
      try {
        const nextCustomer = await getShopifyCustomer();
        if (mounted) setCustomer(nextCustomer);
      } catch {
        if (mounted) setCustomer(null);
      }
    }
    async function loadLocalization() {
      try {
        const nextLocalization = await getStorefrontLocalization();
        if (mounted) setLocalization(nextLocalization);
      } catch {
        if (mounted) setMarketError("Market selection is temporarily unavailable.");
      }
    }
    void Promise.all([refreshCartCount(), checkAuth(), loadLocalization()]);
    window.addEventListener("shopify-cart-updated", refreshCartCount);
    return () => {
      mounted = false;
      window.removeEventListener("shopify-cart-updated", refreshCartCount);
    };
  }, []);

  const accountLabel = customer?.firstName || customer?.displayName || "Account";

  async function changeMarket(countryCode: string) {
    if (!countryCode || countryCode === localization?.activeCountry.isoCode) return;
    setMarketBusy(true);
    setMarketError("");
    try {
      const result = await selectStorefrontMarket({
        data: { countryCode, cartId: getStoredCartId() },
      });
      if (result.resetCart) clearStoredCartId();
      window.location.reload();
    } catch {
      setMarketError("We could not change market. Please try again.");
      setMarketBusy(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 min-w-0">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-24 bg-accent px-4 py-3 text-sm font-bold text-white transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <div className="bg-charcoal-deep text-white/80">
        <div className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 px-4 font-mono text-[10px] uppercase tracking-[0.14em] md:min-h-9 md:px-6 md:text-[11px] md:tracking-[0.18em]">
          <div className="flex min-w-0 items-center gap-4 md:gap-6">
            <div className="flex shrink-0 items-center gap-2">
              <Globe aria-hidden="true" className="h-3 w-3 text-accent" />
              <label htmlFor="storefront-market" className="sr-only">
                Shopping country and currency
              </label>
              <select
                id="storefront-market"
                aria-label="Shopping country and currency"
                aria-describedby={marketError ? "storefront-market-error" : undefined}
                disabled={marketBusy || !localization}
                value={localization?.activeCountry.isoCode ?? ""}
                onChange={(event) => void changeMarket(event.target.value)}
                className="max-w-[12rem] cursor-pointer bg-transparent py-2 pr-1 text-[10px] uppercase tracking-[0.14em] text-white outline-none disabled:cursor-wait disabled:opacity-70 md:text-[11px] md:tracking-[0.18em]"
              >
                {!localization ? <option value="">Loading market…</option> : null}
                {localization?.availableCountries.map((country) => (
                  <option
                    key={country.isoCode}
                    value={country.isoCode}
                    className="bg-charcoal-deep"
                  >
                    {country.isoCode} / {country.currency.isoCode}
                  </option>
                ))}
              </select>
              {marketError ? (
                <span id="storefront-market-error" className="sr-only" role="status">
                  {marketError}
                </span>
              ) : null}
            </div>
            <a
              href={`tel:${content.site.phoneHref}`}
              className="hidden min-h-7 items-center gap-2 text-white/70 hover:text-white md:flex"
            >
              <Phone aria-hidden="true" className="h-3 w-3" /> {content.site.phoneDisplay}
            </a>
          </div>

          <div className="hidden items-center gap-5 xl:flex">
            <AccountApplicationLinks />
            <AccountLinks customer={customer} accountLabel={accountLabel} />
            <CartLink count={cartCount} />
          </div>

          <div className="flex shrink-0 items-center gap-1 xl:hidden">
            <MobileAccountLink customer={customer} accountLabel={accountLabel} />
            <CartLink count={cartCount} />
            <button
              type="button"
              disabled={!hydrated}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              className="flex h-11 w-11 items-center justify-center text-white/80 hover:text-white disabled:opacity-60"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Menu aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-white/10 bg-[oklch(0.285_0.012_250)]">
        <div className="grid w-full min-w-0 grid-cols-1 items-center gap-2 px-4 py-2 md:grid-cols-12 md:gap-6 md:px-6 md:py-4">
          <Link to="/" className="mx-auto flex items-center gap-3 md:col-span-3 md:mx-0">
            <BrandMark name={content.site.name} />
          </Link>
          <div className="min-w-0 md:col-span-9">
            <form
              action="/search"
              role="search"
              className="group flex h-11 min-w-0 items-center border border-white/25 bg-white/[0.08] pl-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] focus-within:border-accent focus-within:bg-white/[0.11] md:h-12"
            >
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
              <label htmlFor="site-search" className="sr-only">
                Search products or part number
              </label>
              <input
                id="site-search"
                name="q"
                type="search"
                placeholder="Search products or part number"
                className="min-w-0 flex-1 bg-transparent px-3 font-mono text-base tracking-wide text-white placeholder:text-white/70 focus:outline-none sm:text-[12px] md:text-[13px]"
              />
              <button
                type="submit"
                aria-label="Search products"
                className="flex h-11 shrink-0 items-center bg-accent px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:brightness-110 sm:px-5 md:h-10 md:px-6 md:text-[11px] md:tracking-[0.22em]"
              >
                <span className="hidden sm:inline">Search</span>
                <Search aria-hidden="true" className="h-4 w-4 sm:hidden" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <nav
        aria-label="Main navigation"
        className="hidden border-b border-white/10 bg-charcoal-deep xl:block"
      >
        <div className="grid w-full grid-cols-9 px-3 2xl:px-5">
          {navigation.map((item) => (
            <Link
              key={item.id}
              {...navTarget(item.to)}
              aria-label={item.label}
              activeProps={{ "aria-current": "page", className: "text-white bg-white/10" }}
              className="inline-flex min-h-16 min-w-0 flex-col items-center justify-center px-2 text-center font-display text-[11px] font-bold uppercase leading-[1.2] tracking-[-0.01em] text-white/85 transition-colors hover:bg-white/5 hover:text-white 2xl:text-[12px]"
            >
              <span {...edit(`navigation.header.${item.index}.label`, "Menu label")}>
                {(DEFAULT_NAV_LINES[item.id]?.label === item.label ? DEFAULT_NAV_LINES[item.id].lines : [item.label]).map((line) => <span key={line} className="block">{line}</span>)}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {mobileMenuOpen ? (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="border-b border-white/10 bg-charcoal-deep px-4 py-4 xl:hidden animate-in fade-in duration-150"
        >
          <div className="mb-4 border-b border-white/10 pb-4">
            <AccountLinks customer={customer} accountLabel={accountLabel} mobile />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {navigation.map((item) => (
              <Link
                key={item.id}
                {...navTarget(item.to)}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-12 items-center justify-between border border-white/20 bg-white/[0.03] px-3.5 py-2 font-display text-xs sm:text-sm font-bold uppercase leading-snug text-white/90 hover:border-accent hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                <span {...edit(`navigation.header.${item.index}.label`, "Menu label")}>
                  {item.label}
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
              </Link>
            ))}
          </div>
          <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={`tel:${content.site.phoneHref}`}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 border border-white/15 bg-white/[0.03] px-3 font-mono text-xs uppercase tracking-[0.14em] text-white/80 hover:border-accent hover:text-white"
              >
                <Phone aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
                {content.site.phoneDisplay}
              </a>
              <AccountApplicationLinks mobile />
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

const DEFAULT_NAV_LINES: Record<string, { label: string; lines: string[] }> = {
  "all-products": { label: "All Products", lines: ["All Products"] }, asphalt: { label: "Asphalt Blacktop", lines: ["Asphalt", "Blacktop"] }, concrete: { label: "Readymix Concrete", lines: ["Readymix", "Concrete"] }, packing: { label: "Packing Machinery", lines: ["Packing", "Machinery"] }, automation: { label: "Automation and Drives", lines: ["Automation and", "Drives"] }, "home-controls": { label: "Home Automation and Controls", lines: ["Home Automation", "and Controls"] }, "control-panels": { label: "Control Panels and Software", lines: ["Control Panels", "and Software"] }, resources: { label: "PDF and Videos", lines: ["PDF and Videos"] }, contact: { label: "Contact", lines: ["Contact"] },
};

function BrandMark({ name }: { name: string }) {
  return (
    <>
      <span aria-hidden="true" className="relative h-8 w-8 shrink-0 sm:h-9 sm:w-9">
        <span className="absolute inset-0 rotate-45 border-2 border-accent" />
        <span className="absolute inset-[6px] rotate-45 bg-accent" />
      </span>
      <span className="whitespace-nowrap font-display text-[15px] font-bold uppercase tracking-tight text-white sm:text-[17px]">
        {name === "Spares Automation" ? <>SPARES<span className="text-accent">.</span>AUTOMATION</> : name}
      </span>
    </>
  );
}

function CartLink({ count }: { count: number }) {
  return (
    <Link
      to="/cart"
      aria-label={`Cart${count ? `, ${count} items` : ""}`}
      className="flex h-11 min-w-11 items-center justify-center gap-1 text-white/75 hover:text-white xl:h-9 xl:min-w-9"
    >
      <ShoppingCart aria-hidden="true" className="h-4 w-4" />
      {count > 0 ? (
        <span className="inline-flex h-5 min-w-5 items-center justify-center bg-accent px-1 text-[9px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function MobileAccountLink({
  customer,
  accountLabel,
}: {
  customer: Awaited<ReturnType<typeof getShopifyCustomer>>;
  accountLabel: string;
}) {
  return (
    <Link
      to={customer ? "/account" : "/login"}
      aria-label={customer ? accountLabel : "Sign in or register"}
      className="flex h-11 w-11 items-center justify-center text-white/75 hover:text-white"
    >
      <User aria-hidden="true" className="h-4 w-4" />
    </Link>
  );
}

function AccountApplicationLinks({ mobile = false }: { mobile?: boolean }) {
  const className = mobile
    ? "flex min-h-11 flex-1 items-center justify-center border border-white/15 bg-white/[0.03] px-3 font-mono text-xs uppercase tracking-[0.12em] text-white/80 hover:border-accent hover:text-white"
    : "flex min-h-7 items-center text-white/75 hover:text-white";

  return (
    <div className={mobile ? "flex flex-1" : "flex items-center gap-5"}>
      <Link to="/credit-account" className={`${className} gap-1.5`}>
        <CreditCard aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
        Open Credit Account
      </Link>
    </div>
  );
}

function AccountLinks({
  customer,
  accountLabel,
  mobile = false,
}: {
  customer: Awaited<ReturnType<typeof getShopifyCustomer>>;
  accountLabel: string;
  mobile?: boolean;
}) {
  const className = mobile
    ? "flex min-h-11 items-center justify-center border border-white/15 bg-white/[0.03] px-3 font-mono text-xs uppercase tracking-[0.14em] text-white/80 hover:border-accent hover:text-white"
    : "flex min-h-7 items-center gap-1.5 text-white/75 hover:text-white";
  if (customer)
    return (
      <Link to="/account" className={className}>
        <User aria-hidden="true" className="h-4 w-4 text-accent" />
        {accountLabel}
      </Link>
    );
  return (
    <div className={mobile ? "grid grid-cols-2 gap-2" : "flex items-center gap-5"}>
      <Link to="/login" className={className}>
        <User aria-hidden="true" className="h-4 w-4 text-accent" />
        Sign in
      </Link>
      <Link to="/register" className={className}>
        <UserPlus aria-hidden="true" className="h-4 w-4 text-accent" />
        Register
      </Link>
    </div>
  );
}
