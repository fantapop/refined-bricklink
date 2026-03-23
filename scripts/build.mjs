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

// Inject build timestamp into main.js in the built copy so the rb-version
// meta tag reflects when the build was made, without touching manifest.json.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const buildStamp = [
  now.getFullYear(),
  pad(now.getMonth() + 1),
  pad(now.getDate()),
].join("") + "-" + pad(now.getHours()) + pad(now.getMinutes());
const mainJsBuildPath = join(dest, "main.js");
let mainJsContent = readFileSync(mainJsBuildPath, "utf-8");
mainJsContent = mainJsContent.replace(
  "chrome.runtime.getManifest().version",
  `chrome.runtime.getManifest().version + "+${buildStamp}"`
);
writeFileSync(mainJsBuildPath, mainJsContent, "utf-8");
console.log(`  stamped build time ${buildStamp} → main.js`);

// Package into build/out/
const manifest = JSON.parse(readFileSync(join(src, "manifest.json"), "utf-8"));
const version = manifest.version;

// Stamp the build time into the manifest version in build/source/ as a 4th
// component (MMDD.HHmm) so chrome://extensions shows it updating on each build.
const manifestBuildPath = join(dest, "manifest.json");
const builtManifest = JSON.parse(readFileSync(manifestBuildPath, "utf-8"));
const [hh, min] = [pad(now.getHours()), pad(now.getMinutes())];
builtManifest.version = `${version}.${hh}${min}`;
writeFileSync(manifestBuildPath, JSON.stringify(builtManifest, null, 2) + "\n", "utf-8");
console.log(`  stamped build version ${builtManifest.version} → manifest.json`);

// Keep package.json version in sync with manifest.json
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(`  synced package.json version → ${version}`);
}
const outDir = join(root, "build/out");
const zipName = `refined-bricklink-v${version}.zip`;
const zipPath = join(outDir, zipName);

mkdirSync(outDir, { recursive: true });
execSync(`find ${dest} -exec touch -t 197001010000 {} \\;`);
execSync(`cd ${dest} && zip -r ${zipPath} .`);

const sha256 = execSync(`sha256sum ${zipPath}`).toString().split(" ")[0];
console.log(`Packaged build/out/${zipName}`);
console.log(`SHA256: ${sha256}`);
