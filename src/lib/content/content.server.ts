import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { writeAdminAudit } from "../admin/audit.server";
import { getDb } from "../db/index.server";
import {
  getFailureBackoffMs,
  shouldReportFailure,
  summarizeDatabaseError,
} from "../db/resilience";
import {
  contentDocuments,
  contentMedia,
  contentRevisions,
  staffUsers,
} from "../db/schema";
import {
  CONTENT_KEYS,
  CONTENT_REGISTRY,
  getDefaultContent,
  getDefaultContentBundle,
  type ContentBundle,
  type ContentKey,
  validateContent,
} from "./registry";

export type ContentDocumentView<K extends ContentKey = ContentKey> = {
  key: K;
  label: string;
  group: string;
  draftData: ContentBundle[K];
  publishedData: ContentBundle[K];
  draftVersion: number;
  publishedVersion: number;
  updatedBy: string | null;
  publishedBy: string | null;
  updatedAt: string;
  publishedAt: string;
};

export class ContentConflictError extends Error {
  constructor() {
    super("CONTENT_VERSION_CONFLICT");
  }
}

export function collectMediaIds(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaIds(item, result);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "mediaId" && typeof item === "string" && item) result.add(item);
      else collectMediaIds(item, result);
    }
  }
  return result;
}

/** Add missing fixed documents and their initial immutable revisions. Safe on every boot. */
export async function seedContentDefaults(): Promise<void> {
  try {
    const db = getDb();
    for (const key of CONTENT_KEYS) {
      const defaults = getDefaultContent(key) as Record<string, unknown>;
      await db.insert(contentDocuments).values({
        key,
        draftData: defaults,
        publishedData: defaults,
      }).onConflictDoNothing({ target: contentDocuments.key });
      await db.insert(contentRevisions).values({
        documentKey: key,
        version: 1,
        data: defaults,
      }).onConflictDoNothing({
        target: [contentRevisions.documentKey, contentRevisions.version],
      });
    }
  } catch (error) {
    console.error("[content] Failed to seed compiled defaults:", error);
  }
}

let bundleCache: { data: ContentBundle; expires: number } | null = null;
let consecutiveBundleFailures = 0;
let lastBundleFailureLogAt = 0;

export function invalidateContentBundleCache(): void {
  bundleCache = null;
}

/** Public reads never throw: malformed/missing/database content uses compiled defaults. */
export async function loadPublishedContentBundle(): Promise<ContentBundle> {
  const now = Date.now();
  if (bundleCache && now < bundleCache.expires) {
    return bundleCache.data;
  }

  const result = getDefaultContentBundle();
  try {
    const rows = await getDb().select({
      key: contentDocuments.key,
      data: contentDocuments.publishedData,
    }).from(contentDocuments);
    for (const row of rows) {
      if (!CONTENT_KEYS.includes(row.key as ContentKey)) continue;
      const key = row.key as ContentKey;
      try {
        result[key] = validateContent(key, row.data) as never;
      } catch (error) {
        console.error(`[content] Invalid published document ${key}; using defaults:`, error);
      }
    }
    consecutiveBundleFailures = 0;
    bundleCache = { data: result, expires: now + 10_000 };
  } catch (error) {
    consecutiveBundleFailures += 1;
    const retryDelay = getFailureBackoffMs(consecutiveBundleFailures);
    if (shouldReportFailure(lastBundleFailureLogAt, now)) {
      lastBundleFailureLogAt = now;
      console.error(
        `[content] Published content unavailable; using compiled defaults for ${Math.ceil(retryDelay / 1_000)}s (${summarizeDatabaseError(error)}).`,
      );
    }
    bundleCache = { data: result, expires: now + retryDelay };
  }
  return result;
}

export async function listContentDocuments() {
  const db = getDb();
  const rows = await db.select({
    key: contentDocuments.key,
    draftVersion: contentDocuments.draftVersion,
    publishedVersion: contentDocuments.publishedVersion,
    updatedAt: contentDocuments.updatedAt,
    publishedAt: contentDocuments.publishedAt,
    updatedBy: staffUsers.name,
  }).from(contentDocuments)
    .leftJoin(staffUsers, eq(contentDocuments.updatedBy, staffUsers.id))
    .orderBy(asc(contentDocuments.key));
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return CONTENT_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      label: CONTENT_REGISTRY[key].label,
      group: CONTENT_REGISTRY[key].group,
      draftVersion: row?.draftVersion ?? 1,
      publishedVersion: row?.publishedVersion ?? 1,
      hasUnpublishedChanges: row ? row.draftVersion !== row.publishedVersion : false,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
    };
  });
}

export async function loadContentDocument<K extends ContentKey>(key: K): Promise<ContentDocumentView<K>> {
  const db = getDb();
  const [row] = await db.select({
    document: contentDocuments,
    updatedBy: staffUsers.name,
  }).from(contentDocuments)
    .leftJoin(staffUsers, eq(contentDocuments.updatedBy, staffUsers.id))
    .where(eq(contentDocuments.key, key)).limit(1);
  if (!row) {
    await seedContentDefaults();
    return loadContentDocument(key);
  }
  const [publisher] = row.document.publishedBy
    ? await db.select({ name: staffUsers.name }).from(staffUsers).where(eq(staffUsers.id, row.document.publishedBy)).limit(1)
    : [];
  /**
   * A stored document that no longer matches its schema must not lock the
   * editor out — that is the one screen able to repair it. Fall back to the
   * compiled defaults so the fields render and the next save fixes the row.
   */
  const validated = (value: unknown, label: string) => {
    try {
      return validateContent(key, value);
    } catch (error) {
      console.error(`[content] ${label} for "${key}" is invalid; editing defaults:`, error);
      return getDefaultContent(key);
    }
  };

  return {
    key,
    label: CONTENT_REGISTRY[key].label,
    group: CONTENT_REGISTRY[key].group,
    draftData: validated(row.document.draftData, "Draft"),
    publishedData: validated(row.document.publishedData, "Published copy"),
    draftVersion: row.document.draftVersion,
    publishedVersion: row.document.publishedVersion,
    updatedBy: row.updatedBy,
    publishedBy: publisher?.name ?? null,
    updatedAt: row.document.updatedAt.toISOString(),
    publishedAt: row.document.publishedAt.toISOString(),
  };
}

export async function saveContentDraft<K extends ContentKey>(
  key: K,
  data: unknown,
  expectedVersion: number,
  staffId: number,
) {
  const parsed = validateContent(key, data);
  const [updated] = await getDb().update(contentDocuments).set({
    draftData: parsed as Record<string, unknown>,
    draftVersion: sql`${contentDocuments.draftVersion} + 1`,
    updatedBy: staffId,
    updatedAt: sql`now()`,
  }).where(and(
    eq(contentDocuments.key, key),
    eq(contentDocuments.draftVersion, expectedVersion),
  )).returning({ version: contentDocuments.draftVersion });
  if (!updated) throw new ContentConflictError();
  await writeAdminAudit(getDb() as never, {
    staffId, action: "content.draft_saved", targetType: "content", targetId: key,
    details: { fromVersion: expectedVersion, toVersion: updated.version },
  });
  return updated.version;
}

export async function publishContentDraft(key: ContentKey, staffId: number) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(contentDocuments)
      .where(eq(contentDocuments.key, key)).for("update").limit(1);
    if (!row) throw new Error("CONTENT_NOT_FOUND");
    const parsed = validateContent(key, row.draftData) as Record<string, unknown>;
    if (row.draftVersion === row.publishedVersion) return row.publishedVersion;
    const nextVersion = row.draftVersion;
    const mediaIds = [...collectMediaIds(parsed)];
    if (mediaIds.length) {
      const available = await tx.select({ id: contentMedia.id, archived: contentMedia.isArchived }).from(contentMedia).where(inArray(contentMedia.id, mediaIds));
      if (available.length !== mediaIds.length || available.some((item) => item.archived)) throw new Error("CONTENT_MEDIA_INVALID");
    }
    await tx.update(contentDocuments).set({
      publishedData: parsed,
      publishedVersion: nextVersion,
      publishedBy: staffId,
      updatedBy: staffId,
      publishedAt: sql`now()`,
      updatedAt: sql`now()`,
    }).where(eq(contentDocuments.key, key));
    await tx.insert(contentRevisions).values({
      documentKey: key, version: nextVersion, data: parsed, publishedBy: staffId,
    });
    if (mediaIds.length) {
      await tx.update(contentMedia).set({ isPublished: true, updatedAt: sql`now()` })
        .where(inArray(contentMedia.id, mediaIds));
    }
    await writeAdminAudit(tx as never, {
      staffId, action: "content.published", targetType: "content", targetId: key,
      details: { version: nextVersion },
    });
    invalidateContentBundleCache();
    return nextVersion;
  });
}

export async function listContentRevisions(key: ContentKey) {
  return getDb().select({
    id: contentRevisions.id,
    version: contentRevisions.version,
    publisher: staffUsers.name,
    createdAt: contentRevisions.createdAt,
  }).from(contentRevisions)
    .leftJoin(staffUsers, eq(contentRevisions.publishedBy, staffUsers.id))
    .where(eq(contentRevisions.documentKey, key))
    .orderBy(desc(contentRevisions.version));
}

/** One revision's stored snapshot, so the CMS can diff it against the draft. */
export async function loadContentRevision(key: ContentKey, revisionId: number) {
  const [revision] = await getDb()
    .select()
    .from(contentRevisions)
    .where(and(eq(contentRevisions.id, revisionId), eq(contentRevisions.documentKey, key)))
    .limit(1);
  if (!revision) return null;
  return { id: revision.id, version: revision.version, data: revision.data };
}

export async function restoreContentRevision(key: ContentKey, revisionId: number, staffId: number) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [revision] = await tx.select().from(contentRevisions).where(and(
      eq(contentRevisions.id, revisionId), eq(contentRevisions.documentKey, key),
    )).limit(1);
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    const data = validateContent(key, revision.data) as Record<string, unknown>;
    const [updated] = await tx.update(contentDocuments).set({
      draftData: data,
      draftVersion: sql`${contentDocuments.draftVersion} + 1`,
      updatedBy: staffId,
      updatedAt: sql`now()`,
    }).where(eq(contentDocuments.key, key)).returning({ version: contentDocuments.draftVersion });
    if (!updated) throw new Error("CONTENT_NOT_FOUND");
    await writeAdminAudit(tx as never, {
      staffId, action: "content.revision_restored", targetType: "content", targetId: key,
      details: { revisionId, revisionVersion: revision.version, draftVersion: updated.version },
    });
    return updated.version;
  });
}

export async function isMediaReferenced(id: string) {
  const rows = await getDb().select({
    draft: contentDocuments.draftData,
    published: contentDocuments.publishedData,
  }).from(contentDocuments);
  return rows.some((row) => collectMediaIds(row.draft).has(id) || collectMediaIds(row.published).has(id));
}

export type DraftBundleEntry = {
  data: unknown;
  version: number;
  /** True when the stored draft failed validation and was swapped for a valid copy. */
  repaired?: boolean;
};

/**
 * Draft data for every document in one query. The visual editor needs the whole
 * set because a single public page mixes navigation, page and catalogue copy.
 *
 * Every document is validated on the way out, exactly as `loadDraftContentBundle`
 * does for rendering. Handing back a raw row would let a draft that no longer
 * matches its schema — an older shape, a hand-edited row — reach the editor,
 * which then posts it back untouched and fails on a field nobody edited. Falling
 * back to the published copy means the next save repairs the stored document.
 */
export async function loadDraftBundle(): Promise<Record<string, DraftBundleEntry>> {
  const published = await loadPublishedContentBundle();
  const db = getDb();
  const rows = await db
    .select({
      key: contentDocuments.key,
      draftData: contentDocuments.draftData,
      draftVersion: contentDocuments.draftVersion,
    })
    .from(contentDocuments);

  const result: Record<string, DraftBundleEntry> = {};
  for (const key of CONTENT_KEYS) {
    const row = rows.find((entry) => entry.key === key);
    if (!row) {
      result[key] = { data: published[key], version: 1 };
      continue;
    }
    try {
      result[key] = { data: validateContent(key, row.draftData), version: row.draftVersion };
    } catch (error) {
      console.error(`[content] Draft for "${key}" is invalid; editing the published copy:`, error);
      // The version is kept so optimistic concurrency still guards the save.
      result[key] = { data: published[key], version: row.draftVersion, repaired: true };
    }
  }
  return result;
}

/**
 * Draft view of every document, validated the same way published content is.
 * A document whose draft is invalid falls back to its published copy so the
 * visual editor still renders.
 */
export async function loadDraftContentBundle(): Promise<ContentBundle> {
  // Draft overlays must never mutate the cached bundle used by public pages.
  const published = structuredClone(await loadPublishedContentBundle());
  try {
    const rows = await getDb()
      .select({ key: contentDocuments.key, data: contentDocuments.draftData })
      .from(contentDocuments);
    for (const row of rows) {
      if (!CONTENT_KEYS.includes(row.key as ContentKey)) continue;
      const key = row.key as ContentKey;
      try {
        published[key] = validateContent(key, row.data) as never;
      } catch {
        // Keep the published copy for this document.
      }
    }
  } catch (error) {
    console.error("[content] Draft content unavailable; using published copy:", error);
  }
  return published;
}
