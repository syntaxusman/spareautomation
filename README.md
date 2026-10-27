# Spares Automation Client Feedback Changes

## Shopify Commerce Automation

The CMS now includes staff quotation email management, admin-only percentage-based bulk product
pricing, and automatic Shopify order invoice emails. Shopify setup, required access scopes, webhook
registration, notification branding, and the safe pricing procedure are documented in
[`SHOPIFY_COMMERCE_AUTOMATION.md`](./SHOPIFY_COMMERCE_AUTOMATION.md).

The storefront is Shopify Markets-aware: enabled countries appear in the header selector, catalogue
queries use Shopify country context, and cart buyer identity keeps regional prices and checkout
currency aligned. Shopify product photos also receive an automatic, configurable visible copyright
watermark without altering the source files stored in Shopify.

## UX, Accessibility, Commerce, And Platform Hardening

The July UX audit remediation is now implemented while retaining the existing industrial visual direction.

- Rebuilt the shared header with valid responsive navigation, separate mobile menu/cart controls, an accessible search, and no horizontal mobile overflow.
- Centralized the public phone, email, WhatsApp number, URL, location, and opening hours in `src/lib/site.ts`.
- Made homepage product-line choices open their intended filtered category URLs and restored a single page-level heading.
- Added WCAG-oriented focus styles, reduced-motion behavior, skip navigation, accessible control names, live form errors, improved target sizes, and AA contrast.
- Added Shopify cursor pagination to the products catalogue and persisted catalogue filters in the URL.
- Added honest catalogue-empty and mutation-failure states instead of presenting integration failures as ordinary filter results.
- Removed the unused second customer-account/OAuth implementation and kept the Storefront customer flow used by the visible login, registration, and account pages.
- Added customer password recovery at `/forgot-password` and stopped returning customer access tokens to browser JavaScript.
- Removed hardcoded delivery/lead-time promises and renamed mail-based quote actions so their behavior is explicit.
- Added accessible request forms for returns, tracking, resources, product questions, and unsubscribe requests.
- Added responsive Shopify images, deferred third-party video loading, HTTPS-only resource links, and Product/Organization structured data.
- Added route-specific metadata, canonical URLs, noindex rules, `robots.txt`, `sitemap.xml`, and a web manifest.
- Added security headers in the Node response wrapper and corrected Docker output/env configuration for the current Nitro build.
- Removed unused React Query runtime code and limited Tailwind scanning to used storefront sources, reducing built CSS from about 90 KB to about 49 KB and the shared JS entry by about 25 KB.
- Added Playwright desktop/mobile regression tests and a GitHub Actions quality workflow.

### Verification

- `bun run lint` passes with six pre-existing Fast Refresh warnings in unused UI primitive files and no errors.
- `bun run typecheck` passes.
- `bun run check:content` validates CMS-managed fields and editable markers.
- `bun run check:catalog` audits the live Shopify catalogue and fails on missing images, zero prices, or products without a purchasable positive-price variant. Run it before publishing catalogue changes.
- `bun run test` passes: 9 browser tests passed and one intentionally skipped desktop-only duplicate.
- `bun run build` passes.
- `bun run check:bundle` enforces the 500 KiB maximum client-chunk budget after a build.
- Production route smoke tests pass with configured Shopify environment variables; missing products now return HTTP 404.
- Mobile Lighthouse: Accessibility 100, Best Practices 100, SEO 100.

### Required Business Inputs Before Public Launch

- Confirm the production domain used in `src/lib/site.ts`, `public/robots.txt`, and `public/sitemap.xml`.
- Have qualified UK counsel approve the trading, privacy, returns, delivery, and cookie wording and add the legal entity name, registered address, company number, VAT number, retention periods, and any international-transfer details that apply.
- Confirm the published Shopify catalogue, markets, shipping, tax, checkout, customer email, and payment settings using real staging orders.
- Replace email-client request handoffs with an email/CRM provider only when service credentials, spam protection, retention rules, and ownership are supplied.

This document records the website changes implemented from the client feedback in `spares automation snags 10 July 2026.docx`.

## CMS & Admin Panel Runbook

The website forms (part inquiry, credit account, return request, and support requests) are handled by a lightweight CMS instead of `mailto:` links. Submissions are stored in Postgres and managed by staff at `/admin`. **Orders always stay in Shopify** — the CMS only manages applications, returns, inquiries, and support requests. Return requests receive a customer acknowledgement and later customer status emails when staff change their CMS status. Approved credit applications are synced to Shopify as tagged customers; staff then raise draft orders / invoices in Shopify.

### Environment variables

See `.env.example`. Key CMS variables:

- `DATABASE_URL` — Postgres connection string (required for forms and `/admin`).
- `APP_DATABASE_URL` — optional Docker Compose override for a managed database;
  Compose otherwise connects to its bundled `db` service automatically.
- `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` — first admin account, seeded automatically on first boot when no staff exist.
- `APP_SESSION_SECRET` — encrypts the admin (and customer) session cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `RESEND_API_KEY` (recommended) **or** `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` — transactional email for sales-desk notifications, return acknowledgements, and return status updates. If neither is set, submissions are still stored but notification emails are skipped with a logged warning.
- `MAIL_FROM` / `SALES_DESK_EMAIL` — sender and recipient for notifications.
- `UPLOAD_DIR` — private local storage for part-inquiry photos and product-question attachments (default `./data/uploads`).
- Shopify Admin token needs `write_customers`, `write_customer_metafields`, and `write_draft_orders` scopes for the customer handoff and quote flow.

### Migrations

Migrations run automatically and idempotently on server boot (`src/lib/db/migrate.server.ts`), reading the SQL files in `drizzle/`. The Docker runtime image copies the `drizzle/` folder so migrations apply on startup. To generate a new migration after schema changes:

```
npx drizzle-kit generate
```

### Admin seeding & access

On first boot, if `staff_users` is empty and `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` are set, an `admin` account is created. Staff sign in at `/admin/login`; unauthenticated visits to `/admin/*` redirect there.

### Persistent storage

Part-inquiry photo uploads are written to `UPLOAD_DIR`. The Compose stack mounts
the persistent `cms_data` volume at `/app/data` and stores the bundled Postgres
database in `cms_db`; both survive rebuilds and redeployments.

### Coolify deployment

Create a Docker Compose resource from this repository and assign the public
domain to the `app` service on container port `80`. The `db` service is private
and must not be assigned a domain. Coolify generates
`SERVICE_PASSWORD_POSTGRES`; the same value is used by both services.

For local development, `docker-compose.override.yml` publishes the app at
`http://localhost:${APP_PORT:-8080}`. Coolify deploys `docker-compose.yml`
directly, leaving the host port unpublished so its proxy can route to port 80
without colliding with another application.

Before the first deployment, set `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and
`APP_SESSION_SECRET` in Coolify. Add the email and Shopify variables described
above as required by the enabled integrations. Keep those values runtime-only.
When using an external managed PostgreSQL database, set `APP_DATABASE_URL`;
otherwise leave it empty to use the bundled persistent database.

### Customer account email links

The storefront handles account activation and password changes on the Spares
Automation domain. In Shopify Admin, keep legacy customer accounts enabled and
set the primary button URL in the two customer notification templates to:

- Customer account invite: `https://spares-automation.co.uk/activate?activation_url={{ customer.account_activation_url }}`
- Customer account password reset: `https://spares-automation.co.uk/reset?reset_url={{ customer.reset_password_url }}`

These notification-template URLs are a required deployment setting. The app
validates the supplied one-time URL, completes the action through the Storefront
API, and signs the customer in without exposing the commerce backend to them.

The app exposes `/health` for Coolify's container liveness check and `/ready`
for PostgreSQL readiness. Keeping those checks separate prevents a brief
database restart from removing the entire public storefront from Coolify's
proxy. Neither Postgres nor the Node process publishes a host port; Coolify's
proxy reaches the app over its internal network.

## Summary

- Cleaned the homepage, header, category cards, products page, footer links, support pages, resources access, and cart quote flow.
- Kept the existing TanStack Start, Shopify, cart, search, login/register, and product-detail foundations.
- Used the 10 July feedback as the source of truth. Earlier emails mentioned by the client were not available in the repo.

## Homepage And Header

- Removed the right-side header search helper text: `Part / product no.`
- Changed the search placeholder to `Search products or part number`.
- Removed the small `Product catalogue` text under the Spares Automation logo.
- Removed homepage hero eyebrow labels such as `Heavy plant / bituminous` and `Heavy plant / ready-mix`.
- Removed AS/CN product-line codes from homepage cards.
- Removed `Range / 01` style labels from category image cards.
- Removed `Browse range` text from the main homepage range cards.
- Removed extra marketing copy under the Asphalt/Blacktop and Ready-Mix/Concrete homepage cards.
- Simplified the image overlays so category options sit cleanly over the full image.
- Added homepage links for `PDFs & Manuals` and `Videos`, both pointing to `/resources`.
- Replaced `New Arrivals` with `Control Panels & Software`; the legacy URL redirects to the new catalogue route.
- Aligned homepage asphalt labels with the approved product-line list and removed internal sub-category/vertical wording.
- Clarified that photos are attached through email or WhatsApp and that cart details are emailed from a populated cart.
- Reduced the homepage help section heading size so it is less oversized.
- Documented replacement image guidance in code: Packing/Home category photos should be landscape, `4:3` or `16:10`, minimum `1200px` wide.

## Category And Product Pages

Shopify collection setup and the client product-assignment workflow are documented in
[`SHOPIFY_CATALOGUE_GUIDE.md`](./SHOPIFY_CATALOGUE_GUIDE.md). The storefront category and
product-line handles are defined once in `src/lib/catalog.ts`; run
`npm run shopify:sync-collections` to preview any missing/unpublished Shopify collections.

- Updated Ready-Mix / Concrete subcategories to:
  - `Aggregate Feeding`
  - `Cement / Material silos`
  - `Additive system`
  - `Water controls`
  - `Air controls`
  - `Automation controls`
- Updated Concrete category filtering keywords to match those new subcategories.
- Reduced the `/products` hero height so products and filters appear sooner.
- Changed the products-page local search label to `Filter current results` so it does not feel like a second global search bar.
- Kept category filtering, availability filtering, sorting, and product search.
- Removed dummy PDF/video cards and `#` links from `/products`.

## Footer, Information, And Help Pages

- Updated footer copy from the old industrial-spares sentence to:
  `Trade catalogue, quote support, and parts help for machinery teams.`
- Added a reusable `InfoPage` layout for lightweight support/information pages.
- Rewired footer links to real dedicated routes instead of unrelated placeholder destinations.
- Added these new routes:
  - `/resources`
  - `/track-order`
  - `/got-a-question`
  - `/terms-and-conditions`
  - `/returns-policy`
  - `/delivery-information`
  - `/privacy-policy`
  - `/cookies`
  - `/disclaimer`
  - `/unsubscribe`
- Each new support page has a complete heading, explanatory sections, contact details, and a clear CTA.

## Cart And Quote Flow

- Added `Send cart details` to the cart page when the cart has items.
- Wired `Send cart details` to the existing `quoteRequestMailto(cart)` helper.
- The generated email includes cart lines, quantities, subtotal, and contact fields.
- Clarified cart copy:
  - `Checkout` completes an online order.
  - `Send cart details` emails the cart to the sales desk for quote support, product checks, or account pricing.

## Files Changed

- `src/components/shopify/SiteHeader.tsx`
- `src/components/shopify/SiteFooter.tsx`
- `src/components/shopify/InfoPage.tsx`
- `src/routes/index.tsx`
- `src/routes/products/index.tsx`
- `src/routes/concrete.tsx`
- `src/routes/cart.tsx`
- `src/routes/resources.tsx`
- `src/routes/track-order.tsx`
- `src/routes/got-a-question.tsx`
- `src/routes/terms-and-conditions.tsx`
- `src/routes/returns-policy.tsx`
- `src/routes/delivery-information.tsx`
- `src/routes/privacy-policy.tsx`
- `src/routes/cookies.tsx`
- `src/routes/disclaimer.tsx`
- `src/routes/unsubscribe.tsx`
- `src/routeTree.gen.ts`

## Verification

- `bun run build` passed.
- `npm run build` passed.
- Smoke-checked the following local routes and all returned `200`:
  - `/`
  - `/products`
  - `/concrete`
  - `/cart`
  - `/resources`
  - `/track-order`
  - `/terms-and-conditions`

## Notes

- Browser screenshot capture was not completed because Playwright/browser screenshot tooling is not installed in this repo.
- Final legal/policy/support wording should be replaced when the client supplies approved copy.
- Any missing category details from the referenced 22 June email still need to be supplied separately if they differ from the 10 July document.
