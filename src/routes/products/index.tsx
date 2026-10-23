import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUpDown, ChevronRight, Filter, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import automation from "@/assets/Automation pic.jpg";
import asphalt from "@/assets/asphalt-plant.jpg";
import concrete from "@/assets/concrete-plant.jpg";
import catControls from "@/assets/Control panels and software pic.jpg";
import catHome from "@/assets/Home automation pic.jpg";
import catPacking from "@/assets/packing machines pic.jpg";
import { ProductCard } from "@/components/shopify/ProductCard";
import { SiteFooter } from "@/components/shopify/SiteFooter";
import { SiteHeader } from "@/components/shopify/SiteHeader";
import { getCatalogProductsPage, getCollection } from "@/lib/api/shopify.functions";
import { CATALOG_CATEGORIES, getCatalogueSearch } from "@/lib/catalog";

const CATEGORY_IMAGES: Record<string, string> = {
  asphalt,
  concrete,
  packing: catPacking,
  automation,
  "home-controls": catHome,
  "control-panels-software": catControls,
};
import type { ShopifyProduct } from "@/lib/shopify/types";
import { useContent } from "@/lib/content/ContentContext";
import { useEditable } from "@/lib/content/edit-mode";
import { getPublishedContent } from "@/lib/content/content.functions";
import { contentPageHead } from "@/lib/seo";

type CategoryFilter = {
  label: string;
  handle: string;
  description: string;
};

const categoryGroups = CATALOG_CATEGORIES.map((category) => ({
  ...category,
  collections: [
    { label: category.label, handle: category.handle, description: category.description },
    ...category.productLines.map((line) => ({
      label: line.label,
      handle: line.collectionHandle,
      description: `${line.label} products`,
    })),
  ] satisfies CategoryFilter[],
}));
const collectionFilters = categoryGroups.flatMap((category) => category.collections);
const CATALOGUE_PAGE_SIZE = 12;

export const Route = createFileRoute("/products/")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search.category === "string" ? search.category : "all",
    availability: search.availability === "available" ? ("available" as const) : ("all" as const),
    sort: ["price-asc", "price-desc", "title"].includes(String(search.sort))
      ? (search.sort as "price-asc" | "price-desc" | "title")
      : ("newest" as const),
  }),
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: async ({ deps }) => {
    const collectionHandle = collectionFilters.some((category) => category.handle === deps.category)
      ? deps.category
      : undefined;
    const [initialPage, collections, content] = await Promise.all([
      getCatalogProductsPage({ data: { first: CATALOGUE_PAGE_SIZE, collectionHandle } }),
      Promise.all(
        categoryGroups.map(async (category) => {
          try {
            const collection = await getCollection({
              data: { handle: category.handle, first: 1 },
            });

            return [
              category.handle,
              collection?.description.trim() || category.description,
            ] as const;
          } catch {
            return [category.handle, category.description] as const;
          }
        }),
      ),
      getPublishedContent(),
    ]);

    const activeCollectionItem =
      deps.category && deps.category !== "all"
        ? collectionFilters.find((category) => category.handle === deps.category)
        : undefined;

    return {
      initialPage,
      categoryDescriptions: Object.fromEntries(collections),
      site: content.site,
      seo: content.product.listingSeo,
      categoryTitle: activeCollectionItem?.label,
      categoryDescription: activeCollectionItem?.description,
    };
  },
  head: ({ loaderData }) => {
    const seo = loaderData?.categoryTitle
      ? {
          title: loaderData.categoryTitle,
          description:
            loaderData.categoryDescription ??
            loaderData.seo?.description ??
            "Browse products across asphalt, concrete, packing, automation and control categories.",
          ogTitle: loaderData.categoryTitle,
          ogDescription: loaderData.categoryDescription ?? "",
        }
      : loaderData?.seo;

    return contentPageHead(seo, loaderData?.site, "/products", {
      title: "All Products",
      description:
        "Browse all products across asphalt, concrete, packing, automation and control categories.",
    });
  },
  component: ProductsCataloguePage,
});

function ProductsCataloguePage() {
  const { catalogue, messages, product: productCopy } = useContent();
  const edit = useEditable();
  const presentation = new Map(catalogue.categories.map((category) => [category.handle, category]));
  const displayedCategoryGroups = categoryGroups.filter((category) => presentation.get(category.handle)?.visible !== false).map((category) => {
    const managed = presentation.get(category.handle);
    return { ...category, label: managed?.label ?? category.label, description: managed?.description ?? category.description, collections: category.collections.map((collection, index) => index === 0 ? { ...collection, label: managed?.label ?? collection.label, description: managed?.description ?? collection.description } : collection) };
  });
  const { initialPage, categoryDescriptions } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [products, setProducts] = useState<ShopifyProduct[]>(initialPage.products);
  const [pageInfo, setPageInfo] = useState(initialPage.pageInfo);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const activeCategory = search.category;
  const isAll = !activeCategory || activeCategory === "all";
  const activeGroup = displayedCategoryGroups.find((category) =>
    category.collections.some((collection) => collection.handle === activeCategory),
  );
  const activeCollection = activeGroup?.collections.find(
    (collection) => collection.handle === activeCategory,
  );
  const isSubcategory = Boolean(
    activeGroup && activeCollection && activeCollection.handle !== activeGroup.handle,
  );

  const presentationIndex = activeGroup
    ? catalogue.categories.findIndex((category) => category.handle === activeGroup.handle)
    : -1;
  const presentationCategory =
    presentationIndex >= 0 ? catalogue.categories[presentationIndex] : null;

  const managedImage = presentationCategory?.mediaId
    ? `/content-media/${presentationCategory.mediaId}/image`
    : null;
  const heroImage =
    !isAll && activeGroup
      ? (managedImage ?? CATEGORY_IMAGES[activeGroup.handle] ?? automation)
      : automation;
  const heroImageAlt =
    !isAll && activeGroup
      ? managedImage
        ? presentationCategory?.mediaAlt || activeCollection?.label || activeGroup.label
        : `${activeCollection?.label || activeGroup.label} catalogue`
      : "Industrial automation catalogue";

  const heroEyebrow =
    isAll || !activeGroup
      ? productCopy.listingEyebrow
      : isSubcategory
        ? activeGroup.label
        : productCopy.listingEyebrow;

  const heroTitle = isAll || !activeCollection ? null : activeCollection.label;

  const heroIntro = isAll
    ? productCopy.listingIntro
    : activeCollection?.description ||
      (activeGroup && categoryDescriptions[activeGroup.handle]) ||
      activeGroup?.description ||
      productCopy.listingIntro;

  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    activeGroup?.handle ?? null,
  );
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const revealResultsAfterNavigationRef = useRef(false);
  const availability = search.availability;
  const sort = search.sort;
  const updateSearch = (updates: Partial<typeof search>) =>
    void navigate({
      search: (previous: typeof search) => ({ ...previous, ...updates }),
      replace: true,
    });

  const revealResults = useCallback(() => {
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleCategorySelection = (selectedHandle: string, expandedHandle: string | null) => {
    setExpandedCategory(expandedHandle);

    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    if (selectedHandle === activeCategory) {
      requestAnimationFrame(revealResults);
      return;
    }

    revealResultsAfterNavigationRef.current = true;
  };

  useEffect(() => {
    setProducts(initialPage.products);
    setPageInfo(initialPage.pageInfo);
    setLoadError("");
  }, [initialPage]);

  useEffect(() => {
    setExpandedCategory(activeGroup?.handle ?? null);
  }, [activeGroup?.handle]);

  useEffect(() => {
    if (!revealResultsAfterNavigationRef.current) return;

    revealResultsAfterNavigationRef.current = false;
    const frame = requestAnimationFrame(revealResults);

    return () => cancelAnimationFrame(frame);
  }, [activeCategory, initialPage, revealResults]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const sidebar = sidebarRef.current;
      const selected = sidebar?.querySelector<HTMLElement>("[data-catalog-active='true']");
      if (!sidebar || !selected) return;

      const sidebarBox = sidebar.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      sidebar.scrollTo({
        top: Math.max(0, sidebar.scrollTop + selectedBox.top - sidebarBox.top - 12),
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeCategory, expandedCategory]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        if (availability === "available" && !product.availableForSale) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);

        const priceA = Number(a.priceRange.minVariantPrice.amount);
        const priceB = Number(b.priceRange.minVariantPrice.amount);

        if (sort === "price-asc") return priceA - priceB;
        if (sort === "price-desc") return priceB - priceA;

        return 0;
      });
  }, [availability, products, sort]);

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <section className="relative flex min-h-[120px] min-w-0 items-center overflow-hidden md:min-h-[140px] max-h-[175px]">
        <img
          src={heroImage}
          alt={heroImageAlt}
          className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal-deep via-charcoal-deep/70 to-charcoal-deep/10" />
        <div className="relative mx-auto w-full max-w-[1600px] px-4 py-3 md:px-6 md:py-4">
          <div
            className="mb-2 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.3em] text-white/60 md:text-[10px]"
            {...(isAll ? edit(`product.listingEyebrow`, "Eyebrow") : {})}
          >
            <span className="h-px w-8 bg-accent" />
            {heroEyebrow}
          </div>
          {isAll || !heroTitle ? (
            <h1
              className="break-words font-display text-[clamp(1.45rem,5vw,2.25rem)] font-extrabold uppercase leading-none tracking-tight text-white"
              {...edit(`product.listingTitle`, "Listing heading")}
            >
              {productCopy.listingTitle}{" "}
              <span
                className="text-accent"
                {...edit(`product.listingHighlight`, "Highlighted word")}
              >
                {productCopy.listingHighlight}
              </span>
            </h1>
          ) : (
            <h1
              className="break-words font-display leading-tight tracking-tight text-white"
              {...(presentationIndex >= 0 && !isSubcategory
                ? edit(`catalogue.categories.${presentationIndex}.label`, "Category name")
                : {})}
            >
              <span className="block font-display text-[clamp(1.55rem,5.2vw,2.4rem)] font-extrabold uppercase text-white">
                {heroTitle}
              </span>
              <span className="mt-1.5 flex items-center gap-2 font-mono text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                <span className="h-px w-4 bg-accent" />
                <span>
                  {productCopy.listingTitle}{" "}
                  <span className="text-accent">{productCopy.listingHighlight}</span>
                </span>
              </span>
            </h1>
          )}
          {heroIntro ? (
            <p
              className="mt-2 max-w-2xl pr-2 text-xs leading-relaxed text-white/70 md:pr-0 md:text-sm"
              {...(isAll
                ? edit(`product.listingIntro`, "Introduction")
                : presentationIndex >= 0 && !isSubcategory
                  ? edit(
                      `catalogue.categories.${presentationIndex}.description`,
                      "Category description",
                    )
                  : {})}
            >
              {heroIntro}
            </p>
          ) : null}
        </div>
      </section>

      <main
        id="main-content"
        className="mx-auto grid min-w-0 max-w-[1600px] grid-cols-1 gap-6 px-4 py-8 md:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:min-h-[900px]"
      >
        <aside
          ref={sidebarRef}
          aria-label="Product collections"
          className="h-fit min-w-0 overflow-hidden border border-rule bg-surface lg:sticky lg:top-[116px] lg:max-h-[calc(100dvh-116px)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:auto] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden xl:top-[180px] xl:max-h-[calc(100dvh-180px)]"
        >
          <div className="border-b border-rule p-3 sm:p-4 lg:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-ink-muted">
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
                Categories
              </div>
              <span className="inline-block max-w-[150px] truncate border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-accent lg:hidden">
                {isAll
                  ? "All"
                  : activeCollection?.label ??
                    collectionFilters.find((c) => c.handle === activeCategory)?.label ??
                    "All"}
              </span>
            </div>
          </div>

          <div className="max-lg:max-h-[240px] max-lg:overflow-y-auto max-lg:overscroll-contain p-2 sm:p-3 lg:p-3">
            <Link
              to="/products"
              search={getCatalogueSearch("all")}
              resetScroll={false}
              aria-current={activeCategory === "all" ? "page" : undefined}
              data-catalog-active={activeCategory === "all"}
              onClick={() => handleCategorySelection("all", null)}
              className={`flex w-full items-center justify-between border px-3 py-2.5 sm:px-4 sm:py-3 lg:px-4 lg:py-4 text-left transition-colors ${
                activeCategory === "all"
                  ? "border-accent bg-accent/10"
                  : "border-transparent hover:border-rule hover:bg-background"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-display text-xs sm:text-sm font-bold uppercase tracking-tight">
                  All Products
                </span>
                <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted sm:text-[10px] sm:tracking-[0.18em] lg:mt-1 lg:whitespace-normal">
                  Complete catalogue
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent" />
            </Link>

            {displayedCategoryGroups.map((category) => {
              const parent = category.collections[0];
              const children = category.collections.slice(1);
              const expanded = expandedCategory === category.handle;
              const groupActive = category.collections.some(
                (collection) => collection.handle === activeCategory,
              );

              return (
                <div key={category.handle} className="mt-1.5 sm:mt-2">
                  <div
                    className={`flex w-full items-stretch border transition-colors ${
                      activeCategory === parent.handle
                        ? "border-accent bg-accent/10"
                        : groupActive
                          ? "border-rule bg-background"
                          : "border-transparent hover:border-rule hover:bg-background"
                    }`}
                  >
                    <Link
                      to="/products"
                      search={getCatalogueSearch(parent.handle)}
                      resetScroll={false}
                      aria-current={activeCategory === parent.handle ? "page" : undefined}
                      data-catalog-active={activeCategory === parent.handle}
                      onClick={() => handleCategorySelection(parent.handle, category.handle)}
                      className="min-w-0 flex-1 px-3 py-2.5 sm:px-4 sm:py-3 lg:px-4 lg:py-4 text-left"
                    >
                      <span className="block truncate font-display text-xs sm:text-sm font-bold uppercase tracking-tight lg:whitespace-normal">
                        {parent.label}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted sm:text-[10px] sm:tracking-[0.18em] lg:mt-1 lg:whitespace-normal">
                        {presentation.get(parent.handle)?.description ?? categoryDescriptions[parent.handle] ?? parent.description}
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`catalogue-group-${category.handle}`}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${parent.label}`}
                      onClick={() => setExpandedCategory(expanded ? null : category.handle)}
                      className="flex w-10 sm:w-11 shrink-0 items-center justify-center text-accent hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  </div>

                  {expanded ? (
                    <div id={`catalogue-group-${category.handle}`}>
                      {children.map((collection) => (
                        <Link
                          key={collection.handle}
                          to="/products"
                          search={getCatalogueSearch(collection.handle)}
                          resetScroll={false}
                          aria-current={activeCategory === collection.handle ? "page" : undefined}
                          data-catalog-active={activeCategory === collection.handle}
                          onClick={() =>
                            handleCategorySelection(collection.handle, category.handle)
                          }
                          className={`flex w-full items-center justify-between border border-t-0 px-3 py-2 pl-6 sm:px-4 sm:py-2.5 sm:pl-7 text-left transition-colors ${
                            activeCategory === collection.handle
                              ? "border-accent bg-accent/10"
                              : "border-transparent hover:border-rule hover:bg-background"
                          }`}
                        >
                          <span className="block truncate font-display text-xs font-bold uppercase tracking-tight lg:whitespace-normal">
                            {collection.label}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-accent" />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            aria-controls="catalogue-results"
            onClick={revealResults}
            className="flex w-full items-center justify-between border-t border-accent/30 bg-accent px-4 py-3 text-left text-accent-foreground lg:hidden"
          >
            <span>
              <span className="block font-display text-sm font-extrabold uppercase tracking-tight">
                View products
              </span>
              <span className="mt-0.5 block font-mono text-[9px] font-bold uppercase tracking-[0.16em] opacity-80">
                Results are shown below
              </span>
            </span>
            <ArrowDown className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
        </aside>

        <section
          ref={resultsRef}
          id="catalogue-results"
          className="min-w-0 scroll-mt-20 lg:min-h-[800px]"
        >
          <div className="border border-rule bg-surface p-4 md:p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-ink-muted">
                  <SlidersHorizontal className="h-4 w-4 text-accent" />
                  Refine products
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                    Showing{" "}
                    <strong className="font-bold text-ink">{filteredProducts.length}</strong> of{" "}
                    <strong className="font-bold text-ink">{products.length}</strong> loaded
                  </span>
                  <span className="border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-accent">
                    {isAll
                      ? "All Products"
                      : activeCollection?.label ??
                        collectionFilters.find((category) => category.handle === activeCategory)?.label}
                  </span>
                </div>
              </div>

              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto">
                <label className="group min-w-0 border border-rule bg-background px-3 py-2 transition-colors focus-within:border-accent sm:min-w-[190px]">
                  <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                    Availability
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <select
                      aria-label="Filter by availability"
                      value={availability}
                      onChange={(event) =>
                        updateSearch({ availability: event.target.value as "all" | "available" })
                      }
                      className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink focus:outline-none"
                    >
                      <option value="all">All Stock</option>
                      <option value="available">Available</option>
                    </select>
                  </span>
                </label>

                <label className="group min-w-0 border border-rule bg-background px-3 py-2 transition-colors focus-within:border-accent sm:min-w-[190px]">
                  <span className="block font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                    Sort by
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <select
                      aria-label="Sort products"
                      value={sort}
                      onChange={(event) =>
                        updateSearch({ sort: event.target.value as typeof sort })
                      }
                      className="min-w-0 flex-1 bg-transparent font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink focus:outline-none"
                    >
                      <option value="newest">Newest</option>
                      <option value="title">A-Z</option>
                      <option value="price-asc">Price Low</option>
                      <option value="price-desc">Price High</option>
                    </select>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="mt-6 border border-dashed border-rule bg-surface px-4 py-10 text-center md:px-8 md:py-16">
              <h2 className="font-display text-xl font-bold uppercase tracking-tight md:text-2xl">
                {products.length === 0 ? productCopy.emptyTitle : productCopy.filteredEmptyTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-muted md:mt-4">
                {products.length === 0 ? productCopy.emptyCopy : productCopy.filteredEmptyCopy}
              </p>
              <button
                type="button"
                onClick={() => {
                  void navigate({
                    search: { category: "all", availability: "all", sort: "newest" },
                    replace: true,
                  });
                }}
                className="mt-6 inline-flex h-11 items-center justify-center bg-accent px-6 font-mono text-[10px] uppercase tracking-[0.22em] text-accent-foreground md:mt-8"
              >
                Reset Filters
              </button>
            </div>
          )}

          {pageInfo.hasNextPage ? (
            <div className="mt-6 text-center">
              {loadError ? (
                <p role="alert" className="mb-3 text-sm text-red-700">
                  {loadError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  setLoadError("");
                  try {
                    const next = await getCatalogProductsPage({
                      data: {
                        first: CATALOGUE_PAGE_SIZE,
                        collectionHandle: activeCategory === "all" ? undefined : activeCategory,
                        after: pageInfo.endCursor ?? undefined,
                      },
                    });
                    setProducts((current) => [
                      ...current,
                      ...next.products.filter(
                        (product) => !current.some((item) => item.id === product.id),
                      ),
                    ]);
                    setPageInfo(next.pageInfo);
                  } catch {
                    setLoadError("More products could not be loaded. Please try again.");
                  } finally {
                    setLoadingMore(false);
                  }
                }}
                className="inline-flex h-12 items-center justify-center border border-accent bg-surface px-7 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-accent hover:bg-accent hover:text-white disabled:opacity-60"
              >
                {loadingMore ? "Loading products" : messages["catalogue.loadMore"]}
              </button>
            </div>
          ) : null}

          <div className="mt-10 border border-rule bg-charcoal-deep p-6 text-white/70">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
              Trade Support
            </div>
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <p className="max-w-2xl text-sm leading-relaxed text-white/50">
                Trouble finding the right part? Send a part number, manufacturer reference, or
                photo.
              </p>
              <Link
                to="/contact-us"
                className="inline-flex h-11 shrink-0 items-center justify-center border border-white/10 px-5 font-mono text-[10px] uppercase tracking-[0.22em] text-white transition-colors hover:border-accent hover:text-accent"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
