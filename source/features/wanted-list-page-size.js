(function () {
  var observer = null;
  var modifiedLinks = new Map(); // element -> original href

  function applyToLinks(preferred) {
    // Rewrite edit.page links (which 302 to search.page) directly to search.page
    // so the pageSize param survives.
    document.querySelectorAll('a[href*="/v2/wanted/edit.page"]').forEach(function (a) {
      if (modifiedLinks.has(a)) return;
      var url = new URL(a.href);
      if (url.searchParams.has("pageSize")) return;
      modifiedLinks.set(a, a.href);
      url.pathname = "/v2/wanted/search.page";
      url.searchParams.set("pageSize", preferred);
      a.href = url.toString();
    });

    // Also handle any direct search.page links that lack pageSize
    document.querySelectorAll('a[href*="/v2/wanted/search.page"]').forEach(function (a) {
      if (modifiedLinks.has(a)) return;
      var url = new URL(a.href);
      if (url.searchParams.has("pageSize")) return;
      modifiedLinks.set(a, a.href);
      url.searchParams.set("pageSize", preferred);
      a.href = url.toString();
    });
  }

  var featureDef = {
    id: "wanted-list-page-size",
    name: "Default Page Size",
    description:
      "Sets the default number of items shown per page on wanted list search pages.",
    enabledByDefault: true,
    section: "Wanted Lists",
    settings: [
      {
        name: "rb-page-size",
        label: "Items per page",
        description:
          "Number of items to show per page when opening a wanted list.",
        type: "select",
        optionsFrom: "rb-page-size-options",
        default: "100",
      },
    ],

    init(settings) {
      var preferred = (settings && settings["rb-page-size"]) || "100";
      if (preferred === "25") return;

      applyToLinks(preferred);

      observer = new MutationObserver(function () {
        applyToLinks(preferred);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    destroy() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      modifiedLinks.forEach(function (originalHref, a) {
        a.href = originalHref;
      });
      modifiedLinks.clear();
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
