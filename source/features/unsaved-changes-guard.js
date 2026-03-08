(function () {
  var beforeUnloadHandler = null;

  var featureDef = {
    id: "unsaved-changes-guard",
    name: "Unsaved Changes Warning",
    description:
      "Shows a browser warning when navigating away from a wanted list edit page with unsaved changes.",
    enabledByDefault: true,

    init: function () {
      var banner = document.getElementById("wanted-save-banner");
      if (!banner) return;

      beforeUnloadHandler = function (e) {
        // If edit-summary-banner is active, use its change tracking
        // (more precise — only warns when fields actually differ from defaults)
        var summary = document.getElementById("rb-edit-summary");
        if (summary) {
          if (summary.style.display !== "none") {
            e.preventDefault();
            e.returnValue = "";
            return "";
          }
          return;
        }

        // Fallback: banner is visible (display: block) when in edit mode
        if (banner.offsetHeight > 0) {
          e.preventDefault();
          e.returnValue = "";
          return "";
        }
      };

      window.addEventListener("beforeunload", beforeUnloadHandler);
    },

    destroy: function () {
      if (beforeUnloadHandler) {
        window.removeEventListener("beforeunload", beforeUnloadHandler);
        beforeUnloadHandler = null;
      }
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
