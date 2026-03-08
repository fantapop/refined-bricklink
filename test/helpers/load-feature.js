import { readFileSync } from "fs";
import { Script } from "vm";

/**
 * Loads a feature file by executing it as a plain script (not a module).
 * This mirrors how the browser runs these IIFE files as content scripts.
 *
 * @param {string} filePath - Absolute path to the feature file
 * @param {object} [options]
 * @param {boolean} [options.resetRegistry=true] - Whether to reset RefinedBricklink.features
 */
export function loadFeature(filePath, { resetRegistry = true } = {}) {
  if (resetRegistry) {
    globalThis.RefinedBricklink = { features: [] };
  }

  const code = readFileSync(filePath, "utf-8");

  // Provide a `module` object so the conditional export works
  const mod = { exports: {} };
  globalThis.module = mod;

  const script = new Script(code, { filename: filePath });
  script.runInThisContext();

  delete globalThis.module;

  return mod.exports;
}
