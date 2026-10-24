import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentStaff, requireAdminRole, requireStaff } from "../admin/auth.server";
import {
  ContentConflictError,
  listContentDocuments,
  listContentRevisions,
  loadContentDocument,
  loadDraftBundle,
  loadContentRevision,
  loadDraftContentBundle,
  loadPublishedContentBundle,
  publishContentDraft,
  restoreContentRevision,
  saveContentDraft,
} from "./content.server";
import { isContentKey, type ContentKey } from "./registry";

const keySchema = z.string().refine(isContentKey, "Unknown content document");

export const getPublishedContent = createServerFn({ method: "GET" }).handler(
  loadPublishedContentBundle,
);

export const getContentIndex = createServerFn({ method: "GET" }).handler(async () => {
  await requireStaff();
  return listContentDocuments();
});

export const getContentEditor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: keySchema }))
  .handler(async ({ data }) => {
    await requireStaff();
    const key = data.key as ContentKey;
    const [document, revisions, publishedContent] = await Promise.all([
      loadContentDocument(key),
      listContentRevisions(key),
      loadPublishedContentBundle(),
    ]);
    // Never overlay drafts onto the shared published-content cache. Apart from
    // leaking unpublished wording into later public reads, mutating that object
    // can make staff previews show an older document from another request.
    const previewContent = structuredClone(publishedContent);
    previewContent[key] = document.draftData as never;
    return {
      document,
      previewContent,
      revisions: revisions.map((revision) => ({
        ...revision,
        createdAt: revision.createdAt.toISOString(),
      })),
    };
  });

export const saveDraft = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    key: keySchema,
    data: z.unknown(),
    version: z.number().int().positive(),
  }))
  .handler(async ({ data }) => {
    const staff = await requireStaff();
    try {
      const version = await saveContentDraft(
        data.key as ContentKey, data.data, data.version, staff.id,
      );
      return { ok: true as const, version };
    } catch (error) {
      if (error instanceof ContentConflictError) {
        return { ok: false as const, conflict: true as const, error: "This document changed since you opened it. Reload before saving." };
      }
      if (error instanceof z.ZodError) {
        return { ok: false as const, error: "Content validation failed.", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
      }
      throw error;
    }
  });

export const publishDraft = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: keySchema }))
  .handler(async ({ data }) => {
    const staff = await requireAdminRole();
    try {
      return { ok: true as const, version: await publishContentDraft(data.key as ContentKey, staff.id) };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { ok: false as const, error: "The draft is not valid and cannot be published.", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
      }
      throw error;
    }
  });

/** Snapshot of one revision, used to preview what restoring it would change. */
export const getRevision = createServerFn({ method: "GET" })
  .inputValidator(z.object({ key: keySchema, revisionId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireStaff();
    const revision = await loadContentRevision(data.key as ContentKey, data.revisionId);
    if (!revision) return { ok: false as const, error: "Revision not found." };
    // Serialised as JSON for the client diff; the shape is the document's own.
    return {
      ok: true as const,
      revision: {
        id: revision.id,
        version: revision.version,
        data: JSON.stringify(revision.data),
      },
    };
  });

export const restoreRevision = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: keySchema, revisionId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const staff = await requireAdminRole();
    const version = await restoreContentRevision(data.key as ContentKey, data.revisionId, staff.id);
    return { ok: true as const, version };
  });

/** Draft bundle for the visual editor: every document plus its draft version. */
export const getDraftBundle = createServerFn({ method: "GET" }).handler(async () => {
  await requireStaff();
  const bundle = await loadDraftBundle();
  return JSON.stringify(bundle);
});

/**
 * Draft content for the visual editor. Returns null for anonymous visitors so a
 * query string alone can never expose unpublished wording.
 */
export const getEditorContent = createServerFn({ method: "GET" }).handler(async () => {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  return loadDraftContentBundle();
});
