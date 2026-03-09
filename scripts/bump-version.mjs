#!/usr/bin/env node
/**
 * Bumps the patch version across all files that reference it.
 *
 * Usage:
 *   node scripts/bump-version.mjs          # auto-increment patch (0.1.71 → 0.1.72)
 *   node scripts/bump-version.mjs 0.2.0    # set explicit version
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Read current version from manifest ──────────────────────────────────────

const manifestPath = resolve(root, "source/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const oldVersion = manifest.version;

// ── Determine new version ────────────────────────────────────────────────────

let newVersion = process.argv[2];
if (!newVersion) {
  const parts = oldVersion.split(".").map(Number);
  parts[2]++;
  newVersion = parts.join(".");
}

if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`Invalid version: ${newVersion}`);
  process.exit(1);
}

console.log(`Bumping ${oldVersion} → ${newVersion}`);

// ── Update manifest.json ─────────────────────────────────────────────────────

manifest.version = newVersion;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
console.log(`  updated source/manifest.json`);

// ── Update package.json ──────────────────────────────────────────────────────

const packagePath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
pkg.version = newVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
console.log(`  updated package.json`);

// ── Update README.md ─────────────────────────────────────────────────────────

const readmePath = resolve(root, "README.md");
const readme = readFileSync(readmePath, "utf-8");
const updatedReadme = readme.replaceAll(`v${oldVersion}`, `v${newVersion}`);
if (updatedReadme !== readme) {
  writeFileSync(readmePath, updatedReadme, "utf-8");
  console.log(`  updated README.md`);
}

console.log(`Done. Don't forget to reload the extension and run npm run build.`);
