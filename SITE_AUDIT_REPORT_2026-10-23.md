# Spares Automation — Full Site UI/UX, Functional and Responsive Audit

**Audit date:** 23 October 2026  
**Project:** Spares Automation storefront and CMS  
**Audit environment:** Local TanStack Start development build, Chromium, 390×844 mobile, 768×1024 tablet, and 1440×900 desktop; additional existing coverage at 320 px  
**Overall recommendation:** **Conditional no-go for production release** until the P1 release gates below are closed.

## 1. Executive summary

The site has a strong and consistent industrial-commerce design, a well-structured responsive foundation, sensible empty/error states, good metadata coverage, and broad public-route test coverage. The audited public experience remained usable even while PostgreSQL was unavailable. All 75 audited route/viewport combinations returned HTTP 200, showed no horizontal overflow, and had no images missing `alt` attributes.

The main risks are not basic rendering failures. They are:

1. **Database-backed and external-service journeys were not fully verifiable in this environment.** PostgreSQL was unavailable, so persistence, authenticated CMS workflows, real customer authentication, submission delivery, and order-related integrations remain release gates.
2. **Catalogue data quality is visibly inconsistent.** Multiple products use missing-image placeholders and/or show `£0.00`, which reduces trust and can create commercial ambiguity.
3. **The mobile catalogue is excessively long.** Eighteen cards produce a 12,545 px page at 390 px wide; the route requests up to 48 products initially, so a fuller result set would be substantially longer.
4. **Database failure handling causes severe latency and log noise.** Public fallback content works, but failed CMS reads are retried frequently and emit repeated full stack traces. During the crawl, some otherwise simple routes took 8–19.6 seconds while the database was offline.

No confirmed P0 site-wide outage or destructive defect was found. The site should be considered **functionally promising but not release-certified** until the integration test gap and catalogue issues are resolved.

## Remediation update — 23 October 2026

The code-side recommendations from this audit have now been implemented while retaining the existing visual direction:

- Database failure reads now back off from 30 seconds to 5 minutes, expected outage logs are condensed/rate-limited, and migration retries enter a 60-second cooldown.
- Zero/invalid-price products show **Request price** and cannot be added to checkout as free products; missing imagery uses a branded fallback state.
- A live `check:catalog` gate now audits Shopify records before publication.
- Catalogue pages load 12 products at a time and preserve the existing **Load more** continuation.
- The home implementation was moved out of its route module; the largest client chunk fell from 530.56 kB to 500.96 kB (489.22 KiB on disk), below the enforced 500 KiB CI budget.
- The credit-account page now has one page-level H1, product links have explicit accessible names, priority touch targets are larger, and small operational mono text was raised to 10–12 px.
- The mobile header fell from 169 px to 145 px and the first-layer cookie notice from 43.4% to 32.7% of the 390×844 viewport without changing the brand system.
- Automated accessibility smoke tests, incremental catalogue tests, production Core Web Vitals reporting, content validation, bundle checks, and a two-worker CI limit were added.
- Lint now passes with zero warnings and zero errors.

Post-remediation verification: **125 tests passed and 25 database/viewport-dependent tests were intentionally skipped**, with zero failures; typecheck, lint, content validation, production build, and bundle budget all pass. The remaining release gates are external: correct the eight Shopify records identified by `npm run check:catalog`, and run the 25 database-dependent tests against a reachable staging PostgreSQL service.

## 2. Scorecard

| Area | Score | Assessment |
|---|---:|---|
| Visual design and consistency | 8.0/10 | Distinctive, professional, and cohesive across public pages |
| Navigation and information architecture | 7.5/10 | Clear global navigation and useful support routes; mobile chrome is heavy |
| Responsive behaviour | 7.0/10 | No horizontal overflow; layouts adapt well, but long mobile pages and tall fixed UI reduce efficiency |
| Functional coverage | 7.5/10 | Public UI behaviour is broadly covered; database/external-service completion is not verified |
| Accessibility foundation | 7.0/10 | Strong semantics in many areas, focus/reduced-motion support, and image alternatives; small type, target sizing, and one missing H1 require work |
| Performance and resilience | 6.0/10 | Acceptable normal navigation in many cases; large client chunk and poor database-outage behaviour need attention |
| Catalogue/content readiness | 5.5/10 | Product data presentation is the largest customer-facing trust risk |

**Overall: 6.9/10 — solid foundation, material pre-release work remains.**

## 3. Audit scope and evidence

The audit covered:

- Repository architecture, routes, shared components, server functions, CMS content loading, and database startup behaviour.
- Public storefront pages, search, catalogue, product detail, cart/quote empty states, support and legal content, authentication screens, account gating, and CMS login gating.
- Desktop, tablet, mobile, and narrow-mobile responsive behaviour.
- Navigation, forms, error/empty states, cookie consent, image viewer, product tabs, redirects, SEO endpoints, and keyboard/accessibility-related implementation patterns.
- Static checks, production build, content validation, existing Playwright coverage, an additional 75-case route/viewport crawl, and full-page screenshot review.

Evidence files are in `audit-artifacts/`:

- `home-desktop.png`
- `home-mobile.png`
- `products-desktop.png`
- `products-mobile.png`
- `contact-mobile.png`
- `audit-ui-metrics.mjs`

### Verification results

| Check | Result |
|---|---|
| `npm run lint` | Passed with 0 errors and 18 warnings |
| `npm run typecheck` | Passed |
| `npm run check:content` | Passed: 9 documents, 7 block types, 22 editable pages, 71 editable markers |
| `npm run build` | Passed; main client chunk warning at 530.56 kB (160.57 kB gzip) |
| Focused public Playwright suite | 65 passed, 13 skipped, 0 failed, using one worker |
| Route/viewport crawl | 75/75 returned HTTP 200; 0 horizontal-overflow cases; 0 missing-image-alt cases |
| Full `npm test` attempt | Not accepted as a valid pass/fail result: unavailable PostgreSQL caused retry contention and timeouts; run was stopped |

The 13 skipped focused tests are primarily integration/viewport-specific cases. They must not be treated as passing coverage.

## 4. Prioritized findings

### P1 — Must resolve before release

#### F-01: Critical integration journeys are not release-verified

**Type:** Release gate / verification gap  
**Affected areas:** Contact submission, credit application, authenticated customer flows, returns, CMS CRUD/publishing/media, database persistence, notification delivery, and real Shopify order/checkout completion.

PostgreSQL was unavailable in the local environment. The UI correctly fell back to compiled content on public pages, but database-backed completion could not be validated. Live payment or order placement was deliberately not performed.

**Recommendation:** Run the complete E2E suite against a clean staging PostgreSQL database and non-production Shopify/test integrations. Verify record creation, validation failures, duplicate handling, authentication/session expiry, CMS publish/rollback, upload lifecycle, email/notification delivery, checkout hand-off, and failure recovery. This is a release gate, not evidence that these flows are broken.

#### F-02: Catalogue data reduces trust and may create pricing ambiguity

**Type:** Confirmed customer-facing issue  
**Evidence:** Desktop and mobile catalogue screenshots show multiple missing-image placeholders, `£0.00` prices, and sold-out products mixed into primary browsing.

For industrial buyers, an absent image can be acceptable when technical identifiers are strong, but a zero price is ambiguous: it can mean free, unavailable, price-on-application, or incomplete data. The current presentation does not explain which.

**Recommendation:** Add an import/publication rule that prevents incomplete products from being published. Require either a valid price above zero or an explicit “Request price” state. Require a primary image or a deliberately branded “image unavailable” treatment. Review availability labels and exclude unusable products from default result ordering.

#### F-03: Mobile catalogue discovery is too scroll-heavy

**Type:** Confirmed responsive/UX issue  
**Evidence:** At 390×844, the all-products page is 12,545 px high for 18 one-column product cards. The route initially requests up to 48 products (`src/routes/products/index.tsx`).

The large square imagery and tall card structure make comparison slow. If 48 items render, the page could exceed 25,000–30,000 CSS pixels depending on content.

**Recommendation:** Paginate or use a deliberate “Load more” pattern with 12–16 initial results; preserve filters and scroll position in the URL. Create a denser mobile card with a smaller media ratio and more compact metadata. A two-column layout can be tested at wider mobile widths, but model/part-number legibility should take priority over density.

#### F-04: Database outages trigger repeated latency and log flooding

**Type:** Confirmed resilience/performance issue  
**Evidence:** Public content falls back safely, but failed reads are cached for only five seconds. The migration routine retries five times with exponential delays. The audit generated thousands of repeated database stack-trace lines, and several page navigations rose from roughly 0.4–1.1 seconds to 8–19.6 seconds while PostgreSQL was offline.

Relevant implementation:

- `src/lib/content/content.server.ts`: failed content bundles are cached for 5 seconds.
- `src/lib/db/migrate.server.ts`: five startup migration attempts with 0.5, 1, 2, and 4 second waits.

**Recommendation:** Add a database circuit breaker or longer failure backoff (for example 30–60 seconds with jitter), deduplicate/rate-limit expected outage logs, and emit a compact structured error rather than repeated full stacks. Separate migration readiness from public rendering and provide an explicit database-disabled test mode. Monitor fallback rate and database latency in production.

### P2 — High-value improvements

#### F-05: Mobile header consumes too much of the first viewport

**Evidence:** The public header measures 169 px at 390×844, approximately 20% of the viewport height before page content. It combines the utility strip, brand/actions, and search/navigation treatment.

**Recommendation:** Collapse the utility message on small screens, reduce vertical padding, and consider revealing search on demand. Target approximately 96–120 px of persistent chrome while preserving the primary menu, search, account, and basket actions.

#### F-06: Cookie consent obscures 43.4% of the initial mobile viewport

**Evidence:** The first-layer notice measures 366.5 px high on an 844 px viewport. Accept, reject, and manage choices are all present, which is good, but the overlay substantially blocks the underlying page.

**Recommendation:** Tighten copy and spacing, retain equal prominence for accept/reject, and move detailed explanation into the preferences view. Aim for less than one-third of the initial mobile viewport without weakening consent clarity.

#### F-07: Small text and compact controls reduce readability and touch comfort

The visual system uses many 8–10 px utility labels; global CSS raises some of these to 9 or 11 px, but they remain small for meaningful product metadata and form assistance. The crawl also flagged numerous controls below the recommended 44×44 px touch target, including known 36×36 header/quantity-style controls. Some flagged items are inline links and need manual triage rather than blanket resizing.

**Recommendation:** Use at least 12 px for secondary operational text and 14–16 px for form/help content. Increase primary mobile controls to 44×44 px where layout permits, and guarantee at least the WCAG 2.2 minimum target size or valid spacing/inline exceptions. Validate at 200% zoom and with keyboard-only navigation.

#### F-08: Credit-account page has no H1

**Evidence:** `/credit-account` returned zero H1 elements at mobile, tablet, and desktop. Its `InfoPage` is configured with `showHero={false}`, removing the page-level heading.

**Impact:** Weakens document structure for screen-reader users and can reduce search-engine clarity.

**Recommendation:** Render the page title as a visible H1 above the application or as a correctly implemented visually hidden H1 when the design genuinely cannot show it. Keep form section headings beneath it in logical order.

#### F-09: Main client bundle is over the configured warning threshold

**Evidence:** Production build reports a 530.56 kB client chunk (160.57 kB gzip). TanStack also warns that the exported `Home` component in `src/routes/index.tsx` prevents optimal route code splitting.

**Recommendation:** Move reusable `Home` implementation out of the route module, retain only route-specific exports, inspect the bundle, and lazy-load heavy product/admin/media features. Set and enforce a bundle budget in CI.

### P3 — Quality and maintainability

#### F-10: Large route components and lint warnings increase change risk

The codebase passes lint but reports 18 `react-refresh/only-export-components` warnings. Several route/components are 575–850+ lines, including product detail, catalogue, registration, CMS visual editing, and media management.

**Recommendation:** Split presentation, state, validation, and data orchestration into focused modules. Resolve route-export warnings where practical and add component-level tests for complex forms and product state.

#### F-11: Legal and operational content needs owner sign-off

The legal, privacy, cookies, delivery, returns, disclaimer, and unsubscribe pages are present and readable. Code review cannot confirm that business identity, policies, contact details, retention periods, delivery commitments, and consumer/business terms are legally or operationally correct.

**Recommendation:** Obtain documented approval from the business owner and qualified legal/privacy reviewer before launch. Add a visible revision/effective date where appropriate.

## 5. UI and UX assessment

### What works well

- Strong, consistent industrial visual language across navigation, cards, forms, support content, and footer.
- Clear high-level routes for products, quotes, resources, delivery, returns, account, and contact.
- Good product-detail structure: image viewing, information tabs, availability, quote/basket actions, and consent-aware YouTube embedding.
- Useful empty states for cart, quote, signed-out account, and gated return behaviour.
- Contact methods and support routes are visible and understandable.
- Form validation and required-field behaviour are covered in browser tests.
- Cookie settings support accept, reject, and granular management.
- Metadata, canonical handling, robots, sitemap, and legacy category redirects are implemented and tested.
- The footer is comprehensive and logically grouped.

### UX friction

- Mobile users see substantial fixed/header UI before content.
- Catalogue cards prioritize large media over rapid part comparison.
- Very long mobile pages make result scanning and return-to-filter behaviour costly.
- Small all-caps/monospace metadata is visually distinctive but often below comfortable reading size.
- The footer becomes a long secondary journey on mobile; collapsible groups could reduce perceived length.
- Missing imagery and zero prices weaken otherwise polished presentation.

## 6. Responsive assessment

| Viewport | Result | Main observations |
|---|---|---|
| 390×844 mobile | Pass with issues | No horizontal overflow; coherent stacking; header is 169 px; cookie layer covers 43.4%; catalogue is 12,545 px high |
| 768×1024 tablet | Pass with issues | No horizontal overflow; category/navigation layout remains usable; catalogue is 7,144 px high |
| 1440×900 desktop | Pass | Strong hierarchy and density; catalogue is 4,883 px high; header is 182 px but proportionally less intrusive |
| 320 px narrow mobile | Existing test passes | Registration and legal acceptance remain usable without horizontal overflow |

Responsive strengths include consistent edge spacing, sensible stacking, readable content widths, and no audited overflow. The key responsive weakness is vertical efficiency rather than broken layout.

## 7. Accessibility assessment

Positive implementation signals:

- Skip-link and focus-visible styling are present.
- Reduced-motion preferences are considered.
- Audited images all had `alt` attributes.
- Most audited pages expose one H1 and useful document titles.
- Controls and forms generally have labels or accessible names.
- Consent, status, and error patterns are explicit.

Issues requiring remediation or formal testing:

- `/credit-account` has no H1.
- Utility typography is frequently below 12 px.
- Several controls are smaller than the recommended 44×44 px touch target; a subset is below 24 px and needs manual exception/spacing review.
- Product-card image links were flagged by the audit heuristic as unnamed because the accessible name is inherited from a descendant image; verify these with an accessibility tree/axe run rather than relying on DOM text heuristics.
- A formal WCAG 2.2 AA audit was not completed. Screen reader testing, zoom/reflow at 200% and 400%, keyboard traversal, contrast measurement, and error-recovery testing remain necessary for a conformance claim.

## 8. Functional coverage matrix

| Journey | Status | Notes |
|---|---|---|
| Home and global navigation | Passed | Desktop/mobile navigation and overflow checks pass |
| Product catalogue | Passed with UX issues | Loading, filters, sorting/category behaviour, and selection covered; density/data quality need work |
| Search | Passed | Query result rendering covered |
| Product detail | Passed | Tabs, image viewer, and YouTube-consent behaviour covered |
| Cart | Partially verified | Empty state/UI verified; complete add/update/remove/checkout transaction not release-verified |
| Quote builder | Partially verified | UI and local quote behaviour covered; delivery/persistence not fully verified |
| Login/register/password reset | Partially verified | Screens, validation, and signed-out state covered; real identity/session/email lifecycle not fully verified |
| Contact and question forms | Partially verified | Required-field behaviour covered; database persistence and delivery not verified |
| Returns and tracking | Partially verified | Signed-out gating and screens covered; real order lookup/return workflow not verified |
| Credit application | Partially verified | UI present; persistence/notification not verified; missing H1 |
| CMS/admin | Partially verified | Login protection/redirect covered; authenticated CRUD, publishing, media, and rollback not verified |
| Cookie preferences | Passed | Accept/reject/manage behaviour covered; mobile footprint needs improvement |
| SEO routes | Passed | Titles, robots, sitemap, canonical patterns, and redirects covered |
| Database fallback | Functionally passes, operationally weak | Public defaults render, but latency/log behaviour is unacceptable during sustained outage |

## 9. Recommended implementation plan

### Before release

1. Provision a representative staging database and test integrations; run the full suite and manually complete all revenue/data-writing journeys.
2. Clean and validate catalogue records: pricing, images, availability, part numbers, and purchasability.
3. Reduce mobile catalogue density and initial result count; add URL-preserving pagination or “Load more.”
4. Implement database failure backoff/circuit breaking and structured, rate-limited logging.
5. Fix the credit-account H1 and validate heading order.

### Next iteration

1. Reduce the mobile header and cookie-notice footprint.
2. Raise small text sizes and increase high-value touch targets.
3. Split the main client chunk and remove the `Home` route export warning.
4. Add accessibility automation (for example axe) plus manual keyboard, screen-reader, contrast, and zoom testing.
5. Refactor the largest route components and clear lint warnings.

### Ongoing controls

- Add CI gates for typecheck, lint, content validation, build, E2E, accessibility smoke checks, and bundle budgets.
- Add catalogue validation at ingestion/publication time.
- Monitor database latency/fallback rate, form failures, checkout hand-off, client errors, and Core Web Vitals.
- Keep a small cross-device regression matrix: 320, 390, 768, 1024, and 1440 px.

## 10. Release exit criteria

Release should be approved only when:

- The full E2E suite passes against staging with no database-related skips or timeouts.
- Contact, question, credit, return, authentication, CMS publishing, media upload, and checkout hand-off are verified end to end.
- No active catalogue item shows an unexplained zero price or accidental missing media.
- Mobile catalogue length and header/consent obstruction are reduced and re-tested.
- Database loss does not create repeated multi-second page delays or log floods.
- The credit-account H1 and priority touch/readability issues are fixed.
- Business/legal owners sign off on operational and policy content.

## 11. Audit limitations

This was a local code-and-browser audit, not a production penetration test, legal review, or formal WCAG certification. PostgreSQL was unavailable, and no real payment, order, email, or destructive CMS action was performed. Those limitations are explicitly represented as release gates above rather than assumed successes or failures.

