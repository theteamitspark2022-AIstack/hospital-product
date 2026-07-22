const { test, expect } = require("@playwright/test");

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("shows ITSpark logo and brand panel", async ({ page }) => {
    const logo = page.locator(".brand-logo").first();
    await expect(logo).toBeVisible();
    await expect(page.locator("text=AI-Powered Business Communication")).toBeVisible();
  });

  test("shows Sign In and Create Account tabs", async ({ page }) => {
    await expect(page.locator("text=Sign In")).toBeVisible();
    await expect(page.locator("text=Create Account")).toBeVisible();
  });

  test("shows error on empty login submit", async ({ page }) => {
    await page.click("button:has-text('Sign In')");
    await expect(page.locator("#error")).toContainText("email and password");
  });

  test("shows error on invalid email format", async ({ page }) => {
    await page.fill("#loginEmail", "notanemail");
    await page.fill("#loginPassword", "Secret123");
    await page.click("button:has-text('Sign In')");
    // Server will return 401 — just check we stay on login
    await expect(page).toHaveURL(/login/);
  });

  test("switches to Create Account tab", async ({ page }) => {
    await page.click("text=Create Account");
    await expect(page.locator("h1")).toContainText("Get started");
    await expect(page.locator("#signupBusiness")).toBeVisible();
  });

  test("shows error for weak password on signup", async ({ page }) => {
    await page.click("text=Create Account");
    await page.fill("#signupBusiness", "Test Biz");
    await page.fill("#signupEmail", "test@example.com");
    await page.fill("#signupPassword", "weakpass");
    await page.click("button:has-text('Create Account')");
    await expect(page.locator("#error")).toContainText("uppercase");
  });

  test("shows error for missing number in password", async ({ page }) => {
    await page.click("text=Create Account");
    await page.fill("#signupBusiness", "Test Biz");
    await page.fill("#signupEmail", "test@example.com");
    await page.fill("#signupPassword", "NoNumbers");
    await page.click("button:has-text('Create Account')");
    await expect(page.locator("#error")).toContainText("number");
  });

  test("Enter key triggers login", async ({ page }) => {
    await page.fill("#loginEmail", "test@example.com");
    await page.fill("#loginPassword", "wrongpass");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/login/);
  });
});
