/**
 * Shared helpers for launching a persistent Chromium context
 * with the extension loaded and a reusable Chrome profile (for auth).
 */
import { chromium } from "@playwright/test";
import path from "path";

export const extensionPath = path.resolve(import.meta.dirname, "../../../build/source");
export const userDataDir = path.resolve(
  import.meta.dirname,
  "../../.auth/chrome-profile"
);

/**
 * Launches a persistent context with the extension loaded,
 * reusing the shared Chrome profile so login state persists.
 */
export async function launchExtension() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--headless=new",
    ],
  });

  return context;
}

/**
 * Discovers the extension ID from the chrome://extensions page.
 * Works for extensions with or without a service worker.
 */
export async function getExtensionId(context) {
  // Try service workers first (fast path)
  if (context.serviceWorkers().length > 0) {
    return context.serviceWorkers()[0].url().split("/")[2];
  }

  // Fallback: read the ID from chrome://extensions
  const page = await context.newPage();
  await page.goto("chrome://extensions", { waitUntil: "domcontentloaded" });

  const extensionId = await page.evaluate(async () => {
    const manager = document.querySelector("extensions-manager");
    if (!manager || !manager.shadowRoot) return null;
    const itemList = manager.shadowRoot.querySelector("extensions-item-list");
    if (!itemList || !itemList.shadowRoot) return null;
    const items = itemList.shadowRoot.querySelectorAll("extensions-item");
    for (const item of items) {
      if (!item.shadowRoot) continue;
      const name = item.shadowRoot.querySelector("#name");
      if (name && name.textContent.trim() === "Refined Bricklink") {
        return item.id;
      }
    }
    return null;
  });

  await page.close();
  return extensionId;
}
