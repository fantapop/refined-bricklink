(function () {
  const container = document.getElementById("features-list");

  // Dynamically load feature scripts from the manifest so we don't
  // have to maintain a separate list in options.html.
  // registry.js is loaded synchronously in options.html.
  // main.js is not needed on the options page.
  const manifest = chrome.runtime.getManifest();
  const scripts = manifest.content_scripts[0].js.filter(function (src) {
    return src !== "registry.js" && src !== "main.js";
  });

  function onAllLoaded() {
    const features = RefinedBricklink.features;

    // Build defaults for feature toggles and all css vars in one pass
    const defaults = {};
    for (const feature of features) {
      defaults[feature.id] = feature.enabledByDefault;
      for (const v of (feature.cssVars || [])) {
        defaults[v.name] = v.default;
      }
    }

    chrome.storage.sync.get(defaults, function (settings) {
      for (const feature of features) {
        const card = document.createElement("div");
        card.className = "feature-card";

        // ── Header row ──────────────────────────────────────────────
        const header = document.createElement("div");
        header.className = "feature-header";

        const info = document.createElement("div");
        info.className = "feature-info";

        const name = document.createElement("div");
        name.className = "feature-name";
        name.textContent = feature.name;
        info.appendChild(name);

        const desc = document.createElement("div");
        desc.className = "feature-desc";
        desc.textContent = feature.description;
        info.appendChild(desc);

        header.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "feature-actions";

        // ── Customize button (only for features with cssVars) ─────────
        const cardVars = feature.cssVars || [];
        let varsSection = null;

        if (cardVars.length > 0) {
          varsSection = document.createElement("div");
          varsSection.className = "feature-vars";
          varsSection.hidden = true;

          const customizeBtn = document.createElement("button");
          customizeBtn.className = "customize-btn";
          customizeBtn.textContent = "Customize";
          customizeBtn.addEventListener("click", function () {
            const opening = varsSection.hidden;
            varsSection.hidden = !opening;
            customizeBtn.classList.toggle("is-open", opening);
          });
          actions.appendChild(customizeBtn);

          // ── Var rows ──────────────────────────────────────────────
          for (const v of cardVars) {
            const row = document.createElement("div");
            row.className = "style-row";

            const rowInfo = document.createElement("div");
            rowInfo.className = "style-info";

            const label = document.createElement("label");
            label.className = "style-label";
            label.htmlFor = "rb-var-" + v.name;
            label.textContent = v.label;
            rowInfo.appendChild(label);

            const rowDesc = document.createElement("div");
            rowDesc.className = "style-desc";
            rowDesc.textContent = v.description;
            rowInfo.appendChild(rowDesc);

            row.appendChild(rowInfo);

            const input = document.createElement("input");
            input.id = "rb-var-" + v.name;
            input.type = v.type === "color" ? "color" : "text";
            input.value = settings[v.name];
            input.className = v.type === "color" ? "style-color-input" : "style-text-input";
            if (v.type !== "color") {
              input.placeholder = v.default;
            }
            input.addEventListener("change", function () {
              chrome.storage.sync.set({ [v.name]: input.value });
            });

            if (v.type === "color") {
              const group = document.createElement("div");
              group.className = "style-input-group";
              group.appendChild(input);
              const hex = document.createElement("span");
              hex.className = "style-color-hex";
              hex.textContent = input.value;
              input.addEventListener("input", function () { hex.textContent = input.value; });
              group.appendChild(hex);
              row.appendChild(group);
            } else {
              row.appendChild(input);
            }
            varsSection.appendChild(row);
          }
        }

        // ── Toggle switch ────────────────────────────────────────────
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "toggle";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.id = feature.id;
        checkbox.checked = !!settings[feature.id];
        checkbox.addEventListener("change", function () {
          chrome.storage.sync.set({ [feature.id]: checkbox.checked });
        });

        const slider = document.createElement("span");
        slider.className = "slider";

        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(slider);
        actions.appendChild(toggleLabel);

        header.appendChild(actions);
        card.appendChild(header);

        if (varsSection) {
          card.appendChild(varsSection);
        }

        container.appendChild(card);
      }
    });
  }

  // Load scripts sequentially to preserve order
  function loadNext(i) {
    if (i >= scripts.length) {
      onAllLoaded();
      return;
    }
    const script = document.createElement("script");
    script.src = "../" + scripts[i];
    script.onload = script.onerror = function () {
      loadNext(i + 1);
    };
    document.head.appendChild(script);
  }

  loadNext(0);
})();
