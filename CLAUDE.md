# Refined Bricklink Extension - Developer Guide

## Project Overview
Chrome extension that adds UI features and quality-of-life improvements to bricklink.com. Built as a manifest v3 content script extension with individual toggleable features.

**Test Command:** `npx vitest run`

## Architecture

### Feature System
Each feature is a self-contained module in `source/features/` with:
- `id`: Unique identifier
- `name`: Display name for options page
- `description`: User-facing description
- `enabledByDefault`: Boolean
- `init()`: Called when feature is enabled
- `destroy()`: Cleanup when feature is disabled

Features register themselves: `RefinedBricklink.features.push(featureDef);`

### Key Files
- `source/registry.js` - Feature registry initialization
- `source/main.js` - Loads enabled features, stamps version meta tag
- `source/features/` - Individual feature files (unit test co-located: `*.test.js`)
- `source/options/options.html` - Extension options UI
- `source/manifest.json` - Extension manifest; Chrome loads extension from `source/`
- `test/` - E2E tests (Playwright), test helpers, and setup

## Development Workflow

### Making Changes
1. Edit code in `source/features/`
2. Run `npx vitest run` to verify tests pass
3. Run `npm run build` to sync changes to `build/source/`
4. Reload extension on `chrome://extensions` (load from `build/source/`)
5. Refresh the BrickLink page
6. Verify reload by checking the `rb-version` meta tag — it shows `<version>+<timestamp>` (e.g. `0.2.4+20260315-1342`); the timestamp changes on every build

**Note:** Only bump `source/manifest.json` version when cutting a release, not during routine development.

### Cutting a Release
1. Bump version in `source/manifest.json`
2. Update `docs/chrome-web-store.md` to reflect any new or changed features
3. Run all tests (`npx vitest run` + `npx playwright test`)
4. Tag the commit — CI builds and publishes the release zip automatically
5. Paste the updated description from `docs/chrome-web-store.md` into the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole)

### Testing
- **Unit tests:** `npx vitest run` (fast, no browser needed)
- **E2E tests (no auth):** `npx playwright test --project=no-auth`
- **E2E tests (auth required):** `npx playwright test --project=auth`
- **Watch mode:** `npx vitest` (auto-runs on file changes)

### Console Debugging
Content script logs appear in the page console under "Content Scripts" tab in DevTools. The Chrome MCP `read_console_messages` tool only sees page-context logs, NOT content script logs.

## Key Patterns

### React Async Updates
BrickLink uses React which sometimes updates the DOM asynchronously:
- **Pattern:** Watch the trigger element with MutationObserver, start short polling (5ms) to detect the async change
- **Example:** `wanted-list-smart-filters.js` - table mutation triggers polling to detect filter changes 10-20ms later

### MutationObserver Limitations
- Only detects DOM mutations: childList, attributes, characterData
- Does NOT detect JavaScript property changes (e.g., `select.value = "X"`)
- React often sets properties without triggering mutations

### State Snapshotting
When tracking changes (like `edit-summary-banner`):
- Snapshot initial state when entering edit mode
- **Critical:** Clear snapshots when exiting edit mode (no editable fields)
- Otherwise stale snapshots cause false positives after save/cancel

### Avoiding Re-entry
Use `isWiringUp` flag when doing DOM modifications inside MutationObserver callbacks to prevent infinite loops.

## Feature Descriptions

### wanted-list-smart-filters
Filters Color/Years/Condition dropdowns to show only values present in the wanted list. Auto-selects if all items have the same value. Handles React resetting filters during edits via table mutation observer + polling pattern.

### edit-summary-banner
Shows live summary of changed fields in the save banner. Uses field snapshots to track changes. Integrates with unsaved-changes-guard for navigation warnings.

### wanted-list-change-tracker (Quantity Control Panel)
Adds control panel to quantity inputs with increment/decrement, match Have↔Want, and revert buttons. Highlights changed fields with orange background.

### max-price-revert
Similar control panel for max price fields with revert-to-original functionality.

### reverse-wanted-list
Reverses the order of wanted list buttons in the "Add to Wanted List" modal, putting most-used lists first.

### maintenance-link-guard
Blocks navigation to BrickLink pages during monthly maintenance windows (detected via banner or redirect).

### unsaved-changes-guard
Shows browser warning when navigating away from edit page with unsaved changes. Integrates with edit-summary-banner for precise change detection.

### quantity-spacing
Tightens padding on quantity input fields to make room for control panels.

## BrickLink DOM Reference

### Wanted List Edit Page
- Table: `.table-wl-edit`
- Save banner: `#wanted-save-banner`
- Edit summary (our element): `#rb-edit-summary`
- Data rows: `.table-row` (with editable fields)
- Columns: `.wl-col-condition`, `.wl-col-price`, `.wl-col-quantity`, `.wl-col-remarks`, `.wl-col-notify`

### Wanted List Search/Filters
- URL: `/wanted/search.page?wantedMoreID=X`
- Filter container: `.search-item-filters` (appears when "More Options" clicked)
- Search selector: `.search-selector` (wraps each filter)
- Data source: `window.wlJson.wantedItems` array in page HTML

### Other Elements
- Maintenance banner: `.blp-sitewide-notification__item--monthlyMaintenance`
- Maintenance redirect: `oops.asp?err=dailyOffline`
- Add to Wanted List modal: `.wl-add-list .l-overflow-auto--y`
- List buttons: `button.wl-search-list` with `.wl-search-list__name` span

## Common Issues

### "It's not working after reload"
- Did you run `npm run build` and reload the extension AND refresh the page?
- Check the `rb-version` meta tag — the timestamp after `+` should match your latest build

### "MutationObserver not firing"
- React might be setting properties without DOM mutations
- Try watching the parent element, not the mutated element itself
- Consider table mutation + polling pattern for async updates

### "Changes persist after save"
- Clear snapshots/state when exiting edit mode
- Don't rely on React re-renders to clean up state
- Explicitly detect when editable fields disappear

## Memory File
Additional context and patterns are maintained in:
`~/.claude/projects/-Users-chris-Development-refined-bricklink/memory/MEMORY.md`
