import { test, expect } from "@playwright/test";
import {
  launchExtension,
  getExtensionId,
} from "./helpers/extension-context.js";

test.describe("Options page", () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    context = await launchExtension();
    extensionId = await getExtensionId(context);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("renders toggles for all registered features", async () => {
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/options/options.html`
    );

    await page.waitForSelector(".feature-card");
    const cards = await page.$$(".feature-card");

    // Should have at least the 3 features we ship
    expect(cards.length).toBeGreaterThanOrEqual(3);

    // Each card should have a toggle checkbox
    for (const card of cards) {
      const checkbox = await card.$('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
    }

    await page.close();
  });
});
