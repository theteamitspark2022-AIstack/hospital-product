const { test, expect } = require("@playwright/test");

// Helper: log in and return the page already on /dashboard
async function loginAs(page, email, password) {
  await page.goto("/login");
  await page.fill("#loginEmail", email);
  await page.fill("#loginPassword", password);
  await page.click("button:has-text('Sign In')");
  await page.waitForURL(/dashboard/, { timeout: 10000 });
}

// NOTE: These tests require a running local server with a seeded owner account.
// Set TEST_OWNER_EMAIL and TEST_OWNER_PASSWORD in .env.test or as env vars.
const OWNER_EMAIL = process.env.TEST_OWNER_EMAIL || "owner@example.com";
const OWNER_PASS  = process.env.TEST_OWNER_PASSWORD || "Secret123";

test.describe("Dashboard (owner)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASS);
  });

  test("shows ITSpark logo in header", async ({ page }) => {
    const logo = page.locator("header img.brand-logo");
    await expect(logo).toBeVisible();
  });

  test("shows all owner tabs including Settings and Billing", async ({ page }) => {
    await expect(page.locator(".tab", { hasText: "Overview" })).toBeVisible();
    await expect(page.locator(".tab", { hasText: "Inbox" })).toBeVisible();
    await expect(page.locator(".tab", { hasText: "Tickets" })).toBeVisible();
    await expect(page.locator(".tab", { hasText: "Appointments" })).toBeVisible();
    await expect(page.locator(".tab", { hasText: "Settings" })).toBeVisible();
    await expect(page.locator(".tab", { hasText: "Billing" })).toBeVisible();
  });

  test("Overview tab shows stat cards", async ({ page }) => {
    await expect(page.locator(".stats-grid")).toBeVisible();
    const cards = page.locator(".stat-card");
    await expect(cards).toHaveCount(7);
  });

  test("can switch to Appointments tab", async ({ page }) => {
    await page.click(".tab:has-text('Appointments')");
    await expect(page.locator("#tab-appointments")).toBeVisible();
  });

  test("can switch to Settings tab", async ({ page }) => {
    await page.click(".tab:has-text('Settings')");
    await expect(page.locator("#tab-settings")).toBeVisible();
  });

  test("appointments tab shows booking form", async ({ page }) => {
    await page.click(".tab:has-text('Appointments')");
    await expect(page.locator("input[placeholder*='447']")).toBeVisible();
  });
});

test.describe("Unauthenticated access", () => {
  test("redirects /dashboard to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});
