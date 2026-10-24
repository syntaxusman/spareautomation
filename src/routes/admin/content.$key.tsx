import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import {
  CircleAlert,
  ExternalLink,
  GitCompare,
  History,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CmsShell } from "@/components/admin/CmsShell";
import { ChangeList } from "@/components/admin/ChangeList";
import { FieldRenderer, type FieldContext, type JsonValue } from "@/components/admin/FieldRenderer";
import {
  EmptyState,
  formatDateTime,
  formatRelative,
  Notice,
  Pill,
  PublishPill,
  SectionCard,
  Spinner,
} from "@/components/admin/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession } from "@/lib/admin/admin.functions";
import { cmsHead } from "@/lib/admin/head";
import {
  getContentEditor,
  getRevision,
  publishDraft,
  restoreRevision,
  saveDraft,
} from "@/lib/content/content.functions";
import { diffContent, hasChanges, type ContentChange } from "@/lib/content/diff";
import { isMapDocument, specFor } from "@/lib/content/fields";
import { listMedia } from "@/lib/content/media.functions";
import { isContentKey, type ContentKey } from "@/lib/content/registry";

const AUTOSAVE_MS = 25_000;

export const Route = createFileRoute("/admin/content/$key")({
  head: () => cmsHead("Edit content"),
  loader: async ({ params }) => {
    const staff = await getAdminSession();
    if (!staff) throw redirect({ to: "/admin/login" });
    if (staff.mustChangePassword) throw redirect({ to: "/admin/change-password" });
    if (!isContentKey(params.key)) throw new Error("Unknown content document");
    const [editor, media] = await Promise.all([
      getContentEditor({ data: { key: params.key } }),
      listMedia(),
    ]);
    return { staff, editor, media };
  },
  component: ContentEditorRoute,
});

function ContentEditorRoute() {
  const isPreview = useLocation().pathname.endsWith("/preview");
  return isPreview ? <Outlet /> : <ContentEditorPage />;
}

function issueMap(issues?: Array<{ path: string; message: string }>) {
  return Object.fromEntries((issues ?? []).map((issue) => [issue.path, issue.message]));
}

function ContentEditorPage() {
  const loaded = Route.useLoaderData();
  const router = useRouter();
  const { staff, media } = loaded;
  const key = loaded.editor.document.key as ContentKey;
  const spec = specFor(key);

  const [document_, setDocument] = useState(loaded.editor.document);
  const [revisions, setRevisions] = useState(loaded.editor.revisions);
  const [draft, setDraft] = useState<JsonValue>(loaded.editor.document.draftData as JsonValue);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "restore">("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState(spec.tabs[0]?.id ?? "");
  const [changesOpen, setChangesOpen] = useState(false);
  const [comparison, setComparison] = useState<{
    title: string;
    description: string;
    changes: ContentChange[];
  } | null>(null);
  const [restoring, setRestoring] = useState<{ id: number; version: number } | null>(null);

  const anchors = useRef(new Map<string, HTMLElement>());

  // Live diff between the editor's working copy and what visitors currently see.
  const pendingChanges = useMemo(
    () => diffContent(document_.publishedData, draft),
    [document_.publishedData, draft],
  );
  const ahead = hasChanges(document_.publishedData, draft);

  const save = useCallback(
    async (options?: { silent?: boolean }) => {
      if (busy) return false;
      setBusy("save");
      setIssues({});
      try {
        const result = await saveDraft({
          data: { key, data: draft, version: document_.draftVersion },
        });
        if (!result.ok) {
          if ("conflict" in result && result.conflict) {
            setConflict(true);
            toast.error("Someone else edited this document", {
              description: "Reload to pick up their changes before saving yours.",
            });
            return false;
          }
          const map = issueMap(result.issues);
          setIssues(map);
          const first = Object.keys(map)[0];
          if (first) {
            focusIssue(first, anchors.current, spec, setTab);
            toast.error("Some fields need attention", {
              description: `${Object.keys(map).length} field${Object.keys(map).length === 1 ? "" : "s"} could not be saved.`,
            });
          } else {
            toast.error(result.error);
          }
          return false;
        }
        setDocument((current) => ({ ...current, draftVersion: result.version }));
        setDirty(false);
        setSavedAt(new Date().toISOString());
        if (!options?.silent) toast.success("Draft saved");
        return true;
      } catch {
        toast.error("The draft could not be saved. Check your connection and try again.");
        return false;
      } finally {
        setBusy("");
      }
    },
    [busy, draft, document_.draftVersion, key, spec],
  );

  // Warn on navigation away with unsaved edits.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Cmd/Ctrl+S saves, matching every other editor people use.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    }
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Autosave, so a closed tab never costs an afternoon of edits.
  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(() => void save({ silent: true }), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, conflict, save]);

  async function publish() {
    if (dirty && !(await save({ silent: true }))) return;
    setBusy("publish");
    setIssues({});
    try {
      const result = await publishDraft({ data: { key } });
      if (!result.ok) {
        const map = issueMap(result.issues);
        setIssues(map);
        const first = Object.keys(map)[0];
        if (first) focusIssue(first, anchors.current, spec, setTab);
        toast.error(result.error);
        return;
      }
      toast.success(`Published version ${result.version}`, {
        description: "The live website now shows this content.",
      });
      await router.invalidate();
    } finally {
      setBusy("");
    }
  }

  async function compareRevision(revisionId: number, version: number) {
    const result = await getRevision({ data: { key, revisionId } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComparison({
      title: `Version ${version} compared with your draft`,
      description:
        "Restoring copies the old wording into the draft. Nothing changes on the website until you publish.",
      changes: diffContent(draft, JSON.parse(result.revision.data)),
    });
  }

  async function confirmRestore() {
    if (!restoring) return;
    setBusy("restore");
    try {
      await restoreRevision({ data: { key, revisionId: restoring.id } });
      toast.success(`Version ${restoring.version} restored into the draft`, {
        description: "Review it, then publish when you are happy.",
      });
      setRestoring(null);
      await router.invalidate();
    } finally {
      setBusy("");
    }
  }

  // Reload from the server after invalidate, without losing local scroll state.
  useEffect(() => {
    setDocument(loaded.editor.document);
    setRevisions(loaded.editor.revisions);
    setDraft(loaded.editor.document.draftData as JsonValue);
    setDirty(false);
  }, [loaded.editor]);

  const ctx: FieldContext = {
    media,
    issues,
    registerAnchor: (path, element) => {
      if (element) anchors.current.set(path, element);
      else anchors.current.delete(path);
    },
  };

  const mapDocument = isMapDocument(key);
  const issueCount = Object.keys(issues).length;

  return (
    <CmsShell
      staff={staff}
      breadcrumbs={[{ label: "Content", to: "/admin/content" }]}
      title={document_.label}
      subtitle={spec.description}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/admin/content/$key/preview"
              params={{ key }}
              search={{ raw: false, page: "", width: "desktop" as const }}
              target="_blank"
            >
              <ExternalLink /> Preview
            </Link>
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={busy !== "" || !dirty}>
            {busy === "save" ? <Spinner /> : <Save />} Save draft
          </Button>
        </>
      }
    >
      {conflict ? (
        <div className="mb-4">
          <Notice
            tone="danger"
            title="This document changed somewhere else"
            action={
              <Button size="sm" variant="outline" onClick={() => location.reload()}>
                Reload
              </Button>
            }
          >
            Another editor saved a newer draft. Reload to see it — your unsaved edits on this screen
            will be lost.
          </Notice>
        </div>
      ) : null}

      {issueCount ? (
        <div className="mb-4">
          <Notice tone="warning" title={`${issueCount} field${issueCount === 1 ? "" : "s"} need attention`}>
            Fields with a problem are outlined below. Fix them and save again.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            {spec.tabs.length > 1 ? (
              <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
                {spec.tabs.map((entry) => (
                  <TabsTrigger key={entry.id} value={entry.id} className="text-[12.5px]">
                    {entry.label}
                    {tabHasIssue(entry.fields, issues, mapDocument) ? (
                      <CircleAlert className="ml-1.5 size-3.5 text-destructive" aria-hidden="true" />
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            ) : null}

            {spec.tabs.map((entry) => (
              <TabsContent key={entry.id} value={entry.id} className="mt-0 space-y-6">
                {entry.description ? (
                  <p className="text-[13px] text-muted-foreground">{entry.description}</p>
                ) : null}
                {mapDocument ? (
                  <FieldRenderer
                    field={spec.fields.__map}
                    value={draft}
                    onChange={(next) => {
                      setDraft(next);
                      setDirty(true);
                    }}
                    path={[]}
                    ctx={ctx}
                  />
                ) : (
                  <div className="space-y-6 rounded-xl border bg-card p-4 sm:p-5">
                    {entry.fields.map((name) => (
                      <FieldRenderer
                        key={name}
                        field={spec.fields[name]}
                        value={(draft as Record<string, JsonValue>)?.[name] ?? ""}
                        onChange={(next) => {
                          setDraft({ ...(draft as Record<string, JsonValue>), [name]: next });
                          setDirty(true);
                        }}
                        path={[name]}
                        name={name}
                        ctx={ctx}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-18 lg:self-start">
          <SectionCard title="Publish">
            <div className="space-y-3 p-3.5">
              <div className="flex items-center gap-2">
                <PublishPill dirty={dirty} ahead={ahead} />
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  draft v{document_.draftVersion} · live v{document_.publishedVersion}
                </span>
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">Edited</dt>
                  <dd className="min-w-0 flex-1">
                    {formatRelative(savedAt ?? document_.updatedAt)}
                    {document_.updatedBy ? ` by ${document_.updatedBy}` : ""}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">Published</dt>
                  <dd className="min-w-0 flex-1">
                    {formatRelative(document_.publishedAt)}
                    {document_.publishedBy ? ` by ${document_.publishedBy}` : ""}
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => setChangesOpen(true)}
                disabled={pendingChanges.length === 0}
                className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/40 disabled:cursor-default disabled:opacity-60"
              >
                <GitCompare className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {pendingChanges.length === 0 ? (
                  "Draft matches the live website"
                ) : (
                  <>
                    <span className="font-medium tabular-nums">{pendingChanges.length}</span>
                    change{pendingChanges.length === 1 ? "" : "s"} waiting to publish
                  </>
                )}
              </button>

              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void save()}
                  disabled={busy !== "" || !dirty}
                >
                  {busy === "save" ? <Spinner /> : <Save />} Save draft
                </Button>
                {staff.role === "admin" ? (
                  <Button size="sm" onClick={publish} disabled={busy !== "" || (!ahead && !dirty)}>
                    {busy === "publish" ? <Spinner /> : <Send />} Publish
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    An administrator publishes changes to the live website.
                  </p>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground">
                {dirty
                  ? "Unsaved edits autosave shortly, or press ⌘S."
                  : "Saved drafts are private until published."}
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title={
              <span className="flex items-center gap-1.5">
                <History className="size-3.5 text-muted-foreground" aria-hidden="true" /> Revisions
              </span>
            }
          >
            {revisions.length === 0 ? (
              <p className="p-3.5 text-xs text-muted-foreground">
                No published revisions yet. The first publish creates one.
              </p>
            ) : (
              <ul className="divide-y">
                {revisions.slice(0, 8).map((revision) => (
                  <li key={revision.id} className="flex items-center gap-2 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-xs font-medium">
                        Version {revision.version}
                        {revision.version === document_.publishedVersion ? (
                          <Pill tone="success">Live</Pill>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {formatDateTime(revision.createdAt)}
                        {revision.publisher ? ` · ${revision.publisher}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Compare version ${revision.version}`}
                      onClick={() => void compareRevision(revision.id, revision.version)}
                    >
                      <GitCompare />
                    </Button>
                    {staff.role === "admin" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Restore version ${revision.version}`}
                        onClick={() => setRestoring({ id: revision.id, version: revision.version })}
                      >
                        <RotateCcw />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>

      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Changes waiting to publish</DialogTitle>
            <DialogDescription>
              How the draft differs from what visitors see on the live website right now.
            </DialogDescription>
          </DialogHeader>
          <ChangeList changes={pendingChanges} contentKey={key} value={draft} />
        </DialogContent>
      </Dialog>

      <Dialog open={comparison !== null} onOpenChange={(open) => !open && setComparison(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{comparison?.title}</DialogTitle>
            <DialogDescription>{comparison?.description}</DialogDescription>
          </DialogHeader>
          {comparison ? (
            comparison.changes.length ? (
              <ChangeList changes={comparison.changes} contentKey={key} value={draft} />
            ) : (
              <EmptyState title="Identical" copy="This revision matches your current draft." />
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={restoring !== null} onOpenChange={(open) => !open && setRestoring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {restoring?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft is replaced with this older wording. The live website is unaffected until
              you publish. Any unsaved edits on this screen are discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore} disabled={busy === "restore"}>
              {busy === "restore" ? <Spinner /> : null} Restore into draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CmsShell>
  );
}

/** Does any field on this tab carry a validation issue? */
function tabHasIssue(fields: string[], issues: Record<string, string>, mapDocument: boolean) {
  if (mapDocument) return Object.keys(issues).length > 0;
  return Object.keys(issues).some((path) => fields.includes(path.split(".")[0]));
}

/** Switch to the tab owning a failed field, then scroll it into view. */
function focusIssue(
  path: string,
  anchors: Map<string, HTMLElement>,
  spec: ReturnType<typeof specFor>,
  setTab: (id: string) => void,
) {
  const root = path.split(".")[0];
  const owner = spec.tabs.find((entry) => entry.fields.includes(root)) ?? spec.tabs[0];
  if (owner) setTab(owner.id);
  // Let the tab paint before measuring the target's position.
  requestAnimationFrame(() => {
    anchors.get(path)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
