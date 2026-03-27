(function () {
  var observer = null;
  var bodyObserver = null;
  var styleEl = null;
  var CSS = /* @inline */``;
  var isWiringUp = false;

  var featureDef = {
    id: "wanted-list-download-buttons",
    name: "Wanted List Download Buttons",
    description:
      "Adds a Download button to each row on the Wanted Lists page so you can download a list without clicking into it.",
    enabledByDefault: true,
    section: "Wanted Lists",
    docsUrl: "https://github.com/fantapop/refined-bricklink#download-buttons",

    init() {
      if (!window.location.pathname.includes("/v2/wanted/list.page")) return;

      styleEl = document.createElement("style");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);

      const addButtons = () => {
        if (isWiringUp) return;
        const table = document.querySelector(
          "table.wl-overview-list-table:not(.compact)"
        );
        if (!table) return;

        isWiringUp = true;
        const rows = Array.from(table.querySelectorAll("tr")).filter((r) =>
          r.querySelector("td")
        );
        const hideEnabled = document.body.classList.contains("rb-hide-enabled");
        const showHidden = document.body.classList.contains("rb-show-hidden");
        for (const row of rows) {
          if (row.querySelector(".rb-dl-btn")) continue;

          const link = row.querySelector("a");
          if (!link) continue;
          const href = link.getAttribute("href") || "";
          const qs = href.includes("?") ? href.split("?")[1] : "";
          const params = new URLSearchParams(qs);
          const id = params.get("wantedMoreID");
          const name = link.textContent.trim();
          if (!id) continue;
          if (hideEnabled && !showHidden && RefinedBricklink.isHidden(name)) continue;

          const actionCell = row.querySelector("td.no-break");
          if (!actionCell) continue;

          const btn = document.createElement("a");
          btn.className = "bl-btn bl-btn--tight l-margin-left--xs rb-dl-btn";
          btn.textContent = "Download";
          btn.href = `/files/clone/wanted/downloadXML.file?wantedMoreID=${id}&wlName=${encodeURIComponent(name)}`;
          actionCell.appendChild(btn);
        }
        isWiringUp = false;
      };

      addButtons();

      observer = new MutationObserver(addButtons);
      observer.observe(document.querySelector("main") || document.body, {
        childList: true,
        subtree: true,
      });

      // Re-evaluate when wanted-list-hide changes show-hidden state
      bodyObserver = new MutationObserver(addButtons);
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    },

    destroy() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (bodyObserver) {
        bodyObserver.disconnect();
        bodyObserver = null;
      }
      if (styleEl) {
        styleEl.remove();
        styleEl = null;
      }
      document.querySelectorAll(".rb-dl-btn").forEach((el) => el.remove());
    },
  };

  RefinedBricklink.features.push(featureDef);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = featureDef;
  }
})();
