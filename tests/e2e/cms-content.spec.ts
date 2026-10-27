import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import { hashPassword } from "../../src/lib/admin/auth.server";
import { shopifyE2EConfigured } from "./test-environment";

function localEnvironment(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const fileEnv = localEnvironment();
const environment = {
  databaseUrl: process.env.DATABASE_URL || fileEnv.DATABASE_URL,
  adminEmail: process.env.ADMIN_SEED_EMAIL || fileEnv.ADMIN_SEED_EMAIL,
  adminPassword: process.env.ADMIN_SEED_PASSWORD || fileEnv.ADMIN_SEED_PASSWORD,
};
const configured = Boolean(
  environment.databaseUrl && environment.adminEmail && environment.adminPassword,
);

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function database() {
  return postgres(environment.databaseUrl!, { max: 1, prepare: false });
}

let reachable: Promise<boolean> | null = null;

/** The CMS database is optional locally, so integration tests skip when it is down. */
function databaseReachable() {
  if (!configured) return Promise.resolve(false);
  reachable ??= (async () => {
    const sql = postgres(environment.databaseUrl!, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
    });
    try {
      await sql`select 1`;
      return true;
    } catch {
      return false;
    } finally {
      await sql.end({ timeout: 2 }).catch(() => undefined);
    }
  })();
  return reachable;
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  expectedUrl: RegExp = /\/admin(?:\?|$)/,
) {
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectedUrl, { timeout: 20_000 });
}

async function waitForEditorHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "Save draft",
    );
    return button && Object.keys(button).some((key) => key.startsWith("__reactProps$"));
  });
}

async function waitForHydratedButton(page: Page, label: string) {
  await page.waitForFunction((buttonLabel) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent?.trim() === buttonLabel,
    );
    return (
      button &&
      !button.disabled &&
      Object.keys(button).some((key) => key.startsWith("__reactProps$"))
    );
  }, label);
}

async function waitForMediaHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "Upload image",
    );
    return button && Object.keys(button).some((key) => key.startsWith("__reactProps$"));
  });
}

async function waitForUsersHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "New user",
    );
    return button && Object.keys(button).some((key) => key.startsWith("__reactProps$"));
  });
}

test("public pages render their compiled content without an admin session", async ({ page }) => {
  test.slow();
  await page.goto("/disclaimer");
  await expect(page.getByRole("heading", { level: 1, name: "Disclaimer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compatibility" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Third-party names" })).toBeVisible();

  await page.goto("/got-a-question");
  await expect(page.getByRole("heading", { level: 1, name: "Got a question?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product questions" })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("heading", { level: 1, name: "Cart" })).toBeVisible();
});

test("CMS-driven public pages keep their landmarks and heading structure", async ({ page }) => {
  test.slow();
  for (const target of [
    "/disclaimer",
    "/delivery-information",
    "/returns",
    "/got-a-question",
    "/about-us",
    "/contact-us",
    "/resources",
    "/cookies",
  ]) {
    await page.goto(target);
    await expect(page.getByRole("link", { name: "Skip to main content" }), target).toBeAttached();
    await expect(page.getByRole("banner"), target).toBeVisible();
    await expect(page.locator("main#main-content"), target).toBeVisible();
    await expect(page.locator("h1"), target).toHaveCount(1);
    const unlabelledImages = await page
      .locator("main img:not([alt])")
      .count();
    expect(unlabelledImages, target).toBe(0);
  }
});

test("unauthenticated visitors cannot reach CMS screens, drafts or previews", async ({ page }) => {
  test.slow();
  for (const target of ["/admin/content", "/admin/media", "/admin/users", "/admin/content/site/preview"]) {
    // A server-side redirect can abort the navigation request; the resulting URL is what matters.
    await page.goto(target).catch(() => undefined);
    await expect(page, target).toHaveURL(/\/admin\/login/, { timeout: 20_000 });
  }
});

test("every CMS-wired route renders without a client error", async ({ page }) => {
  // Fifteen server-rendered routes, each hitting Shopify or Postgres.
  test.setTimeout(240_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${page.url()}: ${message.text()}`);
  });

  const targets = [
    "/",
    "/products",
    "/search?q=valve",
    "/cart",
    "/quote",
    "/login",
    "/register",
    "/forgot-password",
    "/account",
    "/track-order",
    "/credit-account",
    "/resources",
    "/robots.txt",
    "/sitemap.xml",
    "/site.webmanifest",
  ].filter(
    (target) =>
      shopifyE2EConfigured || (target !== "/products" && !target.startsWith("/search")),
  );

  for (const target of targets) {
    // Catalogue routes call Shopify, which can blip; one retry keeps the check honest.
    let response = await page.goto(target);
    if ((response?.status() ?? 500) >= 500) response = await page.goto(target);
    expect(response?.status(), target).toBeLessThan(400);
  }

  // Shopify or database outages are logged on the server, not surfaced to visitors.
  expect(failures.filter((entry) => !/favicon|net::ERR/i.test(entry))).toEqual([]);
});


test("the CMS sign-in screen uses the admin design system", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to the CMS" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // The admin theme is applied before paint; its absence means the CMS
  // stylesheet did not load and the storefront theme is showing through.
  await expect(page.locator("html")).toHaveAttribute("data-cms-theme", /^(light|dark)$/);
});

test.describe("CMS dashboard", () => {
  test.describe.configure({ mode: "serial" });

  test("the sidebar reaches every area of the platform", async ({ page }, testInfo) => {
    test.skip(!(await databaseReachable()), "CMS database is not reachable");
    test.skip(testInfo.project.name !== "desktop-chromium", "Dashboard checks run once per suite");

    await signIn(page, environment.adminEmail!, environment.adminPassword!);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

    const sidebar = page.getByTestId("cms-sidebar");
    for (const label of [
      "Dashboard",
      "Submissions",
      "Quotations",
      "Bulk pricing",
      "Content",
      "Media",
      "Users",
      "Activity",
      "Settings",
    ]) {
      await expect(sidebar.getByText(label, { exact: true }).first(), label).toBeVisible();
    }

    // Every content document is reachable from the sidebar.
    await sidebar.getByText("Business details", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/content\/site$/);
    await expect(page.getByRole("button", { name: "Save draft" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

    await sidebar.getByText("Media", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/media$/);
    await expect(page.getByRole("heading", { level: 1, name: "Media" })).toBeVisible();

    await sidebar.getByText("Activity", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/activity/);
    await expect(page.getByRole("heading", { level: 1, name: "Activity log" })).toBeVisible();

    // Signing out must be reachable without opening a menu.
    await expect(sidebar.getByRole("button", { name: "Sign out" })).toBeVisible();

    await sidebar.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await expect(page.getByRole("heading", { name: "Business details" })).toBeVisible();
    await page.getByRole("tab", { name: "Navigation" }).click();
    await expect(page.getByRole("heading", { name: "Navigation and footer" })).toBeVisible();

    await sidebar.getByText("Submissions", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/submissions/);
    await expect(page.getByRole("heading", { level: 1, name: "Submissions" })).toBeVisible();
  });
});


test("editing markers never reach anonymous visitors", async ({ page }) => {
  await page.goto("/?cmsEdit=1");
  await expect(page.getByRole("heading", { level: 2, name: /Asphalt/i }).first()).toBeVisible();
  expect(await page.locator("[data-cms-field]").count()).toBe(0);
});

test.describe("Visual page editor", () => {
  test.describe.configure({ mode: "serial" });

  test("click-to-edit changes wording on the page", async ({ page }, testInfo) => {
    test.skip(!(await databaseReachable()), "CMS database is not reachable");
    test.skip(testInfo.project.name !== "desktop-chromium", "Content mutations run once per suite");
    test.setTimeout(180_000);

    const sql = database();
    // The frame must become interactive: the loading overlay has to clear and
    // the page inside has to carry editing markers.
    const [original] = await sql<
      { draft_data: Record<string, never>; published_data: Record<string, never>; draft_version: number; published_version: number }[]
    >`
      select draft_data, published_data, draft_version, published_version
      from content_documents where key = 'catalogue'
    `;

    try {
      await signIn(page, environment.adminEmail!, environment.adminPassword!);
      await page.goto("/admin/visual?page=%2F&width=desktop");
      await expect(page.getByRole("combobox", { name: "Page to edit" })).toBeVisible();
      await expect(page.getByText("Loading page…")).toBeHidden({ timeout: 30_000 });

      // The rendered page carries editing markers for staff.
      const frame = page.frameLocator('iframe[title="Page being edited"]');
      const target = frame.locator('[data-cms-field="catalogue.ranges.0.lines.0.label"]');
      await expect(target).toBeVisible({ timeout: 30_000 });
      await expect(target).toHaveText("Aggregate feeding");

      // The storefront header and first-visit cookie banner intentionally sit
      // above page content. Dispatching the click verifies the editor bridge
      // without making this CMS test depend on those unrelated overlays.
      await target.dispatchEvent("click");
      await expect(page.getByRole("heading", { name: "Product line name" })).toBeVisible();

      const field = page.getByLabel("Line label");
      await field.fill("Aggregate feeding systems");
      await page.getByRole("button", { name: /^Save/ }).first().click();
      await expect(page.getByText("Changes saved to the draft")).toBeVisible({ timeout: 15_000 });

      // The preview reflects the saved draft.
      await expect(
        page
          .frameLocator('iframe[title="Page being edited"]')
          .locator('[data-cms-field="catalogue.ranges.0.lines.0.label"]'),
      ).toHaveText("Aggregate feeding systems", { timeout: 30_000 });

      // Visitors still see the published wording until it is published.
      const anonymous = await page.context().browser()!.newContext();
      const visitor = await anonymous.newPage();
      await visitor.goto("/");
      await expect(visitor.getByText("Aggregate feeding", { exact: true }).first()).toBeVisible();
      await anonymous.close();
    } finally {
      await sql`
        update content_documents
        set draft_data = ${sql.json(original.draft_data)},
            published_data = ${sql.json(original.published_data)},
            draft_version = ${original.draft_version},
            published_version = ${original.published_version}
        where key = 'catalogue'
      `.catch(() => undefined);
      await sql.end({ timeout: 2 });
    }
  });
});

test.describe("CMS content workflow", () => {
  test.describe.configure({ mode: "serial" });

  test("draft, preview, publish and restore run end to end", async ({ page }, testInfo) => {
    test.skip(!(await databaseReachable()), "CMS database is not reachable");
    test.skip(testInfo.project.name !== "desktop-chromium", "Content mutations run once per suite");

    const sql = database();
    const editedTitle = `Disclaimer ${Date.now()}`;
    const [original] = await sql<
      { draft_data: Record<string, never>; published_data: Record<string, never>; draft_version: number; published_version: number }[]
    >`select draft_data, published_data, draft_version, published_version from content_documents where key = 'pages'`;
    expect(original, "the pages document must be seeded").toBeTruthy();

    try {
      await signIn(page, environment.adminEmail!, environment.adminPassword!);
      await page.goto("/admin/content");
      await expect(page.getByRole("heading", { name: "Functional pages" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Catalogue presentation" })).toBeVisible();

      await expect(
        page
          .locator("#main-content")
          .getByRole("link", { name: "Information and legal pages" }),
      ).toBeVisible();
      await page.goto("/admin/content/pages");
      await expect(page).toHaveURL(/\/admin\/content\/pages$/);
      await waitForEditorHydration(page);

      // Another editor saves a change while this editor holds an older version.
      const draft = structuredClone(original.draft_data) as Record<string, { title: string }>;
      draft.disclaimer.title = editedTitle;
      await sql`
        update content_documents
        set draft_data = ${sql.json(draft)}, draft_version = draft_version + 1
        where key = 'pages'
      `;

      // Make a local edit so the save controls are enabled, then verify that
      // the stale version is rejected instead of overwriting the other edit.
      const pageTitle = page.locator("#field-about-us-title");
      await pageTitle.fill(`${await pageTitle.inputValue()} (local edit)`);
      await page.getByRole("button", { name: "Save draft" }).first().click();
      await expect(page.getByRole("alert")).toContainText("This document changed somewhere else", {
        timeout: 15_000,
      });
      await page.getByRole("button", { name: "Reload" }).click();
      await waitForEditorHydration(page);
      await page
        .getByRole("navigation", { name: "Pages in this document" })
        .getByRole("button", { name: "Disclaimer" })
        .click();
      await expect(page.locator("#field-disclaimer-title")).toHaveValue(editedTitle);

      // Draft changes are invisible to the public site until published.
      await page.goto("/disclaimer");
      await expect(page.getByRole("heading", { level: 1, name: "Disclaimer" })).toBeVisible();

      // The authenticated preview renders the draft through the public renderer.
      await page.goto("/admin/content/pages/preview?raw=true&page=disclaimer");
      await expect(page.getByRole("heading", { level: 1, name: editedTitle })).toBeVisible();

      await page.goto("/admin/content/pages");
      await waitForEditorHydration(page);
      await waitForHydratedButton(page, "Publish");
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect
        .poll(async () => {
          const [row] = await sql<{ title: string }[]>`
            select published_data -> 'disclaimer' ->> 'title' as title
            from content_documents
            where key = 'pages'
          `;
          return row?.title;
        }, { timeout: 30_000 })
        .toBe(editedTitle);

      await page.goto("/disclaimer");
      await expect(page.getByRole("heading", { level: 1, name: editedTitle })).toBeVisible();

      const revisions = await sql<{ version: number }[]>`
        select version from content_revisions where document_key = 'pages' order by version desc
      `;
      expect(revisions.length).toBeGreaterThan(1);

      // Restoring an older revision changes the draft only.
      await page.goto("/admin/content/pages");
      await waitForEditorHydration(page);
      await page
        .locator("aside")
        .getByRole("button", { name: /^Restore version/ })
        .last()
        .click();
      await page.getByRole("button", { name: "Restore into draft" }).click();
      await expect
        .poll(async () => {
          const [row] = await sql<{ title: string }[]>`
            select draft_data -> 'disclaimer' ->> 'title' as title
            from content_documents
            where key = 'pages'
          `;
          return row?.title;
        }, { timeout: 15_000 })
        .toBe("Disclaimer");

      await page.goto("/disclaimer");
      await expect(page.getByRole("heading", { level: 1, name: editedTitle })).toBeVisible();

      await page.goto("/admin/content/pages");
      await waitForEditorHydration(page);
      await waitForHydratedButton(page, "Publish");
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect
        .poll(async () => {
          const [row] = await sql<{ title: string }[]>`
            select published_data -> 'disclaimer' ->> 'title' as title
            from content_documents
            where key = 'pages'
          `;
          return row?.title;
        }, { timeout: 30_000 })
        .toBe("Disclaimer");

      await page.goto("/disclaimer");
      await expect(page.getByRole("heading", { level: 1, name: "Disclaimer" })).toBeVisible();
    } finally {
      await sql`
        delete from content_revisions
        where document_key = 'pages' and version > ${original.published_version}
      `.catch(() => undefined);
      await sql`
        update content_documents
        set draft_data = ${sql.json(original.draft_data)},
            published_data = ${sql.json(original.published_data)},
            draft_version = ${original.draft_version},
            published_version = ${original.published_version}
        where key = 'pages'
      `.catch(() => undefined);
      await sql.end({ timeout: 2 });
    }
  });

  test("uploaded media stays private, resists deletion while referenced, then deletes", async ({
    page,
  }, testInfo) => {
    test.skip(!(await databaseReachable()), "CMS database is not reachable");
    test.skip(testInfo.project.name !== "desktop-chromium", "Content mutations run once per suite");

    const sql = database();
    const alt = `E2E media ${Date.now()}`;
    let mediaId = "";
    const [original] = await sql<{ draft_data: Record<string, never>; draft_version: number }[]>`
      select draft_data, draft_version from content_documents where key = 'pages'
    `;

    try {
      await signIn(page, environment.adminEmail!, environment.adminPassword!);
      await page.goto("/admin/media");
      await waitForMediaHydration(page);
      await page.getByRole("button", { name: "Upload image", exact: true }).first().click();
      await page.locator("#media-file").setInputFiles({
        name: "e2e-content-image.png",
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
      await page.locator("#media-alt").fill(alt);
      await page.getByRole("button", { name: "Upload", exact: true }).click();
      let uploaded: { id: string } | undefined;
      await expect
        .poll(async () => {
          [uploaded] = await sql<{ id: string }[]>`
            select id from content_media where default_alt = ${alt} order by created_at desc limit 1
          `;
          return uploaded?.id;
        }, { timeout: 15_000 })
        .toMatch(/^[a-f0-9]{32}$/);

      const card = page.locator("li").filter({ has: page.getByRole("img", { name: alt }) });
      await expect(card).toContainText("Draft only");
      mediaId = uploaded?.id ?? "";
      expect(mediaId).toMatch(/^[a-f0-9]{32}$/);

      // Unpublished media is not served to anonymous visitors.
      const anonymous = await page.context().browser()!.newContext();
      const response = await anonymous.request.get(
        `/content-media/${mediaId}/e2e-content-image.png`,
        { failOnStatusCode: false },
      );
      expect(response.status()).toBe(404);
      await anonymous.close();

      // Referenced images cannot be deleted.
      const draft = structuredClone(original.draft_data) as Record<
        string,
        { blocks: Array<Record<string, string>> }
      >;
      draft.disclaimer.blocks.push({ type: "media", mediaId, mediaAlt: alt, caption: "" });
      await sql`
        update content_documents
        set draft_data = ${sql.json(draft)}, draft_version = draft_version + 1
        where key = 'pages'
      `;

      await page.goto("/admin/media");
      await waitForMediaHydration(page);
      await card.getByRole("button", { name: /Actions for/ }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await expect(page.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
      await expect
        .poll(async () => {
          const rows = await sql<{ id: string }[]>`select id from content_media where id = ${mediaId}`;
          return rows.length;
        }, { timeout: 15_000 })
        .toBe(1);

      await sql`
        update content_documents
        set draft_data = ${sql.json(original.draft_data)}, draft_version = ${original.draft_version}
        where key = 'pages'
      `;

      await page.goto("/admin/media");
      await waitForMediaHydration(page);
      await card.getByRole("button", { name: /Actions for/ }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Delete permanently" }).click();
      await expect(page.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
      await expect(card).toHaveCount(0);

      await expect
        .poll(async () => {
          const remaining = await sql<{ id: string }[]>`
            select id from content_media where id = ${mediaId}
          `;
          return remaining.length;
        }, { timeout: 15_000 })
        .toBe(0);
    } finally {
      await sql`
        update content_documents
        set draft_data = ${sql.json(original.draft_data)}, draft_version = ${original.draft_version}
        where key = 'pages'
      `.catch(() => undefined);
      if (mediaId) await sql`delete from content_media where id = ${mediaId}`.catch(() => undefined);
      await sql.end({ timeout: 2 });
    }
  });

  test("staff accounts can edit drafts but cannot publish or manage users", async ({
    page,
  }, testInfo) => {
    test.skip(!(await databaseReachable()), "CMS database is not reachable");
    test.skip(testInfo.project.name !== "desktop-chromium", "Content mutations run once per suite");

    const sql = database();
    const email = `e2e-staff-${Date.now()}@example.com`;
    const password = "StaffTemporary123";

    try {
      await sql`
        insert into staff_users (email, password_hash, name, role, must_change_password)
        values (${email}, ${await hashPassword(password)}, 'E2E Staff', 'staff', true)
      `;

      // A temporary password forces a change before any CMS screen opens.
      await signIn(page, email, password, /\/admin\/change-password$/);
      await expect(page).toHaveURL(/\/admin\/change-password$/);
      await page.goto("/admin/content");
      await expect(page).toHaveURL(/\/admin\/change-password$/);

      await sql`update staff_users set must_change_password = false where email = ${email}`;
      await page.goto("/admin/content/site");
      await waitForEditorHydration(page);
      await expect(page.getByRole("button", { name: "Save draft" }).first()).toBeVisible();

      // Every editor control keeps an accessible name for keyboard and screen-reader use.
      const unnamedFields = await page.locator("main input:visible, main textarea:visible, main select:visible").evaluateAll(
        (elements) =>
          elements.filter((element) => {
            const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const label = element.closest("label")?.textContent?.trim();
            return !(
              label ||
              control.labels?.length ||
              element.getAttribute("aria-label") ||
              element.getAttribute("aria-labelledby") ||
              element.getAttribute("title")
            );
          }).length,
      );
      expect(unnamedFields).toBe(0);
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Restore version/ })).toHaveCount(0);

      await page.goto("/admin/users");
      await expect(page).not.toHaveURL(/\/admin\/users$/);
      await expect(page.getByRole("button", { name: "Create" })).toHaveCount(0);

      // Deactivating the account invalidates its live session immediately.
      await page.context().clearCookies();
      await signIn(page, environment.adminEmail!, environment.adminPassword!);
      await page.goto("/admin/users");
      await waitForUsersHydration(page);
      const row = page.locator("li").filter({ hasText: email });
      await row.getByRole("button", { name: /Actions for/ }).click();
      await page.getByRole("menuitem", { name: "Edit account" }).click();
      await page.getByRole("switch", { name: "Account is active" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("heading", { name: "Edit account" })).toHaveCount(0);

      let deactivated: { is_active: boolean; session_version: number } | undefined;
      await expect
        .poll(async () => {
          [deactivated] = await sql<{ is_active: boolean; session_version: number }[]>`
            select is_active, session_version from staff_users where email = ${email}
          `;
          return deactivated?.is_active;
        }, { timeout: 15_000 })
        .toBe(false);
      expect(deactivated?.is_active).toBe(false);
      expect(deactivated?.session_version).toBeGreaterThan(1);

      await page.context().clearCookies();
      await page.goto("/admin/login");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toContainText("Invalid email or password");
    } finally {
      await sql`delete from staff_users where email = ${email}`.catch(() => undefined);
      await sql.end({ timeout: 2 });
    }
  });

  test("administrators cannot deactivate themselves or remove the last administrator", async ({
    page,
  }, testInfo) => {
    test.skip(!(await databaseReachable()), "CMS database is not reachable");
    test.skip(testInfo.project.name !== "desktop-chromium", "Content mutations run once per suite");

    const sql = database();
    try {
      const activeAdmins = await sql<{ email: string }[]>`
        select email from staff_users where role = 'admin' and is_active = true
      `;

      await signIn(page, environment.adminEmail!, environment.adminPassword!);
      await page.goto("/admin/users");
      await waitForUsersHydration(page);
      const own = page.locator("li").filter({ hasText: environment.adminEmail!.toLowerCase() });
      await own.getByRole("button", { name: /Actions for/ }).click();
      await page.getByRole("menuitem", { name: "Edit account" }).click();
      await page.getByRole("switch", { name: "Account is active" }).click();
      const save = page.getByRole("button", { name: "Save changes" });
      await save.click();
      await expect(save).toBeDisabled();
      await expect(save).toBeEnabled();

      if (activeAdmins.length === 1) {
        await page.reload();
        await waitForUsersHydration(page);
        await own.getByRole("button", { name: /Actions for/ }).click();
        await page.getByRole("menuitem", { name: "Edit account" }).click();
        await page.getByRole("combobox", { name: "Role" }).click();
        await page.getByRole("option", { name: /^Staff/ }).click();
        const demote = page.getByRole("button", { name: "Save changes" });
        await demote.click();
        await expect(demote).toBeDisabled();
        await expect(demote).toBeEnabled();
      }

      const [unchanged] = await sql<{ is_active: boolean; role: string }[]>`
        select is_active, role from staff_users where email = ${environment.adminEmail!.toLowerCase()}
      `;
      expect(unchanged).toMatchObject({ is_active: true, role: "admin" });
    } finally {
      await sql.end({ timeout: 2 });
    }
  });
});
