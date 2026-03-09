#!/usr/bin/env node
// Build script: copies source/ → build/source/, excluding test files, dev files,
// and feature CSS files (which get inlined into JS); then inlines CSS into
// any JS file that contains the /* @inline */`` marker.

import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, basename, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = join(root, "source");
const dest = join(root, "build/source");

const featuresSrc = join(src, "features");

// Copy source → build, excluding:
//   *.test.js      — unit tests
//   dev.html       — dev-only prototype page
//   features/*.css   — inlined into JS at build time (below)
cpSync(src, dest, {
  recursive: true,
  force: true,
  filter: (srcPath) => {
    const name = basename(srcPath);
    if (name.endsWith(".test.js")) return false;
    if (name === "dev.html") return false;
    if (name.endsWith(".css") && srcPath.startsWith(featuresSrc)) return false;
    return true;
  },
});

// Inline CSS into JS files that contain the /* @inline */`` marker
function inlineCSS(jsPath, cssPath) {
  if (!existsSync(cssPath)) return;
  const css = readFileSync(cssPath, "utf-8").trimEnd();
  let js = readFileSync(jsPath, "utf-8");
  const marker = "/* @inline */``";
  if (!js.includes(marker)) return;
  js = js.replace(marker, `\`${css}\``);
  writeFileSync(jsPath, js, "utf-8");
  console.log(`  inlined ${basename(cssPath)} → ${basename(jsPath)}`);
}

// Find all JS files in build/features that have a matching CSS in source/features
const featuresDest = join(dest, "features");

import { readdirSync } from "fs";
for (const file of readdirSync(featuresDest)) {
  if (!file.endsWith(".js")) continue;
  const cssFile = file.replace(/\.js$/, ".css");
  inlineCSS(join(featuresDest, file), join(featuresSrc, cssFile));
}

// Package into build/out/
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf-8"));
const version = manifest.version;
const outDir = join(root, "build/out");
const zipName = `refined-bricklink-v${version}.zip`;
const zipPath = join(outDir, zipName);

mkdirSync(outDir, { recursive: true });
execSync(`find ${dest} -exec touch -t 197001010000 {} \\;`);
execSync(`cd ${dest} && zip -r ${zipPath} .`);

const sha256 = execSync(`sha256sum ${zipPath}`).toString().split(" ")[0];
writeFileSync(`${zipPath}.sha256`, `${sha256}  ${zipName}\n`, "utf-8");

console.log(`Packaged build/out/${zipName}`);
console.log(`SHA256: ${sha256}`);
