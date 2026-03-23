(function () {
  if (!window.location.pathname.includes("/v2/wanted/search.page")) return;

  var CACHE_KEY = "rb-settings-cache";
  var FEATURE_ID = "wanted-list-page-size-options";
  var PSO_KEY = "rb-page-size-options";
  var DEFAULT_OPTIONS = "50,100,250,500";

  function parseValues(str) {
    return (str || DEFAULT_OPTIONS)
      .split(",")
      .map(function (s) { return parseInt(s.trim(), 10); })
      .filter(function (n) { return !isNaN(n) && n > 0; })
      .sort(function (a, b) { return a - b; });
  }

  // Use cached settings so we can apply the correct options before first paint.
  // Falls back to defaults on first-ever load (no cache yet).
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) {}

  // If the feature is explicitly disabled, don't hide anything.
  if (cached && cached[FEATURE_ID] === false) return;

  var values = parseValues(cached && cached[PSO_KEY]);
  var valuesAsStrings = values.map(String);
  var urlPageSize = new URLSearchParams(window.location.search).get("pageSize");

  function applyToSelect(sel) {
    if (sel.getAttribute("data-rb-ready")) return;
    sel.innerHTML = "";
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = v + " per pg";
      sel.appendChild(opt);
    });
    if (urlPageSize && valuesAsStrings.includes(urlPageSize)) sel.value = urlPageSize;
    sel.setAttribute("data-rb-ready", "preload");
  }

  // Apply to any selects already in the DOM, and watch for new ones.
  document.querySelectorAll("select.width-xsm").forEach(applyToSelect);

  var observer = new MutationObserver(function () {
    document.querySelectorAll("select.width-xsm:not([data-rb-ready])").forEach(applyToSelect);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Safety fallback: disconnect and mark any remaining selects if the feature
  // never ran (e.g. disabled mid-flight).
  setTimeout(function () {
    observer.disconnect();
    document.querySelectorAll("select.width-xsm:not([data-rb-ready])").forEach(function (sel) {
      sel.setAttribute("data-rb-ready", "fallback");
    });
  }, 1000);
})();
