import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Minus,
  PackageCheck,
  PlayCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState } from "react";

import { AddToCartButton } from "@/components/shopify/AddToCartButton";
import { AddToQuoteButton } from "@/components/shopify/AddToQuoteButton";
import { PayPalMark } from "@/components/shopify/PaymentMarks";
import { SiteFooter } from "@/components/shopify/SiteFooter";
import { SiteHeader } from "@/components/shopify/SiteHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatMoney,
  isVariantPurchasable,
  shopifyImageUrl,
} from "@/lib/shopify/format";
import type { ShopifyProduct, ShopifyVariant } from "@/lib/shopify/types";
import { productImageWatermarkProps } from "@/lib/shopify/watermark";
import { useContent } from "@/lib/content/ContentContext";
import { useEditable } from "@/lib/content/edit-mode";

type ProductDetailProps = {
  product: ShopifyProduct;
};

export function ProductDetail({ product }: ProductDetailProps) {
  const { site, product: copy } = useContent();
  const edit = useEditable();
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants.find((variant) => variant.availableForSale)?.id ?? product.variants[0]?.id,
  );
  const [quantity, setQuantity] = useState(1);
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) ?? product.variants[0];
  const gallery = product.images.length
    ? product.images
    : product.featuredImage
      ? [product.featuredImage]
      : [];
  const [activeImage, setActiveImage] = useState(gallery[0]);
  const brand = product.technicalDetails.brand ?? product.vendor ?? "Spares Automation";
  const mpnRange = product.technicalDetails.mpnRange ?? selectedVariant?.sku ?? "Ask for MPN";
  const selectedVariantPurchasable = isVariantPurchasable(selectedVariant);

  return (
    <div className="min-h-screen bg-background text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: product.title, description: product.description, image: product.images.map((image) => image.url), sku: selectedVariant?.sku || undefined, brand: { "@type": "Brand", name: brand }, offers: selectedVariant && selectedVariantPurchasable ? { "@type": "Offer", price: selectedVariant.price.amount, priceCurrency: selectedVariant.price.currencyCode, availability: "https://schema.org/InStock", url: `${site.url}/products/${product.handle}` } : undefined }).replace(/</g, "\\u003c") }} />
      <SiteHeader />

      <main id="main-content" className="mx-auto max-w-[1600px]">
        <div className="border-b border-rule bg-surface px-4 py-4 md:px-6 lg:px-10">
          <Link
            to="/products"
            search={{ category: "all", availability: "all", sort: "newest" }}
            className="inline-flex h-12 items-center gap-2.5 bg-accent px-5 font-display text-sm font-bold uppercase tracking-[0.06em] text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent/90 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Catalogue
          </Link>
        </div>

        <section className="grid grid-cols-1 gap-px bg-rule lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* Row 1: Product Gallery and Product Info */}
          <ProductGallery
            productTitle={product.title}
            gallery={gallery}
            activeImage={activeImage}
            onSelectImage={setActiveImage}
          />

          <section className="bg-surface p-4 md:p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <StockBadge variant={selectedVariant} product={product} />
            </div>

            <h1 className="mt-4 max-w-3xl break-words font-display text-[1.15rem] font-bold leading-[1.2] tracking-[-0.01em] text-ink sm:text-[1.3rem] md:mt-5 md:text-[1.45rem] lg:text-[1.65rem]">
              {product.title}
            </h1>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SpecBlock label="Brand" value={brand} />
              <SpecBlock label="MPN / Range" value={mpnRange} />
            </div>

            <div className="mt-6 max-w-2xl border border-rule bg-surface">
              <div className="bg-surface p-4">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">
                  Market price
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-ink md:text-[1.75rem]">
                  {selectedVariantPurchasable && selectedVariant
                    ? formatMoney(selectedVariant.price)
                    : "Request price"}
                </div>
                {selectedVariantPurchasable && selectedVariant?.compareAtPrice ? (
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted line-through">
                    Was {formatMoney(selectedVariant.compareAtPrice)}
                  </div>
                ) : null}
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  Currency and pricing follow your selected Shopify market. Taxes, duties, and
                  delivery are confirmed at checkout.
                </p>
              </div>
            </div>

            {product.variants.length > 1 ? (
              <div className="mt-6">
                <label className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
                  Variant
                </label>
                <select
                  value={selectedVariantId}
                  onChange={(event) => setSelectedVariantId(event.target.value)}
                  className="mt-3 h-12 w-full border border-rule bg-background px-4 font-mono text-sm text-ink focus:border-accent focus:outline-none"
                >
                  {product.variants.map((variant) => (
                    <option key={variant.id} value={variant.id} disabled={!variant.availableForSale}>
                      {variant.title} {variant.sku ? `- ${variant.sku}` : ""}{" "}
                      {variant.availableForSale ? "" : "(Sold out)"}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-6 space-y-3">
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                disabled={!selectedVariantPurchasable}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <AddToCartButton
                  variantId={selectedVariant?.id ?? ""}
                  quantity={quantity}
                  disabled={!selectedVariantPurchasable}
                  className="inline-flex h-13 items-center justify-center gap-2 bg-accent px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedVariantPurchasable
                    ? "Add to Cart"
                    : selectedVariant?.availableForSale
                      ? "Request price"
                      : "Sold out"}
                </AddToCartButton>
                <AddToQuoteButton
                  product={product}
                  variant={selectedVariant}
                  quantity={quantity}
                  className="inline-flex h-13 items-center justify-center gap-2 border border-accent bg-accent/5 px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
                />
                <Link
                  to="/cart"
                  className="inline-flex h-13 items-center justify-center border border-charcoal-deep bg-charcoal-deep px-5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-white shadow-sm transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {copy.viewCartLabel}
                </Link>
              </div>
              <div className="flex flex-col gap-3 border border-rule bg-background p-3.5 sm:flex-row sm:items-center">
                <PayPalMark prominent />
                <div>
                  <div className="font-display text-sm font-bold uppercase tracking-tight text-ink">
                    PayPal accepted
                  </div>
                  <div className="mt-1 text-xs leading-5 text-ink-muted">
                    Select PayPal as your payment method at secure checkout.
                  </div>
                </div>
              </div>
              <Link
                to="/contact-us"
                className="inline-flex h-12 w-full items-center justify-center border border-rule bg-surface px-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink transition-colors hover:border-accent hover:text-accent sm:w-auto"
              >
                {copy.questionLabel}
              </Link>
            </div>

          </section>

          <div className="bg-surface lg:col-span-2">
            <ProductResources product={product} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function QuantityStepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const { quantityLabel: label } = useContent().product;
  const decrease = () => onChange(Math.max(1, value - 1));
  const increase = () => onChange(Math.min(99, value + 1));

  return (
    <div className="flex h-13 w-full items-stretch border border-rule bg-surface sm:w-[210px]">
      <div className="flex min-w-[52px] items-center justify-center border-r border-rule font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </div>
      <button
        type="button"
        onClick={decrease}
        disabled={disabled || value <= 1}
        className="flex w-11 items-center justify-center text-ink transition-colors hover:bg-background hover:text-accent disabled:cursor-not-allowed disabled:text-ink-muted/35"
        aria-label="Decrease quantity"
      >
        <Minus aria-hidden="true" className="h-4 w-4" />
      </button>
      <input
        value={value}
        onChange={(event) => {
          const nextValue = Number.parseInt(event.target.value, 10);
          if (Number.isNaN(nextValue)) {
            onChange(1);
            return;
          }
          onChange(Math.min(99, Math.max(1, nextValue)));
        }}
        disabled={disabled}
        inputMode="numeric"
        aria-label="Quantity"
        className="w-12 border-x border-rule bg-transparent text-center font-display text-base font-bold text-ink focus:outline-none disabled:text-ink-muted"
      />
      <button
        type="button"
        onClick={increase}
        disabled={disabled || value >= 99}
        className="flex w-11 items-center justify-center text-ink transition-colors hover:bg-background hover:text-accent disabled:cursor-not-allowed disabled:text-ink-muted/35"
        aria-label="Increase quantity"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProductGallery({
  productTitle,
  gallery,
  activeImage,
  onSelectImage,
}: {
  productTitle: string;
  gallery: ShopifyProduct["images"];
  activeImage: ShopifyProduct["images"][number] | undefined;
  onSelectImage: (image: ShopifyProduct["images"][number]) => void;
}) {
  const { imagePendingLabel } = useContent().product;
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const activeIndex = activeImage
    ? gallery.findIndex((image) => image.url === activeImage.url)
    : 0;
  const showNavigation = gallery.length > 1;
  const selectRelativeImage = (offset: number) => {
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex = (currentIndex + offset + gallery.length) % gallery.length;
    onSelectImage(gallery[nextIndex]);
    setZoom(1);
  };
  const setViewerState = (open: boolean) => {
    setViewerOpen(open);
    if (!open) setZoom(1);
  };

  return (
    <section className="bg-surface p-4 md:p-6 lg:p-8">
      <div
        {...(activeImage ? productImageWatermarkProps() : {})}
        className={`relative aspect-[4/3] max-h-[620px] overflow-hidden bg-[oklch(0.96_0.005_250)] ${
          activeImage ? "protected-image-frame" : ""
        }`}
      >
        {activeImage ? (
          <button
            type="button"
            onClick={() => setViewerState(true)}
            className="group h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent"
            aria-label={`Enlarge ${activeImage.altText ?? productTitle}`}
          >
            <img
              src={shopifyImageUrl(activeImage.url, 1000)}
              srcSet={`${shopifyImageUrl(activeImage.url, 480)} 480w, ${shopifyImageUrl(activeImage.url, 800)} 800w, ${shopifyImageUrl(activeImage.url, 1200)} 1200w`}
              sizes="(min-width: 1024px) 48vw, 100vw"
              width={activeImage.width ?? 1000}
              height={activeImage.height ?? 1000}
              alt={activeImage.altText ?? productTitle}
              draggable={false}
              className="h-full w-full object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <span aria-hidden="true" className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center bg-charcoal-deep/90 text-white shadow-md">
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-muted">
            {imagePendingLabel}
          </div>
        )}

        {showNavigation ? (
          <>
            <button
              type="button"
              onClick={() => selectRelativeImage(-1)}
              aria-label="View previous product image"
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-rule bg-white/90 text-ink shadow-md transition-colors hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:left-4 md:h-12 md:w-12"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => selectRelativeImage(1)}
              aria-label="View next product image"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-rule bg-white/90 text-ink shadow-md transition-colors hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:right-4 md:h-12 md:w-12"
            >
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-charcoal-deep/85 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-white md:bottom-4">
              {(activeIndex >= 0 ? activeIndex : 0) + 1} / {gallery.length}
            </span>
          </>
        ) : null}
      </div>

      {gallery.length > 1 ? (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-5 md:gap-3">
          {gallery.map((image) => (
            <button
              {...productImageWatermarkProps()}
              key={image.url}
              type="button"
              onClick={() => onSelectImage(image)}
              className={`protected-image-frame protected-image-frame--compact aspect-square overflow-hidden border bg-background transition-colors hover:border-accent ${
                activeImage?.url === image.url ? "border-accent" : "border-rule"
              }`}
              aria-label={`View ${image.altText ?? productTitle}`}
            >
              <img
                src={shopifyImageUrl(image.url, 240)}
                width={image.width ?? 240}
                height={image.height ?? 240}
                loading="lazy"
                alt={image.altText ?? productTitle}
                draggable={false}
                className="h-full w-full object-contain mix-blend-multiply"
              />
            </button>
          ))}
        </div>
      ) : null}

      {activeImage ? (
        <Dialog open={viewerOpen} onOpenChange={setViewerState}>
          <DialogContent className="flex h-[95dvh] w-[96vw] max-w-[1500px] flex-col gap-0 overflow-hidden border-rule bg-surface p-0 shadow-2xl sm:rounded-none">
            <DialogTitle className="sr-only">{productTitle} image viewer</DialogTitle>
            <DialogDescription className="sr-only">
              Enlarged product image. Use the zoom controls or double-click the image to zoom.
            </DialogDescription>

            <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface px-4 py-2 pr-14">
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-bold text-ink">{productTitle}</div>
                <div aria-live="polite" className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-muted">
                  Zoom {Math.round(zoom * 100)}%
                </div>
              </div>
              <div className="flex items-center border border-rule bg-background">
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
                  disabled={zoom <= 1}
                  aria-label="Zoom out"
                  className="flex h-10 w-10 items-center justify-center border-r border-rule text-ink hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  disabled={zoom === 1}
                  aria-label="Reset zoom"
                  className="flex h-10 w-10 items-center justify-center border-r border-rule text-ink hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((current) => Math.min(3, current + 0.5))}
                  disabled={zoom >= 3}
                  aria-label="Zoom in"
                  className="flex h-10 w-10 items-center justify-center text-ink hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-auto bg-[oklch(0.96_0.005_250)]">
              <div
                {...productImageWatermarkProps()}
                className="protected-image-frame relative min-h-full min-w-full"
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
              >
                <img
                  src={shopifyImageUrl(activeImage.url, 2400)}
                  width={activeImage.width ?? 1600}
                  height={activeImage.height ?? 1600}
                  alt={activeImage.altText ?? productTitle}
                  onDoubleClick={() => setZoom((current) => (current === 1 ? 2 : 1))}
                  className={`absolute inset-0 h-full w-full select-none object-contain mix-blend-multiply ${
                    zoom === 1 ? "cursor-zoom-in" : "cursor-zoom-out"
                  }`}
                  draggable={false}
                />
              </div>

              {showNavigation ? (
                <>
                  <button
                    type="button"
                    onClick={() => selectRelativeImage(-1)}
                    aria-label="View previous product image"
                    className="fixed left-[3vw] top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-rule bg-white/95 text-ink shadow-md hover:border-accent hover:bg-accent hover:text-white md:h-12 md:w-12"
                  >
                    <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectRelativeImage(1)}
                    aria-label="View next product image"
                    className="fixed right-[3vw] top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-rule bg-white/95 text-ink shadow-md hover:border-accent hover:bg-accent hover:text-white md:h-12 md:w-12"
                  >
                    <ChevronRight className="h-6 w-6" aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-rule bg-surface px-4 py-2 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted">
              Double-click to zoom · scroll to move around a zoomed image
              {showNavigation ? ` · ${(activeIndex >= 0 ? activeIndex : 0) + 1} of ${gallery.length}` : ""}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function StockBadge({ variant, product }: { variant?: ShopifyVariant; product: ShopifyProduct }) {
  const copy = useContent().product;
  const edit = useEditable();
  const quantity = variant?.quantityAvailable;
  const hasExactStock = typeof quantity === "number" && quantity > 0;
  const isAvailable = variant?.availableForSale || product.availableForSale;

  if (!isAvailable) {
    return (
      <span className="inline-flex min-h-10 items-center gap-2 border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700">
        <PackageCheck className="h-3.5 w-3.5" />
        {copy.outOfStockLabel}
      </span>
    );
  }

  return (
    <div className="inline-flex min-h-10 max-w-full flex-wrap items-center gap-x-2 gap-y-1 border border-accent/30 bg-accent/5 px-3 text-sm text-ink">
      <PackageCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="font-semibold">
        {hasExactStock ? `${quantity} in stock` : "Available to order"}
      </span>
      <span aria-hidden="true" className="hidden h-4 w-px bg-rule sm:block" />
      <span className="text-xs text-ink-muted" {...edit(`product.leadTimeNote`, "Lead time note")}>{copy.leadTimeNote}</span>
    </div>
  );
}

function SpecBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-rule bg-surface p-3.5 shadow-[inset_3px_0_0_var(--color-accent)] md:p-4">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </div>
      <div className="mt-2 break-words font-display text-sm font-semibold leading-snug text-ink md:text-[15px]">
        {value}
      </div>
    </div>
  );
}

function ProductDescription({ product }: { product: ShopifyProduct }) {
  if (product.descriptionHtml) {
    return (
      <div
        className="max-w-4xl space-y-4 text-sm leading-7 text-ink-muted [&_a]:text-accent [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
      />
    );
  }

  return (
    <p className="max-w-4xl whitespace-pre-line text-sm leading-7 text-ink-muted">{product.description}</p>
  );
}

function extractYouTubeVideoId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function ProductResources({ product }: { product: ShopifyProduct }) {
  const copy = useContent().product;
  const edit = useEditable();
  type SupportTab = "video" | "pdf" | "description";
  const [activeTab, setActiveTab] = useState<SupportTab>("description");
  const [videoDisclaimerAccepted, setVideoDisclaimerAccepted] = useState(false);
  const [youtubeAllowed, setYoutubeAllowed] = useState(false);
  const { videoGuide, setupVideoUrl, pdfGuide, datasheets, manuals } = product.technicalDetails;
  const videoLinks = [
    ...(videoGuide ? [{ label: videoGuide.text || "Video guide", url: videoGuide.url }] : []),
    ...(setupVideoUrl && setupVideoUrl !== videoGuide?.url
      ? [{ label: "Setup video", url: setupVideoUrl }]
      : []),
  ];
  const youtubeVideo = videoLinks
    .map((video) => ({ ...video, youtubeId: extractYouTubeVideoId(video.url) }))
    .find((video) => video.youtubeId);
  const documents = [
    ...(pdfGuide ? [{ label: pdfGuide.text || "PDF guide", url: pdfGuide.url, type: "PDF Guide" }] : []),
    ...datasheets.map((resource) => ({ ...resource, type: "Datasheet" })),
    ...manuals.map((resource) => ({ ...resource, type: "Manual" })),
  ];
  const hasDescription = Boolean(product.descriptionHtml.trim() || product.description.trim());
  const tabs: Array<{ id: SupportTab; label: string; icon: typeof PlayCircle }> = [
    { id: "description", label: copy.tabDetails, icon: FileText },
    { id: "pdf", label: copy.tabPdf, icon: FileText },
    { id: "video", label: copy.tabVideo, icon: PlayCircle },
  ];

  return (
    <section aria-labelledby="product-support-title" className="px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-5 md:mb-6">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.24em] text-accent" {...edit(`product.supportEyebrow`, "Eyebrow")}>
            {copy.supportEyebrow}
          </div>
          <h2 id="product-support-title" className="mt-2 font-display text-xl font-bold uppercase tracking-tight md:text-2xl" {...edit(`product.supportTitle`, "Panel heading")}>
            {copy.supportTitle}
          </h2>
        </div>

        <div className="overflow-hidden border border-rule bg-background">
          <div
            role="tablist"
            aria-label="Product support information"
            className="grid grid-cols-3 border-b border-rule bg-surface"
          >
            {tabs.map((tab, tabIndex) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`support-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`support-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => {
                    let nextIndex: number | null = null;
                    if (event.key === "ArrowRight") nextIndex = (tabIndex + 1) % tabs.length;
                    if (event.key === "ArrowLeft") nextIndex = (tabIndex - 1 + tabs.length) % tabs.length;
                    if (event.key === "Home") nextIndex = 0;
                    if (event.key === "End") nextIndex = tabs.length - 1;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    const nextTab = tabs[nextIndex];
                    setActiveTab(nextTab.id);
                    requestAnimationFrame(() => document.getElementById(`support-tab-${nextTab.id}`)?.focus());
                  }}
                  className={`relative flex min-h-12 sm:min-h-14 items-center justify-center gap-1.5 sm:gap-2 border-r last:border-r-0 border-rule px-1.5 sm:px-4 font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] sm:tracking-[0.16em] transition-colors ${
                    isActive
                      ? "bg-charcoal-deep text-white after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:bg-accent"
                      : "text-ink-muted hover:bg-background hover:text-accent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div
            id={`support-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`support-tab-${activeTab}`}
            className="p-4 md:p-6 lg:p-8"
          >
            {activeTab === "video" ? (
              videoLinks.length ? (
                youtubeVideo && !youtubeAllowed ? (
                  <YouTubeConsentPanel
                    accepted={videoDisclaimerAccepted}
                    onAcceptedChange={setVideoDisclaimerAccepted}
                    onAllow={() => setYoutubeAllowed(true)}
                  />
                ) : (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(240px,0.5fr)]">
                    {youtubeVideo ? (
                      <div className="aspect-video overflow-hidden border border-rule bg-charcoal-deep">
                        <iframe
                          width="100%"
                          height="100%"
                          src={`https://www.youtube-nocookie.com/embed/${youtubeVideo.youtubeId}`}
                          title={youtubeVideo.label}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                          className="h-full w-full"
                        />
                      </div>
                    ) : (
                      <SupportEmptyState
                        icon={PlayCircle}
                        title="Video preview unavailable"
                        copy="Use the video link to open this guide in a new window."
                      />
                    )}
                    <div className="space-y-3">
                      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-ink-muted" {...edit(`product.videosLabel`, "Videos heading")}>{copy.videosLabel}</div>
                      {videoLinks.map((video) => (
                        <SupportLink key={video.url} href={video.url} icon={PlayCircle} label={video.label} />
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <SupportEmptyState
                  icon={PlayCircle}
                  title="No video available"
                  copy="A video guide has not yet been added for this product."
                />
              )
            ) : null}

            {activeTab === "pdf" ? (
              documents.length ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(240px,0.5fr)]">
                  <iframe
                    src={documents[0].url}
                    title={`${documents[0].label} preview`}
                    className="h-[55vh] min-h-[420px] w-full border border-rule bg-white"
                  />
                  <div className="space-y-3">
                    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-ink-muted" {...edit(`product.documentsLabel`, "Documents heading")}>{copy.documentsLabel}</div>
                    {documents.map((document) => (
                      <SupportLink
                        key={`${document.type}-${document.url}`}
                        href={document.url}
                        icon={FileText}
                        label={`${document.type}: ${document.label}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <SupportEmptyState
                  icon={FileText}
                  title="No PDF available"
                  copy="A PDF guide or datasheet has not yet been added for this product."
                />
              )
            ) : null}

            {activeTab === "description" ? (
              hasDescription ? (
                <ProductDescription product={product} />
              ) : (
                <SupportEmptyState
                  icon={FileText}
                  title="No description available"
                  copy="A detailed description has not yet been added for this product."
                />
              )
            ) : null}
          </div>
        </div>

        <div className="mt-5 border border-rule bg-surface p-5 md:mt-6 md:flex md:items-center md:justify-between md:gap-8 md:p-6">
          <div>
            <h3 className="font-display text-lg font-bold uppercase tracking-tight" {...edit(`product.questionLabel`, "Question heading")}>
              {copy.questionLabel}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted" {...edit(`product.questionCopy`, "Question copy")}>{copy.questionCopy}</p>
          </div>
          <Link
            to="/contact-us"
            className="mt-4 inline-flex h-11 shrink-0 items-center justify-center gap-2 bg-accent px-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:brightness-110 md:mt-0"
          >
            {copy.questionCta}
          </Link>
        </div>
      </div>
    </section>
  );
}

function YouTubeConsentPanel({
  accepted,
  onAcceptedChange,
  onAllow,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onAllow: () => void;
}) {
  return (
    <section
      aria-labelledby="youtube-disclaimer-title"
      className="mx-auto max-w-3xl border border-rule bg-surface p-5 md:p-7"
    >
      <span className="flex h-11 w-11 items-center justify-center bg-accent/10 text-accent">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="mt-5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-accent">
        Third-party content
      </div>
      <h3
        id="youtube-disclaimer-title"
        className="mt-2 font-display text-xl font-bold uppercase tracking-tight text-ink"
      >
        YouTube video disclaimer
      </h3>
      <p className="mt-3 text-sm leading-6 text-ink-muted">
        This video is provided by YouTube, a Google service. If you continue, the YouTube
        player will load and Google may receive information such as your IP address, device
        details, and viewing activity, and may store or access information on your device.
      </p>
      <p className="mt-3 text-sm leading-6 text-ink-muted">
        The video is third-party content and is subject to{" "}
        <a
          href="https://www.youtube.com/static?template=terms"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent underline underline-offset-2"
        >
          YouTube&apos;s Terms of Service
        </a>{" "}
        and the{" "}
        <a
          href="https://policies.google.com/privacy?gl=GB&hl=en-GB"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent underline underline-offset-2"
        >
          Google Privacy Policy
        </a>
        . You can also review our <Link to="/cookies" className="font-semibold text-accent underline underline-offset-2">Cookie Policy</Link>.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 border border-rule bg-background p-4 text-sm leading-6 text-ink">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
        />
        <span>
          I understand this disclaimer and agree to load the YouTube video and its
          third-party content.
        </span>
      </label>

      <button
        type="button"
        disabled={!accepted}
        onClick={onAllow}
        className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 bg-accent px-5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <PlayCircle className="h-4 w-4" aria-hidden="true" />
        Agree and load YouTube video
      </button>
    </section>
  );
}
function SupportLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof PlayCircle;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-14 items-center gap-3 border border-rule bg-surface p-4 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-accent/10 text-accent">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>{label}</span>
    </a>
  );
}


function SupportEmptyState({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof PlayCircle;
  title: string;
  copy: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center border border-dashed border-rule bg-surface px-5 py-10 text-center md:min-h-[280px]">
      <span className="flex h-12 w-12 items-center justify-center bg-accent/10 text-accent">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold uppercase tracking-tight">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{copy}</p>
    </div>
  );
}
