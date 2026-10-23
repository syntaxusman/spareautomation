import {
  Outlet,
  Link,
  createRootRoute,
  useLocation,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CookieConsent } from "../components/shopify/CookieConsent";
import { ContentProvider, useContent } from "../lib/content/ContentContext";
import { EditModeProvider } from "../lib/content/edit-mode";
import { getEditorContent, getPublishedContent } from "../lib/content/content.functions";
import { getDefaultContentBundle } from "../lib/content/registry";

function NotFoundComponent() {
  const { messages } = useContent();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{messages["error.notFoundTitle"]}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {messages["error.notFoundCopy"]}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const { messages } = useContent();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {messages["error.genericTitle"]}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {messages["error.genericCopy"]}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const FAVICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="20" y="20" width="24" height="24" transform="rotate(45 32 32)" stroke="oklch(0.62 0.18 245)" stroke-width="3" fill="none" />
  <rect x="25" y="25" width="14" height="14" transform="rotate(45 32 32)" fill="oklch(0.62 0.18 245)" />
</svg>
`;

export const Route = createRootRoute({
  loader: async ({ location }) => {
    // `cmsEdit=1` is set only by the CMS visual editor, and it still needs a
    // signed-in staff session, so visitors can never turn editing on.
    const wantsEditing = new URLSearchParams(location.searchStr ?? "").get("cmsEdit") === "1";
    if (wantsEditing) {
      try {
        const draft = await getEditorContent();
        if (draft) return { content: draft, editMode: true };
      } catch (error) {
        // Never let the editor preview fail to render; fall back to published.
        console.error("[content] Editor preview unavailable:", error);
      }
    }
    return { content: await getPublishedContent(), editMode: false };
  },
  head: ({ loaderData }) => {
    const content = loaderData?.content ?? getDefaultContentBundle();
    return ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: content.home.seo.title },
      {
        name: "description",
        content: content.home.seo.description,
      },
      { name: "author", content: content.site.name },
      { property: "og:title", content: content.home.seo.ogTitle || content.home.seo.title },
      {
        property: "og:description",
        content: content.home.seo.ogDescription || content.home.seo.description,
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: content.site.url },
      { property: "og:site_name", content: content.site.name },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: content.site.socialHandle },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: `data:image/svg+xml;utf8,${encodeURIComponent(FAVICON_SVG)}`,
      },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: content.site.name,
          url: content.site.url,
          email: content.site.email,
          telephone: content.site.phoneHref,
          address: {
            "@type": "PostalAddress",
            addressLocality: content.site.addressLocality,
            addressCountry: content.site.addressCountry,
          },
          contactPoint: {
            "@type": "ContactPoint",
            telephone: content.site.phoneHref,
            email: content.site.email,
            contactType: "sales",
            availableLanguage: "English",
          },
        }),
      },
    ],
  })},
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The CMS stamps `data-cms-theme` here from an inline script before paint,
    // so the server HTML legitimately differs from the client on this element.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { content, editMode } = Route.useLoaderData();
  // The consent banner is for public visitors; it would sit over CMS screens
  // and it is meaningless to signed-in staff working in the admin.
  const isAdmin = useLocation().pathname.startsWith("/admin");
  return (
    <EditModeProvider enabled={editMode}>
      <ContentProvider value={content}>
        <ClientMonitoring />
        <Outlet />
        {isAdmin ? null : <CookieConsent />}
      </ContentProvider>
    </EditModeProvider>
  );
}

function ClientMonitoring() {
  useEffect(() => {
    if (import.meta.env.PROD) {
      void import("../lib/web-vitals").then(({ startWebVitalsMonitoring }) => {
        startWebVitalsMonitoring();
      });
    }

    const reportWindowError = (event: ErrorEvent) => {
      reportLovableError(event.error ?? new Error(event.message), { source: "window.onerror" });
    };
    const reportUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportLovableError(event.reason, { source: "window.unhandledrejection" });
    };

    window.addEventListener("error", reportWindowError);
    window.addEventListener("unhandledrejection", reportUnhandledRejection);
    return () => {
      window.removeEventListener("error", reportWindowError);
      window.removeEventListener("unhandledrejection", reportUnhandledRejection);
    };
  }, []);

  return null;
}
