import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    shopifyStoreDomain: process.env.SHOPIFY_STORE_DOMAIN,
    shopifyStorefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
    shopifyStorefrontPrivateAccessToken: process.env.SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN,
    shopifyStorefrontApiVersion: process.env.SHOPIFY_STOREFRONT_API_VERSION ?? "2026-01",
    shopifyDefaultCountry: process.env.SHOPIFY_DEFAULT_COUNTRY ?? "GB",
    shopifyAdminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    shopifyAdminApiVersion: process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-07",
    // Client secret from the Shopify app. Used only to authenticate incoming
    // webhook bodies; this is not the Admin API access token.
    shopifyWebhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    shopifyAppUrl: process.env.SHOPIFY_APP_URL,

    // CMS database (Postgres). Required for form submissions and the admin panel.
    databaseUrl: process.env.DATABASE_URL,

    // Initial admin account, seeded on first boot when staff_users is empty.
    adminSeedEmail: process.env.ADMIN_SEED_EMAIL,
    adminSeedPassword: process.env.ADMIN_SEED_PASSWORD,

    // Transactional email for sales-desk notifications. Resend is preferred;
    // SMTP/nodemailer is the fallback. If neither is set, submissions are
    // stored but notification emails are skipped with a warning.
    resendApiKey: process.env.RESEND_API_KEY,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    mailFrom:
      process.env.MAIL_FROM ??
      "Spares Automation <trade@spares-automation.co.uk>",
    salesDeskEmail:
      process.env.SALES_DESK_EMAIL ?? "trade@spares-automation.co.uk",

    // Local persistent storage for CMS attachments. Mount a volume
    // here in production (see docker-compose.yml).
    uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",
  };
}
