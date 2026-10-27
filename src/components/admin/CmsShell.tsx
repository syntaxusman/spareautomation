import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ChevronRight,
  ExternalLink,
  Images,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MousePointerClick,
  ReceiptText,
  Search,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import { CommandPalette, useCommandPalette } from "@/components/admin/CommandPalette";
import { ThemeToggle } from "@/components/admin/theme";
import { InitialsAvatar } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { adminLogout, type AdminSession } from "@/lib/admin/admin.functions";
import { CONTENT_KEYS, CONTENT_REGISTRY, type ContentKey } from "@/lib/content/registry";
import { cn } from "@/lib/utils";

const SUBMISSION_SEARCH = { type: "all", status: "all", search: "", page: 1 } as const;
const ACTIVITY_SEARCH = { page: 1, action: "" } as const;
const VISUAL_SEARCH = { page: "/", width: "desktop" } as const;

type Crumb = { label: string; to?: string; params?: Record<string, string> };

type CmsShellProps = {
  staff: AdminSession;
  title: string;
  subtitle?: string;
  /** Buttons rendered at the right of the page header. */
  actions?: ReactNode;
  /** Trail shown in the top bar, before the current page. */
  breadcrumbs?: Crumb[];
  /** Count badge on the submissions link. */
  inboxCount?: number;
  /** Suppresses the page header block for screens that own their full width. */
  bare?: boolean;
  /** Removes the content max-width, for the visual editor. */
  wide?: boolean;
  children: ReactNode;
};

/**
 * Content documents grouped the way the registry groups them, so the sidebar
 * mirrors the document index instead of flattening nine unrelated entries.
 */
const CONTENT_GROUPS = (() => {
  const groups = new Map<string, Array<{ key: ContentKey; label: string }>>();
  for (const key of CONTENT_KEYS) {
    const { group, label } = CONTENT_REGISTRY[key];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({ key, label });
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
})();

export function CmsShell({
  staff,
  title,
  subtitle,
  actions,
  breadcrumbs = [],
  inboxCount,
  bare,
  wide,
  children,
}: CmsShellProps) {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const palette = useCommandPalette();

  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);

  async function signOut() {
    // Always land on the sign-in screen, even if clearing the session failed.
    try {
      await adminLogout();
    } finally {
      void navigate({ to: "/admin/login" });
    }
  }

  const nav = (
    <Nav
      staff={staff}
      path={path}
      inboxCount={inboxCount}
      onSearch={() => {
        setDrawerOpen(false);
        palette.setOpen(true);
      }}
      onSignOut={signOut}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="bottom-right" closeButton richColors />
      <CommandPalette
        staff={staff}
        open={palette.open}
        onOpenChange={palette.setOpen}
        onSignOut={signOut}
      />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[17rem] bg-sidebar p-0">
          <SheetTitle className="sr-only">CMS navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Jump to a section of the content management system.
          </SheetDescription>
          {nav}
        </SheetContent>
      </Sheet>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          data-testid="cms-sidebar"
          className="sticky top-0 hidden h-screen border-r bg-sidebar lg:block"
        >
          {nav}
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu />
            </Button>

            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
              {breadcrumbs.map((crumb) => (
                <Fragment key={crumb.label}>
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      params={crumb.params as never}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-muted-foreground">{crumb.label}</span>
                  )}
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                </Fragment>
              ))}
              <span className="truncate font-medium">{title}</span>
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 lg:hidden"
                aria-label="Search"
                onClick={() => palette.setOpen(true)}
              >
                <Search />
              </Button>
              <Button variant="ghost" size="sm" className="hidden h-8 gap-2 sm:flex" asChild>
                <a href="/" target="_blank" rel="noreferrer">
                  <ExternalLink /> View site
                </a>
              </Button>
              <ThemeToggle />
              <AccountMenu staff={staff} onSignOut={signOut} />
            </div>
          </header>

          <main
            id="main-content"
            className={cn("min-w-0 flex-1 px-4 py-6 sm:px-6", wide ? "" : "mx-auto w-full max-w-6xl")}
          >
            {bare ? null : (
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                  {subtitle ? (
                    <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- navigation */

function Nav({
  staff,
  path,
  inboxCount,
  onSearch,
  onSignOut,
}: {
  staff: AdminSession;
  path: string;
  inboxCount?: number;
  onSearch: () => void;
  onSignOut: () => void;
}) {
  // Keep the group holding the open document expanded across navigations.
  const activeGroup = useMemo(() => {
    const match = /^\/admin\/content\/([^/]+)/.exec(path);
    const key = match?.[1];
    if (!key || !(key in CONTENT_REGISTRY)) return null;
    return CONTENT_REGISTRY[key as ContentKey].group;
  }, [path]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2.5 border-b px-4">
        <span
          className="flex size-6.5 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground"
          aria-hidden="true"
        >
          SA
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] leading-tight font-semibold">
            Spares Automation
          </span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            Content management
          </span>
        </span>
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onSearch}
          className="flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Search className="size-3.5" aria-hidden="true" />
          Search…
          <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="CMS sections" className="space-y-5 px-3 py-3">
          <Section>
            <NavLink
              to="/admin"
              icon={<LayoutDashboard />}
              label="Dashboard"
              active={path === "/admin"}
            />
            <NavLink
              to="/admin/visual"
              search={VISUAL_SEARCH}
              icon={<MousePointerClick />}
              label="Edit pages"
              active={path.startsWith("/admin/visual")}
            />
            <NavLink
              to="/admin/submissions"
              search={SUBMISSION_SEARCH}
              icon={<Inbox />}
              label="Submissions"
              active={path.startsWith("/admin/submissions")}
              count={inboxCount}
            />
          </Section>

          <Section heading="Commerce">
            <NavLink
              to="/admin/quotes"
              icon={<ReceiptText />}
              label="Quotations"
              active={path.startsWith("/admin/quotes")}
            />
            {staff.role === "admin" ? (
              <NavLink
                to="/admin/pricing"
                icon={<Tags />}
                label="Bulk pricing"
                active={path.startsWith("/admin/pricing")}
              />
            ) : null}
          </Section>

          <Section
            heading="Content"
            headingAction={
              <Link
                to="/admin/content"
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:text-foreground",
                  path === "/admin/content" ? "text-foreground" : "text-muted-foreground",
                )}
              >
                All
              </Link>
            }
          >
            {CONTENT_GROUPS.map(({ group, items }) => (
              <NavGroup
                key={group}
                label={group}
                forceOpen={activeGroup === group}
                active={items.some((item) => path === `/admin/content/${item.key}`)}
              >
                {items.map((item) => (
                  <NavLink
                    key={item.key}
                    to="/admin/content/$key"
                    params={{ key: item.key }}
                    label={item.label}
                    active={path === `/admin/content/${item.key}`}
                    nested
                  />
                ))}
              </NavGroup>
            ))}
          </Section>

          <Section heading="Library">
            <NavLink
              to="/admin/media"
              icon={<Images />}
              label="Media"
              active={path.startsWith("/admin/media")}
            />
          </Section>

          {staff.role === "admin" ? (
            <Section heading="Administration">
              <NavLink
                to="/admin/users"
                icon={<Users />}
                label="Users"
                active={path.startsWith("/admin/users")}
              />
              <NavLink
                to="/admin/activity"
                search={ACTIVITY_SEARCH}
                icon={<Activity />}
                label="Activity"
                active={path.startsWith("/admin/activity")}
              />
            </Section>
          ) : null}
        </nav>
      </ScrollArea>

      <div className="shrink-0 space-y-0.5 border-t p-3">
        <NavLink
          to="/admin/settings"
          icon={<Settings />}
          label="Settings"
          active={path.startsWith("/admin/settings")}
        />
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

function Section({
  heading,
  headingAction,
  children,
}: {
  heading?: string;
  headingAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      {heading ? (
        <div className="flex items-center gap-2 px-2 pb-1">
          <span className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {heading}
          </span>
          {headingAction ? <span className="ml-auto">{headingAction}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function NavGroup({
  label,
  active,
  forceOpen,
  children,
}: {
  label: string;
  active: boolean;
  /** Reopens the group holding the document that was just navigated to. */
  forceOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
          active
            ? "font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent",
        )}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </button>
      {open ? <div className="mt-0.5 space-y-0.5">{children}</div> : null}
    </div>
  );
}



function NavLink({
  to,
  params,
  search,
  icon,
  label,
  active,
  count,
  nested,
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  icon?: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  nested?: boolean;
}) {
  return (
    <Link
      to={to}
      params={params as never}
      search={search as never}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors",
        nested ? "ml-3.5 border-l pr-2 pl-4" : "px-2",
        active
          ? nested
            ? "border-primary font-medium text-foreground"
            : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "[&>svg]:size-4 [&>svg]:shrink-0",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
      {count ? (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function AccountMenu({ staff, onSignOut }: { staff: AdminSession; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 rounded-full ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Account menu"
        >
          <InitialsAvatar name={staff.name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-[13px] font-medium">{staff.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{staff.email}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {staff.role === "admin" ? "Administrator" : "Staff"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2 text-[13px]">
          <Link to="/admin/settings">
            <Settings className="size-4" aria-hidden="true" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 text-[13px]">
          <Link to="/admin/change-password">
            <KeyRound className="size-4" aria-hidden="true" /> Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 text-[13px]">
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" aria-hidden="true" /> View website
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onSignOut}
          className="gap-2 text-[13px] text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
