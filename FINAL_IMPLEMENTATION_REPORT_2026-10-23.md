# Spares Automation — UI/UX and Functional Improvement Report

**Report date:** 23 October 2026  
**Project:** Spares Automation storefront and CMS  
**Prepared for:** Management review  
**Implementation status:** Code remediation complete; conditional release readiness

## Executive summary

The full UI/UX, responsive, accessibility, functional-resilience, performance, and code-quality improvement programme has been completed without redesigning the storefront or changing its established visual identity.

The work reduced mobile interface obstruction, shortened the initial catalogue experience, improved incomplete-product handling, strengthened accessibility, reduced the primary JavaScript bundle, eliminated lint warnings, and added automated safeguards for future releases.

The revised internal audit score is **8.1/10**, up from **6.9/10**. The application is technically stronger and all completed repository checks pass. Final production approval remains conditional on two external activities: correcting eight Shopify catalogue records and running the database-dependent tests against an available staging PostgreSQL service.

## Business impact

- Customers see more usable content within the first mobile viewport.
- Products with missing or zero pricing can no longer appear to be free or enter checkout incorrectly.
- Product-image gaps now use a deliberate branded fallback rather than a broken presentation.
- Catalogue browsing starts with a manageable result set and retains the existing Load more journey.
- Database outages generate less delay and substantially less repetitive logging.
- Accessibility improvements make headings, product links, status messages, and key touch targets easier to use.
- Performance, catalogue quality, content integrity, and responsive behaviour are now protected by automated release checks.

## Measured results

| Measure | Before | After | Result |
|---|---:|---:|---|
| Overall internal audit score | 6.9/10 | 8.1/10 | Improved |
| Mobile header height | 169 px | 145 px | 14% reduction |
| Cookie banner viewport coverage | 43.4% | 32.7% | 25% relative reduction |
| Initial catalogue products | 18 observed / up to 48 requested | 12 | Faster, shorter first view |
| Mobile catalogue page height | 12,545 px | 9,342 px | 26% reduction |
| Largest client JavaScript chunk | 530.56 kB | 500.96 kB | Under the enforced 500 KiB budget |
| Lint warnings | 18 | 0 | Cleared |
| Final automated test result | Incomplete under DB outage | 125 passed, 25 intentionally skipped, 0 failed | Passing within available environment |

## Completed improvements

### 1. Product and catalogue integrity

- Zero or invalid prices display **Request price** instead of £0.00.
- Products without a valid purchasable variant cannot be added to the basket.
- Missing images use a branded **Image unavailable** state.
- The catalogue now loads 12 products initially with incremental loading.
- A live Shopify catalogue validation command was added for release use.

### 2. Mobile and responsive experience

- Reduced mobile header height while preserving navigation, search, account, and basket access.
- Reduced cookie-banner copy, spacing, and vertical footprint while keeping accept, reject, and preference controls equally accessible.
- Increased priority mobile touch targets to 44 px.
- Increased very small operational text to a more readable 10–12 px range.
- Confirmed no horizontal overflow across the audited routes and viewports.

### 3. Accessibility

- Restored a page-level H1 to the credit-account journey without changing its visible layout.
- Added explicit accessible names to product links and relevant actions.
- Improved live status announcements for add-to-cart feedback.
- Added automated checks for headings, landmarks, image alternatives, duplicate IDs, unnamed form controls, and horizontal overflow.

### 4. Performance and maintainability

- Separated the home-page implementation from its route definition to improve code splitting.
- Reduced the largest client chunk below the new CI budget.
- Added production Core Web Vitals reporting for LCP, CLS, INP, FCP, and TTFB.
- Eliminated all ESLint warnings.
- Isolated CI browser execution to prevent stateful CMS tests from racing over the shared staging database.

### 5. Database resilience

- Added progressive database failure backoff from 30 seconds up to 5 minutes.
- Added a migration retry cooldown after repeated failures.
- Replaced repeated full stack traces with compact, rate-limited outage logging.
- Preserved the existing compiled-content fallback so public pages remain available during a CMS database outage.

## Verification completed

| Check | Final result |
|---|---|
| ESLint | Passed — 0 errors, 0 warnings |
| TypeScript | Passed |
| Content validation | Passed — 9 documents, 7 block types, 22 editable pages, 71 markers |
| Production build | Passed |
| Bundle budget | Passed — largest chunk 489.22 KiB on disk, below 500 KiB |
| Automated browser/unit suite | 125 passed, 25 skipped, 0 failed |
| Targeted accessibility regression suite | 16 passed, 0 failed |
| Visual responsive review | Passed with the established design preserved |

The 25 skipped cases require database-backed or viewport-specific conditions unavailable in the local environment. The CI workflow is configured to run with PostgreSQL and includes the new quality gates.

## Outstanding external actions

These items cannot be completed safely from the source repository alone and should be assigned before final production sign-off.

### Shopify catalogue owner

Correct eight live catalogue records identified by `npm run check:catalog`:

- Seven records have zero/invalid pricing and no positive-price purchasable variant.
- One record is missing its primary product image.

Until corrected, the storefront safely presents these items as **Request price**, unavailable, or with a branded image fallback.

### Release/DevOps owner

- Provide a reachable staging PostgreSQL service.
- Run the complete database-backed test suite.
- Verify contact, credit application, CMS publishing, authentication/session, notification, and checkout hand-off journeys using non-production integrations.

## Release recommendation

**Conditional Go.** The repository-level improvements are complete and verified, and no visual redesign has been introduced. Production release can proceed after:

1. The eight Shopify source records are corrected.
2. The database-dependent suite passes against staging PostgreSQL.
3. The business owner confirms the legal and operational content.

## Supporting evidence

- Full technical audit: `SITE_AUDIT_REPORT_2026-10-23.md`
- Visual evidence and measurement scripts: `audit-artifacts/`
- Release checks: `npm run check:content`, `npm run check:catalog`, and `npm run check:bundle`

