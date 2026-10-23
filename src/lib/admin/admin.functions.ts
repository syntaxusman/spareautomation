import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import {
  getCurrentStaff,
  isUnauthorizedError,
  loginStaff,
  logoutStaff,
  requireAdmin,
} from "./auth.server";
import { getDb } from "../db/index.server";
import {
  attachments,
  submissionNotes,
  submissions,
  staffUsers,
  type SubmissionStatus,
  type SubmissionType,
} from "../db/schema";
import { sendEmail } from "../notify.server";
import {
  syncCreditCustomer,
  type CustomerSyncMetafield,
} from "../shopify/customer-sync.server";
import { loadPublishedContentBundle } from "../content/content.server";
import { renderTemplateText } from "../content/registry";

/**
 * Admin (staff) server functions. Every function that reads or mutates
 * submission data is guarded by requireAdmin(). Authentication itself uses a
 * signed cookie session (see auth.server.ts).
 */

const UNAUTHORIZED_MESSAGE = "You must sign in to access the admin area.";

function guard(error: unknown): never {
  if (isUnauthorizedError(error)) {
    throw new Error(UNAUTHORIZED_MESSAGE);
  }
  throw error;
}

// --- Session ---------------------------------------------------------------

export type AdminSession = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "staff";
  mustChangePassword: boolean;
};

function toSession(staff: {
  id: number;
  email: string;
  name: string;
  role: "admin" | "staff";
  mustChangePassword: boolean;
}): AdminSession {
  return { id: staff.id, email: staff.email, name: staff.name, role: staff.role, mustChangePassword: staff.mustChangePassword };
}

export const getAdminSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSession | null> => {
    const staff = await getCurrentStaff();
    return staff ? toSession(staff) : null;
  },
);

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Password is required").max(200),
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator(loginSchema)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; mustChangePassword?: boolean }> => {
    return loginStaff(data.email, data.password);
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  await logoutStaff();
  return { ok: true };
});

// --- Listing ---------------------------------------------------------------

const submissionTypeValues = [
  "part_inquiry",
  "credit_account",
  "return_request",
  "support_tracking",
  "support_resources",
  "support_question",
  "unsubscribe",
] as const;

const submissionStatusValues = [
  "new",
  "in_review",
  "approved",
  "rejected",
  "completed",
] as const;

const listSchema = z.object({
  type: z.enum(submissionTypeValues).optional(),
  status: z.enum(submissionStatusValues).optional(),
  search: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const PAGE_SIZE = 25;

export type SubmissionSummary = {
  id: number;
  type: SubmissionType;
  status: SubmissionStatus;
  reference: string | null;
  contactEmail: string;
  contactName: string | null;
  company: string | null;
  shopifySyncedAt: string | null;
  createdAt: string;
};

export type SubmissionListResult =
  | {
      ok: true;
      items: SubmissionSummary[];
      total: number;
      page: number;
      pageCount: number;
      counts: Record<SubmissionStatus, number>;
    }
  | { ok: false; error: string };

export const listSubmissions = createServerFn({ method: "GET" })
  .inputValidator(listSchema)
  .handler(async ({ data }): Promise<SubmissionListResult> => {
    try {
      await requireAdmin();
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    const filters: SQL[] = [];
    if (data.type) filters.push(eq(submissions.type, data.type));
    if (data.status) filters.push(eq(submissions.status, data.status));
    if (data.search) {
      const term = `%${data.search}%`;
      const searchFilter = or(
        ilike(submissions.reference, term),
        ilike(submissions.contactEmail, term),
        ilike(submissions.contactName, term),
        ilike(submissions.company, term),
      );
      if (searchFilter) filters.push(searchFilter);
    }
    const where = and(...filters);

    const [totalRow] = await db
      .select({ value: count() })
      .from(submissions)
      .where(where);
    const total = totalRow?.value ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(data.page, pageCount);
    const countRows = await db
      .select({ status: submissions.status, value: count() })
      .from(submissions)
      .groupBy(submissions.status);
    const counts: Record<SubmissionStatus, number> = {
      new: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
    };
    for (const row of countRows) counts[row.status] = row.value;

    const rows = await db
      .select()
      .from(submissions)
      .where(where)
      .orderBy(desc(submissions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    return {
      ok: true,
      total,
      page,
      pageCount,
      counts,
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        reference: row.reference,
        contactEmail: row.contactEmail,
        contactName: row.contactName,
        company: row.company,
        shopifySyncedAt: row.shopifySyncedAt ? row.shopifySyncedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

// --- Detail ----------------------------------------------------------------

const detailSchema = z.object({ id: z.coerce.number().int().min(1) });

export type SubmissionNoteView = {
  id: number;
  body: string;
  staffName: string | null;
  createdAt: string;
};

/** Serializable view of a submission payload (form field values). */
export type SubmissionPayload = Record<string, string | number | boolean | null>;

export type SubmissionAttachment = {
  id: number;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
};

export type SubmissionDetail = {
  id: number;
  type: SubmissionType;
  status: SubmissionStatus;
  reference: string | null;
  contactEmail: string;
  contactName: string | null;
  company: string | null;
  payload: SubmissionPayload;
  shopifyCustomerId: string | null;
  shopifySyncedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: SubmissionNoteView[];
  attachments: SubmissionAttachment[];
};

export type SubmissionDetailResult =
  | { ok: true; submission: SubmissionDetail }
  | { ok: false; error: string };

export const getSubmissionDetail = createServerFn({ method: "GET" })
  .inputValidator(detailSchema)
  .handler(async ({ data }): Promise<SubmissionDetailResult> => {
    try {
      await requireAdmin();
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    const rows = await db
      .select({
        submission: submissions,
        reviewedByName: staffUsers.name,
      })
      .from(submissions)
      .leftJoin(staffUsers, eq(submissions.reviewedBy, staffUsers.id))
      .where(eq(submissions.id, data.id))
      .limit(1);

    const row = rows[0];
    if (!row) return { ok: false, error: "Submission not found." };

    const noteRows = await db
      .select({
        id: submissionNotes.id,
        body: submissionNotes.body,
        staffName: staffUsers.name,
        createdAt: submissionNotes.createdAt,
      })
      .from(submissionNotes)
      .leftJoin(staffUsers, eq(submissionNotes.staffId, staffUsers.id))
      .where(eq(submissionNotes.submissionId, data.id))
      .orderBy(desc(submissionNotes.createdAt));

    const s = row.submission;
    const attachmentRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.submissionId, data.id))
      .orderBy(desc(attachments.createdAt));

    return {
      ok: true,
      submission: {
        id: s.id,
        type: s.type,
        status: s.status,
        reference: s.reference,
        contactEmail: s.contactEmail,
        contactName: s.contactName,
        company: s.company,
        payload: s.payload as SubmissionPayload,
        shopifyCustomerId: s.shopifyCustomerId,
        shopifySyncedAt: s.shopifySyncedAt ? s.shopifySyncedAt.toISOString() : null,
        reviewedByName: row.reviewedByName,
        reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        notes: noteRows.map((n) => ({
          id: n.id,
          body: n.body,
          staffName: n.staffName,
          createdAt: n.createdAt.toISOString(),
        })),
        attachments: attachmentRows.map((a) => ({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          size: a.size,
          createdAt: a.createdAt.toISOString(),
        })),
      },
    };
  });

// --- Mutations -------------------------------------------------------------

const setStatusSchema = z.object({
  id: z.coerce.number().int().min(1),
  status: z.enum(submissionStatusValues),
});

export type MutationResult = { ok: boolean; error?: string };

export const setSubmissionStatus = createServerFn({ method: "POST" })
  .inputValidator(setStatusSchema)
  .handler(async ({ data }): Promise<MutationResult> => {
    let staffId: number;
    try {
      const staff = await requireAdmin();
      staffId = staff.id;
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    const [existing] = await db
      .select({
        type: submissions.type,
        status: submissions.status,
        reference: submissions.reference,
        contactEmail: submissions.contactEmail,
        payload: submissions.payload,
      })
      .from(submissions)
      .where(eq(submissions.id, data.id))
      .limit(1);

    if (!existing) return { ok: false, error: "Submission not found." };

    await db
      .update(submissions)
      .set({
        status: data.status,
        reviewedBy: staffId,
        reviewedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(eq(submissions.id, data.id));

    if (existing.type === "return_request" && existing.status !== data.status) {
      const orderNumber = String(existing.payload["Order number"] ?? "").trim();
      const fallbackReference = orderNumber || `request ${data.id}`;
      const statusMessage: Record<SubmissionStatus, string> = {
        new: "Your return request is waiting for review.",
        in_review:
          "Our returns team is reviewing your request. We will contact you if we need more information.",
        approved:
          "Your return request has been approved. Please follow the return instructions sent by our team before dispatching the goods.",
        rejected:
          "We are unable to approve this return request in its current form. Reply to this email if you would like the team to review additional information.",
        completed:
          "Your return request has been completed. Any agreed refund, replacement, or repair will follow the arrangements confirmed by our team.",
      };

      const content = await loadPublishedContentBundle();
      const variables = { reference: existing.reference ?? fallbackReference, status: data.status.replaceAll("_", " "), statusMessage: statusMessage[data.status] };
      await sendEmail({
        to: existing.contactEmail,
        replyTo: content.site.email,
        subject: renderTemplateText(content.emails.returnStatus.subject, variables).replace(/[\r\n]+/g, " "),
        text: renderTemplateText(content.emails.returnStatus.body, variables),
      });
    }
    return { ok: true };
  });

const addNoteSchema = z.object({
  submissionId: z.coerce.number().int().min(1),
  body: z.string().trim().min(1, "Note cannot be empty").max(4000),
});

export const addSubmissionNote = createServerFn({ method: "POST" })
  .inputValidator(addNoteSchema)
  .handler(async ({ data }): Promise<MutationResult> => {
    let staffId: number;
    try {
      const staff = await requireAdmin();
      staffId = staff.id;
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    await db.insert(submissionNotes).values({
      submissionId: data.submissionId,
      staffId,
      body: data.body,
    });
    await db
      .update(submissions)
      .set({ updatedAt: sql`now()` })
      .where(eq(submissions.id, data.submissionId));
    return { ok: true };
  });

export const markSubmissionReviewed = createServerFn({ method: "POST" })
  .inputValidator(detailSchema)
  .handler(async ({ data }): Promise<MutationResult> => {
    let staffId: number;
    try {
      const staff = await requireAdmin();
      staffId = staff.id;
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    await db
      .update(submissions)
      .set({
        reviewedBy: staffId,
        reviewedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(eq(submissions.id, data.id));
    return { ok: true };
  });

// --- Shopify customer sync -------------------------------------------------

const syncSchema = z.object({ id: z.coerce.number().int().min(1) });

export type SyncResult =
  | { ok: true; shopifyCustomerId: string; syncedAt: string }
  | { ok: false; error: string };

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

/**
 * Create a tagged Shopify customer from an approved credit application.
 * Orders and invoicing remain in Shopify; this only provisions the customer.
 */
export const syncSubmissionToShopify = createServerFn({ method: "POST" })
  .inputValidator(syncSchema)
  .handler(async ({ data }): Promise<SyncResult> => {
    let staffId: number;
    try {
      const staff = await requireAdmin();
      staffId = staff.id;
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, data.id))
      .limit(1);
    const submission = rows[0];
    if (!submission) return { ok: false, error: "Submission not found." };
    if (submission.type !== "credit_account") {
      return { ok: false, error: "Only credit applications can be synced." };
    }
    if (submission.shopifyCustomerId) {
      return { ok: false, error: "This application has already been synced." };
    }

    const payload = submission.payload as Record<string, unknown>;
    const [firstName, ...rest] = (submission.contactName ?? "").split(" ");
    const lastName = rest.join(" ") || undefined;

    const extraTags = [
      "approved-application",
      submission.reference ? `Ref:${submission.reference}` : "",
    ].filter(Boolean);

    const metafields: CustomerSyncMetafield[] = [];
    if (submission.reference) metafields.push({ key: "reference", value: submission.reference });
    if (submission.company) metafields.push({ key: "company", value: submission.company });
    const companyNumber = payloadString(payload, "Company number");
    if (companyNumber) metafields.push({ key: "company_number", value: companyNumber });
    const vatNumber = payloadString(payload, "VAT number");
    if (vatNumber) metafields.push({ key: "vat_number", value: vatNumber });
    const creditLimit = payloadString(payload, "Requested credit limit");
    if (creditLimit) metafields.push({ key: "credit_limit", value: creditLimit });

    const note = [
      "Credit account application (approved)",
      submission.reference ? `Reference: ${submission.reference}` : "",
      submission.company ? `Company: ${submission.company}` : "",
      payloadString(payload, "Billing address")
        ? `Billing address: ${payloadString(payload, "Billing address")}`
        : "",
      payloadString(payload, "Requested credit limit")
        ? `Requested credit limit: ${payloadString(payload, "Requested credit limit")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const { customerId } = await syncCreditCustomer({
        email: submission.contactEmail,
        firstName,
        lastName,
        phone: payloadString(payload, "Phone"),
        extraTags,
        note,
        metafields,
      });

      const syncedAt = new Date();
      await db
        .update(submissions)
        .set({
          shopifyCustomerId: customerId,
          shopifySyncedAt: syncedAt,
          status: "approved",
          reviewedBy: staffId,
          reviewedAt: syncedAt,
          updatedAt: sql`now()`,
        })
        .where(eq(submissions.id, data.id));

      return { ok: true, shopifyCustomerId: customerId, syncedAt: syncedAt.toISOString() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Shopify sync failed.",
      };
    }
  });

// --- Attachment download (protected) ---------------------------------------

const downloadSchema = z.object({ id: z.coerce.number().int().min(1) });

export type AttachmentDownload =
  | { ok: true; filename: string; mime: string; dataUrl: string }
  | { ok: false; error: string };

/**
 * Return an attachment as a base64 data URL. Guarded by requireAdmin so files
 * are never publicly reachable — only signed-in staff can fetch them.
 */
export const getAttachmentDownload = createServerFn({ method: "GET" })
  .inputValidator(downloadSchema)
  .handler(async ({ data }): Promise<AttachmentDownload> => {
    try {
      await requireAdmin();
    } catch (error) {
      guard(error);
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, data.id))
      .limit(1);
    const attachment = rows[0];
    if (!attachment) return { ok: false, error: "Attachment not found." };

    try {
      const buffer = await readFile(attachment.path);
      const dataUrl = `data:${attachment.mime};base64,${buffer.toString("base64")}`;
      return { ok: true, filename: attachment.filename, mime: attachment.mime, dataUrl };
    } catch {
      return { ok: false, error: "The file could not be read from storage." };
    }
  });
