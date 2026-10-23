import { expect, test } from "@playwright/test";

import { shopifyE2EConfigured } from "./test-environment";

const routes = [
  "/",
  "/products?category=all&availability=all&sort=newest",
  "/products/siemens-burners-qrb3-flame-detector",
  "/credit-account",
  "/contact-us",
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "spares-automation-cookie-consent-v1",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
});

for (const route of routes) {
  test(`${route} keeps its core accessibility contract`, async ({ page }) => {
    test.skip(
      route.startsWith("/products") && !shopifyE2EConfigured,
      "Shopify catalogue credentials are not configured",
    );
    await page.goto(route);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("img:not([alt])")).toHaveCount(0);

    const diagnostics = await page.evaluate(() => {
      const duplicateIds = [...document.querySelectorAll<HTMLElement>("[id]")]
        .map((element) => element.id)
        .filter((id, index, ids) => id && ids.indexOf(id) !== index);
      const unnamedControls = [...document.querySelectorAll<HTMLElement>("button, input, select, textarea")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .filter((element) => {
          const input = element as HTMLInputElement;
          if (["hidden", "submit"].includes(input.type)) return false;
          const labelledBy = element.getAttribute("aria-labelledby");
          const labelledByText = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? "")
                .join(" ")
            : "";
          const labels = "labels" in input ? [...(input.labels ?? [])].map((label) => label.textContent ?? "").join(" ") : "";
          return ![
            element.getAttribute("aria-label"),
            labelledByText,
            labels,
            element.textContent,
            input.placeholder,
            input.value,
          ].some((value) => value?.trim());
        })
        .map((element) => element.outerHTML.slice(0, 180));

      return {
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        duplicateIds: [...new Set(duplicateIds)],
        unnamedControls,
      };
    });

    expect(diagnostics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(diagnostics.duplicateIds).toEqual([]);
    expect(diagnostics.unnamedControls).toEqual([]);
  });
}

test("web-vitals endpoint accepts a valid same-site metric", async ({ request }) => {
  const response = await request.post("/api/web-vitals", {
    data: { name: "LCP", value: 1234.5, path: "/test", navigationId: "playwright" },
  });
  expect(response.status()).toBe(204);
});

test("catalogue loads additional products without replacing the current results", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  await page.goto("/products?category=all&availability=all&sort=newest");
  const cards = page.locator(".product-card");
  const initialCount = await cards.count();
  expect(initialCount).toBeLessThanOrEqual(12);

  const loadMore = page.getByRole("button", { name: /load more/i });
  if (await loadMore.isVisible()) {
    await loadMore.click();
    await expect.poll(() => cards.count()).toBeGreaterThan(initialCount);
  }
});
