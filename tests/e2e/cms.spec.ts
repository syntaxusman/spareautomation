import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

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
const cmsTestEnv = {
  databaseUrl: process.env.DATABASE_URL || fileEnv.DATABASE_URL,
  adminEmail: process.env.ADMIN_SEED_EMAIL || fileEnv.ADMIN_SEED_EMAIL,
  adminPassword: process.env.ADMIN_SEED_PASSWORD || fileEnv.ADMIN_SEED_PASSWORD,
};
const cmsIntegrationConfigured = Boolean(
  cmsTestEnv.databaseUrl && cmsTestEnv.adminEmail && cmsTestEnv.adminPassword,
);

let reachable: Promise<boolean> | null = null;

/** The CMS database is optional locally, so integration tests skip when it is down. */
function databaseReachable() {
  if (!cmsIntegrationConfigured) return Promise.resolve(false);
  reachable ??= (async () => {
    const sql = postgres(cmsTestEnv.databaseUrl!, { max: 1, prepare: false, connect_timeout: 5 });
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

test("unauthenticated staff are redirected from /admin to the login page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to the CMS" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("admin login rejects an empty submission and stays on the page", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to the CMS" })).toBeVisible();
});

test("credit account page exposes the credit application form", async ({ page }) => {
  await page.goto("/credit-account");
  await expect(page.getByRole("heading", { name: "Apply for credit terms" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Registered company name" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Requested credit limit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();
});

test("homepage part inquiry form offers an optional photo upload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Photo (optional)")).toBeVisible();
});

test("product question form accepts multiple image and document attachments", async ({ page }) => {
  await page.goto("/got-a-question");
  const attachments = page.getByLabel("Attach files (optional)");
  await expect(attachments).toBeVisible();
  await expect(attachments).toHaveAttribute("multiple", "");
  await expect(attachments).toHaveAttribute("accept", /application\/pdf/);
  await expect(page.getByText("Maximum 10 MB each and 25 MB combined.")).toBeVisible();
});

test("returns page directs signed-out customers to their account", async ({ page }) => {
  await page.goto("/returns");
  await expect(page.getByRole("heading", { name: "Returns", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to start a return" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).last()).toHaveAttribute(
    "href",
    "/login?redirect=%2Freturns",
  );
});

test("return request persists in the CMS with an email reference", async ({ page }, testInfo) => {
  test.skip(!(await databaseReachable()), "CMS database is not reachable");
  test.skip(testInfo.project.name !== "desktop-chromium", "Database mutation runs once per suite");
  test.skip(true, "Requires an authenticated Shopify customer and order fixture");

  const unique = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `return-${unique}@example.com`;
  const orderNumber = `#RET-${unique}`;
  const sql = postgres(cmsTestEnv.databaseUrl!, { max: 1, prepare: false });

  try {
    await page.goto("/returns", { waitUntil: "networkidle" });
    await page.getByLabel("Order number *").fill(orderNumber);
    await page.getByLabel("Product name or part number *").fill("Siemens return test");
    await page.getByLabel("Quantity *").fill("2");
    await page.getByLabel("Reason for return *").selectOption("damaged");
    await page.getByLabel("What happened? (optional)").fill("Outer packaging damaged");
    await page.getByLabel("Contact name *").fill("Returns E2E");
    await page.getByLabel("Email address *").fill(email);
    await page.getByRole("button", { name: "Submit return request" }).click();

    await expect(page.getByText(/Your reference is SA-/)).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(async () => {
        const rows = await sql<
          { type: string; order_number: string; items: string; total: string }[]
        >`
          select type::text,
                 payload->>'Order number' as order_number,
                 payload->>'Items being returned' as items,
                 payload->>'Total quantity' as total
          from submissions
          where contact_email = ${email}
        `;
        return rows[0];
      })
      .toMatchObject({
        type: "return_request",
        order_number: orderNumber,
        total: "2",
      });

    const [row] = await sql<{ items: string }[]>`
      select payload->>'Items being returned' as items
      from submissions
      where contact_email = ${email}
    `;
    expect(row.items).toContain("Siemens return test");
    expect(row.items).toContain("Damaged in delivery");
  } finally {
    await sql`delete from submissions where contact_email = ${email}`.catch(() => undefined);
    await sql.end({ timeout: 2 });
  }
});

test("public submission persists and staff can review, update, and annotate it", async ({
  page,
}, testInfo) => {
  test.skip(!(await databaseReachable()), "CMS database is not reachable");
  test.skip(testInfo.project.name !== "desktop-chromium", "Database mutation runs once per suite");

  const unique = `${testInfo.project.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `cms-${unique}@example.com`;
  const note = `E2E note ${unique}`;
  const sql = postgres(cmsTestEnv.databaseUrl!, { max: 1, prepare: false });

  try {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByLabel("Your name").fill("CMS E2E");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Part Number", { exact: true }).fill(`PART-${unique}`);
    await page.getByLabel("Description").fill("Database-backed CMS workflow test");
    await page.getByLabel("Photo (optional)").setInputFiles({
      name: 'unsafe" onload="alert(1).png',
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    const invalidFields = await page
      .locator("form:has(#part-number) :invalid")
      .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).name));
    expect(invalidFields).toEqual([]);
    await page.getByRole("button", { name: "Submit Request" }).click();

    const confirmation = page.getByRole("status");
    await expect(confirmation).toContainText("SA-", { timeout: 20_000 });
    const reference = (await confirmation.locator("strong").textContent())?.trim();
    expect(reference).toMatch(/^SA-\d{4}-\d{6}$/);

    await expect
      .poll(async () => {
        const rows = await sql<
          {
            status: string;
            attachment_count: number;
            filename: string | null;
          }[]
        >`
          select s.status,
                 count(a.id)::int as attachment_count,
                 max(a.filename) as filename
          from submissions s
          left join attachments a on a.submission_id = s.id
          where s.contact_email = ${email}
          group by s.id
        `;
        return rows[0];
      })
      .toMatchObject({
        status: "new",
        attachment_count: 1,
        filename: "unsafe_ onload__alert_1_.png",
      });

    await page.goto("/admin/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email address").fill(cmsTestEnv.adminEmail!);
    await page.getByLabel("Password").fill(cmsTestEnv.adminPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin(?:\?|$)/);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

    await page.goto("/admin/submissions");
    await expect(page).toHaveURL(/\/admin\/submissions/);
    await page.getByPlaceholder("Reference, email, name or company").fill(email);
    await page.getByRole("link", { name: reference! }).click();

    await page.getByRole("button", { name: "In review" }).click();
    await expect(page.getByRole("status")).toContainText("Status updated");
    await page.getByPlaceholder("Add an internal note (visible to staff only)").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(note)).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => {
        const rows = await sql<{ status: string; note: string | null }[]>`
          select s.status, max(n.body) as note
          from submissions s
          left join submission_notes n on n.submission_id = s.id
          where s.contact_email = ${email}
          group by s.id
        `;
        return rows[0];
      })
      .toEqual({ status: "in_review", note });
  } finally {
    const files = await sql<{ path: string }[]>`
      select a.path
      from attachments a
      join submissions s on s.id = a.submission_id
      where s.contact_email = ${email}
    `.catch(() => []);
    await sql`delete from submissions where contact_email = ${email}`.catch(() => undefined);
    await sql.end({ timeout: 2 });
    await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
  }
});

test("honeypot submissions are rejected without creating a row", async ({ page }, testInfo) => {
  test.skip(!(await databaseReachable()), "CMS database is not reachable");
  test.skip(testInfo.project.name !== "desktop-chromium", "Database mutation runs once per suite");

  const email = `spam-${testInfo.project.name}-${Date.now()}@example.com`;
  const sql = postgres(cmsTestEnv.databaseUrl!, { max: 1, prepare: false });
  try {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Part Number", { exact: true }).fill("SPAM");
    await page.locator('input[name="website"]').fill("https://spam.example");
    await page.getByRole("button", { name: "Submit Request" }).click();
    await expect(page.getByRole("alert")).toBeVisible();

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from submissions where contact_email = ${email}
    `;
    expect(rows[0].count).toBe(0);
  } finally {
    await sql.end({ timeout: 2 });
  }
});
