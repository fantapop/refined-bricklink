(function () {
  var STYLE_ID = "rb-quantity-spacing-styles";
  var styleEl = null;

  var featureDef = {
    id: "quantity-spacing",
    name: "Quantity Style Fixes",
    description:
      "Fixes misaligned Want/Have input fields on wanted list edit pages. Normalizes label widths, reduces padding, and merges the two inputs into one rounded shape.",
    enabledByDefault: true,
    cssVars: [
      {
        name: "--rb-label-min-width",
        label: "Want/Have label width",
        description: "Minimum width of Want:/Have: labels so inputs stay aligned",
        default: "38px",
        type: "text",
      },
    ],

    init: function () {
      if (!document.querySelector(".table-wl-edit")) return;

      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = /* @inline */``;
      document.head.appendChild(styleEl);
    },

    destroy: function () {
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
