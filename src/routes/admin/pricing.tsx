import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  CheckCircle2,
  PackageSearch,
  RefreshCw,
  Search,
  Tags,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsShell } from "@/components/admin/CmsShell";
import { EmptyState, Notice, Pill, SectionCard, Spinner } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminSession } from "@/lib/admin/admin.functions";
import {
  applyBulkPriceUpdate,
  listPricingProducts,
  previewBulkPriceUpdate,
} from "@/lib/admin/commerce.functions";
import { cmsHead } from "@/lib/admin/head";
import { moneyAmount } from "@/lib/shopify/commerce";

type Preview = Awaited<ReturnType<typeof previewBulkPriceUpdate>>;
type PricingProduct = Awaited<ReturnType<typeof listPricingProducts>>[number];

export const Route = createFileRoute("/admin/pricing")({
  head: () => cmsHead("Bulk pricing"),
  loader: async () => {
    const staff = await getAdminSession();
    if (!staff) throw redirect({ to: "/admin/login" });
    if (staff.mustChangePassword) throw redirect({ to: "/admin/change-password" });
    if (staff.role !== "admin") throw redirect({ to: "/admin" });
    return { staff };
  },
  component: PricingPage,
});

function PricingPage() {
  const { staff } = Route.useLoaderData();
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState("");
  const [percentage, setPercentage] = useState("5");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"preview" | "apply" | "">("");
  const [completed, setCompleted] = useState<{ variants: number; products: number } | null>(null);

  async function loadProducts() {
    setCatalogueLoading(true);
    setCatalogueError("");
    try {
      setProducts(await listPricingProducts());
    } catch (error) {
      setCatalogueError(
        error instanceof Error ? error.message : "Shopify products could not be loaded.",
      );
    } finally {
      setCatalogueLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const visibleProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return products;
    return products.filter((product) =>
      [product.title, product.vendor, product.productType, product.status]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [productSearch, products]);

  const selectedIds = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const allVisibleSelected =
    visibleProducts.length > 0 && visibleProducts.every((product) => selectedIds.has(product.id));

  function resetPreview() {
    setPreview(null);
    setConfirmation("");
    setCompleted(null);
  }

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
    resetPreview();
  }

  function toggleVisibleProducts() {
    const visibleIds = new Set(visibleProducts.map((product) => product.id));
    setSelectedProductIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.has(id));
      return [...new Set([...current, ...visibleIds])];
    });
    resetPreview();
  }

  async function buildPreview() {
    setBusy("preview");
    setPreview(null);
    setConfirmation("");
    setCompleted(null);
    try {
      const next = await previewBulkPriceUpdate({
        data: { productIds: selectedProductIds, percentage: Number(percentage) },
      });
      setPreview(next);
      if (!next.variantCount) toast.info("No positive-price variants matched this selection.");
    } catch (error) {
      toast.error("Preview could not be built", {
        description: error instanceof Error ? error.message : "Shopify catalogue is unavailable.",
      });
    } finally {
      setBusy("");
    }
  }

  const confirmationText = preview ? `UPDATE ${preview.variantCount} PRICES` : "";

  return (
    <CmsShell
      staff={staff}
      title="Bulk pricing"
      subtitle="Increase or decrease Shopify variant prices by a percentage. Every run is previewed, revalidated immediately before writing, and recorded in the activity log."
    >
      <Notice tone="warning" title="This changes live Shopify prices">
        Existing zero-price “Request price” products are deliberately skipped. Discounts, Markets
        price lists, compare-at prices, and existing orders are not changed.
      </Notice>

      <div className="mt-4 grid gap-4 lg:grid-cols-[28rem_minmax(0,1fr)]">
        <SectionCard
          title="Select products"
          description={`${selectedProductIds.length.toLocaleString("en-GB")} of ${products.length.toLocaleString("en-GB")} selected`}
        >
          <div className="space-y-5 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-search">Find products</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="product-search"
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Search name, vendor or product type"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                <span className="text-[11px] text-muted-foreground">
                  {visibleProducts.length.toLocaleString("en-GB")} products shown
                </span>
                <div className="flex items-center gap-1">
                  {selectedProductIds.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedProductIds([]);
                        resetPreview();
                      }}
                    >
                      Clear all
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={catalogueLoading || visibleProducts.length === 0}
                    onClick={toggleVisibleProducts}
                  >
                    {allVisibleSelected ? "Clear shown" : "Select shown"}
                  </Button>
                </div>
              </div>

              {catalogueLoading ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Loading Shopify products
                </div>
              ) : catalogueError ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-destructive">{catalogueError}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Button asChild size="sm">
                      <a href="/api/shopify/oauth/start">Connect Shopify</a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadProducts()}
                    >
                      <RefreshCw /> Try again
                    </Button>
                  </div>
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                  <PackageSearch className="size-6" />
                  No Shopify products match this search.
                </div>
              ) : (
                <div className="max-h-[24rem] divide-y overflow-y-auto">
                  {visibleProducts.map((product) => (
                    <label
                      key={product.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{product.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {[product.vendor, product.productType].filter(Boolean).join(" · ") ||
                            "No vendor or product type"}
                        </span>
                      </span>
                      <Pill
                        tone={product.status === "ACTIVE" ? "success" : "neutral"}
                        dot
                        className="capitalize"
                      >
                        {product.status.toLowerCase()}
                      </Pill>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="price-percentage">Percentage change</Label>
              <div className="relative">
                <Input
                  id="price-percentage"
                  type="number"
                  min={-90}
                  max={500}
                  step="0.01"
                  value={percentage}
                  onChange={(event) => {
                    setPercentage(event.target.value);
                    resetPreview();
                  }}
                  className="pr-9"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {Number(percentage) < 0 ? (
                  <ArrowDown className="size-3" />
                ) : (
                  <ArrowUp className="size-3" />
                )}
                Use a negative number to decrease prices and a positive number to increase them.
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => void buildPreview()}
              disabled={
                Boolean(busy) ||
                selectedProductIds.length === 0 ||
                !percentage ||
                Number(percentage) === 0
              }
            >
              {busy === "preview" ? <Spinner /> : <Calculator />} Preview changes
            </Button>
          </div>
        </SectionCard>

        <div>
          {completed ? (
            <SectionCard>
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto size-10 text-success" />
                <h2 className="mt-3 text-base font-semibold">Shopify prices updated</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {completed.variants.toLocaleString("en-GB")} variants across{" "}
                  {completed.products.toLocaleString("en-GB")} products were updated.
                </p>
                <Button className="mt-5" variant="outline" onClick={() => setCompleted(null)}>
                  Start another update
                </Button>
              </div>
            </SectionCard>
          ) : !preview ? (
            <EmptyState
              icon={<Tags />}
              title="Preview required"
              copy="Select one or more Shopify products and enter a percentage. No price is changed until the preview count is confirmed."
            />
          ) : preview.variantCount === 0 ? (
            <EmptyState
              icon={<Tags />}
              title="No prices matched"
              copy="The selected products have no positive-price variants. Choose other products and preview again."
            />
          ) : (
            <div className="space-y-4">
              <SectionCard title="Change summary">
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <Metric label="Products" value={preview.productCount} />
                  <Metric label="Variants" value={preview.variantCount} />
                  <Metric
                    label="Change"
                    value={`${preview.percentage > 0 ? "+" : ""}${preview.percentage}%`}
                  />
                  <Metric label="Zero prices skipped" value={preview.skippedZeroPrices} />
                </div>
              </SectionCard>

              <SectionCard
                title="Price preview"
                description={`Showing ${Math.min(100, preview.items.length)} of ${preview.items.length} variants`}
              >
                <div className="max-h-[30rem] overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-card text-[10px] tracking-wide text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2">Product / variant</th>
                        <th className="px-3 py-2 text-right">Current</th>
                        <th className="px-3 py-2 text-right">New</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.items.slice(0, 100).map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">
                            <span className="block font-medium">{item.productTitle}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {item.title}
                              {item.sku ? ` · ${item.sku}` : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {moneyAmount(item.price, item.currencyCode)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {moneyAmount(item.newPrice, item.currencyCode)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Confirm live update">
                <div className="space-y-3 p-4">
                  <p className="text-xs text-muted-foreground">
                    Type{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground">
                      {confirmationText}
                    </code>{" "}
                    exactly. Shopify is checked again before any write; if the selection count
                    changed, the update stops.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      aria-label="Price update confirmation"
                    />
                    <Button
                      variant="destructive"
                      disabled={busy === "apply" || confirmation !== confirmationText}
                      onClick={async () => {
                        setBusy("apply");
                        try {
                          const result = await applyBulkPriceUpdate({
                            data: {
                              productIds: preview.productIds,
                              percentage: preview.percentage,
                              expectedVariantCount: preview.variantCount,
                              expectedFingerprint: preview.fingerprint,
                              confirmation,
                            },
                          });
                          setPreview(null);
                          setConfirmation("");
                          setCompleted({
                            variants: result.updatedVariants,
                            products: result.updatedProducts,
                          });
                          toast.success("Shopify prices updated");
                        } catch (error) {
                          toast.error("Price update stopped", {
                            description:
                              error instanceof Error
                                ? error.message
                                : "Shopify rejected the update.",
                          });
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {busy === "apply" ? <Spinner /> : <Tags />} Apply live prices
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </div>
    </CmsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card p-3">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
