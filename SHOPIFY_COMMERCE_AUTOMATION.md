# Shopify commerce, Markets and image-protection setup

The website CMS now includes a commerce workspace while Shopify remains the source of truth for
products, variant prices, draft orders, secure checkout links and completed orders.

## Included in this repository

- `/admin/quotes` lists the latest Shopify draft orders, including website quote requests, and lets
  staff send or resend the quotation email. Shopify inserts the secure checkout link and records the
  draft as `INVOICE_SENT`.
- `/admin/pricing` loads the Shopify catalogue so administrators can search, tick specific products,
  preview a percentage increase or decrease, and apply it only after typing the exact variant count.
  Zero-price enquiry products are skipped. Every success or failure is written to the CMS activity
  log.
- `/api/shopify/orders-create` receives Shopify's `orders/create` webhook and asks Shopify to send the
  order invoice automatically. HMAC verification, shop-domain validation and persisted webhook IDs
  prevent forged or duplicate emails.
- The public header lists the countries enabled in Shopify Markets. Selecting one reloads product
  and collection queries with Shopify's country context, so regional catalogue availability,
  currencies, exchange-rate adjustments and fixed market prices come directly from Shopify.
- New carts persist the selected country in Shopify buyer identity. Existing carts are repriced when
  the visitor changes country, keeping the displayed cart and Shopify checkout aligned.
- Website quote requests record the selected country and use that market's presentment currency on
  the Shopify draft order when localization is available.
- Every Shopify product photo receives a visible copyright watermark automatically. This includes
  photos added after deployment; the original Shopify media file is not modified.

## Configure Shopify Markets

In Shopify Admin, open **Settings → Markets** and complete the following for each selling region:

1. Create or activate the market and include its destination countries.
2. Confirm the products published to that market.
3. Configure the market currency and either automatic conversion/adjustments or fixed product
   prices. The website deliberately performs no local exchange-rate calculation.
4. Configure payment methods, shipping zones/rates, duties and taxes for those destinations.
5. Place a test order in every enabled currency and confirm that product, cart and checkout prices
   agree.

Only countries returned by Shopify's Storefront `localization.availableCountries` appear in the
website selector. Set `SHOPIFY_DEFAULT_COUNTRY` to the two-letter country code used before a visitor
makes a selection (normally `GB`). Prices and availability are requested with Shopify's
`@inContext(country: ...)`; cart creation and market changes set `buyerIdentity.countryCode`.

The old hardcoded UK VAT calculation has been removed from product and cart totals. Shopify checkout
is responsible for the final tax, duties and delivery calculation for the selected destination.

## Product image watermark

The watermark is enabled by default and is rendered over product cards, galleries, thumbnails,
zoomed images and cart thumbnails. Configure it at build/deployment time:

```text
VITE_PRODUCT_IMAGE_WATERMARK_ENABLED=true
VITE_PRODUCT_IMAGE_WATERMARK_TEXT=© SPARES AUTOMATION
```

Rebuild/redeploy the application after changing either watermark variable.

This visible overlay remains in ordinary screenshots and makes copied imagery attributable. Browser
right-click and dragging remain blocked. Browsers cannot prevent operating-system screenshots or a
determined user from retrieving a public image URL; permanent pixel-level protection would require
uploading a pre-watermarked source image or routing every source through an image-processing service.

## Shopify app access

Create or update the store's custom app in Shopify's Dev Dashboard and grant these Admin API scopes:

- `read_draft_orders`, `write_draft_orders` — quotation listing and email sending.
- `read_products`, `write_products` — bulk price preview and updates.
- `read_orders`, `write_orders` — the order-created webhook and automatic invoice email.
- Keep the existing customer scopes required by credit-account syncing.

Release the new app version, deploy the website, then sign in to the website CMS and open
**Commerce â†’ Bulk pricing â†’ Connect Shopify**. The store owner approves CustomFrontend once.
Shopify returns an offline Admin API token to the website callback; the application encrypts it
with `APP_SESSION_SECRET` and stores it in PostgreSQL. A manually copied
`SHOPIFY_ADMIN_ACCESS_TOKEN` is therefore optional. This authorization-code installation is the
required flow when the Shopify app and client store belong to different organizations.

Set these production variables in Coolify:

```text
SHOPIFY_STORE_DOMAIN=permanent-store-domain.myshopify.com
SHOPIFY_DEFAULT_COUNTRY=GB
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_ADMIN_API_VERSION=2026-07
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_APP_URL=https://spares-automation.co.uk
SHOPIFY_WEBHOOK_SECRET=...
VITE_PRODUCT_IMAGE_WATERMARK_ENABLED=true
VITE_PRODUCT_IMAGE_WATERMARK_TEXT=© SPARES AUTOMATION
```

`SHOPIFY_WEBHOOK_SECRET` is the app client secret used to sign webhook deliveries. It is not the
Admin API access token. Keep both values server-only. The OAuth callback must be listed in the
CustomFrontend app's allowed redirect URLs.

## Register the automatic invoice webhook

The Shopify connection callback automatically registers the shop-specific `ORDERS_CREATE` webhook.
The command-line setup remains available as a diagnostic/manual fallback when a static Admin token
has been supplied:

```bash
npm run shopify:setup-automation
npm run shopify:setup-automation -- --apply
```

The command creates one `ORDERS_CREATE` subscription pointing to:

```text
https://spares-automation.co.uk/api/shopify/orders-create
```

Re-running it is safe; an existing matching subscription is left unchanged. Confirm successful test
deliveries in the app's Shopify Dev Dashboard logs.

## Brand the customer emails in Shopify

The application supplies the recipient, subject and staff message, while Shopify renders and sends
the transactional email and secure payment link. In Shopify Admin:

1. Configure the store logo and blue brand colour in the notification/email branding settings.
2. Review the **Draft order invoice** template used for quotations.
3. Review the **Order invoice** template used by automatic order invoices.
4. Add the approved legal entity name, registered address, company number and VAT number to the
   invoice footer/template. These business values are not present in the repository.
5. Confirm the sender domain is authenticated, then send test emails from both templates.

Shopify's normal order confirmation is separate from the order invoice. Decide with the client
whether both should remain enabled; this implementation intentionally sends the requested invoice.

## Safe operating procedure for prices

1. Sign in as a CMS administrator and open **Commerce → Bulk pricing**.
2. Search the product list, select the intended products, and enter the percentage.
3. Review every selected product and the current/new variant prices in the preview.
4. Export or otherwise retain a Shopify catalogue backup before a large production run.
5. Type the exact confirmation phrase and apply the prices.
6. Check the CMS activity log and spot-check affected products in Shopify.

The tool changes only the base variant `price`. It does not change compare-at prices, Markets price
lists, discounts, draft orders, or completed orders. Selections above 5,000 positive-price variants
must be split into smaller selected-product batches.
