import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/components/shopify/HomePage";
import { getPublishedContent } from "@/lib/content/content.functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/")({
  loader: async () => getPublishedContent(),
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData?.home.seo.title ??
          "Spares Automation - Industrial Parts & Automation Spares",
      },
      {
        name: "description",
        content:
          loaderData?.home.seo.description ??
          "Browse product ranges, request quotes, and find support from Spares Automation.",
      },
      { property: "og:title", content: loaderData?.home.seo.title ?? "Spares Automation" },
      {
        property: "og:description",
        content: loaderData?.home.seo.description ?? "Industrial parts and automation support.",
      },
    ],
    links: [{ rel: "canonical", href: loaderData?.site.url ?? SITE.url }],
  }),
  component: HomePage,
});
