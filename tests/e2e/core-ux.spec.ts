import { expect, test } from "@playwright/test";

import { shopifyE2EConfigured } from "./test-environment";

test("homepage remains within the viewport and exposes working navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Industrial parts and automation spares",
  );
  await expect(page.getByRole("link", { name: "Aggregate feeding" }).first()).toHaveAttribute(
    "href",
    "/products?category=asphalt-aggregate-feeding&availability=all&sort=newest",
  );
  await expect(page.getByRole("link", { name: /Control Panels & Software/i })).toHaveAttribute(
    "href",
    "/products?category=control-panels-software&availability=all&sort=newest",
  );
  await expect(page.getByText("Browse sub-categories", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Sub-categories -/i)).toHaveCount(0);
  await expect(page.getByText("New Arrivals", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/attach it to an email or send it by WhatsApp/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    /wa\.me\/441618187420/,
  );
  const supportControls = await page
    .getByRole("button", { name: "Submit Request" })
    .or(page.getByRole("link", { name: "Email sales" }))
    .or(page.getByRole("link", { name: "WhatsApp" }))
    .evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
  expect(supportControls.every((height) => height <= 46)).toBeTruthy();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const clippedHeadings = await page
    .locator("main h2")
    .evaluateAll((headings) =>
      headings
        .filter((heading) => heading.scrollWidth > heading.clientWidth + 1)
        .map((heading) => heading.textContent),
    );
  expect(clippedHeadings).toEqual([]);
});

test("mobile navigation uses separate named controls", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile navigation test");
  page.on("pageerror", (error) => console.error("Browser page error:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Browser console error:", message.text());
  });
  await page.goto("/");
  const headerBox = await page.locator("header").boundingBox();
  expect(headerBox).not.toBeNull();
  expect(headerBox!.height).toBeLessThanOrEqual(150);
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeVisible();
  await expect(menu).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Sign in or register" })).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.getByRole("link", { name: /^Cart/ })).toBeVisible();
  await menu.click();
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Register", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "All Products", exact: true })).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Home Automation and Controls", exact: true }),
  ).toHaveAttribute("href", "/products?category=home-controls&availability=all&sort=newest");
  await expect(
    navigation.getByRole("link", { name: "Control Panels and Software", exact: true }),
  ).toHaveAttribute(
    "href",
    "/products?category=control-panels-software&availability=all&sort=newest",
  );
});

test("authentication controls and metadata are accessible", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Sign In | Spares Automation");
  await expect(page.getByRole("button", { name: "Show password" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});

test("customer password-reset links open the new-password form", async ({ page }) => {
  await page.goto("/account/reset/123456789/0123456789abcdef0123456789abcdef");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("new-password-123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("different-password-123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("alert")).toHaveText("The passwords do not match.");
});

test("first-party email links keep account activation and reset on site", async ({ page }) => {
  const activationUrl = encodeURIComponent(
    "https://example.myshopify.com/account/activate/123456789/0123456789abcdef0123456789abcdef",
  );
  await page.goto(`/activate?activation_url=${activationUrl}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Activate account" })).toBeVisible();
  await expect(
    page.getByText(/Choose a password to finish setting up your account/i),
  ).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("new-password-123");
  await page.getByLabel("Confirm new password", { exact: true }).fill("different-password-123");
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByRole("alert")).toHaveText("The passwords do not match.");

  const resetUrl = encodeURIComponent(
    "https://example.myshopify.com/account/reset/123456789/0123456789abcdef0123456789abcdef",
  );
  await page.goto(`/reset?reset_url=${resetUrl}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set new password" })).toBeVisible();
  await expect(page.getByText(/Shopify/i)).toHaveCount(0);
});

test("incomplete customer email links fail safely", async ({ page }) => {
  await page.goto("/activate");
  await expect(page.getByRole("alert")).toHaveText(
    "This activation link is incomplete or invalid.",
  );
  await expect(page.getByRole("link", { name: "Return to registration" })).toBeVisible();
});

test("contact methods are actionable and consistent", async ({ page }) => {
  await page.goto("/contact-us");
  await expect(page.getByRole("link", { name: /Technical Sales/ })).toHaveAttribute(
    "href",
    "tel:+441618187420",
  );
  await expect(page.getByRole("link", { name: /Email Enquiries/ })).toHaveAttribute(
    "href",
    "mailto:trade@spares-automation.co.uk",
  );
});

test("credit account link precedes sign in in the top bar", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop top bar test");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const credit = page.getByRole("link", { name: "Open Credit Account", exact: true });
  const signIn = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(credit).toHaveAttribute("href", "/credit-account");
  const order = await Promise.all(
    [credit, signIn].map((link) =>
      link.evaluate((element) => element.getBoundingClientRect().left),
    ),
  );
  expect(order[0]).toBeLessThan(order[1]);
});

test("trade account entry points and route are removed", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /open trade account/i })).toHaveCount(0);
  await expect(page.locator("footer").getByRole("link", { name: /trade account/i })).toHaveCount(0);

  const response = await page.goto("/trade-account");
  expect(response?.status()).toBe(404);
});

test("registration form stays inside a 320px phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/register");
  const outsideControls = await page.locator("input, select, button").evaluateAll((controls) =>
    controls
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return style.display !== "none" && (rect.left < -1 || rect.right > window.innerWidth + 1);
      })
      .map(
        (control) =>
          control.getAttribute("name") || control.getAttribute("aria-label") || control.textContent,
      ),
  );
  expect(outsideControls).toEqual([]);
});

test("registration requires acceptance of the legal terms", async ({ page }) => {
  await page.goto("/register");

  const consent = page.getByRole("checkbox", {
    name: /I agree to the Terms & Conditions and acknowledge the Privacy Policy/i,
  });
  await expect(consent).toBeVisible();
  await expect(consent).toHaveAttribute("required", "");
  await expect(page.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute(
    "href",
    "/terms-and-conditions",
  );
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy-policy",
  );
});

test("touch tablets keep homepage category choices visible", async ({ browser, isMobile }) => {
  test.skip(isMobile, "Runs once with an explicit touch-tablet context");
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".hero-range-panel").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Aggregate feeding" }).first()).toBeVisible();
  await context.close();
});

test("desktop hero hover fills the category panel with the range title", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop hover treatment");
  await page.goto("/");
  const firstRange = page.locator(".hero-range").first();
  await firstRange.hover();
  await expect(page.getByTestId("hero-hover-title-0")).toBeVisible();
  await expect(page.getByTestId("hero-hover-title-0")).toContainText(/Asphalt \/ Blacktop Spares/i);
});

test("homepage part finder uses the approved heading hierarchy and concise copy", async ({
  page,
}) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Need help finding a part?" });
  const instruction = page.getByText("Send a part number or product description.", { exact: true });
  await expect(heading).toBeVisible();
  await expect(instruction).toBeVisible();
  const sizes = await Promise.all([
    heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    instruction.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ]);
  expect(sizes[0]).toBeGreaterThan(sizes[1]);
  await expect(page.getByText(/Use this form for text details/i)).toHaveCount(0);
});

test("supported payment marks appear in the footer", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.getByRole("heading", { name: "Payments we support" })).toBeVisible();
  for (const method of ["Visa", "Mastercard", "Maestro", "Visa Electron", "PayPal"]) {
    await expect(footer.getByRole("img", { name: method, exact: true })).toBeVisible();
  }
});

test("all products keeps one search and a compact catalogue hero", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  await page.goto("/products");
  await expect(page.getByRole("searchbox")).toHaveCount(1);
  await expect(page.getByPlaceholder("Search within results...")).toHaveCount(0);

  const hero = page
    .getByRole("heading", { name: /all products catalogue/i })
    .locator("xpath=ancestor::section[1]");
  const box = await hero.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(181);

  await expect(page.getByRole("link", { name: /Control Panels & Software/i }).last()).toBeVisible();
  await expect(page.getByText("New Arrivals", { exact: true })).toHaveCount(0);
});

test("selecting a category updates the catalogue hero heading and metadata", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  await page.goto("/products?category=asphalt");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/asphalt/i);

  await page.goto("/products?category=concrete");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/concrete/i);
});

test("mobile category selection brings products into view", async ({ page, isMobile }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  test.skip(!isMobile, "Mobile catalogue behavior");
  await page.goto("/products?category=all&availability=all&sort=newest");

  const results = page.locator("#catalogue-results");
  const viewProducts = page.getByRole("button", { name: /View products/i });
  await expect(viewProducts).toBeVisible();
  await expect(viewProducts).toContainText("Results are shown below");

  await page
    .getByRole("complementary", { name: "Product collections" })
    .getByRole("link", { name: /Asphalt \/ Blacktop Spares/i })
    .click();

  await expect(page).toHaveURL(/category=asphalt/);
  await expect
    .poll(() => results.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(page.viewportSize()!.height);
  await expect(results.getByText("Asphalt / Blacktop Spares", { exact: true })).toBeVisible();
});

test("every product exposes tabbed support content and useful empty states", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  test.slow();
  await page.goto("/products");
  const firstProduct = page.locator('article a[href^="/products/"]').first();
  await expect(firstProduct).toBeVisible();
  await firstProduct.click();
  await page.waitForURL(/\/products\/[^/?#]+$/, { timeout: 20_000 });
  // Product-only chrome proves the route rendered, on phone and desktop alike.
  await expect(page.getByRole("tablist", { name: "Product support information" })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("PayPal accepted", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "PayPal", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Market price", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Taxes, duties, and delivery are confirmed at checkout/),
  ).toBeVisible();

  const protectedProductImage = page.getByRole("button", { name: /^Enlarge / }).locator("img");
  await expect(protectedProductImage).toHaveAttribute("draggable", "false");
  const contextMenuBlocked = await protectedProductImage.evaluate((image) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    return !image.dispatchEvent(event);
  });
  expect(contextMenuBlocked).toBeTruthy();
  const watermarkContent = await page
    .locator(".protected-image-frame")
    .first()
    .evaluate((frame) => getComputedStyle(frame, "::after").content);
  expect(watermarkContent).toContain("SPARES AUTOMATION");

  const enlargeButton = page.getByRole("button", { name: /^Enlarge / });
  await expect(enlargeButton).toHaveText("");
  await enlargeButton.click();
  const imageViewer = page.getByRole("dialog");
  await expect(imageViewer).toBeVisible();
  await imageViewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(imageViewer.getByText("Zoom 150%")).toBeVisible();
  await imageViewer.getByRole("button", { name: "Close" }).click();
  await expect(imageViewer).toBeHidden();

  const videoTab = page.getByRole("tab", { name: "Video Guide" });
  const pdfTab = page.getByRole("tab", { name: "PDF Guide" });
  const descriptionTab = page.getByRole("tab", { name: "Product Details" });
  await expect(videoTab).toBeVisible();
  await expect(pdfTab).toBeVisible();
  await expect(descriptionTab).toBeVisible();
  await expect(descriptionTab).toHaveAttribute("aria-selected", "true");

  const tabLabels = await page.getByRole("tab").allTextContents();
  expect(tabLabels.map((label) => label.trim())).toEqual([
    "Product Details",
    "PDF Guide",
    "Video Guide",
  ]);

  await pdfTab.click();
  await expect(pdfTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText(/PDF|Datasheet|Manual/i);

  await descriptionTab.click();
  await expect(descriptionTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).not.toBeEmpty();

  const supportBox = await page.getByRole("heading", { name: "Product Support" }).boundingBox();
  const questionBox = await page.getByRole("heading", { name: "Got a question?" }).boundingBox();
  expect(supportBox).not.toBeNull();
  expect(questionBox).not.toBeNull();
  expect(questionBox!.y).toBeGreaterThan(supportBox!.y);
});

test("YouTube videos require disclaimer consent before loading", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  await page.goto("/products/siemens-burners-qrb3-flame-detector");
  // Tabs are client-side, so wait for hydration before driving them.
  await page.waitForLoadState("networkidle");
  const videoTab = page.getByRole("tab", { name: "Video Guide" });
  await videoTab.click();
  await expect(videoTab).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });

  await expect(page.getByRole("heading", { name: "YouTube video disclaimer" })).toBeVisible();
  await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toHaveCount(0);

  const consent = page.getByRole("checkbox", {
    name: /I understand this disclaimer and agree to load the YouTube video/i,
  });
  const loadVideo = page.getByRole("button", { name: "Agree and load YouTube video" });
  await expect(consent).not.toBeChecked();
  await expect(loadVideo).toBeDisabled();

  await consent.check();
  await expect(loadVideo).toBeEnabled();
  await loadVideo.click();

  await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "YouTube video disclaimer" })).toHaveCount(0);
});

test("customers can build a quote from a product", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  test.slow();
  await page.goto("/products");
  const firstProduct = page.locator('article a[href^="/products/"]').first();
  await expect(firstProduct).toBeVisible();
  await firstProduct.click();
  await page.waitForURL(/\/products\/[^/?#]+$/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Build a quote" })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");

  const productTitle = (await page.getByRole("heading", { level: 1 }).textContent())?.trim();
  // The button stores the item in the browser, so it only works once React has hydrated.
  const buildQuote = page.getByRole("button", { name: "Build a quote" });
  await expect(buildQuote).toBeEnabled();
  await buildQuote.click();

  // Navigation is client-side, so wait for the quote page to render, not just its URL.
  await expect(page.getByRole("heading", { level: 1, name: "My Quote" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/\/quote$/);
  await expect(page.getByRole("heading", { name: "Quote summary" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit quote" })).toBeVisible();
  if (productTitle) await expect(page.getByText(productTitle, { exact: true })).toBeVisible();
});

test("category labels and legacy route match the approved catalogue wording", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  await page.goto("/asphalt");
  await expect(page).toHaveURL(/\/products\?category=asphalt&availability=all&sort=newest$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ALL PRODUCTS CATALOGUE");

  for (const label of [
    "Aggregate feeding",
    "Burner / Drying",
    "Bitumen",
    "Hot storage / silos",
    "Baghouse",
    "Mixing Tower",
  ]) {
    await expect(
      page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first(),
    ).toBeVisible();
  }

  await page.goto("/new-arrivals");
  await expect(page).toHaveURL(
    /\/products\?category=control-panels-software&availability=all&sort=newest$/,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ALL PRODUCTS CATALOGUE");
});

test("resource navigation accurately describes the request service", async ({ page }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  await page.goto("/");
  await expect(
    page.locator('header a[href="/resources"]', { hasText: "PDF and Videos" }),
  ).toHaveAttribute("href", "/resources");
  await page.goto("/resources");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("PDFs, manuals & videos");
  const hero = heading.locator("xpath=ancestor::section[1]");
  const box = await hero.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(181);
  await expect(page.getByText(/arranged by category/i)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Resource library is being updated/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: /PDFs & Videos/i }).first(),
  ).toBeVisible();
  await expect(page.getByText("Product resources").first()).toBeVisible();
});

test("main navigation uses the approved labels and routes", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop navigation test");
  await page.setViewportSize({ width: 1900, height: 900 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const items = [
    ["All Products", "/products?category=all&availability=all&sort=newest"],
    ["Asphalt Blacktop", "/products?category=asphalt&availability=all&sort=newest"],
    ["Readymix Concrete", "/products?category=concrete&availability=all&sort=newest"],
    ["Packing Machinery", "/products?category=packing&availability=all&sort=newest"],
    ["Automation and Drives", "/products?category=automation&availability=all&sort=newest"],
    [
      "Home Automation and Controls",
      "/products?category=home-controls&availability=all&sort=newest",
    ],
    [
      "Control Panels and Software",
      "/products?category=control-panels-software&availability=all&sort=newest",
    ],
    ["PDF and Videos", "/resources"],
    ["Contact", "/contact-us"],
  ] as const;

  for (const [label, href] of items) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "href",
      href,
    );
  }

  const overflow = await navigation.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const itemRows = await navigation
    .getByRole("link")
    .evaluateAll(
      (links) => new Set(links.map((link) => Math.round(link.getBoundingClientRect().top))).size,
    );
  expect(itemRows).toBe(1);
  const edgeGaps = await navigation.getByRole("link").evaluateAll((links) => {
    const first = links[0].getBoundingClientRect();
    const last = links[links.length - 1].getBoundingClientRect();
    return { left: first.left, right: window.innerWidth - last.right };
  });
  expect(edgeGaps.left).toBeLessThanOrEqual(40);
  expect(edgeGaps.right).toBeLessThanOrEqual(40);
  await expect(navigation.getByRole("link").first()).toHaveCSS("font-size", "12px");

  await page.setViewportSize({ width: 1280, height: 900 });
  const compactRows = await navigation
    .getByRole("link")
    .evaluateAll(
      (links) => new Set(links.map((link) => Math.round(link.getBoundingClientRect().top))).size,
    );
  expect(compactRows).toBe(1);

  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(navigation).toBeHidden();
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
});

test("category entry points use the unified catalogue layout", async ({ page, isMobile }) => {
  test.skip(!shopifyE2EConfigured, "Shopify catalogue credentials are not configured");
  test.skip(isMobile, "Desktop category navigation test");
  await page.setViewportSize({ width: 1900, height: 500 });
  await page.goto("/products?category=all&availability=all&sort=newest");
  const sidebar = page.getByRole("complementary", { name: "Product collections" });

  await expect(sidebar.getByRole("link", { name: "Lighting", exact: true })).toHaveCount(0);
  await sidebar.getByRole("link", { name: /Home Automation and Controls/i }).click();

  await expect(page).toHaveURL(/\/products\?category=home-controls&availability=all&sort=newest$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ALL PRODUCTS CATALOGUE");
  await expect(
    sidebar.getByRole("button", { name: "Collapse Home Automation and Controls" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar.getByRole("link", { name: "Lighting", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Security", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Baghouse", exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 300);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(sidebar).toHaveCSS("position", "sticky");
  await expect(sidebar).toHaveCSS("overflow-y", "auto");
  await expect(sidebar).toHaveCSS("scrollbar-width", "none");
  const sidebarMetrics = await sidebar.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    top: element.getBoundingClientRect().top,
  }));
  expect(sidebarMetrics.scrollHeight).toBeGreaterThan(sidebarMetrics.clientHeight);
  expect(sidebarMetrics.top).toBeCloseTo(180, 0);

  await sidebar.getByRole("link", { name: "Lighting", exact: true }).click();
  await expect(page).toHaveURL(/\/products\?category=lighting&availability=all&sort=newest$/);

  await page.goto("/home-controls?line=lighting");
  await expect(page).toHaveURL(/\/products\?category=lighting&availability=all&sort=newest$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ALL PRODUCTS CATALOGUE");
});

test("information pages use completed compact content flows", async ({ page }) => {
  await page.goto("/about-us");
  await expect(
    page.getByRole("heading", { level: 1, name: "About Spares Automation" }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("heading", { level: 2 })).toHaveCount(4);
  await expect(page.locator("main img")).toHaveCount(0);

  await page.goto("/contact-us");
  await expect(
    page.getByRole("heading", { level: 1, name: "Contact Spares Automation" }),
  ).toBeVisible();
  const contactHero = page
    .getByRole("heading", { level: 1, name: "Contact Spares Automation" })
    .locator("xpath=ancestor::section[1]");
  const contactHeroBox = await contactHero.boundingBox();
  expect(contactHeroBox).not.toBeNull();
  expect(contactHeroBox!.height).toBeLessThanOrEqual(181);
  await expect(page.getByText(/Speak with the sales desk/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  await expect(page.locator("main img")).toHaveCount(0);
});

test("product question requires product details and contact email", async ({ page }) => {
  await page.goto("/contact-us");

  const productDetails = page.getByLabel("Part or product details *");
  const contactEmail = page.getByLabel("Contact email *");
  await expect(productDetails).toHaveAttribute("required", "");
  await expect(contactEmail).toHaveAttribute("required", "");

  await contactEmail.fill("buyer@example.com");
  await page.getByLabel("How can we help?").fill("Please help identify this item.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(productDetails).toBeFocused();

  await productDetails.fill("Unknown actuator shown in attached photo");
  await contactEmail.fill("");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(contactEmail).toBeFocused();
});

test("tracking page collects the required details", async ({ page }) => {
  await page.goto("/track-order");
  await expect(page.getByRole("textbox", { name: "Order number" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  await expect(page.getByRole("link", { name: /View account orders/ })).toHaveAttribute(
    "href",
    "/account",
  );
});

test("crawler files are available", async ({ request }) => {
  expect((await request.get("/robots.txt")).ok()).toBeTruthy();
  expect((await request.get("/sitemap.xml")).ok()).toBeTruthy();
});
