import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  if (!sessionStorage.getItem("audit-consent-cleared")) {
    localStorage.removeItem("spares-automation-cookie-consent-v1");
    sessionStorage.setItem("audit-consent-cleared", "1");
  }
});
const page = await context.newPage();

await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
await page.getByRole("region", { name: "Cookie preferences" }).waitFor();
const initial = await page.evaluate(() => {
  const header = document.querySelector("header")?.getBoundingClientRect();
  const consent = document.querySelector('[aria-label="Cookie preferences"]')?.getBoundingClientRect();
  return {
    headerHeight: header?.height ?? 0,
    consentHeight: consent?.height ?? 0,
    consentCoveragePercent: consent ? Math.round((consent.height / innerHeight) * 1_000) / 10 : 0,
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});
await page.screenshot({ path: "audit-artifacts/home-improved-mobile.png", fullPage: true });

await page.getByRole("button", { name: "Reject" }).click();
await page.goto(
  "http://127.0.0.1:4173/products?category=all&availability=all&sort=newest",
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(300);
const catalogue = await page.evaluate(() => ({
  documentHeight: document.documentElement.scrollHeight,
  productCards: document.querySelectorAll(".product-card").length,
  loadMoreVisible: Boolean(
    [...document.querySelectorAll("button")].find((button) => /load more/i.test(button.textContent ?? "")),
  ),
  requestPriceCount: [...document.querySelectorAll("body *")].filter(
    (element) => element.children.length === 0 && element.textContent?.trim() === "Request price",
  ).length,
  imageUnavailableCount: [...document.querySelectorAll("body *")].filter(
    (element) => element.children.length === 0 && element.textContent?.trim() === "Image unavailable",
  ).length,
  overflow: document.documentElement.scrollWidth - innerWidth,
}));
await page.screenshot({ path: "audit-artifacts/products-improved-mobile.png", fullPage: true });

await page.goto("http://127.0.0.1:4173/credit-account", { waitUntil: "domcontentloaded" });
const creditHeadingCount = await page.locator("h1").count();

const vitalsResponse = await page.request.post("http://127.0.0.1:4173/api/web-vitals", {
  data: { name: "LCP", value: 1234.5, path: "/verification", navigationId: "audit-check" },
});

console.log(
  JSON.stringify(
    { initial, catalogue, creditHeadingCount, vitalsStatus: vitalsResponse.status() },
    null,
    2,
  ),
);
await browser.close();
