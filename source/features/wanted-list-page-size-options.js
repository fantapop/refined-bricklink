(function () {
  var modifiedSelects = new Map(); // element -> original innerHTML

  function parseValues(str) {
    return str
      .split(",")
      .map(function (s) { return parseInt(s.trim(), 10); })
      .filter(function (n) { return !isNaN(n) && n > 0; })
      .sort(function (a, b) { return a - b; });
  }

  var applyObserver = null;
  var pendingValues = null;

  function revealSelect(sel, values, currentValue) {
    var valuesAsStrings = values.map(String);
    if (!modifiedSelects.has(sel)) modifiedSelects.set(sel, sel.innerHTML);
    var effective = currentValue || sel.value;
    sel.innerHTML = "";
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = v + " per pg";
      sel.appendChild(opt);
    });
    if (valuesAsStrings.includes(effective)) sel.value = effective;
    sel.setAttribute("data-rb-ready", "1");
  }

  function applyOptions(values) {
    var urlParams = new URLSearchParams(window.location.search);
    // Read from URL — sel.value is unreliable if the current pageSize isn't
    // in BrickLink's original options (e.g. 500 falls back to 25)
    var currentValue = urlParams.get("pageSize");

    pendingValues = values;

    document.querySelectorAll("select.width-xsm").forEach(function (sel) {
      revealSelect(sel, values, currentValue);
    });

    // Watch for React replacing the select elements after we've processed them.
    // When a new select.width-xsm appears (without data-rb-ready), apply immediately.
    if (applyObserver) applyObserver.disconnect();
    applyObserver = new MutationObserver(function () {
      document.querySelectorAll("select.width-xsm:not([data-rb-ready])").forEach(function (sel) {
        revealSelect(sel, pendingValues, currentValue);
      });
    });
    applyObserver.observe(document.body, { childList: true, subtree: true });
  }

  var featureDef = {
    id: "wanted-list-page-size-options",
    name: "Custom Page Size Options",
    description:
      "Replaces the items-per-page dropdown on wanted list search pages with a customizable set of values.",
    enabledByDefault: true,
    section: "Wanted Lists",
    settings: [
      {
        name: "rb-page-size-options",
        label: "Page size options",
        description: "Comma-separated list of page sizes to offer.",
        type: "text",
        default: "50,100,250,500",
      },
    ],

    init(settings) {
      if (!window.location.pathname.includes("/v2/wanted/search.page")) return;
      var values = parseValues(
        (settings && settings["rb-page-size-options"]) || "50,100,250,500"
      );
      if (values.length) applyOptions(values);
    },

    destroy() {
      if (applyObserver) { applyObserver.disconnect(); applyObserver = null; }
      pendingValues = null;
      modifiedSelects.forEach(function (html, sel) {
        sel.innerHTML = html;
        sel.removeAttribute("data-rb-ready");
      });
      modifiedSelects.clear();
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
