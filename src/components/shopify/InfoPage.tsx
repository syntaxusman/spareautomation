import { Link } from "@tanstack/react-router";
import { ArrowRight, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/shopify/SiteFooter";
import { SiteHeader } from "@/components/shopify/SiteHeader";
import { useContent } from "@/lib/content/ContentContext";
import { useEditable } from "@/lib/content/edit-mode";
import type { ContentBlock } from "@/lib/content/registry";

type ManagedPageKey =
  | "about-us"
  | "terms-and-conditions"
  | "returns-policy"
  | "privacy-policy"
  | "cookies"
  | "disclaimer"
  | "delivery-information"
  | "contact-us"
  | "resources";

type FunctionalPageKey = "got-a-question" | "credit-account";

type InfoPageProps = {
  /** Information/legal document that supplies every piece of copy. */
  contentKey?: ManagedPageKey;
  /** Functional-page document, for form pages rendered with this layout. */
  functionalKey?: FunctionalPageKey;
  eyebrow?: string;
  title?: string;
  intro?: string;
  /** Legacy fallback used only when no CMS document is available. */
  sections?: Array<{ title: string; copy: string }>;
  ctaLabel?: string;
  ctaTo?: string;
  showHero?: boolean;
  compactHero?: boolean;
  showCta?: boolean;
  children?: ReactNode;
};

/**
 * Cards, steps, lists and text blocks all render as the same two-column grid.
 * Each entry carries the content path it came from so the visual editor can
 * offer click-to-edit on the rendered card.
 */
function flattenTextBlocks(blocks: readonly ContentBlock[], documentPath: string) {
  return blocks.flatMap((block, blockIndex) => {
    const base = documentPath ? `${documentPath}.blocks.${blockIndex}` : "";
    if (block.type === "text") {
      return [
        {
          title: block.title,
          copy: block.copy,
          titlePath: base ? `${base}.title` : "",
          copyPath: base ? `${base}.copy` : "",
        },
      ];
    }
    if (block.type === "cards" || block.type === "steps") {
      return block.items.map((item, itemIndex) => ({
        title: item.title,
        copy: item.copy,
        titlePath: base ? `${base}.items.${itemIndex}.title` : "",
        copyPath: base ? `${base}.items.${itemIndex}.copy` : "",
      }));
    }
    if (block.type === "list") {
      return [
        {
          title: block.title,
          copy: block.items.map((item) => `• ${item}`).join("\n"),
          titlePath: base ? `${base}.title` : "",
          copyPath: "",
        },
      ];
    }
    return [];
  });
}

export function InfoPage({
  contentKey,
  functionalKey,
  eyebrow,
  title,
  intro,
  sections,
  ctaLabel,
  ctaTo,
  showHero = true,
  compactHero = true,
  showCta = true,
  children,
}: InfoPageProps) {
  const { site, pages, functional } = useContent();
  const edit = useEditable();
  const documentPath = contentKey ? `pages.${contentKey}` : functionalKey ? `functional.${functionalKey}` : "";
  const managed = contentKey ? pages[contentKey] : functionalKey ? functional[functionalKey] : null;
  const blocks = managed?.blocks ?? [];
  const renderedEyebrow = managed?.eyebrow ?? eyebrow ?? "";
  const renderedTitle = managed?.title ?? title ?? "";
  const renderedIntro = managed?.intro ?? intro ?? "";
  const renderedCtaLabel = (managed?.ctaLabel || ctaLabel || "Contact sales").trim();
  const renderedCtaTo = managed?.ctaTo || ctaTo || "/contact-us";
  const renderedSections = managed
    ? flattenTextBlocks(blocks, documentPath)
    : (sections ?? []).map((section) => ({ ...section, titlePath: "", copyPath: "" }));
  const heroBlock = blocks.find((block) => block.type === "hero");
  const heroMedia = heroBlock?.type === "hero" && heroBlock.mediaId ? heroBlock : null;
  const mediaBlocks = blocks.filter((block) => block.type === "media");
  const ctaBlocks = blocks.filter((block) => block.type === "cta");

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <main id="main-content">
        {!showHero && renderedTitle ? (
          <h1
            className="sr-only"
            aria-label={
              functionalKey === "credit-account" ? "Credit account application page" : renderedTitle
            }
            {...(documentPath ? edit(`${documentPath}.title`, "Page heading") : {})}
          >
            {renderedTitle}
          </h1>
        ) : null}
        {showHero ? (
          <section
            className={`border-b border-rule bg-charcoal-deep text-white ${
              compactHero ? "flex min-h-[140px] items-center md:min-h-[170px]" : ""
            }`}
          >
            <div
              className={`mx-auto max-w-[1200px] px-4 md:px-6 ${
                compactHero ? "py-5 md:py-6" : "py-12 md:py-16"
              }`}
            >
              <div
                className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45"
                {...(documentPath ? edit(`${documentPath}.eyebrow`, "Page eyebrow") : {})}
              >
                {renderedEyebrow}
              </div>
              <h1
                className={`max-w-4xl font-display font-extrabold uppercase leading-tight tracking-tight ${
                  compactHero ? "mt-2 text-2xl sm:text-3xl md:text-4xl" : "mt-4 text-3xl md:text-5xl"
                }`}
                {...(documentPath ? edit(`${documentPath}.title`, "Page heading") : {})}
              >
                {renderedTitle}
              </h1>
              {renderedIntro ? (
                <p
                  className={`max-w-3xl text-sm leading-7 text-white/60 md:text-base ${
                    compactHero ? "mt-3" : "mt-5"
                  }`}
                  {...(documentPath ? edit(`${documentPath}.intro`, "Page introduction") : {})}
                >
                  {renderedIntro}
                </p>
              ) : null}
              {heroMedia ? (
                <img
                  src={`/content-media/${heroMedia.mediaId}/image`}
                  alt={heroMedia.mediaAlt}
                  className="mt-6 max-h-64 w-full max-w-2xl object-cover"
                />
              ) : null}
            </div>
          </section>
        ) : null}

        {renderedSections.length > 0 ? (
          <section className="bg-surface py-10 md:py-14">
            <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 px-4 md:grid-cols-2 md:px-6">
              {renderedSections.map((section) => (
                <article key={section.title} className="border border-rule bg-background p-6">
                  <h2
                    className="font-display text-lg font-bold uppercase tracking-tight"
                    {...(section.titlePath ? edit(section.titlePath, "Card heading") : {})}
                  >
                    {section.title}
                  </h2>
                  <p
                    className="mt-4 whitespace-pre-line text-sm leading-7 text-ink-muted"
                    {...(section.copyPath ? edit(section.copyPath, "Card text") : {})}
                  >
                    {section.copy}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {children}

        {mediaBlocks.length ? (
          <section className="mx-auto grid max-w-[1200px] gap-5 px-4 py-10 md:grid-cols-2 md:px-6">
            {mediaBlocks.map((block) =>
              block.type === "media" ? (
                <figure key={block.mediaId} className="border border-rule bg-surface p-3">
                  <img
                    src={`/content-media/${block.mediaId}/image`}
                    alt={block.mediaAlt}
                    className="w-full"
                  />
                  {block.caption ? (
                    <figcaption className="mt-2 text-sm text-ink-muted">{block.caption}</figcaption>
                  ) : null}
                </figure>
              ) : null,
            )}
          </section>
        ) : null}

        {ctaBlocks.length ? (
          <section className="mx-auto grid max-w-[1200px] gap-4 px-4 py-8 md:px-6">
            {ctaBlocks.map((block) =>
              block.type === "cta" ? (
                <div
                  key={`${block.title}-${block.to}`}
                  className="border border-rule bg-surface p-5 md:flex md:items-center md:justify-between md:gap-8 md:p-7"
                >
                  <div>
                    <h2 className="font-display text-xl font-bold uppercase tracking-tight">
                      {block.title}
                    </h2>
                    {block.copy ? (
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                        {block.copy}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    to={block.to}
                    className="mt-5 inline-flex h-11 shrink-0 items-center gap-2 bg-accent px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:brightness-110 md:mt-0"
                  >
                    {block.label} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </div>
              ) : null,
            )}
          </section>
        ) : null}

        <section className="border-t border-rule bg-background py-8">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="grid gap-2 text-sm text-ink-muted">
              <a
                href={`tel:${site.phoneHref}`}
                className="inline-flex min-h-8 items-center gap-2 hover:text-accent"
              >
                <Phone className="h-4 w-4" />
                {site.phoneDisplay}
              </a>
              <a
                href={`mailto:${site.email}`}
                className="inline-flex items-center gap-2 hover:text-accent"
              >
                <Mail className="h-4 w-4" />
                {site.email}
              </a>
            </div>
            {showCta && renderedCtaLabel ? (
              <Link
                to={renderedCtaTo}
                className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 bg-accent px-5 font-mono text-[10px] uppercase tracking-[0.22em] text-accent-foreground transition-colors hover:bg-accent/90"
              >
                {renderedCtaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
