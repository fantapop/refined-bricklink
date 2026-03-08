/**
 * Auth setup — runs before any E2E tests that need a logged-in BrickLink session.
 *
 * If the shared Chrome profile already has a valid session, this is a no-op.
 * Otherwise it opens the login page and calls page.pause() so you can log in
 * manually in the headed browser. Close the Playwright inspector to continue.
 */
import { test } from "@playwright/test";
import { launchExtension } from "./helpers/extension-context.js";

/**
 * Checks if the user is logged in to BrickLink.
 * The profile container appears in different places depending on viewport width:
 * - Large screens: #js-blp-icon-nav > .blp-icon-nav__item-container--profile
 * - Small screens: hidden inside #js-blp-icon-nav > .blp-icon-nav__item-container--more
 * We check for either container existing in the DOM (not necessarily visible).
 */
async function isLoggedIn(page) {
  return page
    .locator(
      ".blp-icon-nav__item-container--profile, " +
        ".blp-icon-nav__item-container--more .blp-icon-nav__item--profile"
    )
    .first()
    .waitFor({ state: "attached", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
}

test("authenticate with BrickLink", async () => {
  const context = await launchExtension();
  const page = await context.newPage();

  await page.goto("https://www.bricklink.com/v2/main.page", {
    waitUntil: "domcontentloaded",
  });

  if (await isLoggedIn(page)) {
    console.log("Already logged in — skipping manual login.");
    await page.close();
    await context.close();
    return;
  }

  // Not logged in — navigate to login page and pause for manual login
  await page.goto("https://www.bricklink.com/v2/login.page", {
    waitUntil: "domcontentloaded",
  });

  console.log(
    "\n🔑 Please log in to BrickLink in the browser window.\n" +
      "   Close the Playwright Inspector (▶ Resume button) when done.\n"
  );

  await page.pause();

  // Verify login succeeded
  await page.goto("https://www.bricklink.com/v2/main.page", {
    waitUntil: "domcontentloaded",
  });

  if (!(await isLoggedIn(page))) {
    throw new Error("Login verification failed — still not logged in.");
  }

  await page.close();
  await context.close();
});
