import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * CMS data model.
 *
 * The CMS owns form submissions (part inquiries, credit account applications,
 * return requests, support requests) and the staff who manage them. It does NOT store orders,
 * carts, or products — those remain in Shopify. Approved credit applications
 * are synced to Shopify as tagged customers.
 */

export const submissionType = pgEnum("submission_type", [
  "part_inquiry",
  "credit_account",
  "return_request",
  "support_tracking",
  "support_resources",
  "support_question",
  "unsubscribe",
]);

export const submissionStatus = pgEnum("submission_status", [
  "new",
  "in_review",
  "approved",
  "rejected",
  "completed",
]);

export const staffRole = pgEnum("staff_role", ["admin", "staff"]);

export const staffUsers = pgTable("staff_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  role: staffRole("role").notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Fixed-key content documents. Their JSON shape is owned and validated by the
 * content registry in code; Postgres stores independent draft/live snapshots.
 */
export const contentDocuments = pgTable("content_documents", {
  key: varchar("key", { length: 120 }).primaryKey(),
  draftData: jsonb("draft_data").notNull().$type<Record<string, unknown>>(),
  publishedData: jsonb("published_data").notNull().$type<Record<string, unknown>>(),
  draftVersion: integer("draft_version").notNull().default(1),
  publishedVersion: integer("published_version").notNull().default(1),
  updatedBy: integer("updated_by").references(() => staffUsers.id, { onDelete: "set null" }),
  publishedBy: integer("published_by").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    documentKey: varchar("document_key", { length: 120 })
      .notNull()
      .references(() => contentDocuments.key, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
    publishedBy: integer("published_by").references(() => staffUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_revisions_document_version_idx").on(table.documentKey, table.version),
  ],
);

export const contentMedia = pgTable("content_media", {
  id: varchar("id", { length: 64 }).primaryKey(),
  filename: text("filename").notNull(),
  mime: varchar("mime", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  defaultAlt: varchar("default_alt", { length: 300 }).notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  createdBy: integer("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    staffId: integer("staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: varchar("target_id", { length: 160 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_audit_target_idx").on(table.targetType, table.targetId)],
);

/**
 * Shopify can retry the same webhook delivery. Keeping the delivery id and
 * processing state makes automatic invoice email sending idempotent across
 * process restarts and deployments.
 */
export const shopifyWebhookDeliveries = pgTable(
  "shopify_webhook_deliveries",
  {
    id: varchar("id", { length: 160 }).primaryKey(),
    topic: varchar("topic", { length: 120 }).notNull(),
    shopDomain: varchar("shop_domain", { length: 255 }).notNull(),
    resourceId: varchar("resource_id", { length: 160 }),
    status: varchar("status", { length: 24 }).notNull().default("processing"),
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("shopify_webhook_resource_idx").on(table.resourceId)],
);

/**
 * Offline Admin API credentials created by Shopify's authorization-code flow.
 * Tokens are encrypted before storage; the database never contains plaintext
 * Shopify access tokens.
 */
export const shopifyAppInstallations = pgTable("shopify_app_installations", {
  shopDomain: varchar("shop_domain", { length: 255 }).primaryKey(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  scopes: text("scopes").notNull().default(""),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable(
  "submissions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: submissionType("type").notNull(),
    status: submissionStatus("status").notNull().default("new"),
    /** Free-form, type-specific fields captured from the public form. */
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    contactEmail: varchar("contact_email", { length: 254 }).notNull(),
    contactName: varchar("contact_name", { length: 160 }),
    company: varchar("company", { length: 160 }),
    /** Human-friendly reference shown to the submitter, e.g. SA-2026-000123. */
    reference: varchar("reference", { length: 60 }),
    /** Set once a trade/credit application has been synced to Shopify. */
    shopifyCustomerId: varchar("shopify_customer_id", { length: 60 }),
    shopifySyncedAt: timestamp("shopify_synced_at", { withTimezone: true }),
    createdByStaff: integer("created_by_staff").references(() => staffUsers.id),
    reviewedBy: integer("reviewed_by").references(() => staffUsers.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("submissions_type_status_idx").on(table.type, table.status),
    index("submissions_created_at_idx").on(table.createdAt),
  ],
);

export const submissionNotes = pgTable("submission_notes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffUsers.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Schema defined now; file uploads are implemented in a later phase. */
export const attachments = pgTable("attachments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mime: varchar("mime", { length: 120 }).notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffUser = typeof staffUsers.$inferSelect;
export type NewStaffUser = typeof staffUsers.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type SubmissionNote = typeof submissionNotes.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type ContentDocument = typeof contentDocuments.$inferSelect;
export type ContentRevision = typeof contentRevisions.$inferSelect;
export type ContentMedia = typeof contentMedia.$inferSelect;
export type ShopifyWebhookDelivery = typeof shopifyWebhookDeliveries.$inferSelect;
export type ShopifyAppInstallation = typeof shopifyAppInstallations.$inferSelect;

export type SubmissionType = (typeof submissionType.enumValues)[number];
export type SubmissionStatus = (typeof submissionStatus.enumValues)[number];
