import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/shopify/SiteHeader";
import { SiteFooter } from "@/components/shopify/SiteFooter";
import { BuildQuoteFromCartButton } from "@/components/shopify/BuildQuoteFromCartButton";
import {
  getShopifyCart,
  removeShopifyCartLine,
  updateShopifyCartLine,
} from "@/lib/api/shopify.functions";
import { clearStoredCartId, getStoredCartId, setStoredCartId } from "@/lib/shopify/cart";
import { formatMoney } from "@/lib/shopify/format";
import type { ShopifyCart } from "@/lib/shopify/types";
import { productImageWatermarkProps } from "@/lib/shopify/watermark";
import { useContent } from "@/lib/content/ContentContext";
import { useEditable } from "@/lib/content/edit-mode";
import { getPublishedContent } from "@/lib/content/content.functions";
import { contentPageHead } from "@/lib/seo";

export const Route = createFileRoute("/cart")({
  loader: async () => {
    const { site, functional } = await getPublishedContent();
    return { site, seo: functional.cart.seo };
  },
  head: ({ loaderData }) =>
    contentPageHead(loaderData?.seo, loaderData?.site, "/cart", {
      title: "Cart",
      description: "Review selected industrial parts, continue to secure Shopify checkout, or request a quote by email.",
    }, { noIndex: true, noFollow: true }),
  component: CartPage,
});

function CartPage() {
  const { functional, messages } = useContent();
  const copy = functional.cart;
  const edit = useEditable();
  const [cart, setCart] = useState<ShopifyCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCart() {
      const cartId = getStoredCartId();
      if (!cartId) {
        setLoading(false);
        return;
      }
      try {
        const nextCart = await getShopifyCart({ data: { cartId } });
        setCart(nextCart);
        if (!nextCart) clearStoredCartId();
      } catch {
        setError(messages["cart.loadFailed"]);
      } finally {
        setLoading(false);
      }
    }

    loadCart();
  }, [messages]);

  async function updateLine(lineId: string, quantity: number) {
    const cartId = getStoredCartId();
    if (!cartId) return;
    setBusyLineId(lineId);
    setError("");
    try {
      const nextCart = await updateShopifyCartLine({ data: { cartId, lineId, quantity } });
      setCart(nextCart);
      setStoredCartId(nextCart.id);
    } catch {
      setError(messages["cart.updateFailed"]);
    } finally {
      setBusyLineId(null);
    }
  }

  async function removeLine(lineId: string) {
    const cartId = getStoredCartId();
    if (!cartId) return;
    setBusyLineId(lineId);
    setError("");
    try {
      const nextCart = await removeShopifyCartLine({ data: { cartId, lineId } });
      setCart(nextCart);
      setStoredCartId(nextCart.id);
    } catch {
      setError(messages["cart.removeFailed"]);
    } finally {
      setBusyLineId(null);
    }
  }

  const isEmpty = !cart || cart.lines.length === 0;
  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <main id="main-content" className="mx-auto max-w-[1600px] px-4 py-8 md:px-6 md:py-12">
        <div className="mb-6 md:mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted" {...edit(`functional.cart.eyebrow`, "Page eyebrow")}>
              {copy.eyebrow}
            </div>
            <h1 className="mt-2 font-display text-2xl md:text-3xl lg:text-4xl font-extrabold uppercase tracking-tight" {...edit(`functional.cart.title`, "Page heading")}>
              {copy.title}
            </h1>
          </div>
          <Link
            to="/"
            className="inline-flex h-11 w-full sm:w-auto items-center justify-center border border-rule px-5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Continue browsing
          </Link>
        </div>

        {error ? <div role="alert" className="mb-5 border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
        {loading ? (
          <div className="border border-rule bg-surface px-4 py-12 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-muted md:px-8 md:py-16" {...edit(`functional.cart.loadingLabel`, "Loading label")}>
            {copy.loadingLabel}
          </div>
        ) : isEmpty ? (
          <div className="border border-dashed border-rule bg-surface px-4 py-12 text-center md:px-8 md:py-16">
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center bg-accent text-accent-foreground">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <h2 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight" {...edit(`functional.cart.emptyTitle`, "Empty state heading")}>
              {copy.emptyTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-muted" {...edit(`functional.cart.emptyCopy`, "Empty state copy")}>
              {copy.emptyCopy}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:gap-8 lg:grid-cols-[1fr_420px]">
            <section className="space-y-3 md:space-y-4">
              {cart.lines.map((line) => (
                <article
                  key={line.id}
                  className="grid grid-cols-[72px_1fr] gap-4 border border-rule bg-surface p-3 md:grid-cols-[96px_1fr] md:gap-5 md:p-4 lg:grid-cols-[120px_1fr_auto]"
                >
                  <Link
                    {...(line.merchandise.product.featuredImage
                      ? productImageWatermarkProps()
                      : {})}
                    to="/products/$handle"
                    params={{ handle: line.merchandise.product.handle }}
                    className={`aspect-square overflow-hidden bg-[oklch(0.96_0.005_250)] ${
                      line.merchandise.product.featuredImage
                        ? "protected-image-frame protected-image-frame--compact"
                        : ""
                    }`}
                  >
                    {line.merchandise.product.featuredImage ? (
                      <img
                        src={line.merchandise.product.featuredImage.url}
                        alt={
                          line.merchandise.product.featuredImage.altText ??
                          line.merchandise.product.title
                        }
                        draggable={false}
                        className="h-full w-full object-cover mix-blend-multiply"
                      />
                    ) : null}
                  </Link>
                  <div>
                    <Link
                      to="/products/$handle"
                      params={{ handle: line.merchandise.product.handle }}
                      className="font-display text-base md:text-lg font-bold uppercase tracking-tight transition-colors hover:text-accent"
                    >
                      {line.merchandise.product.title}
                    </Link>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      {line.merchandise.title}
                      {line.merchandise.sku ? ` / ${line.merchandise.sku}` : ""}
                    </div>
                    <div className="mt-4 md:mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyLineId === line.id || line.quantity <= 1}
                        onClick={() => updateLine(line.id, line.quantity - 1)}
                        aria-label={`Decrease quantity of ${line.merchandise.product.title}`}
                        className="flex h-9 w-9 items-center justify-center border border-rule text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="flex h-9 min-w-11 items-center justify-center border border-rule px-2 font-mono text-sm">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={busyLineId === line.id || line.quantity >= 99}
                        onClick={() => updateLine(line.id, line.quantity + 1)}
                        aria-label={`Increase quantity of ${line.merchandise.product.title}`}
                        className="flex h-9 w-9 items-center justify-center border border-rule text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyLineId === line.id}
                        onClick={() => removeLine(line.id)}
                        aria-label={`Remove ${line.merchandise.product.title} from cart`}
                        className="ml-auto sm:ml-2 flex h-9 w-9 items-center justify-center border border-rule text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 mt-3 flex items-center justify-between border-t border-rule/60 pt-3 md:pt-4 lg:col-span-1 lg:mt-0 lg:flex-col lg:items-end lg:justify-start lg:border-t-0 lg:pt-0 lg:text-right">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      Line total
                    </div>
                    <div className="font-display text-lg md:text-xl font-bold">
                      {formatMoney(line.cost.totalAmount)}
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="h-fit border border-rule bg-surface p-5 md:p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
                Order Summary
              </div>
              <div className="mt-6 space-y-4 border-b border-rule pb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Items</span>
                  <span>{cart.totalQuantity}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Market subtotal</span>
                  <span>{formatMoney(cart.cost.subtotalAmount)}</span>
                </div>
                <div className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-ink-muted">Taxes and duties</span>
                  <span className="text-right font-medium">Calculated at checkout</span>
                </div>
                <div className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-ink-muted">Delivery charge</span>
                  <span className="text-right font-medium">Calculated at checkout</span>
                </div>
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-display text-lg font-bold uppercase tracking-tight">
                    Estimated total
                  </span>
                  <span className="font-display text-xl font-bold md:text-2xl">
                    {formatMoney(cart.cost.totalAmount)}
                  </span>
                </div>
                <p className="mt-2 text-right text-xs text-ink-muted">
                  Final tax, duties, and delivery depend on the checkout destination.
                </p>
              </div>
              <a
                href={cart.checkoutUrl}
                className="mt-8 inline-flex h-12 w-full items-center justify-center bg-accent px-6 font-mono text-[11px] uppercase tracking-[0.22em] text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Continue to secure checkout
              </a>
              <BuildQuoteFromCartButton cart={cart} />
              <p className="mt-4 text-xs leading-relaxed text-ink-muted">
                Checkout completes an online order. Build a quote to submit these products and
                your details to the sales desk for review.
              </p>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
