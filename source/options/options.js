(function () {
  const container = document.getElementById("features-list");

  // Dynamically load feature scripts from the manifest so we don't
  // have to maintain a separate list in options.html.
  // registry.js is loaded synchronously in options.html.
  // main.js is not needed on the options page.
  const manifest = chrome.runtime.getManifest();
  const mainBlock = manifest.content_scripts.find(function (b) {
    return b.js && b.js.includes("main.js");
  });
  const scripts = (mainBlock ? mainBlock.js : []).filter(function (src) {
    return src !== "registry.js" && src !== "main.js";
  });

  function onAllLoaded() {
    const features = RefinedBricklink.features;

    // Build defaults for feature toggles, css vars, and settings in one pass
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

    const SECTION_ORDER = ["Wanted Lists", "Upload", "Part Out", "Search", "Buy", "Modals"];

    // Group features by section, preserving manifest order within each section
    const sections = {};
    for (const feature of features) {
      const s = feature.section || "Other";
      if (!sections[s]) sections[s] = [];
      sections[s].push(feature);
    }

    // Only include sections that have features, in the defined order
    const orderedSections = SECTION_ORDER.filter((s) => sections[s]);
    for (const s of Object.keys(sections)) {
      if (!orderedSections.includes(s)) orderedSections.push(s);
    }

    chrome.storage.sync.get(defaults, function (settings) {
      for (const sectionName of orderedSections) {
        const heading = document.createElement("h2");
        heading.className = "section-heading";
        heading.textContent = sectionName;
        container.appendChild(heading);

        for (const feature of sections[sectionName]) {
        const card = document.createElement("div");
        card.className = "feature-card";

        // ── Header row ──────────────────────────────────────────────
        const header = document.createElement("div");
        header.className = "feature-header";

        const info = document.createElement("div");
        info.className = "feature-info";

        const nameRow = document.createElement("div");
        nameRow.className = "feature-name";

        const nameText = document.createElement("span");
        nameText.textContent = feature.name;
        nameRow.appendChild(nameText);

        if (feature.docsUrl) {
          const docsLink = document.createElement("a");
          docsLink.className = "feature-docs-link";
          docsLink.href = feature.docsUrl;
          docsLink.target = "_blank";
          docsLink.rel = "noopener";
          docsLink.textContent = "?";
          docsLink.title = "View documentation";
          nameRow.appendChild(docsLink);
        }

        info.appendChild(nameRow);

        const desc = document.createElement("div");
        desc.className = "feature-desc";
        desc.textContent = feature.description;
        info.appendChild(desc);

        header.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "feature-actions";

        // ── Customize button (for features with cssVars or settings) ──
        const cardVars = feature.cssVars || [];
        const cardSettings = feature.settings || [];
        let varsSection = null;

        if (cardVars.length > 0 || cardSettings.length > 0) {
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

          // ── Settings rows ─────────────────────────────────────────
          for (const s of cardSettings) {
            if (s.type !== "boolean" && s.type !== "text" && s.type !== "textarea" && s.type !== "select") continue;
            const row = document.createElement("div");
            row.className = s.type === "textarea" ? "style-row style-row--wide" : "style-row";

            const rowInfo = document.createElement("div");
            rowInfo.className = "style-info";

            const label = document.createElement("label");
            label.className = "style-label";
            label.textContent = s.label;
            rowInfo.appendChild(label);

            if (s.description) {
              const rowDesc = document.createElement("div");
              rowDesc.className = "style-desc";
              rowDesc.textContent = s.description;
              rowInfo.appendChild(rowDesc);
            }

            if (s.examples) {
              const examplesEl = document.createElement("div");
              examplesEl.className = "style-examples";
              const header = document.createElement("div");
              header.className = "style-examples-header";
              header.textContent = "Examples:";
              examplesEl.appendChild(header);
              const grid = document.createElement("div");
              grid.className = "style-examples-grid";
              for (const [pattern, desc] of s.examples) {
                const patEl = document.createElement("code");
                patEl.className = "style-example-pattern";
                patEl.textContent = pattern;
                grid.appendChild(patEl);
                const descEl = document.createElement("span");
                descEl.className = "style-example-desc";
                descEl.textContent = desc;
                grid.appendChild(descEl);
              }
              examplesEl.appendChild(grid);
              rowInfo.appendChild(examplesEl);
            }

            row.appendChild(rowInfo);

            if (s.type === "boolean") {
              const toggleLabel = document.createElement("label");
              toggleLabel.className = "toggle";

              const scb = document.createElement("input");
              scb.type = "checkbox";
              scb.checked = !!settings[s.name];
              scb.addEventListener("change", function () {
                chrome.storage.sync.set({ [s.name]: scb.checked });
              });

              const slider = document.createElement("span");
              slider.className = "slider";
              toggleLabel.appendChild(scb);
              toggleLabel.appendChild(slider);
              row.appendChild(toggleLabel);
            } else if (s.type === "select") {
              const sel = document.createElement("select");
              sel.className = "style-select-input";
              let opts = s.options || [];
              if (s.optionsFrom && settings[s.optionsFrom]) {
                opts = settings[s.optionsFrom]
                  .split(",")
                  .map((v) => v.trim())
                  .filter((v) => v && !isNaN(parseInt(v, 10)))
                  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
                  .map((v) => ({ value: v, label: v }));
              }
              for (const opt of opts) {
                const option = document.createElement("option");
                option.value = opt.value;
                option.textContent = opt.label;
                if (String(settings[s.name]) === String(opt.value)) option.selected = true;
                sel.appendChild(option);
              }
              sel.addEventListener("change", function () {
                chrome.storage.sync.set({ [s.name]: sel.value });
              });
              row.appendChild(sel);
            } else if (s.type === "text") {
              const input = document.createElement("input");
              input.type = "text";
              input.value = settings[s.name] ?? s.default;
              input.className = "style-text-input";
              input.placeholder = s.default;
              input.addEventListener("change", function () {
                chrome.storage.sync.set({ [s.name]: input.value });
              });
              row.appendChild(input);
            } else if (s.type === "textarea") {
              const ta = document.createElement("textarea");
              ta.value = settings[s.name] ?? s.default;
              ta.className = "style-textarea";
              ta.placeholder = s.default;
              ta.rows = 1;
              ta.spellcheck = false;
              ta.addEventListener("change", function () {
                chrome.storage.sync.set({ [s.name]: ta.value });
              });
              row.appendChild(ta);
            }
            varsSection.appendChild(row);
          }

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
        } // end feature loop
      } // end section loop
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
