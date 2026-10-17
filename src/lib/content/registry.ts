import { z } from "zod";

import { CATALOG_CATEGORIES, HERO_CATEGORY_TILES, HERO_RANGES } from "../catalog";
import { SITE } from "../site";

/**
 * Editors write plain prose only. Markup, entities, inline event handlers and
 * script/style URLs are rejected before anything reaches the database so a
 * compromised or careless CMS session cannot inject markup into public pages.
 */
const MARKUP_PATTERN =
  /<\s*\/?\s*[a-zA-Z!?]|<\s*script|&lt;|&gt;|&#\d|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|(?:^|[\s"'/])on[a-z]{3,}\s*=|expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|data)/i;
export const PLAIN_TEXT_MESSAGE = "Remove markup, HTML entities and script content; this field accepts plain text only.";
const plainText = <T extends z.ZodType<string>>(schema: T) =>
  schema.refine((value) => !MARKUP_PATTERN.test(value), PLAIN_TEXT_MESSAGE);

const text = (max = 5000) => plainText(z.string().trim().min(1).max(max));
const optionalText = (max = 5000) => plainText(z.string().trim().max(max));
const APPROVED_ROUTES = new Set([
  "/", "/about-us", "/account", "/asphalt", "/automation", "/cart", "/concrete",
  "/contact-us", "/control-panels-software", "/credit-account", "/cookies",
  "/delivery-information", "/disclaimer", "/forgot-password", "/got-a-question",
  "/home-controls", "/login", "/new-arrivals", "/packing", "/privacy-policy",
  "/products", "/quote", "/register", "/resources", "/returns", "/returns-policy",
  "/search", "/terms-and-conditions", "/track-order", "/unsubscribe",
]);
const safeLink = z.string().trim().max(500).refine((value) => {
  if (value.startsWith("/")) {
    if (value.startsWith("//")) return false;
    try { return APPROVED_ROUTES.has(new URL(value, "https://cms.invalid").pathname); } catch { return false; }
  }
  try {
    return ["https:", "mailto:", "tel:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use an internal path or a safe HTTPS, email, or telephone link");

/** Open Graph copy falls back to the page title/description when left empty. */
export const seoSchema = z.object({
  title: text(120),
  description: text(320),
  ogTitle: optionalText(120).default(""),
  ogDescription: optionalText(320).default(""),
});

export type PageSeo = z.infer<typeof seoSchema>;

const heroBlockSchema = z.object({
  type: z.literal("hero"),
  eyebrow: optionalText(120),
  title: text(240),
  copy: optionalText(3000),
  mediaId: z.string().max(64).optional().default(""),
  mediaAlt: z.string().max(300).optional().default(""),
});

const textBlockSchema = z.object({
  type: z.literal("text"),
  title: text(240),
  copy: text(10000),
});

const cardsBlockSchema = z.object({
  type: z.literal("cards"),
  title: optionalText(240),
  items: z.array(z.object({ title: text(240), copy: text(5000) })).min(1).max(12),
});

const listBlockSchema = z.object({
  type: z.literal("list"),
  title: text(240),
  items: z.array(text(1000)).min(1).max(30),
});

const stepsBlockSchema = z.object({
  type: z.literal("steps"),
  title: text(240),
  items: z.array(z.object({ title: text(240), copy: text(3000) })).min(1).max(12),
});

const mediaBlockSchema = z.object({
  type: z.literal("media"),
  mediaId: text(64),
  mediaAlt: text(300),
  caption: optionalText(500),
});

const ctaBlockSchema = z.object({
  type: z.literal("cta"),
  title: text(240),
  copy: optionalText(3000),
  label: text(100),
  to: safeLink,
});

export const contentBlockSchema = z.discriminatedUnion("type", [
  heroBlockSchema,
  textBlockSchema,
  cardsBlockSchema,
  listBlockSchema,
  stepsBlockSchema,
  mediaBlockSchema,
  ctaBlockSchema,
]).superRefine((value, context) => {
  if (value.type === "hero" && value.mediaId && !value.mediaAlt.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaAlt"], message: "Alt text is required when an image is selected" });
});

export type ContentBlock = z.infer<typeof contentBlockSchema>;

const pageSchema = z.object({
  seo: seoSchema,
  eyebrow: optionalText(120),
  title: text(240),
  intro: optionalText(3000),
  ctaLabel: optionalText(100),
  ctaTo: safeLink,
  blocks: z.array(contentBlockSchema).max(30),
});

const siteSchema = z.object({
  name: text(120),
  url: z.string().url().startsWith("https://"),
  email: z.string().email().max(254),
  phoneDisplay: text(60),
  phoneHref: z.string().regex(/^\+[1-9]\d{6,14}$/),
  whatsapp: z.string().regex(/^\d{7,15}$/),
  location: text(200),
  hours: text(200),
  addressLocality: text(120),
  addressCountry: z.string().trim().regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code"),
  socialHandle: z.string().trim().regex(/^@[A-Za-z0-9_]{1,30}$/, "Use an @handle"),
});

const navItemSchema = z.object({
  id: text(80),
  label: text(100),
  to: safeLink,
  visible: z.boolean(),
});

const navigationSchema = z.object({
  header: z.array(navItemSchema).max(20),
  information: z.array(navItemSchema).max(20),
  help: z.array(navItemSchema).max(20),
  footerCopy: text(500),
}).superRefine((value, context) => {
  const locked: Record<string, string> = {
    "all-products": "/products", asphalt: "/products?category=asphalt", concrete: "/products?category=concrete", packing: "/products?category=packing",
    automation: "/products?category=automation", "home-controls": "/products?category=home-controls", "control-panels": "/products?category=control-panels-software",
    resources: "/resources", contact: "/contact-us", products: "/products", about: "/about-us", cart: "/cart", quote: "/quote", tracking: "/track-order",
    account: "/account", question: "/contact-us", terms: "/terms-and-conditions", returns: "/returns", "returns-policy": "/returns-policy",
    delivery: "/delivery-information", privacy: "/privacy-policy", cookies: "/cookies", disclaimer: "/disclaimer", unsubscribe: "/unsubscribe",
  };
  const items = [...value.header, ...value.information, ...value.help];
  if (value.header.length !== 9 || value.information.length !== 8 || value.help.length !== 8) context.addIssue({ code: z.ZodIssueCode.custom, message: "Fixed navigation entries cannot be added or removed; use visibility controls instead" });
  for (const item of items) if (locked[item.id] !== item.to) context.addIssue({ code: z.ZodIssueCode.custom, message: `Destination for ${item.id} is locked` });
  for (const section of [value.header, value.information, value.help]) if (new Set(section.map((item) => item.id)).size !== section.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Navigation identifiers must be unique within each section" });
});

const homeSchema = z.object({
  seo: seoSchema,
  title: text(240),
  resourceTitle: text(240),
  resourceCopy: text(1500),
  finderTitle: text(240),
  finderCopy: text(2000),
  finderSubmit: text(100),
  contactTitle: text(240),
  contactCopy: text(2000),
});

/** Homepage hero panel wording. Handles stay locked to the catalogue contract. */
const heroLineSchema = z.object({
  handle: text(100),
  label: text(120),
  meta: optionalText(160),
});

const heroRangeSchema = z.object({
  handle: text(100),
  title: text(160),
  lines: z.array(heroLineSchema).max(12),
});

const heroTileSchema = z.object({ handle: text(100), title: text(160) });

const catalogueSchema = z.object({
  ranges: z.array(heroRangeSchema).length(HERO_RANGES.length),
  tiles: z.array(heroTileSchema).length(HERO_CATEGORY_TILES.length),
  categories: z.array(z.object({
    handle: text(100),
    label: text(160),
    description: text(1000),
    visible: z.boolean(),
    mediaId: optionalText(64),
    mediaAlt: optionalText(300),
  }).superRefine((value, context) => {
    if (value.mediaId && !value.mediaAlt.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaAlt"], message: "Alt text is required when an image is selected" });
  })).length(CATALOG_CATEGORIES.length),
}).superRefine((value, context) => {
  const expected = new Set(CATALOG_CATEGORIES.map((category) => String(category.handle)));
  const actual = value.categories.map((category) => category.handle);
  if (new Set(actual).size !== expected.size || actual.some((handle) => !expected.has(handle))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["categories"], message: "Shopify category handles are locked" });

  const rangeHandles = HERO_RANGES.map((range) => range.handle).join("|");
  if (value.ranges.map((range) => range.handle).join("|") !== rangeHandles) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ranges"], message: "Hero panel handles are locked" });
  }
  value.ranges.forEach((range, index) => {
    const compiled = HERO_RANGES[index];
    if (!compiled) return;
    if (range.lines.map((line) => line.handle).join("|") !== compiled.lines.map((line) => line.handle).join("|")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["ranges", index, "lines"], message: "Product-line links are locked; edit the wording only" });
    }
  });
  if (value.tiles.map((tile) => tile.handle).join("|") !== HERO_CATEGORY_TILES.map((tile) => tile.handle).join("|")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tiles"], message: "Category tile links are locked" });
  }
});

const message = text(5000);
const messagesSchema = z.object({
  "common.contactSales": message,
  "common.tryAgain": message,
  "common.required": message,
  "catalogue.empty": message,
  "catalogue.loadMore": message,
  "quote.submitted": message,
  "returns.submitted": message,
  "account.signIn": message,
  "error.notFoundTitle": message,
  "error.notFoundCopy": message,
  "error.genericTitle": message,
  "error.genericCopy": message,
  "cookie.eyebrow": message,
  "cookie.title": message,
  "cookie.copy": message,
  "cookie.link": message,
  "cookie.necessary": message,
  "cookie.necessaryCopy": message,
  "cookie.analytics": message,
  "cookie.analyticsCopy": message,
  "cookie.marketing": message,
  "cookie.marketingCopy": message,
  "cookie.manage": message,
  "cookie.hide": message,
  "cookie.reject": message,
  "cookie.save": message,
  "cookie.accept": message,
  "part.nameLabel": message,
  "part.namePlaceholder": message,
  "part.emailLabel": message,
  "part.emailPlaceholder": message,
  "part.numberLabel": message,
  "part.numberPlaceholder": message,
  "part.descriptionLabel": message,
  "part.descriptionPlaceholder": message,
  "part.photoLabel": message,
  "part.photoHelp": message,
  "part.sending": message,
  "part.successBeforeReference": message,
  "part.successAfterReference": message,
  "auth.resetSent": message,
  "auth.resetFailed": message,
  "cart.loadFailed": message,
  "cart.updateFailed": message,
  "cart.removeFailed": message,
  "account.loadFailed": message,
  "track.loadFailed": message,
  "support.intro": message,
  "support.emailLabel": message,
  "support.attachmentsLabel": message,
  "support.attachmentsHelp": message,
  "support.submit": message,
  "support.sending": message,
  "support.successBeforeReference": message,
  "support.successAfterReference": message,
  "support.tracking.title": message,
  "support.tracking.referenceLabel": message,
  "support.tracking.detailsLabel": message,
  "support.resources.title": message,
  "support.resources.referenceLabel": message,
  "support.resources.detailsLabel": message,
  "support.question.title": message,
  "support.question.referenceLabel": message,
  "support.question.detailsLabel": message,
  "support.unsubscribe.title": message,
  "support.unsubscribe.referenceLabel": message,
  "support.unsubscribe.detailsLabel": message,
  "return.signInTitle": message,
  "return.signInCopy": message,
  "return.selectOrder": message,
  "return.selectItems": message,
  "return.submitFailed": message,
  "return.notesPlaceholder": message,
  "return.submit": message,
  "return.submitting": message,
  "contact.emailLabel": message,
  "contact.emailDetail": message,
  "contact.phoneLabel": message,
  "contact.phoneDetail": message,
  "contact.whatsappLabel": message,
  "contact.whatsappDetail": message,
  "contact.whatsappMessage": message,
}).strict();

/**
 * Functional pages keep their behaviour, forms and Shopify wiring in code; only
 * the explanatory wording around them is editable. `blocks` renders on the
 * InfoPage-based routes; the form-driven routes ignore it.
 */
const functionalPageSchema = z.object({
  seo: seoSchema,
  eyebrow: optionalText(120),
  title: text(240),
  intro: optionalText(2000),
  sectionEyebrow: optionalText(120),
  sectionTitle: optionalText(240),
  noticeTitle: optionalText(240),
  emptyTitle: optionalText(240),
  emptyCopy: optionalText(2000),
  loadingLabel: optionalText(120),
  helpCopy: optionalText(2000),
  ctaLabel: optionalText(100),
  ctaTo: safeLink,
  blocks: z.array(contentBlockSchema).max(12),
});

const productSchema = z.object({
  listingSeo: seoSchema,
  listingEyebrow: optionalText(120),
  listingTitle: text(240),
  listingHighlight: optionalText(120),
  listingIntro: optionalText(2000),
  emptyTitle: text(240),
  emptyCopy: text(2000),
  filteredEmptyTitle: text(240),
  filteredEmptyCopy: text(2000),
  supportEyebrow: text(120),
  supportTitle: text(240),
  tabDetails: text(80),
  tabPdf: text(80),
  tabVideo: text(80),
  documentsLabel: text(120),
  videosLabel: text(120),
  questionLabel: text(120),
  questionCopy: text(1000),
  questionCta: text(80),
  quantityLabel: text(40),
  viewCartLabel: text(80),
  outOfStockLabel: text(80),
  imagePendingLabel: text(80),
  enlargeHint: text(160),
  leadTimeNote: text(300),
});

const requiredEmailVariables: Record<string, readonly string[]> = {
  returnAcknowledgement: ["{{reference}}", "{{orderNumber}}"],
  returnStatus: ["{{reference}}", "{{status}}"],
  salesNotification: ["{{reference}}", "{{submissionType}}", "{{details}}"],
};

const emailTemplateSchema = z.object({ subject: text(300), body: text(12000) });
const emailsSchema = z.object({
  returnAcknowledgement: emailTemplateSchema,
  returnStatus: emailTemplateSchema,
  salesNotification: emailTemplateSchema,
}).superRefine((value, context) => {
  for (const [key, variables] of Object.entries(requiredEmailVariables)) {
    const template = value[key as keyof typeof value];
    for (const variable of variables) {
      if (!`${template.subject}\n${template.body}`.includes(variable)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Template must retain ${variable}`,
        });
      }
    }
  }
});

/**
 * Compiled default for one information page. These mirror exactly what the
 * public routes render, so seeding them changes nothing on the website and an
 * outage can fall back to them safely.
 */
type PageDefault = {
  seo: { title: string; description: string; ogTitle: string; ogDescription: string };
  eyebrow: string;
  title: string;
  intro: string;
  ctaLabel: string;
  ctaTo: string;
  blocks: ContentBlock[];
};

const functionalPage = (
  seo: { title: string; description: string },
  fields: {
    eyebrow?: string;
    title: string;
    intro?: string;
    sectionEyebrow?: string;
    sectionTitle?: string;
    noticeTitle?: string;
    emptyTitle?: string;
    emptyCopy?: string;
    loadingLabel?: string;
    helpCopy?: string;
    ctaLabel?: string;
    ctaTo?: string;
    blocks?: ContentBlock[];
  },
) => ({
  seo: { ...seo, ogTitle: "", ogDescription: "" },
  eyebrow: fields.eyebrow ?? "",
  title: fields.title,
  intro: fields.intro ?? "",
  sectionEyebrow: fields.sectionEyebrow ?? "",
  sectionTitle: fields.sectionTitle ?? "",
  noticeTitle: fields.noticeTitle ?? "",
  emptyTitle: fields.emptyTitle ?? "",
  emptyCopy: fields.emptyCopy ?? "",
  loadingLabel: fields.loadingLabel ?? "",
  helpCopy: fields.helpCopy ?? "",
  ctaLabel: fields.ctaLabel ?? "",
  ctaTo: fields.ctaTo ?? "/contact-us",
  blocks: fields.blocks ?? [],
});

const DEFAULT_FUNCTIONAL = {
  cart: functionalPage(
    { title: "Cart", description: "Review selected industrial parts, continue to secure Shopify checkout, or request a quote by email." },
    {
      eyebrow: "Secure Checkout",
      title: "Cart",
      emptyTitle: "Your cart is empty",
      emptyCopy: "Add products from any category, then complete payment and shipping through checkout.",
      loadingLabel: "Loading cart",
      helpCopy: "Select PayPal as your payment method at secure checkout.",
    },
  ),
  quote: functionalPage(
    { title: "Build a Quote", description: "Review industrial products and submit a quotation request to Spares Automation." },
    {
      eyebrow: "Product quotation",
      title: "My Quote",
      intro: "Review your products and submit the quote for sales review. Shopify account details are filled automatically when you are signed in.",
      sectionTitle: "Quote submitted",
      emptyTitle: "Your quote is empty",
      emptyCopy: "Choose “Build a quote” on any product page to add an item.",
      loadingLabel: "Loading quote",
      helpCopy: "Our sales team will review pricing, availability, and delivery before contacting you.",
    },
  ),
  account: functionalPage(
    { title: "Customer Account", description: "View your Spares Automation account details, credit status, and order history." },
    {
      eyebrow: "Customer Account",
      title: "Account",
      emptyTitle: "Sign in to view your account",
      emptyCopy: "Sign in securely to view your account details and continue to the catalogue.",
      loadingLabel: "Loading account",
    },
  ),
  login: functionalPage(
    { title: "Sign In", description: "Sign in to your Spares Automation customer account to track orders and manage credit terms." },
    {
      eyebrow: "Trade Customer Access",
      title: "Sign In",
      intro: "Sign in directly to your Spares Automation account.",
      sectionEyebrow: "Secure Sign In",
      sectionTitle: "Existing Customer",
      helpCopy: "Don't have an account?",
    },
  ),
  register: functionalPage(
    { title: "Create Account", description: "Create a Spares Automation trade account to track orders, build quotes, and apply for credit terms." },
    {
      eyebrow: "Customer Access",
      title: "Create Your Account",
      intro: "Create your Spares Automation account for faster checkout and secure access to your customer details.",
      sectionEyebrow: "Registration",
      sectionTitle: "New Customer",
      helpCopy: "Already registered?",
    },
  ),
  "forgot-password": functionalPage(
    { title: "Reset Password", description: "Request a password reset link for your Spares Automation customer account." },
    {
      eyebrow: "Customer account",
      title: "Reset password",
      intro: "Enter the email address used for your customer account.",
    },
  ),
  "track-order": functionalPage(
    { title: "Track an Order", description: "Sign in to view and track your Spares Automation orders." },
    {
      eyebrow: "Order support",
      title: "Track an order",
      intro: "Sign in to your account to see live status and courier tracking for every order.",
      sectionEyebrow: "Your orders",
      sectionTitle: "Order tracking",
      noticeTitle: "Order history unavailable",
      emptyTitle: "No orders yet",
      emptyCopy: "There are no orders linked to your account. Once you place an order, its tracking will appear here.",
      loadingLabel: "Loading your orders",
      helpCopy: "Order history is not available through this store account yet. Contact the support desk and we will locate your order.",
      ctaLabel: "View account orders",
      ctaTo: "/account",
    },
  ),
  search: functionalPage(
    { title: "Search Products", description: "Search the Spares Automation industrial parts catalogue by product name, part number, brand, or equipment reference." },
    { eyebrow: "Product Search", title: "CATALOGUE / SEARCH", sectionTitle: "RESULTS" },
  ),
  returns: functionalPage(
    { title: "Returns", description: "Select products and quantities, choose a return reason, and submit a tracked return request." },
    {
      eyebrow: "Delivery & returns",
      title: "Returns",
      intro: "Request a return online, specify exactly what is coming back, and receive a traceable reference and email updates at each staff-managed stage.",
      sectionEyebrow: "How it works",
      sectionTitle: "Four simple stages",
      helpCopy: "Do not send an item until your return has been reviewed and instructions have been issued.",
      blocks: [{
        type: "steps",
        title: "Four simple stages",
        items: [
          { title: "Submit the request", copy: "Choose the order, items, quantities, reasons, and preferred outcome using the form below." },
          { title: "Receive instructions", copy: "An email confirms your reference. The returns team then sends approval and the correct return route." },
          { title: "Return the goods", copy: "Pack the approved items securely and follow the supplied collection or dispatch instructions." },
          { title: "Resolution", copy: "Once assessed, the agreed refund, replacement, repair, or advice is completed and your status is emailed." },
        ],
      }],
    },
  ),
  "got-a-question": functionalPage(
    { title: "Product and Quote Help", description: "Get help with product identification, availability, quotations, carts, and technical questions." },
    {
      eyebrow: "Questions",
      title: "Got a question?",
      intro: "For product identification, availability, technical details, quote help, or cart questions, contact the sales desk with as much reference detail as possible.",
      ctaLabel: "View all contact options",
      ctaTo: "/contact-us",
      blocks: [{
        type: "cards",
        title: "How we can help",
        items: [
          { title: "Product questions", copy: "Send the part number, manufacturer reference, product photo, or equipment name and we will help identify the right item." },
          { title: "Cart and quote questions", copy: "Add products to the cart and use request quote to email the current cart details to the sales desk." },
        ],
      }],
    },
  ),
  "credit-account": functionalPage(
    { title: "Apply for Credit Terms", description: "Apply for a Spares Automation credit account with company, reference, and credit limit details. Subject to credit check and written approval." },
    {
      eyebrow: "Credit account",
      title: "Apply for credit terms",
      intro: "Credit accounts let established customers purchase on agreed payment terms. Submit your company and reference details below; the sales desk will run the necessary checks and confirm your credit limit and terms in writing.",
      ctaLabel: "Existing customer sign in",
      ctaTo: "/login",
    },
  ),
} as const;

const DEFAULT_PAGES: Record<string, PageDefault> = {
  "about-us": {
    seo: {
      title: "About Us",
      description: "Learn how Spares Automation helps machinery teams identify, source, and order industrial parts and automation spares.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "About us",
    title: "About Spares Automation",
    intro: "Spares Automation supports plant operators, maintenance teams, and machinery businesses with product identification, sourcing, ordering, and technical sales assistance.",
    ctaLabel: "Contact the sales desk",
    ctaTo: "/contact-us",
    blocks: [
      {
        type: "cards",
        title: "",
        items: [
          {
            title: "What we do",
            copy: "We help customers identify and source industrial spares for asphalt, concrete, packing, control, and automation systems.",
          },
          {
            title: "How we help",
            copy: "Send a product reference, MPN, equipment photo, or cart details and the sales desk will check compatibility, pricing, availability, and delivery options.",
          },
          {
            title: "Who we support",
            copy: "Our service is designed for plant operators, maintenance departments, contractors, panel builders, and trade customers purchasing replacement components.",
          },
          {
            title: "Our approach",
            copy: "We prioritise clear product information and written confirmation for sourced items, helping customers verify the right component before ordering.",
          },
        ],
      },
    ],
  },
  "terms-and-conditions": {
    seo: {
      title: "Terms and Conditions",
      description: "Trading guidance for orders, quotations, product information, and support from Spares Automation.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Help",
    title: "Terms and conditions",
    intro: "This page summarises how quotations, orders, product information, and support are handled. Terms confirmed at checkout or in a written quotation take precedence.",
    ctaLabel: "Contact sales",
    ctaTo: "/contact-us",
    blocks: [
      {
        type: "cards",
        title: "",
        items: [
          {
            title: "Orders and quotes",
            copy: "Prices, availability, delivery dates, and product suitability are confirmed when the sales desk reviews the order or quote request.",
          },
          {
            title: "Product information",
            copy: "Product data is supplied to help identify parts. Customers should confirm compatibility before ordering critical spares.",
          },
          {
            title: "Contract and payment",
            copy: "An order or quote request is not accepted until availability, total price, delivery, payment terms, and any special-order conditions are confirmed through checkout or in writing.",
          },
          {
            title: "Customer details",
            copy: "Customers are responsible for providing accurate account, billing, delivery, tax, and contact information and for checking the order before payment or written acceptance.",
          },
          {
            title: "Consumer and trade purchases",
            copy: "Some statutory rights depend on whether a purchase is made as a consumer or in the course of business. Nothing on this page is intended to exclude rights that cannot lawfully be excluded.",
          },
          {
            title: "Written terms take precedence",
            copy: "Product-specific quotation terms, supplier restrictions, and the terms presented during Shopify checkout form part of the transaction and take precedence where they are more specific.",
          },
        ],
      },
    ],
  },
  "returns-policy": {
    seo: {
      title: "Returns Policy",
      description: "Information about return eligibility, approvals, shipping, inspections, refunds, and exchanges.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Legal",
    title: "Returns policy",
    intro: "This policy explains the general process and conditions for returning products purchased from Spares Automation. Order-specific terms confirmed at checkout or in writing may also apply.",
    ctaLabel: "Start a return",
    ctaTo: "/returns",
    blocks: [
      {
        type: "cards",
        title: "",
        items: [
          {
            title: "Return eligibility",
            copy: "Return requests should be submitted within the applicable return period and before goods are sent back. Products should remain unused, complete, and in their original packaging unless they are faulty, damaged, or were supplied incorrectly.",
          },
          {
            title: "Return authorisation",
            copy: "All returns require review and authorisation. Once a request is approved, we will provide a return reference and instructions. Goods sent without authorisation may be delayed or refused.",
          },
          {
            title: "Special-order products",
            copy: "Made-to-order, configured, personalised, sealed, or specially sourced products may not be eligible for a change-of-mind return. Any restrictions will be identified in the quotation or order confirmation where possible.",
          },
          {
            title: "Faulty or incorrect goods",
            copy: "Please report faults, transit damage, shortages, or incorrect products promptly and include clear details and photographs where available. Keep all packaging and labels while the issue is assessed.",
          },
          {
            title: "Return shipping",
            copy: "The customer is normally responsible for securely packaging approved returns and following the supplied shipping instructions. Responsibility for return costs depends on the reason for return and any rights that apply to the purchase.",
          },
          {
            title: "Inspection and refunds",
            copy: "Returned goods are inspected before a refund, replacement, repair, or credit is confirmed. Approved refunds are normally issued to the original payment method, subject to payment-provider processing times.",
          },
          {
            title: "Consumer rights",
            copy: "Nothing in this policy is intended to limit statutory rights that cannot lawfully be excluded. Different rules may apply depending on whether a purchase was made as a consumer or in the course of business.",
          },
          {
            title: "Questions about a return",
            copy: "Contact the sales team with your order number, product details, and reason for return if you need help before submitting a request or sending any goods.",
          },
        ],
      },
    ],
  },
  "privacy-policy": {
    seo: {
      title: "Privacy Policy",
      description: "How Spares Automation uses customer, order, account, and product-enquiry information.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Help",
    title: "Privacy policy",
    intro: "Customer details are used to respond to enquiries, process orders, manage accounts, and provide product support.",
    ctaLabel: "Contact sales",
    ctaTo: "/contact-us",
    blocks: [
      {
        type: "cards",
        title: "",
        items: [
          {
            title: "Information used",
            copy: "We may use contact, company, order, cart, and product enquiry details to provide sales and support service.",
          },
          {
            title: "Why information is used",
            copy: "Information is used to answer enquiries, take steps requested before a contract, process and support orders, maintain account security, meet legal obligations, and send marketing only where permitted.",
          },
          {
            title: "Service providers",
            copy: "Shopify and necessary hosting, delivery, payment, and communications providers may process information when they are needed to provide the requested service. Their own notices apply where they act independently.",
          },
          {
            title: "Retention and security",
            copy: "Records are retained only for as long as needed for the purpose collected, legal or accounting requirements, dispute handling, and service security. Access should be limited to people and providers who need it.",
          },
          {
            title: "Your choices and rights",
            copy: "You can ask about access, correction, deletion, restriction, objection, portability, or withdrawal of consent where the relevant right applies. Contact the sales email shown below; you may also complain to the UK Information Commissioner's Office.",
          },
          {
            title: "Support requests",
            copy: "Photos, part numbers, and equipment references sent to the sales desk are used to identify products and answer enquiries. Avoid including unrelated personal or confidential information.",
          },
        ],
      },
    ],
  },
  cookies: {
    seo: {
      title: "Cookie Policy",
      description: "How essential cookies and browser storage support cart, account, and checkout functionality.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Help",
    title: "Cookie policy",
    intro: "Cookies and local browser storage support core shopping functions such as cart persistence, login state, and site operation.",
    ctaLabel: "Contact sales",
    ctaTo: "/contact-us",
    blocks: [
      {
        type: "cards",
        title: "",
        items: [
          {
            title: "Cart storage",
            copy: "The site stores cart information locally so selected products remain available as customers continue browsing.",
          },
          {
            title: "Account and checkout",
            copy: "Shopify services may use cookies or similar technology for secure login, checkout, and order processing.",
          },
          {
            title: "Strictly necessary storage",
            copy: "The current storefront uses browser storage for the cart and security cookies for customer sessions. These functions are necessary when you ask the site to remember a cart or sign you in.",
          },
          {
            title: "Third-party video",
            copy: "YouTube content is not loaded automatically. If a product has a YouTube guide, you choose whether to load it after seeing a notice that YouTube may store or access information on your device.",
          },
          {
            title: "Future analytics or marketing tools",
            copy: "Any non-essential analytics, advertising, or personalisation storage added later must remain disabled until an appropriate consent choice is provided.",
          },
        ],
      },
    ],
  },
  disclaimer: {
    seo: {
      title: "Product Information Disclaimer",
      description: "Important guidance about industrial-part compatibility, specifications, images, and availability.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Help",
    title: "Disclaimer",
    intro: "Product information is provided to support identification and purchasing decisions for industrial spares.",
    ctaLabel: "Contact sales",
    ctaTo: "/contact-us",
    blocks: [
      {
        type: "cards",
        title: "",
        items: [
          {
            title: "Compatibility",
            copy: "Customers should confirm product compatibility with their machine, plant, or control system before ordering.",
          },
          {
            title: "Technical details",
            copy: "Specifications, images, and availability may vary by supplier or manufacturer reference and are confirmed at quote or order stage.",
          },
          {
            title: "Images and descriptions",
            copy: "Images may be illustrative and packaging, markings, colour, or minor construction details can change. Written manufacturer references and confirmed specifications should be used for final identification.",
          },
          {
            title: "Availability and pricing",
            copy: "Catalogue availability, lead times, and prices can change before an order is accepted. Current details are confirmed through checkout or a written quotation.",
          },
          {
            title: "Installation and safety",
            copy: "Industrial parts should be selected and installed by suitably competent personnel in accordance with the equipment documentation, applicable regulations, and site safety procedures.",
          },
          {
            title: "Third-party names",
            copy: "Manufacturer names, model references, and trademarks are used only to help identify compatibility and remain the property of their respective owners.",
          },
        ],
      },
    ],
  },
  "delivery-information": {
    seo: {
      title: "Delivery Information",
      description: "How delivery charges, lead times, dispatch updates and tracking are handled.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Delivery & returns",
    title: "Clear costs and traceable delivery",
    intro: "Delivery options and charges are calculated from the actual basket and destination, with fulfilment and tracking updates kept against the Shopify order.",
    ctaLabel: "Start a return",
    ctaTo: "/returns",
    blocks: [
      {
        type: "steps",
        title: "Delivery journey",
        items: [
          {
            title: "Basket",
            copy: "Products and quantities determine which delivery services can be offered.",
          },
          {
            title: "Checkout",
            copy: "The delivery address and Shopify shipping rules calculate the available charge.",
          },
          {
            title: "Order updates",
            copy: "Dispatch and tracking are emailed and shown on the secure order-status page.",
          },
        ],
      },
      {
        type: "cards",
        title: "Delivery details",
        items: [
          {
            title: "Charges calculated before payment",
            copy: "Available delivery services and charges are calculated in Shopify checkout from the basket and delivery address. You see the applicable total before placing the order.",
          },
          {
            title: "Stock and sourced lead times",
            copy: "Stock items can usually move quickly once payment or account details are complete. For sourced or additional quantities, the sales desk confirms the expected lead time.",
          },
          {
            title: "Dispatch and tracking",
            copy: "When fulfilment and courier tracking are available, Shopify emails the order update and exposes it through the secure order-status link in your account.",
          },
          {
            title: "Damage, shortages, or errors",
            copy: "Check deliveries promptly. Report visible damage, missing quantities, or an incorrect product with the order number and keep the packaging while the team investigates.",
          },
          {
            title: "Large or specialist items",
            copy: "Heavy, oversized, hazardous, or supplier-direct consignments may need a separately confirmed service. Any manual charge is agreed before the order is accepted.",
          },
          {
            title: "International delivery",
            copy: "Availability, transport, duties, taxes, import requirements, and delivery responsibility are confirmed for the destination before an overseas order is processed.",
          },
        ],
      },
      {
        type: "cta",
        title: "Something wrong with a delivery?",
        copy: "Open a return request and select the affected item, quantity, and reason. The request is saved in the CMS and immediately receives an email reference.",
        label: "Start a return",
        to: "/returns",
      },
    ],
  },
  "contact-us": {
    seo: {
      title: "Contact Industrial Parts Support",
      description: "Contact Spares Automation for product identification, quotations, availability, and industrial parts support.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Support",
    title: "Contact Spares Automation",
    intro: "",
    ctaLabel: "View common questions",
    ctaTo: "/got-a-question",
    blocks: [],
  },
  resources: {
    seo: {
      title: "PDFs, Manuals and Videos",
      description: "Browse product videos, technical PDFs, datasheets, and manuals arranged by equipment category.",
      ogTitle: "",
      ogDescription: "",
    },
    eyebrow: "Resource Library",
    title: "PDFs, manuals & videos",
    intro: "",
    ctaLabel: "Contact sales",
    ctaTo: "/contact-us",
    blocks: [
      {
        type: "text",
        title: "Resource library is being updated",
        copy: "No public files are currently assigned to products. Contact the sales desk if you need a specific PDF, manual, or video.",
      },
    ],
  },
};

export const CONTENT_REGISTRY = {
  site: {
    label: "Business details",
    group: "Global settings",
    schema: siteSchema,
    defaults: { ...SITE, addressLocality: "Manchester", addressCountry: "GB", socialHandle: "@SparesAutomation" },
  },
  navigation: {
    label: "Navigation and footer",
    group: "Global settings",
    schema: navigationSchema,
    defaults: {
      header: [
        ["all-products", "All Products", "/products"], ["asphalt", "Asphalt Blacktop", "/products?category=asphalt"],
        ["concrete", "Readymix Concrete", "/products?category=concrete"], ["packing", "Packing Machinery", "/products?category=packing"],
        ["automation", "Automation and Drives", "/products?category=automation"], ["home-controls", "Home Automation and Controls", "/products?category=home-controls"],
        ["control-panels", "Control Panels and Software", "/products?category=control-panels-software"], ["resources", "PDF and Videos", "/resources"], ["contact", "Contact", "/contact-us"],
      ].map(([id, label, to]) => ({ id, label, to, visible: true })),
      information: [
        ["products", "All Products", "/products"], ["contact", "Contact us", "/contact-us"], ["about", "About us", "/about-us"],
        ["cart", "View Cart", "/cart"], ["quote", "Build a Quote", "/quote"], ["tracking", "Track order", "/track-order"],
        ["account", "My order history", "/account"], ["question", "Got a question", "/contact-us"],
      ].map(([id, label, to]) => ({ id, label, to, visible: true })),
      help: [
        ["terms", "Terms & Conditions", "/terms-and-conditions"], ["returns", "Returns", "/returns"], ["returns-policy", "Returns Policy", "/returns-policy"],
        ["delivery", "Delivery Information", "/delivery-information"], ["privacy", "Privacy Policy", "/privacy-policy"], ["cookies", "Cookie Policy", "/cookies"],
        ["disclaimer", "Disclaimer", "/disclaimer"], ["unsubscribe", "Unsubscribe", "/unsubscribe"],
      ].map(([id, label, to]) => ({ id, label, to, visible: true })),
      footerCopy: "Trade catalogue, quote support, and parts help for machinery teams.",
    },
  },
  home: {
    label: "Homepage",
    group: "Homepage",
    schema: homeSchema,
    defaults: {
      seo: { title: "Spares Automation - Industrial Parts & Automation Spares", description: "Browse product ranges, request quotes, and find support from Spares Automation.", ogTitle: "", ogDescription: "" },
      title: "Industrial parts and automation spares",
      resourceTitle: "PDFs & Manuals",
      resourceCopy: "Request datasheets, guides, and technical documents.",
      finderTitle: "Need help finding a part?",
      finderCopy: "Send a part number or product description.",
      finderSubmit: "Submit Request",
      contactTitle: "Other contact options",
      contactCopy: "Email for detailed enquiries or use WhatsApp when you need to send a product photo.",
    },
  },
  catalogue: {
    label: "Homepage panels and categories",
    group: "Catalogue presentation",
    schema: catalogueSchema,
    defaults: {
      ranges: HERO_RANGES.map(({ handle, title, lines }) => ({
        handle,
        title,
        lines: lines.map(({ handle: lineHandle, label, meta }) => ({ handle: lineHandle, label, meta })),
      })),
      tiles: HERO_CATEGORY_TILES.map(({ handle, title }) => ({ handle, title })),
      categories: CATALOG_CATEGORIES.map(({ handle, label, description }) => ({ handle, label, description, visible: true, mediaId: "", mediaAlt: "" })),
    },
  },
  pages: { label: "Information and legal pages", group: "Information / legal pages", schema: z.record(z.string(), pageSchema).superRefine((value, context) => {
    if (Object.keys(DEFAULT_PAGES).sort().join("|") !== Object.keys(value).sort().join("|")) context.addIssue({ code: z.ZodIssueCode.custom, message: "Page routes are fixed and cannot be added or removed" });
  }), defaults: DEFAULT_PAGES },
  functional: {
    label: "Cart, account and form pages",
    group: "Functional pages",
    schema: z.record(z.string(), functionalPageSchema).superRefine((value, context) => {
      if (Object.keys(DEFAULT_FUNCTIONAL).sort().join("|") !== Object.keys(value).sort().join("|")) context.addIssue({ code: z.ZodIssueCode.custom, message: "Functional routes are fixed and cannot be added or removed" });
    }),
    defaults: DEFAULT_FUNCTIONAL,
  },
  product: {
    label: "Product pages and catalogue listing",
    group: "Catalogue presentation",
    schema: productSchema,
    defaults: {
      listingSeo: { title: "All Products", description: "Browse all products across asphalt, concrete, packing, automation and control categories.", ogTitle: "", ogDescription: "" },
      listingEyebrow: "Product Catalogue / Cart",
      listingTitle: "ALL PRODUCTS",
      listingHighlight: "CATALOGUE",
      listingIntro: "Browse the catalogue and narrow the visible products with the filters below.",
      emptyTitle: "Catalogue products are being updated",
      emptyCopy: "Contact our sales desk for availability, product identification, or a quotation while the online catalogue is updated.",
      filteredEmptyTitle: "No products match these filters",
      filteredEmptyCopy: "Adjust the filters or browse other categories.",
      supportEyebrow: "Guides & information",
      supportTitle: "Product Support",
      tabDetails: "Product Details",
      tabPdf: "PDF Guide",
      tabVideo: "Video Guide",
      documentsLabel: "Available documents",
      videosLabel: "Available videos",
      questionLabel: "Got a question?",
      questionCopy: "Send the part number, an equipment photo, or the manufacturer reference and the sales desk will confirm the right item, price and availability.",
      questionCta: "Contact the sales desk",
      quantityLabel: "Qty",
      viewCartLabel: "View Cart",
      outOfStockLabel: "Out of stock",
      imagePendingLabel: "Image pending",
      enlargeHint: "Click to enlarge",
      leadTimeNote: "Lead time and dispatch confirmed at order",
    },
  },
  messages: {
    label: "Forms and interface messages",
    group: "Forms / messages",
    schema: messagesSchema,
    defaults: {
      "common.contactSales": "Contact sales",
      "common.tryAgain": "Please try again.",
      "common.required": "This field is required.",
      "catalogue.empty": "No products match these filters",
      "catalogue.loadMore": "Load more products",
      "quote.submitted": "Your quote has been submitted for sales review.",
      "returns.submitted": "We received your return request.",
      "account.signIn": "Sign in to view your account",
      "error.notFoundTitle": "Page not found",
      "error.notFoundCopy": "The page you're looking for doesn't exist or has been moved.",
      "error.genericTitle": "This page didn't load",
      "error.genericCopy": "Something went wrong on our end. You can try refreshing or head back home.",
      "cookie.eyebrow": "Your privacy choices",
      "cookie.title": "We use cookies",
      "cookie.copy": "We use necessary cookies and browser storage to keep the website secure and remember your cart. With your permission, we may also use analytics and marketing cookies. Read our",
      "cookie.link": "cookie information",
      "cookie.necessary": "Necessary",
      "cookie.necessaryCopy": "Security, account access, checkout, and cart functions.",
      "cookie.analytics": "Analytics",
      "cookie.analyticsCopy": "Helps us understand how visitors use the website.",
      "cookie.marketing": "Marketing",
      "cookie.marketingCopy": "Supports relevant advertising and campaign measurement.",
      "cookie.manage": "Manage choices",
      "cookie.hide": "Hide choices",
      "cookie.reject": "Reject non-essential",
      "cookie.save": "Save choices",
      "cookie.accept": "Accept all",
      "part.nameLabel": "Your name",
      "part.namePlaceholder": "Full name",
      "part.emailLabel": "Email",
      "part.emailPlaceholder": "you@company.co.uk",
      "part.numberLabel": "Part Number",
      "part.numberPlaceholder": "Enter part number here...",
      "part.descriptionLabel": "Description",
      "part.descriptionPlaceholder": "Describe the part you need...",
      "part.photoLabel": "Photo (optional)",
      "part.photoHelp": "JPG, PNG or WebP, up to 8 MB.",
      "part.sending": "Sending",
      "part.successBeforeReference": "Thank you. Your part request has been received and our reference is",
      "part.successAfterReference": "The sales desk will reply by email shortly.",
      "auth.resetSent": "If an account exists for that address, we will email a secure reset link. You can set a new password here on Spares Automation.",
      "auth.resetFailed": "Password-reset instructions could not be requested. Please try again.",
      "cart.loadFailed": "Your cart could not be loaded. Check your connection and try again.",
      "cart.updateFailed": "We could not update this item. Your previous quantity is unchanged.",
      "cart.removeFailed": "We could not remove this item. Please try again.",
      "account.loadFailed": "We could not load your account. Please refresh and try again.",
      "track.loadFailed": "We could not load your orders. Please refresh and try again.",
      "support.intro": "Complete the details below and the team will respond by email.",
      "support.emailLabel": "Contact email *",
      "support.attachmentsLabel": "Attach files (optional)",
      "support.attachmentsHelp": "Up to 5 files. Images, PDF, Word, Excel, PowerPoint, TXT, or CSV. Maximum 10 MB each and 25 MB combined.",
      "support.submit": "Send request",
      "support.sending": "Sending",
      "support.successBeforeReference": "Thank you. Your request has been received and our reference is",
      "support.successAfterReference": "We will reply by email shortly.",
      "support.tracking.title": "Request an order update",
      "support.tracking.referenceLabel": "Order number",
      "support.tracking.detailsLabel": "Delivery postcode or company name",
      "support.resources.title": "Request product resources",
      "support.resources.referenceLabel": "Part or product number",
      "support.resources.detailsLabel": "Document, manual, or video required",
      "support.question.title": "Send a product question",
      "support.question.referenceLabel": "Part or product details *",
      "support.question.detailsLabel": "How can we help?",
      "support.unsubscribe.title": "Request email removal",
      "support.unsubscribe.referenceLabel": "Email address to remove",
      "support.unsubscribe.detailsLabel": "Any additional details (optional)",
      "return.signInTitle": "Sign in to start a return",
      "return.signInCopy": "Returns are linked to your account and orders. Sign in to pick the order and items you want to return.",
      "return.selectOrder": "Select the order you want to return items from.",
      "return.selectItems": "Select at least one item to return.",
      "return.submitFailed": "We could not submit the return request. Please try again.",
      "return.notesPlaceholder": "Add fault symptoms, damage details, or anything that will help us assess the return.",
      "return.submit": "Submit return request",
      "return.submitting": "Submitting return",
      "contact.emailLabel": "Email Enquiries",
      "contact.emailDetail": "Send product questions or cart details",
      "contact.phoneLabel": "Technical Sales",
      "contact.phoneDetail": "Weekday product identification and quotation support",
      "contact.whatsappLabel": "WhatsApp",
      "contact.whatsappDetail": "Useful for photos and part numbers",
      "contact.whatsappMessage": "I need help identifying a part.",
    },
  },
  emails: {
    label: "Transactional email templates",
    group: "Emails",
    schema: emailsSchema,
    defaults: {
      returnAcknowledgement: { subject: "We received your return request — {{orderNumber}}", body: "Your return request has been received.\n\nReference: {{reference}}\nOrder: {{orderNumber}}\n\nOur returns team will review it before goods are sent back." },
      returnStatus: { subject: "Return update: {{reference}}", body: "Your return request {{reference}} is now {{status}}.\n\n{{statusMessage}}" },
      salesNotification: { subject: "New {{submissionType}}: {{reference}}", body: "A new {{submissionType}} was submitted.\n\nReference: {{reference}}\n\n{{details}}" },
    },
  },
} as const;

export type ContentKey = keyof typeof CONTENT_REGISTRY;
export type ContentBundle = { [K in ContentKey]: z.infer<(typeof CONTENT_REGISTRY)[K]["schema"]> };

export const CONTENT_KEYS = Object.keys(CONTENT_REGISTRY) as ContentKey[];

/** Internal destinations an editor may choose from. */
export const APPROVED_ROUTE_LIST = [...APPROVED_ROUTES].sort();

export const BLOCK_TYPES = [
  "hero",
  "text",
  "cards",
  "list",
  "steps",
  "media",
  "cta",
] as const satisfies readonly ContentBlock["type"][];

/** Empty block of the requested type, used by the admin editor's block picker. */
export function createBlock(type: ContentBlock["type"]): ContentBlock {
  switch (type) {
    case "hero":
      return { type: "hero", eyebrow: "", title: "New heading", copy: "", mediaId: "", mediaAlt: "" };
    case "text":
      return { type: "text", title: "New heading", copy: "New paragraph." };
    case "cards":
      return { type: "cards", title: "", items: [{ title: "New card", copy: "New card copy." }] };
    case "list":
      return { type: "list", title: "New list", items: ["First item"] };
    case "steps":
      return { type: "steps", title: "New steps", items: [{ title: "Step one", copy: "What happens first." }] };
    case "media":
      return { type: "media", mediaId: "", mediaAlt: "", caption: "" };
    case "cta":
      return { type: "cta", title: "New call to action", copy: "", label: "Contact sales", to: "/contact-us" };
  }
}

export function isContentKey(value: string): value is ContentKey {
  return value in CONTENT_REGISTRY;
}

export function validateContent<K extends ContentKey>(key: K, value: unknown): ContentBundle[K] {
  return CONTENT_REGISTRY[key].schema.parse(value) as ContentBundle[K];
}

export function getDefaultContent<K extends ContentKey>(key: K): ContentBundle[K] {
  return structuredClone(CONTENT_REGISTRY[key].defaults) as ContentBundle[K];
}

export function getDefaultContentBundle(): ContentBundle {
  return Object.fromEntries(CONTENT_KEYS.map((key) => [key, getDefaultContent(key)])) as ContentBundle;
}

/**
 * Plain-text rendering for email subjects and text bodies. Values are stripped
 * of control characters instead of HTML-escaped, because entities would be
 * visible as literal text in a plain-text message.
 */
export function renderTemplateText(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (match, name: string) =>
    // eslint-disable-next-line no-control-regex
    name in variables ? variables[name].replace(/[\u0000-\u001f\u007f]/g, " ") : match,
  );
}

/** HTML-safe rendering for templates substituted into markup email bodies. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (match, name: string) => name in variables ? escape(variables[name]) : match);
}
