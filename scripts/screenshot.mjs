#!/usr/bin/env node
/**
 * Web-based interactive screenshot tool.
 * Opens Chrome with the extension loaded and injects a floating controller
 * into every page. Navigate to the page you want, use the controller to
 * select a region or element, preview the screenshot, name it, and save
 * to docs/screenshots/.
 *
 * Uses macOS screencapture so native browser UI (title tooltips, etc.) and
 * the real OS cursor are included in the screenshot.
 *
 * Usage: npm run screenshot
 */

import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { readFileSync, copyFileSync, mkdirSync, readdirSync } from "fs";
import { chromium } from "@playwright/test";
import { extensionPath, userDataDir } from "../test/e2e/helpers/extension-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, "../docs/screenshots");
mkdirSync(screenshotsDir, { recursive: true });

// Optional: pass a feature name as the first argument to auto-enumerate screenshots.
// Usage: npm run screenshot -- wanted-list-set-image
//        → names are auto-filled as wanted-list-set-image-1, wanted-list-set-image-2, …
const featureName = process.argv[2] || null;
let screenshotCounter = 1;
if (featureName) {
  const existing = readdirSync(screenshotsDir);
  const re = new RegExp(`^${featureName}-(\\d+)\\.png$`);
  const nums = existing.map(f => { const m = f.match(re); return m ? parseInt(m[1]) : 0; });
  screenshotCounter = nums.length ? Math.max(...nums) + 1 : 1;
  console.log(`Feature: ${featureName} — screenshots will be named ${featureName}-${screenshotCounter}, ${featureName}-${screenshotCounter + 1}, …\n`);
}


const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: null, // let the viewport follow the actual window size
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

const page = await context.newPage();

// Path of the most recent screencapture output; reused by _rbSaveScreenshot
let lastCapturePath = null;

// Active screencapture child process (so Escape can kill it)
let captureChild = null;
let capturePromise = null;
// Stash clip + screen info from _rbBeginCapture so _rbGetCapture can crop
let pendingCaptureRegion = null;

// ── Node.js-side functions exposed to the browser ────────────────────────────

// Begin capture — hides controller, starts full-screen screencapture -C -T 3 async,
// returns immediately. Browser runs its own 3s countdown in parallel, then calls _rbGetCapture.
// si (screen info) is collected by the browser and passed in to avoid an extra CDP round-trip.
await page.exposeFunction("_rbBeginCapture", async ({ clip, si }) => {
  try {
    await page.evaluate(() => {
      const el = document.getElementById("_rb_ctrl");
      if (el) { el.style.opacity = "0"; el.style.pointerEvents = "none"; }
    });

    // Stash region so _rbGetCapture can crop after the full-screen capture finishes
    const vx = si.screenX + Math.round((si.outerWidth - si.innerWidth) / 2);
    const vy = si.screenY + (si.outerHeight - si.innerHeight);
    if (clip) {
      // Clamp element bounds to the visible viewport so we never stray into Chrome UI
      const elemX = vx + Math.round(clip.x - si.scrollX);
      const elemY = vy + Math.round(clip.y - si.scrollY);
      const cx = Math.max(elemX, vx);
      const cy = Math.max(elemY, vy);
      const cRight = Math.min(elemX + Math.round(clip.width),  vx + si.innerWidth);
      const cBottom = Math.min(elemY + Math.round(clip.height), vy + si.innerHeight);
      pendingCaptureRegion = { x: cx, y: cy, w: cRight - cx, h: cBottom - cy };
    } else {
      pendingCaptureRegion = { x: vx, y: vy, w: si.innerWidth, h: si.innerHeight };
    }

    const fullPath = `/tmp/rb_full_${Date.now()}.png`;
    lastCapturePath = fullPath; // overwritten by _rbGetCapture after crop
    capturePromise = new Promise((resolve, reject) => {
      captureChild = execFile(
        "screencapture",
        ["-C", "-T", "3", fullPath],
        (err) => { captureChild = null; if (err) reject(err); else resolve(fullPath); }
      );
    });

    return { success: true };
  } catch (err) {
    console.error("[screenshot] _rbBeginCapture error:", err.message);
    return { success: false, error: err.message };
  }
});

// Get capture result — awaits the full-screen screencapture, crops to the desired region
// using sips (macOS built-in), returns the cropped image as a data URL.
await page.exposeFunction("_rbGetCapture", async () => {
  try {
    const fullPath = await capturePromise;
    const { x, y, w, h } = pendingCaptureRegion;
    // sips uses physical pixels; multiply by 2 for retina (deviceScaleFactor: 2)
    const scale = 2;
    const croppedPath = `/tmp/rb_capture_${Date.now()}.png`;
    await new Promise((resolve, reject) => {
      execFile("sips", [
        "-c", `${h * scale}`, `${w * scale}`,
        "--cropOffset", `${y * scale}`, `${x * scale}`,
        fullPath, "--out", croppedPath,
      ], (err) => { if (err) reject(err); else resolve(); });
    });
    lastCapturePath = croppedPath;
    const buffer = readFileSync(croppedPath);
    // Return the CSS-pixel dimensions of the captured region so the browser can
    // display the preview at 1:1 with the captured content (avoids stretch/squeeze
    // when viewport clamping reduced the region below clip.width/height).
    return { success: true, dataUrl: `data:image/png;base64,${buffer.toString("base64")}`, cssW: w, cssH: h };
  } catch (err) {
    console.error("[screenshot] _rbGetCapture error:", err.message);
    return { success: false, error: err.message };
  } finally {
    capturePromise = null;
    pendingCaptureRegion = null;
    await page.evaluate(() => {
      const el = document.getElementById("_rb_ctrl");
      if (el) { el.style.opacity = ""; el.style.pointerEvents = ""; }
    }).catch(() => {});
  }
});

// Cancel capture — kills the in-flight screencapture process (Escape key).
await page.exposeFunction("_rbCancelCapture", async () => {
  if (captureChild) { captureChild.kill(); captureChild = null; }
  // Swallow the rejection from the killed process so Node doesn't crash
  if (capturePromise) { capturePromise.catch(() => {}); }
  capturePromise = null;
  await page.evaluate(() => {
    const el = document.getElementById("_rb_ctrl");
    if (el) { el.style.opacity = ""; el.style.pointerEvents = ""; }
  }).catch(() => {});
});

// Exit — close browser and stop the process
await page.exposeFunction("_rbExit", async () => {
  await context.close();
  process.exit(0);
});

// Returns the pre-fill name for the next screenshot and advances the counter.
// Counter lives in Node so it persists across page navigations.
await page.exposeFunction("_rbNextScreenshotName", () => {
  if (!featureName) return "";
  return `${featureName}-${screenshotCounter++}`;
});

// Save — copies (or crops then saves) the last capture to docs/screenshots/
// crop = { t, b, l, r } in physical pixels (all optional, default 0)
await page.exposeFunction("_rbSaveScreenshot", async ({ name, crop }) => {
  try {
    if (!lastCapturePath) return { success: false, error: "No capture available" };
    const outputPath = path.join(screenshotsDir, `${name}.png`);
    const { t = 0, b = 0, l = 0, r = 0 } = crop || {};
    if (t > 0 || b > 0 || l > 0 || r > 0) {
      // Get current image dimensions so we can compute the cropped size
      const info = await new Promise((resolve, reject) => {
        execFile("sips", ["-g", "pixelWidth", "-g", "pixelHeight", lastCapturePath], (err, stdout) => {
          if (err) return reject(err);
          const pw = parseInt(stdout.match(/pixelWidth: (\d+)/)?.[1]);
          const ph = parseInt(stdout.match(/pixelHeight: (\d+)/)?.[1]);
          resolve({ w: pw, h: ph });
        });
      });
      const newW = info.w - l - r;
      const newH = info.h - t - b;
      await new Promise((resolve, reject) => {
        execFile("sips", [
          "-c", `${newH}`, `${newW}`,
          "--cropOffset", `${t}`, `${l}`,
          lastCapturePath, "--out", outputPath,
        ], (err) => { if (err) reject(err); else resolve(); });
      });
    } else {
      copyFileSync(lastCapturePath, outputPath);
    }

    await page.evaluate((n) => {
      document.getElementById("_rb_toast")?.remove();
      const toast = document.createElement("div");
      toast.id = "_rb_toast";
      toast.textContent = `✓ ${n}.png saved`;
      toast.style.cssText = [
        "position:fixed", "bottom:20px", "left:50%", "transform:translateX(-50%)",
        "z-index:2147483647", "background:#1a7f3c", "color:#fff",
        "font:600 13px/1 -apple-system,sans-serif", "padding:10px 18px",
        "border-radius:8px", "box-shadow:0 4px 16px rgba(0,0,0,0.4)",
        "pointer-events:none", "opacity:1", "transition:opacity 0.4s",
      ].join(";");
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = "0"; }, 1800);
      setTimeout(() => { toast.remove(); }, 2200);
    }, name);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Injected controller UI ────────────────────────────────────────────────────

const CONTROLLER_CSS = `
  #_rb_ctrl * { box-sizing: border-box; font-family: -apple-system, sans-serif; }

  #_rb_ctrl {
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
    background: #1e1e1e; color: #eee; border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    width: 200px; user-select: none;
    overflow: hidden;
  }
  #_rb_ctrl_title {
    background: #2d2d2d; padding: 8px 12px;
    font-size: 12px; font-weight: 600; color: #aaa; letter-spacing: 0.5px;
    display: flex; align-items: center; gap: 6px; cursor: move;
  }
  #_rb_ctrl_title span { flex: 1; }
  #_rb_ctrl_body { padding: 10px 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .rb-ctrl-btn {
    padding: 7px 10px; border-radius: 6px; border: 1.5px solid #444;
    background: #2a2a2a; color: #ddd; font-size: 12px; font-weight: 500;
    cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;
    transition: background 0.1s;
  }
  .rb-ctrl-btn:hover { background: #333; }
  .rb-ctrl-btn.active { background: #0066cc; border-color: #0080ff; color: #fff; }
  .rb-ctrl-btn .rb-icon { font-size: 14px; width: 18px; text-align: center; }

  /* Element highlight overlay */
  #_rb_elem_highlight {
    position: fixed; pointer-events: none; z-index: 2147483646;
    outline: 2px solid #0af; background: rgba(0, 170, 255, 0.08);
    display: none; transition: none;
  }

  /* Drag selection overlay */
  #_rb_drag_overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 2147483646; cursor: crosshair; display: none;
  }
  #_rb_drag_rect {
    position: fixed; pointer-events: none; z-index: 2147483646;
    outline: 2px solid #0af; background: rgba(0, 170, 255, 0.08); display: none;
  }
  #_rb_drag_label {
    position: fixed; pointer-events: none; z-index: 2147483647; display: none;
    background: #09f; color: #000; font: bold 11px/16px monospace;
    padding: 1px 5px; border-radius: 2px;
  }

  /* Countdown overlay — bottom-right corner */
  #_rb_countdown {
    position: fixed; bottom: 20px; right: 20px;
    z-index: 2147483647; pointer-events: none;
    background: rgba(0,0,0,0.78); border-radius: 12px; padding: 12px 24px;
    text-align: center; display: none;
  }
  #_rb_countdown_num {
    font-size: 48px; font-weight: 700; line-height: 1; color: #0af;
    font-variant-numeric: tabular-nums;
  }
  #_rb_countdown_msg { font-size: 11px; color: #999; margin-top: 4px; }

  /* Preview modal */
  #_rb_preview_overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 2147483647; display: none;
    align-items: center; justify-content: center;
  }
  #_rb_preview_modal {
    background: #1e1e1e; border-radius: 10px; padding: 20px;
    max-width: 80vw; max-height: 90vh; overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    display: flex; flex-direction: column; gap: 12px;
  }
  #_rb_preview_modal h3 { margin: 0; font-size: 15px; font-weight: 600; color: #eee; }
  #_rb_preview_img_wrap {
    position: relative; display: inline-block; align-self: flex-start;
    border: 1.5px solid #444; border-radius: 4px; overflow: hidden;
  }
  #_rb_preview_img { display: block; max-width: 70vw; max-height: 55vh; width: auto; height: auto; }
  #_rb_preview_name_row { display: flex; gap: 8px; align-items: center; }
  #_rb_preview_name_label { font-size: 12px; color: #aaa; white-space: nowrap; }
  #_rb_preview_name_input {
    flex: 1; padding: 8px 10px; border-radius: 6px; border: 1.5px solid #444;
    background: #2a2a2a; color: #eee; font-size: 13px; outline: none;
  }
  #_rb_preview_name_input:focus { border-color: #0080ff; }
  #_rb_preview_buttons { display: flex; gap: 8px; justify-content: flex-end; }
  .rb-preview-btn {
    padding: 7px 16px; border-radius: 6px; border: none;
    font-size: 13px; font-weight: 500; cursor: pointer;
  }
  .rb-preview-btn.cancel { background: #333; color: #ccc; }
  .rb-preview-btn.cancel:hover { background: #3a3a3a; }
  .rb-preview-btn.save { background: #0066cc; color: #fff; }
  .rb-preview-btn.save:hover { background: #0077ee; }

  /* Crop shades — semi-transparent overlays on the cropped-away regions */
  .rb-crop-shade {
    position: absolute; background: rgba(0,0,0,0.5); pointer-events: none; z-index: 1;
  }
  #_rb_shade_top  { top: 0; left: 0; width: 100%; height: 0; }
  #_rb_shade_bot  { bottom: 0; left: 0; width: 100%; height: 0; }
  #_rb_shade_lft  { left: 0; }
  #_rb_shade_rgt  { right: 0; }

  /* Crop handles */
  .rb-crop-handle {
    position: absolute; background: rgba(180, 220, 255, 0.95); border-radius: 4px;
    z-index: 2; box-shadow: 0 0 0 1.5px rgba(0,100,220,0.6), 0 2px 5px rgba(0,0,0,0.5);
  }
  .rb-crop-handle.rb-crop-ns {
    width: 52px; height: 8px; left: 50%; transform: translateX(-50%);
    cursor: ns-resize;
  }
  .rb-crop-handle.rb-crop-ew {
    width: 8px; height: 52px; top: 50%; transform: translateY(-50%);
    cursor: ew-resize;
  }
`;

const CONTROLLER_HTML = `
  <div id="_rb_ctrl_title">
    <span>📷 Screenshot</span>
  </div>
  <div id="_rb_ctrl_body">
    <button class="rb-ctrl-btn" id="_rb_btn_select">
      <span class="rb-icon">↖</span> Select Element
    </button>
    <button class="rb-ctrl-btn" id="_rb_btn_draw">
      <span class="rb-icon">⬚</span> Draw Region
    </button>
    <button class="rb-ctrl-btn" id="_rb_btn_exit" style="margin-top:4px;border-color:#600;color:#f88;">
      <span class="rb-icon">✕</span> Exit
    </button>
  </div>
`;

const PREVIEW_HTML = `
  <div id="_rb_preview_overlay">
    <div id="_rb_preview_modal">
      <h3>Preview Screenshot</h3>
      <div id="_rb_preview_img_wrap">
        <img id="_rb_preview_img" alt="preview"/>
        <div class="rb-crop-shade" id="_rb_shade_top"></div>
        <div class="rb-crop-shade" id="_rb_shade_bot"></div>
        <div class="rb-crop-shade" id="_rb_shade_lft"></div>
        <div class="rb-crop-shade" id="_rb_shade_rgt"></div>
        <div class="rb-crop-handle rb-crop-ns" id="_rb_handle_top"></div>
        <div class="rb-crop-handle rb-crop-ns" id="_rb_handle_bot"></div>
        <div class="rb-crop-handle rb-crop-ew" id="_rb_handle_lft"></div>
        <div class="rb-crop-handle rb-crop-ew" id="_rb_handle_rgt"></div>
      </div>
      <div id="_rb_preview_name_row">
        <label id="_rb_preview_name_label" for="_rb_preview_name_input">Name:</label>
        <input id="_rb_preview_name_input" type="text" placeholder="filename (without .png)" spellcheck="false"/>
      </div>
      <div id="_rb_preview_buttons">
        <button class="rb-preview-btn cancel" id="_rb_preview_cancel">Cancel</button>
        <button class="rb-preview-btn save" id="_rb_preview_save">Save</button>
      </div>
    </div>
  </div>
`;

async function injectController() {
  await page.evaluate(({ css, ctrlHtml, previewHtml, featureName }) => {
    if (document.getElementById("_rb_ctrl")) return;

    // Style
    const style = document.createElement("style");
    style.id = "_rb_ctrl_style";
    style.textContent = css;
    document.head.appendChild(style);

    // Controller panel
    const ctrl = document.createElement("div");
    ctrl.id = "_rb_ctrl";
    ctrl.innerHTML = ctrlHtml;
    document.body.appendChild(ctrl);

    // Element highlight div
    const highlight = document.createElement("div");
    highlight.id = "_rb_elem_highlight";
    document.body.appendChild(highlight);

    // Drag overlay + rect + label
    const dragOverlay = document.createElement("div");
    dragOverlay.id = "_rb_drag_overlay";
    document.body.appendChild(dragOverlay);

    const dragRect = document.createElement("div");
    dragRect.id = "_rb_drag_rect";
    document.body.appendChild(dragRect);

    const dragLabel = document.createElement("div");
    dragLabel.id = "_rb_drag_label";
    document.body.appendChild(dragLabel);

    // Preview overlay
    const tmp = document.createElement("div");
    tmp.innerHTML = previewHtml;
    document.body.appendChild(tmp.firstElementChild);

    // Countdown overlay
    const countdown = document.createElement("div");
    countdown.id = "_rb_countdown";
    countdown.innerHTML = '<div id="_rb_countdown_num">3</div><div id="_rb_countdown_msg">Esc to cancel</div>';
    document.body.appendChild(countdown);

    // ── State ────────────────────────────────────────────────────────────────
    let mode = null; // 'select' | 'draw' | null
    let pendingClip = null;
    // Crop amounts in display pixels from each edge
    let cropDisp = { t: 0, b: 0, l: 0, r: 0 };

    function setMode(m) {
      mode = m;
      document.getElementById("_rb_btn_select").classList.toggle("active", m === "select");
      document.getElementById("_rb_btn_draw").classList.toggle("active", m === "draw");
      highlight.style.display = "none";
      dragOverlay.style.display = m === "draw" ? "block" : "none";
      document.body.style.cursor = m ? "crosshair" : "";
    }

    // ── Panel drag ───────────────────────────────────────────────────────────
    const title = document.getElementById("_rb_ctrl_title");
    let dragOffX = 0, dragOffY = 0, draggingPanel = false;
    title.addEventListener("mousedown", (e) => {
      draggingPanel = true;
      const r = ctrl.getBoundingClientRect();
      dragOffX = e.clientX - r.left;
      dragOffY = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!draggingPanel) return;
      ctrl.style.left = (e.clientX - dragOffX) + "px";
      ctrl.style.top = (e.clientY - dragOffY) + "px";
      ctrl.style.right = "auto";
      ctrl.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => { draggingPanel = false; });

    // ── Mode buttons ─────────────────────────────────────────────────────────
    document.getElementById("_rb_btn_select").addEventListener("click", () => {
      setMode(mode === "select" ? null : "select");
    });
    document.getElementById("_rb_btn_draw").addEventListener("click", () => {
      setMode(mode === "draw" ? null : "draw");
    });
    document.getElementById("_rb_btn_exit").addEventListener("click", () => {
      window._rbExit();
    });

    // ── Select Element mode ──────────────────────────────────────────────────
    document.addEventListener("mouseover", (e) => {
      if (mode !== "select") return;
      const el = e.target;
      if (el.closest("#_rb_ctrl, #_rb_preview_overlay")) return;
      const r = el.getBoundingClientRect();
      Object.assign(highlight.style, {
        display: "block",
        left: r.left + "px", top: r.top + "px",
        width: r.width + "px", height: r.height + "px",
      });
    });

    document.addEventListener("click", (e) => {
      if (mode !== "select") return;
      if (e.target.closest("#_rb_ctrl, #_rb_preview_overlay")) return;
      e.preventDefault(); e.stopPropagation();
      const el = e.target;
      const r = el.getBoundingClientRect();
      pendingClip = {
        x: r.left + window.scrollX, y: r.top + window.scrollY,
        width: r.width, height: r.height,
      };
      highlight.style.display = "none";
      setMode(null);
      captureAndShowPreview();
    }, true);

    // ── Draw Region mode ─────────────────────────────────────────────────────
    let startX = 0, startY = 0, drawDragging = false;

    dragOverlay.addEventListener("mousedown", (e) => {
      startX = e.clientX; startY = e.clientY;
      drawDragging = true;
      dragRect.style.display = "block";
    });

    dragOverlay.addEventListener("mousemove", (e) => {
      if (!drawDragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      Object.assign(dragRect.style, {
        left: x+"px", top: y+"px", width: w+"px", height: h+"px",
      });
      Object.assign(dragLabel.style, {
        display: "block", left: x+"px", top: Math.max(0, y-20)+"px",
      });
      dragLabel.textContent = `${w} × ${h}`;
    });

    dragOverlay.addEventListener("mouseup", (e) => {
      if (!drawDragging) return;
      drawDragging = false;
      dragRect.style.display = "none";
      dragLabel.style.display = "none";
      dragOverlay.style.display = "none";
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      if (w < 5 || h < 5) { setMode(null); return; }
      pendingClip = {
        x: x + window.scrollX, y: y + window.scrollY,
        width: w, height: h,
      };
      setMode(null);
      captureAndShowPreview();
    });

    // ── Crop UI ───────────────────────────────────────────────────────────────
    function updateCropUI() {
      const { t, b, l, r } = cropDisp;
      const imgW = previewImg.offsetWidth;
      const imgH = previewImg.offsetHeight;
      const midH = imgH - t - b;
      const midW = imgW - l - r;

      // Shades
      const shadeTop = document.getElementById("_rb_shade_top");
      const shadeBot = document.getElementById("_rb_shade_bot");
      const shadeLft = document.getElementById("_rb_shade_lft");
      const shadeRgt = document.getElementById("_rb_shade_rgt");
      shadeTop.style.height = t + "px";
      shadeBot.style.height = b + "px";
      shadeLft.style.top = t + "px"; shadeLft.style.height = midH + "px"; shadeLft.style.width = l + "px";
      shadeRgt.style.top = t + "px"; shadeRgt.style.height = midH + "px"; shadeRgt.style.width = r + "px";

      // Handles — centered on each crop edge, clamped so always visible
      const ht = document.getElementById("_rb_handle_top");
      const hb = document.getElementById("_rb_handle_bot");
      const hl = document.getElementById("_rb_handle_lft");
      const hr = document.getElementById("_rb_handle_rgt");
      ht.style.top = Math.max(0, t - 3) + "px";
      hb.style.bottom = Math.max(0, b - 3) + "px";
      hl.style.left = Math.max(0, l - 3) + "px";
      hr.style.right = Math.max(0, r - 3) + "px";
    }

    function setupCropDrag(handleEl, edge) {
      handleEl.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const isVertical = edge === "t" || edge === "b";
        const startMouse = isVertical ? e.clientY : e.clientX;
        const startVal = cropDisp[edge];
        function onMove(ev) {
          const delta = (isVertical ? ev.clientY : ev.clientX) - startMouse;
          // Top/left: dragging toward center increases crop; bottom/right: opposite direction
          const dir = (edge === "t" || edge === "l") ? 1 : -1;
          const imgDim = isVertical ? previewImg.offsetHeight : previewImg.offsetWidth;
          const opposite = edge === "t" ? cropDisp.b : edge === "b" ? cropDisp.t
                         : edge === "l" ? cropDisp.r : cropDisp.l;
          cropDisp[edge] = Math.max(0, Math.min(startVal + delta * dir, imgDim - opposite - 20));
          updateCropUI();
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    setupCropDrag(document.getElementById("_rb_handle_top"), "t");
    setupCropDrag(document.getElementById("_rb_handle_bot"), "b");
    setupCropDrag(document.getElementById("_rb_handle_lft"), "l");
    setupCropDrag(document.getElementById("_rb_handle_rgt"), "r");

    // ── Preview modal ─────────────────────────────────────────────────────────
    const previewOverlay = document.getElementById("_rb_preview_overlay");
    const previewImg = document.getElementById("_rb_preview_img");
    const previewNameInput = document.getElementById("_rb_preview_name_input");

    function runCountdown(seconds) {
      return new Promise((resolve, reject) => {
        const el = document.getElementById("_rb_countdown");
        const numEl = document.getElementById("_rb_countdown_num");
        let remaining = seconds;
        numEl.textContent = remaining;
        el.style.display = "block";
        function finish(cb) {
          clearInterval(timer);
          document.removeEventListener("keydown", onKey);
          el.style.display = "none";
          cb();
        }
        function onKey(e) {
          if (e.key === "Escape") finish(() => reject(new Error("cancelled")));
        }
        document.addEventListener("keydown", onKey);
        const timer = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            finish(resolve);
          } else {
            numEl.textContent = remaining;
          }
        }, 1000);
      });
    }

    async function captureAndShowPreview() {
      const clip = pendingClip;
      // Pass screen info from browser so Node.js doesn't need an extra CDP round-trip
      const si = {
        screenX: window.screenX, screenY: window.screenY,
        outerWidth: window.outerWidth, outerHeight: window.outerHeight,
        innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        scrollX: window.scrollX, scrollY: window.scrollY,
      };

      // Start screencapture (-T 5) and countdown simultaneously so they tick together
      const begun = await window._rbBeginCapture({ clip, si });
      if (!begun?.success) {
        console.error("[screenshot] begin capture failed:", begun?.error);
        return;
      }

      try {
        await runCountdown(3);
      } catch {
        // Escape pressed — kill the screencapture process
        await window._rbCancelCapture();
        return;
      }

      const result = await window._rbGetCapture();
      if (!result?.success) {
        console.error("[screenshot] get capture failed:", result?.error);
        return;
      }

      // Display the preview at the CAPTURED region's CSS dimensions, not the clip's.
      // The captured region may be smaller than clip when the element extends beyond
      // the viewport (clamped). Using the actual captured size means the preview
      // is pixel-accurate and scaleX/Y in doSave is always exactly devicePixelRatio.
      const previewW = result.cssW ?? (clip ? clip.width : window.innerWidth);
      const previewH = result.cssH ?? (clip ? clip.height : window.innerHeight);
      previewImg.style.width = previewW + "px";
      previewImg.style.maxHeight = previewH + "px";

      cropDisp = { t: 0, b: 0, l: 0, r: 0 };
      previewImg.onload = null; // clear any stale handler
      previewImg.src = result.dataUrl;
      previewNameInput.value = await window._rbNextScreenshotName();
      previewOverlay.style.display = "flex";
      // Wait for the next paint so the flex layout resolves before reading offsetWidth/Height
      requestAnimationFrame(() => updateCropUI());
      setTimeout(() => previewNameInput.focus(), 50);
    }

    function hidePreview() {
      previewOverlay.style.display = "none";
      pendingClip = null;
    }

    async function doSave() {
      const name = previewNameInput.value.trim();
      if (!name) { previewNameInput.focus(); return; }
      // Convert display-pixel crop to physical pixels.
      // naturalWidth/offsetWidth is the most accurate scale — it accounts for any CSS
      // constraints that shrink the preview image. Fall back to devicePixelRatio (typically 2
      // on Retina) if layout hasn't resolved (offsetWidth = 0).
      const dispW = previewImg.offsetWidth;
      const dispH = previewImg.offsetHeight;
      const scaleX = dispW ? previewImg.naturalWidth / dispW : window.devicePixelRatio;
      const scaleY = dispH ? previewImg.naturalHeight / dispH : window.devicePixelRatio;
      const crop = {
        t: Math.round(cropDisp.t * scaleY),
        b: Math.round(cropDisp.b * scaleY),
        l: Math.round(cropDisp.l * scaleX),
        r: Math.round(cropDisp.r * scaleX),
      };
      hidePreview();
      await window._rbSaveScreenshot({ name, crop });
    }

    document.getElementById("_rb_preview_save").addEventListener("click", doSave);
    document.getElementById("_rb_preview_cancel").addEventListener("click", hidePreview);
    previewNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSave();
      if (e.key === "Escape") hidePreview();
    });
    previewOverlay.addEventListener("click", (e) => {
      if (e.target === previewOverlay) hidePreview();
    });

  }, { css: CONTROLLER_CSS, ctrlHtml: CONTROLLER_HTML, previewHtml: PREVIEW_HTML, featureName });
}

page.on("load", async () => {
  try { await injectController(); } catch {}
});

try {
  await page.goto("https://www.bricklink.com/v2/wanted/list.page");
} catch {
  // Page may return non-2xx (e.g. auth redirect) — ignore and let user navigate manually
}
await injectController();

console.log("Screenshot tool open. Use the floating panel in the browser.");
console.log("Press Ctrl+C to exit.\n");

// Keep the process alive
await new Promise(() => {});
