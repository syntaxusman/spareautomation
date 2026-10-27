import { Link } from "@tanstack/react-router";
import { ChevronRight, PackageSearch } from "lucide-react";

import {
  formatProductPrice,
  isVariantPurchasable,
  shopifyImageUrl,
} from "@/lib/shopify/format";
import type { ShopifyProduct } from "@/lib/shopify/types";
import { productImageWatermarkProps } from "@/lib/shopify/watermark";

import { AddToCartButton } from "./AddToCartButton";

type ProductCardProps = {
  product: ShopifyProduct;
};

export function ProductCard({ product }: ProductCardProps) {
  const firstPurchasableVariant = product.variants.find(isVariantPurchasable);
  const canPurchase = Boolean(product.availableForSale && firstPurchasableVariant);

  return (
    <article className="product-card group flex min-h-[360px] md:min-h-[400px] lg:min-h-[420px] flex-col border border-rule bg-surface transition-colors hover:border-accent/50">
      <Link
        to="/products/$handle"
        params={{ handle: product.handle }}
        aria-label={`View ${product.title}`}
        className="block"
      >
        <div
          {...(product.featuredImage ? productImageWatermarkProps() : {})}
          className={`relative aspect-square overflow-hidden bg-[oklch(0.96_0.005_250)] ${
            product.featuredImage ? "protected-image-frame" : ""
          }`}
        >
          {product.featuredImage ? (
            <img
              src={shopifyImageUrl(product.featuredImage.url, 640)}
              srcSet={`${shopifyImageUrl(product.featuredImage.url, 360)} 360w, ${shopifyImageUrl(product.featuredImage.url, 640)} 640w, ${shopifyImageUrl(product.featuredImage.url, 900)} 900w`}
              sizes="(min-width: 1280px) 30vw, (min-width: 640px) 50vw, 100vw"
              width={product.featuredImage.width ?? 640}
              height={product.featuredImage.height ?? 640}
              alt={product.featuredImage.altText ?? product.title}
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-ink-muted">
              <PackageSearch aria-hidden="true" className="h-8 w-8 text-accent/70" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
                Image unavailable
              </span>
            </div>
          )}
          <div aria-hidden="true" className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center bg-charcoal-deep text-accent opacity-0 transition-opacity group-hover:opacity-100 md:bottom-4 md:right-4 md:h-9 md:w-9">
            <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 md:p-5">
        <Link
          to="/products/$handle"
          params={{ handle: product.handle }}
          aria-label={`View details for ${product.title}`}
          className="block"
        >
          <div className="font-mono text-[8px] md:text-[9px] uppercase tracking-[0.24em] text-ink-muted">
            {product.vendor || "Spares Automation"}
          </div>
          <h3 className="mt-1 md:mt-2 line-clamp-2 font-display text-[14px] md:text-[16px] font-bold uppercase leading-tight tracking-tight text-ink transition-colors group-hover:text-accent">
            {product.title}
          </h3>
        </Link>
        <p className="mt-2 md:mt-3 line-clamp-2 sm:line-clamp-3 text-[12px] md:text-[13px] leading-relaxed text-ink-muted">
          {product.description || "OEM-grade industrial spare available for online ordering."}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 md:gap-4 pt-4 md:pt-6">
          <div>
            <div className="font-mono text-[8px] md:text-[9px] uppercase tracking-[0.24em] text-ink-muted">
              Price each
            </div>
            <div className="mt-1 font-display text-base md:text-lg font-bold text-ink">
              {formatProductPrice(product)}
            </div>
          </div>
          {canPurchase ? (
            <AddToCartButton
              variantId={firstPurchasableVariant?.id ?? ""}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-charcoal px-3.5 sm:px-4 font-mono text-[9px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-accent"
            >
              Add
            </AddToCartButton>
          ) : (
            <Link
              to="/products/$handle"
              params={{ handle: product.handle }}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-charcoal px-3.5 font-mono text-[9px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-accent sm:px-4"
            >
              {product.availableForSale ? "Enquire" : "Sold Out"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
