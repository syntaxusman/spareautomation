import { chromium } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";
const routes = [
  "/",
  "/products?category=all&availability=all&sort=newest",
  "/search?q=valve",
  "/products/siemens-burners-qrb3-flame-detector",
  "/cart",
  "/quote",
  "/resources",
  "/contact-us",
  "/about-us",
  "/delivery-information",
  "/returns",
  "/credit-account",
  "/login",
  "/register",
  "/forgot-password",
  "/track-order",
  "/got-a-question",
  "/terms-and-conditions",
  "/returns-policy",
  "/privacy-policy",
  "/cookies",
  "/disclaimer",
  "/unsubscribe",
  "/account",
  "/admin/login",
];

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem(
      "spares-automation-cookie-consent-v1",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  const page = await context.newPage();

  for (const route of routes) {
    const errors = [];
    const onPageError = (error) => errors.push(`pageerror: ${error.message}`);
    const onConsole = (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);

    const started = Date.now();
    let status = null;
    let navigationError = null;
    try {
      const response = await page.goto(`${baseURL}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      status = response?.status() ?? null;
      await page.waitForTimeout(250);
    } catch (error) {
      navigationError = error.message;
    }

    const metrics = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const accessibleName = (element) => {
        if (element.getAttribute("aria-label")) return element.getAttribute("aria-label").trim();
        if (element.getAttribute("title")) return element.getAttribute("title").trim();
        if (element.labels?.length) return [...element.labels].map((label) => label.innerText).join(" ").trim();
        return (element.innerText || element.getAttribute("alt") || element.getAttribute("placeholder") || "").trim();
      };
      const controls = [...document.querySelectorAll("button, input, select, textarea, a")].filter(visible);
      const compactControls = controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      });
      const undersizedControls = controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 24 || rect.height < 24;
      });
      const unnamedControls = controls.filter((element) => !accessibleName(element));
      const tinyText = [...document.querySelectorAll("body *")].filter((element) => {
        if (!visible(element) || element.children.length) return false;
        const text = element.textContent?.trim();
        if (!text) return false;
        return Number.parseFloat(getComputedStyle(element).fontSize) < 12;
      });
      return {
        title: document.title,
        h1Count: document.querySelectorAll("h1").length,
        h1: [...document.querySelectorAll("h1")].map((element) => element.textContent?.trim()),
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        headerHeight: document.querySelector("header")?.getBoundingClientRect().height ?? 0,
        productCards: document.querySelectorAll("main article").length,
        imagesMissingAlt: document.querySelectorAll("img:not([alt])").length,
        compactControlCount: compactControls.length,
        undersizedControlCount: undersizedControls.length,
        unnamedControlCount: unnamedControls.length,
        tinyTextCount: tinyText.length,
      };
    });

    results.push({
      viewport: viewport.name,
      route,
      status,
      durationMs: Date.now() - started,
      finalUrl: page.url(),
      navigationError,
      consoleErrors: errors,
      ...metrics,
    });
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
  await context.close();
}

const consentContext = await browser.newContext({ viewport: viewports[0] });
const consentPage = await consentContext.newPage();
await consentPage.goto(baseURL, { waitUntil: "domcontentloaded" });
await consentPage.waitForTimeout(300);
const consentMetrics = await consentPage.evaluate(() => {
  const banner = document.querySelector('[aria-label="Cookie preferences"]');
  const rect = banner?.getBoundingClientRect();
  return rect
    ? {
        height: rect.height,
        viewportHeight: innerHeight,
        viewportCoveragePercent: Math.round((rect.height / innerHeight) * 1000) / 10,
      }
    : null;
});
await consentContext.close();
await browser.close();

console.log(JSON.stringify({ results, consentMetrics }, null, 2));
