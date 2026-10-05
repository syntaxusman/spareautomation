import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Mail,
  MessageSquare,
  Paperclip,
  PlayCircle,
  Send,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import asphalt from "@/assets/asphalt-plant.jpg";
import concrete from "@/assets/concrete-plant.jpg";
import catAutomation from "@/assets/Automation pic.jpg";
import catControls from "@/assets/Control panels and software pic.jpg";
import catHome from "@/assets/Home automation pic.jpg";
import catPacking from "@/assets/packing machines pic.jpg";
import { SiteFooter } from "@/components/shopify/SiteFooter";
import { SiteHeader } from "@/components/shopify/SiteHeader";
import { submitPartInquiry, uploadPartInquiryPhoto } from "@/lib/api/cms.functions";
import { getCatalogueSearch, getCatalogCategory } from "@/lib/catalog";
import { useHydrated } from "@/hooks/use-hydrated";
import { SITE } from "@/lib/site";
import { useContent } from "@/lib/content/ContentContext";
import { getPublishedContent } from "@/lib/content/content.functions";
import { useEditable } from "@/lib/content/edit-mode";

export const Route = createFileRoute("/")({
  loader: async () => getPublishedContent(),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.home.seo.title ?? "Spares Automation - Industrial Parts & Automation Spares" },
      {
        name: "description",
        content: loaderData?.home.seo.description ?? "Browse product ranges, request quotes, and find support from Spares Automation.",
      },
      { property: "og:title", content: loaderData?.home.seo.title ?? "Spares Automation" },
      { property: "og:description", content: loaderData?.home.seo.description ?? "Industrial parts and automation support." },
    ],
    links: [{ rel: "canonical", href: loaderData?.site.url ?? SITE.url }],
  }),
  component: Home,
});

const legacyPrimaryRanges = [
  {
    title: "Asphalt / Blacktop Spares",
    img: asphalt,
    category: "asphalt",
    accent: "accent",
    lines: [
      {
        label: "Aggregate feeding",
        meta: "Hoppers / Belts / Conveyors",
        category: "asphalt-aggregate-feeding",
      },
      { label: "Burner / Drying", meta: "Nozzles / Fuel pumps", category: "burner-drying" },
      { label: "Bitumen", meta: "Pumps / Valves / Hoses", category: "bitumen" },
      {
        label: "Hot storage / silos",
        meta: "Hot bins / Storage",
        category: "hot-storage-and-silos",
      },
      { label: "Baghouse", meta: "Filters / Bags / Dust", category: "baghouse" },
      { label: "Mixing Tower", meta: "Flights / Liners / Seals", category: "mixing-tower" },
    ],
  },
  {
    title: "Ready-Mix / Concrete Spares",
    img: concrete,
    category: "concrete",
    accent: "amber",
    lines: [
      {
        label: "Aggregate Feeding",
        meta: "Hoppers / Belts / Conveyors",
        category: "concrete-aggregate-feeding",
      },
      {
        label: "Cement / Material Silos",
        meta: "Filters / Aerators / Valves",
        category: "cement-material-silos",
      },
      {
        label: "Additive System",
        meta: "Admixture / Chemical / Dosing",
        category: "additive-system",
      },
      { label: "Water Controls", meta: "Meters / Pumps / Flow Valves", category: "water-controls" },
      {
        label: "Air Controls",
        meta: "Pneumatics / Compressors / Actuators",
        category: "air-controls",
      },
      {
        label: "Automation Controls",
        meta: "PLCs / Sensors / Panels",
        category: "automation-controls",
      },
    ],
  },
];

const legacyCategories = [
  // Replacement photos should be landscape, 4:3 or 16:10, minimum 1200px wide.
  { title: "Packing Machinery", img: catPacking, category: "packing" },
  { title: "Automation & Drives", img: catAutomation, category: "automation" },
  { title: "Home Automation and Controls", img: catHome, category: "home-controls" },
  { title: "Control Panels & Software", img: catControls, category: "control-panels-software" },
];

function HeroTitle({ title, accent }: { title: string; accent: "accent" | "amber" }) {
  const baseTitle = title.replace(/ Spares$/, "");

  return (
    <>
      {baseTitle} <span className={accent === "amber" ? "text-amber" : "text-accent"}>Spares</span>
    </>
  );
}

export function Home() {
  const content = useContent();
  const edit = useEditable();
  const managedRanges = content.catalogue.ranges ?? [];
  const primaryRanges = legacyPrimaryRanges.map((range, index) => {
    const managed = managedRanges[index];
    if (!managed) return range;
    return {
      ...range,
      title: managed.title,
      lines: range.lines.map((line, lineIndex) => ({
        ...line,
        label: managed.lines[lineIndex]?.label ?? line.label,
        meta: managed.lines[lineIndex]?.meta ?? line.meta,
        rangeIndex: index,
        lineIndex,
      })),
      rangeIndex: index,
    };
  });
  const managedTiles = content.catalogue.tiles ?? [];
  const categories = legacyCategories.map((tile, index) => ({
    ...tile,
    title: managedTiles[index]?.title ?? tile.title,
    tileIndex: index,
  }));
  const presentation = new Map(content.catalogue.categories.map((category) => [category.handle, category]));
  const managedTitle = (handle: string, fallback: string) => { const managed = presentation.get(handle); return managed?.label !== getCatalogCategory(handle)?.label ? (managed?.label ?? fallback) : fallback; };
  const withPresentation = <T extends { category: string; title: string; img: string }>(item: T) => { const managed = presentation.get(item.category); return { ...item, title: managedTitle(item.category, item.title), img: managed?.mediaId ? `/content-media/${managed.mediaId}/image` : item.img, managedAlt: managed?.mediaId ? (managed.mediaAlt || managed.label) : "" }; };
  const displayedPrimaryRanges = primaryRanges.filter((range) => presentation.get(range.category)?.visible !== false).map(withPresentation);
  const displayedCategories = categories.filter((category) => presentation.get(category.category)?.visible !== false).map(withPresentation);
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [photoError, setPhotoError] = useState("");

  async function submitPartRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const photo = data.get("photo");
    setBusy(true);
    setError("");
    setPhotoError("");
    try {
      const result = await submitPartInquiry({
        data: {
          partNumber: String(data.get("partNumber") ?? ""),
          description: String(data.get("description") ?? ""),
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          website: String(data.get("website") ?? ""),
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (photo instanceof File && photo.size > 0) {
        const uploadData = new FormData();
        uploadData.set("reference", result.reference);
        uploadData.set("photo", photo);
        const upload = await uploadPartInquiryPhoto({ data: uploadData });
        if (!upload.ok) {
          setPhotoError(upload.error ?? "The photo could not be uploaded.");
        }
      }
      setReference(result.reference);
      form.reset();
    } catch {
      setError("We could not send your request. Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />
      <main id="main-content">
        <h1 className="sr-only">{content.home.title}</h1>
        <section className="grid w-full min-w-0 grid-cols-1 md:grid-cols-2">
          {displayedPrimaryRanges.map((range, index) => (
            <article
              key={range.title}
              className="hero-range group relative flex min-h-[400px] sm:min-h-[450px] md:min-h-[480px] items-stretch overflow-hidden border-b border-rule"
            >
              <img
                src={range.img}
                alt={range.managedAlt}
                aria-hidden={range.managedAlt ? undefined : "true"}
                width={1600}
                height={1000}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.05]"
              />
              <div className="absolute inset-0 bg-charcoal-deep/45" />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal-deep via-charcoal-deep/55 to-charcoal-deep/10" />

              <div className="relative z-10 flex min-h-[400px] sm:min-h-[450px] min-w-0 w-full flex-col justify-end gap-3 p-3.5 sm:p-5 md:min-h-[480px] md:gap-6 md:p-8 lg:p-10">
                <div className="hero-range-title flex min-w-0 flex-col justify-end transition-all duration-500">
                  <Link
                    to="/products"
                    search={getCatalogueSearch(range.category)}
                    className="block max-w-xl focus-visible:outline-white"
                  >
                    <h2
                      className="break-words font-display text-[clamp(1.5rem,4.2vw,3.4rem)] font-extrabold uppercase leading-[0.95] tracking-tight text-white"
                      {...edit(`catalogue.ranges.${index}.title`, "Hero panel title")}
                    >
                      <HeroTitle title={range.title} accent={range.accent as "accent" | "amber"} />
                    </h2>
                  </Link>
                </div>

                <div className="hero-range-panel z-20 overflow-hidden border border-white/25 bg-charcoal-deep/95 shadow-2xl shadow-black/40 backdrop-blur-md transition-all duration-500 md:absolute md:inset-x-8 md:inset-y-8 md:flex md:flex-col md:bg-charcoal-deep/70 md:shadow-none md:backdrop-blur-sm lg:inset-x-10">
                  <div className="grid min-h-0 grid-cols-2 gap-1 p-1.5 sm:gap-1.5 sm:p-2.5 md:grid-rows-3">
                    {range.lines.map((line, lineIndex) => (
                      <Link
                        key={line.label}
                        to="/products"
                        search={getCatalogueSearch(line.category)}
                        className={`group/item grid min-h-[50px] sm:min-h-[64px] grid-cols-[1fr_auto] items-center border border-white/12 bg-charcoal-deep/80 px-2 py-1.5 sm:px-3 sm:py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm transition-colors ${
                          range.accent === "amber"
                            ? "hover:border-amber hover:bg-amber/10 focus-visible:border-amber"
                            : "hover:border-accent hover:bg-accent/15 focus-visible:border-accent"
                        }`}
                      >
                        <span className="min-w-0 pr-1">
                          <span
                            className="block break-words text-xs sm:text-sm font-bold leading-tight text-white"
                            {...edit(
                              `catalogue.ranges.${index}.lines.${lineIndex}.label`,
                              "Product line name",
                            )}
                          >
                            {line.label}
                          </span>
                          <span
                            className="mt-0.5 block truncate font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.1em] text-white/50"
                            {...edit(
                              `catalogue.ranges.${index}.lines.${lineIndex}.meta`,
                              "Product line description",
                            )}
                          >
                            {line.meta}
                          </span>
                        </span>
                        <ChevronRight
                          className={`ml-1 sm:ml-3 h-3 w-3 shrink-0 transition-transform group-hover/item:translate-x-0.5 ${
                            range.accent === "amber" ? "text-amber" : "text-accent"
                          }`}
                        />
                      </Link>
                    ))}
                  </div>
                  <div
                    aria-hidden="true"
                    data-testid={`hero-hover-title-${index}`}
                    className="hidden flex-1 items-end border-t border-white/15 bg-gradient-to-t from-charcoal-deep/90 to-transparent px-6 py-6 md:flex lg:px-8 lg:py-7"
                  >
                    <div className="max-w-xl font-display text-[clamp(2rem,3.2vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-tight text-white">
                      <HeroTitle title={range.title} accent={range.accent as "accent" | "amber"} />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4">
          {displayedCategories.map((category) => (
            <Link
              key={category.title}
              to="/products"
              search={getCatalogueSearch(category.category)}
              className="group flex min-h-[190px] sm:min-h-[260px] md:min-h-[320px] lg:min-h-[360px] flex-col border-b border-rule bg-surface border-r last:border-r-0 sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:border-l lg:first:border-l-0"
            >
              <div className="relative flex-1 overflow-hidden bg-[oklch(0.96_0.005_250)]">
                <img
                  src={category.img}
                  alt={category.managedAlt}
                  aria-hidden={category.managedAlt ? undefined : "true"}
                  width={1200}
                  height={900}
                  loading="lazy"
                  className="h-full w-full object-cover mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div className="flex items-center justify-between border-t border-rule px-3 py-3 sm:px-5 sm:py-5 transition-colors group-hover:bg-charcoal-deep group-hover:text-white">
                <div className="min-w-0 pr-1">
                  <h2
                    className="break-words font-display text-[12px] sm:text-[14px] md:text-[15px] font-bold uppercase tracking-tight"
                    {...edit(`catalogue.tiles.${category.tileIndex}.title`, "Category tile title")}
                  >
                    {category.title}
                  </h2>
                </div>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-ink-muted transition-all group-hover:translate-x-1 group-hover:text-accent" />
              </div>
            </Link>
          ))}
        </section>

        <section className="border-b border-rule bg-surface py-10">
          <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-3 px-4 md:grid-cols-2 md:px-6 lg:px-10">
            <Link
              to="/resources"
              className="group flex items-center justify-between border border-rule bg-background p-5 transition-colors hover:border-accent"
            >
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center bg-accent text-accent-foreground">
                  <FileText className="h-5 w-5" />
                </span>
                <span>
                  <span
                    className="block font-display text-lg font-bold uppercase tracking-tight"
                    {...edit("home.resourceTitle", "Resources heading")}
                  >
                    {content.home.resourceTitle}
                  </span>
                  <span
                    className="mt-1 block text-sm text-ink-muted"
                    {...edit("home.resourceCopy", "Resources description")}
                  >
                    {content.home.resourceCopy}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/resources"
              className="group flex items-center justify-between border border-rule bg-background p-5 transition-colors hover:border-accent"
            >
              <span className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center bg-charcoal-deep text-accent">
                  <PlayCircle className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-display text-lg font-bold uppercase tracking-tight">
                    Videos
                  </span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    Find product setup help and plant support videos.
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-accent transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

        <section className="border-b border-rule bg-charcoal-deep py-10 md:py-14">
          <div className="mx-auto max-w-[1600px] px-4 md:px-6 lg:px-10">
            <div className="mb-8 text-center">
              <h2
                className="font-display text-2xl font-extrabold uppercase tracking-tight text-white md:text-3xl"
                {...edit("home.finderTitle", "Part finder heading")}
              >
                {content.home.finderTitle}
              </h2>
              <p
                className="mx-auto mt-2 max-w-4xl font-display text-lg font-bold uppercase tracking-tight text-white/85 md:text-2xl"
                {...edit("home.finderCopy", "Part finder description")}
              >
                {content.home.finderCopy}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              {reference ? (
                <div
                  role="status"
                  className="border border-accent/40 bg-accent/10 p-6 text-sm leading-6 text-white"
                >
                  <CheckCircle2 aria-hidden="true" className="mr-2 inline h-5 w-5 text-accent" />
                  {content.messages["part.successBeforeReference"]}{" "}
                  <strong className="font-semibold">{reference}</strong>.{" "}
                  {content.messages["part.successAfterReference"]}
                  {photoError ? (
                    <span className="mt-2 block text-red-200">Note: {photoError}</span>
                  ) : null}
                </div>
              ) : (
                <form
                  method="post"
                  onSubmit={submitPartRequest}
                  className="relative space-y-5 border border-white/10 bg-white/[0.035] p-4 sm:p-5 md:p-6"
                >
                  <label className="absolute -left-[9999px]" aria-hidden="true">
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="part-name"
                          className="font-mono text-xs uppercase tracking-[0.2em] text-white/75 block mb-2"
                        >
                          {content.messages["part.nameLabel"]}
                        </label>
                        <input
                          id="part-name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          placeholder={content.messages["part.namePlaceholder"]}
                          className="h-12 w-full border border-white/20 bg-white/10 px-4 text-base sm:text-sm text-white transition-colors placeholder:text-white/40 focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="part-email"
                          className="font-mono text-xs uppercase tracking-[0.2em] text-white/75 block mb-2"
                        >
                          {content.messages["part.emailLabel"]}
                        </label>
                        <input
                          id="part-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          placeholder={content.messages["part.emailPlaceholder"]}
                          className="h-12 w-full border border-white/20 bg-white/10 px-4 text-base sm:text-sm text-white transition-colors placeholder:text-white/40 focus:border-accent focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="part-number"
                        className="font-mono text-xs uppercase tracking-[0.2em] text-white/75 block mb-2"
                      >
                        {content.messages["part.numberLabel"]}
                      </label>
                      <input
                        id="part-number"
                        name="partNumber"
                        type="text"
                        required
                        placeholder={content.messages["part.numberPlaceholder"]}
                        className="h-12 w-full border border-white/20 bg-white/10 px-4 text-base sm:text-sm text-white transition-colors placeholder:text-white/40 focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="part-description"
                        className="font-mono text-xs uppercase tracking-[0.2em] text-white/75 block mb-2"
                      >
                        {content.messages["part.descriptionLabel"]}
                      </label>
                      <textarea
                        id="part-description"
                        name="description"
                        rows={3}
                        placeholder={content.messages["part.descriptionPlaceholder"]}
                        className="w-full resize-y border border-white/20 bg-white/10 px-4 py-3 text-base sm:text-sm text-white transition-colors placeholder:text-white/40 focus:border-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="part-photo"
                        className="font-mono text-xs uppercase tracking-[0.2em] text-white/75 block mb-2"
                      >
                        {content.messages["part.photoLabel"]}
                      </label>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border border-white/20 bg-white/10 p-3 sm:px-4 sm:py-3">
                        <Paperclip aria-hidden="true" className="h-4 w-4 shrink-0 text-white/50" />
                        <input
                          id="part-photo"
                          name="photo"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="w-full text-xs sm:text-sm text-white/80 file:mr-3 file:border-0 file:bg-accent file:px-3 file:py-1.5 file:font-mono file:text-[10px] file:font-bold file:uppercase file:tracking-[0.14em] file:text-white"
                        />
                      </div>
                      <p className="mt-1 text-xs text-white/45">{content.messages["part.photoHelp"]}</p>
                    </div>
                  </div>
                  {error ? (
                    <div
                      role="alert"
                      className="border border-red-400/40 bg-red-500/10 p-3 text-sm leading-6 text-red-200"
                    >
                      {error}
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy || !hydrated}
                    className="flex h-11 w-full items-center justify-center gap-2 bg-accent px-5 text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    <Send className="h-4 w-4" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                      {busy ? content.messages["part.sending"] : content.home.finderSubmit}
                    </span>
                  </button>
                </form>
              )}

              <div className="border border-white/10 bg-white/[0.035] p-4 sm:p-5 md:p-6">
                <div
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55"
                  {...edit("home.contactTitle", "Contact block heading")}
                >
                  {content.home.contactTitle}
                </div>
                <h3 className="mt-2 font-display text-lg font-bold text-white">
                  Contact the sales desk directly
                </h3>
                <p
                  className="mt-2 text-sm leading-6 text-white/65"
                  {...edit("home.contactCopy", "Contact block description")}
                >
                  {content.home.contactCopy}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <a
                    href={`mailto:${content.site.email}`}
                    className="flex h-11 items-center justify-center gap-2 border border-accent bg-accent px-4 text-accent-foreground transition-colors hover:bg-accent/90"
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                      Email sales
                    </span>
                  </a>
                  <a
                    href={`https://wa.me/${content.site.whatsapp}?text=${encodeURIComponent(`Hello ${content.site.name}, I need help identifying a part.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center gap-2 border border-[#25D366] bg-[#25D366] px-4 text-charcoal-deep transition-colors hover:bg-[#25D366]/85"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                      WhatsApp
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
