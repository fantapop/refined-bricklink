(function () {
  // Stamp version on DOM so it's easy to verify which build is loaded
  const meta = document.createElement("meta");
  meta.name = "rb-version";
  meta.content = chrome.runtime.getManifest().version;
  document.head.appendChild(meta);

  const features = RefinedBricklink.features;

  // Build defaults: feature enabled flags + css var values from each feature
  const defaults = {};
  for (const feature of features) {
    defaults[feature.id] = feature.enabledByDefault;
    for (const v of (feature.cssVars || [])) {
      defaults[v.name] = v.default;
    }
    for (const s of (feature.settings || [])) {
      defaults[s.name] = s.default;
    }
  }

  function initFeatures(settings) {
    // Inject CSS custom properties before features add their styles
    const allCssVars = [];
    for (const feature of features) {
      for (const v of (feature.cssVars || [])) {
        allCssVars.push(v);
      }
    }
    if (allCssVars.length > 0) {
      const style = document.createElement("style");
      style.textContent =
        ":root {\n" +
        allCssVars.map((v) => `  ${v.name}: ${settings[v.name]};`).join("\n") +
        "\n}";
      document.head.appendChild(style);
    }

    for (const feature of features) {
      if (settings[feature.id]) {
        try {
          feature.init(settings);
        } catch (err) {
          console.error(`[Refined Bricklink] Failed to init feature "${feature.id}":`, err);
        }
      }
    }
  }

  // If we have a cache from a previous page load, init synchronously right now
  // (no async wait) so features like page-size-options apply before first paint.
  // The async storage read runs in parallel to refresh the cache for next load.
  const CACHE_KEY = "rb-settings-cache";
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) {}

  chrome.storage.sync.get(defaults, function (settings) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (e) {}
    if (!cached) initFeatures(settings);
  });

  if (cached) initFeatures(cached);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { initFeatures, defaults };
  }
})();
