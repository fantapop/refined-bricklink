# Refined Bricklink - Chrome Extension

## Overview

A Chrome extension (Manifest V3) that adds toggleable UI features to bricklink.com. Each feature is a self-contained module that registers itself with a central registry. Users enable/disable features via the options page.

## Architecture

- `source/registry.js` — Initializes the global `RefinedBricklink.features` array. Loaded first.
- `source/features/*.js` — Each feature file is an IIFE that pushes itself onto the registry. Unit test lives alongside: `source/features/*.test.js`.
- `source/main.js` — Reads settings from `chrome.storage.sync` and calls `init()` on enabled features. Loaded last.
- `source/options/` — Options page that renders toggles for each registered feature.
- `source/manifest.json` — Extension manifest (Chrome loads the extension from the `source/` directory).
- When adding a new feature file, it must be added in two places: `source/manifest.json` (content_scripts js array) and the file itself. `options.js` reads feature scripts dynamically from the manifest.

## Feature contract

Each feature must push an object onto `RefinedBricklink.features` with:
- `id` — Unique string identifier, used as the `chrome.storage.sync` key.
- `name` — Human-readable name shown in options.
- `description` — Shown in options.
- `enabledByDefault` — Boolean.
- `init()` — Called when the feature is enabled. Must be idempotent.
- `destroy()` — Cleans up everything `init()` added (DOM elements, listeners, observers).

## Naming conventions

- **`rb-` prefix** for DOM element IDs and CSS class names injected by the extension (e.g. `id="rb-scroll-to-top"`).
- **`rb` prefix (camelCase)** for `data-*` attributes on existing DOM elements (e.g. `dataset.rbReversed` → `data-rb-reversed`). This avoids collisions with BrickLink's own attributes.
- **`[Refined Bricklink]` prefix** for `console.error` / `console.log` messages.

## Working with BrickLink's DOM

- BrickLink uses a mix of legacy table layouts and modern components. Always inspect the live DOM to verify selectors — don't assume standard table structures.
- Many UI elements (modals, lists) are populated asynchronously after being added to the DOM. Features that target dynamic content should listen for a user action (e.g. click) and then poll or observe for the content to appear, rather than observing all DOM mutations globally.
- Content scripts run in an isolated world — variables like `RefinedBricklink` are not accessible from page-context JS or the browser console.

## BrickLink maintenance

- **Daily maintenance** runs 10:50–11:00 PM PST. The site redirects to `oops.asp?err=dailyOffline`.
- **Monthly maintenance** is announced via a yellow banner (`.blp-sitewide-notification__item--monthlyMaintenance`).
- Not all links/pages go down during maintenance — some static pages may still work. TODO: during a maintenance window, test which link types are affected to build a smarter guard.
