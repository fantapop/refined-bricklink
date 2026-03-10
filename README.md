# Refined Bricklink

> A browser extension that adds quality-of-life improvements to [bricklink.com](https://www.bricklink.com)

[![Version](https://img.shields.io/github/v/tag/fantapop/refined-bricklink?label=version)](https://github.com/fantapop/refined-bricklink/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Inspired by [Refined GitHub](https://github.com/refined-github/refined-github). Each improvement is independently toggleable from the extension's options page.

---

## Options

<img src="docs/screenshots/options.png" width="600" alt="Options page showing toggleable features">

---

## Features

### Wanted List Search

**Quantity Control Panel** — Adds match Have↔Want and revert controls to quantity fields on wanted list edit pages. Highlights changed rows in orange.

<img src="docs/screenshots/wanted-list-change-tracker.gif" width="600" alt="Quantity control panel demo">

<br>

**Max Price Revert Button** — Adds a revert control to max price fields on wanted list edit pages.

<img src="docs/screenshots/max-price-revert.png" width="500" alt="Max price field with increment/decrement controls and revert tooltip">

<br>

**Edit Summary Banner** — Shows a live count of changed fields in the save banner while editing a wanted list. Hover the summary to see a breakdown by row and field.

<img src="docs/screenshots/edit-summary-banner.png" width="600" alt="Save banner showing '2 items changed' with a popover breakdown">

<br>

**Unsaved Changes Warning** — Shows a browser confirmation dialog when you try to navigate away from a wanted list edit page that has unsaved changes.

<img src="docs/screenshots/unsaved-changes-guard.png" width="500" alt="Chrome Leave site? dialog triggered by unsaved changes">

<br>

**Smart Wanted List Filters** — On wanted list search pages, filters the Color and Condition dropdowns to only show values that exist in your list. Automatically selects and locks the filter if all items share the same value.

<img src="docs/screenshots/wanted-list-smart-filters.gif" width="600" alt="Smart wanted list filters demo">

### Modals

**Reverse Wanted List Order** — Reverses the order of lists in the "Add to Wanted List" modal so your most recently created lists appear at the top.

<img src="docs/screenshots/reverse-wanted-list.png" width="500" alt="Add to Wanted List modal with most recently created list at top">

<br>

### Style

**Quantity Style Fixes** — Tightens padding on quantity input fields to make room for control panels and reduce visual clutter.

| Before | After |
|--------|-------|
| <img src="docs/screenshots/quantity-spacing-before.png" width="200" alt="Before: two separate rounded input boxes"> | <img src="docs/screenshots/quantity-spacing-after.png" width="200" alt="After: merged input with orange highlight"> |

---

## Installation

### From the Chrome Web Store

*Coming soon.*

### From a release (manual)

1. Download the `.zip` from the [latest release](https://github.com/fantapop/refined-bricklink/releases/latest)
2. Unzip it
3. Go to `chrome://extensions` and enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

### From source

```sh
git clone https://github.com/fantapop/refined-bricklink.git
cd refined-bricklink
npm install
npm run build
```

Then load the `build/source/` folder as an unpacked extension.

---

## Source verification

Releases are built automatically from tagged commits via [GitHub Actions](.github/workflows/release.yml). The version in [`source/manifest.json`](source/manifest.json) always matches the release tag.

GitHub displays a SHA256 checksum for each release artifact. Builds are reproducible — to verify the release zip was built from the published source, clone the repo at the matching tag and run `npm run build`. The SHA256 of `build/out/refined-bricklink-v0.2.0.zip` should match.

---

## Development

```sh
npm install          # install dependencies
npx vitest run       # unit tests
npx playwright test  # e2e tests (requires Chrome with extension loaded)
npm run build        # build to build/source/
```

See [CLAUDE.md](CLAUDE.md) for full developer documentation.

---

## Contributing

Feature requests are welcome — feel free to [open an issue](https://github.com/fantapop/refined-bricklink/issues).
