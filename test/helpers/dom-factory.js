/**
 * DOM factory helpers for building BrickLink-like markup in tests.
 */

/**
 * Creates a wanted-list modal container with the given list names.
 * First name is treated as "Default Wanted List".
 */
export function createWantedListModal(listNames) {
  const wrapper = document.createElement("div");
  wrapper.className = "wl-add-list";

  const container = document.createElement("div");
  container.className = "l-overflow-auto--y";

  for (const name of listNames) {
    const btn = document.createElement("button");
    btn.className = "wl-search-list";
    const span = document.createElement("span");
    span.className = "wl-search-list__name";
    span.textContent = name;
    btn.appendChild(span);
    container.appendChild(btn);
  }

  wrapper.appendChild(container);
  return wrapper;
}

/**
 * Creates a trigger link for the "Add to Wanted List" action.
 */
export function createWantedAddLink() {
  const link = document.createElement("a");
  link.className = "bl-wanted-addable";
  link.href = "#";
  link.textContent = "Add to Wanted List";
  return link;
}

/**
 * Creates a wanted lists index table (wl-overview-list-table).
 * Each list = { id, name }
 */
export function createWantedListsIndexTable(lists) {
  const table = document.createElement("table");
  table.className = "wl-overview-list-table";

  for (const list of lists) {
    const tr = document.createElement("tr");

    // Name cell
    const nameTd = document.createElement("td");
    const nameDiv = document.createElement("div");
    nameDiv.className = "break-word";
    const link = document.createElement("a");
    link.href = `/v2/wanted/edit.page?wantedMoreID=${list.id}`;
    link.textContent = list.name;
    const caption = document.createElement("p");
    caption.className = "caption";
    nameDiv.appendChild(link);
    nameDiv.appendChild(caption);
    nameTd.appendChild(nameDiv);
    tr.appendChild(nameTd);

    // Items cell
    const itemsTd = document.createElement("td");
    const span = document.createElement("span");
    span.textContent = "0";
    itemsTd.appendChild(span);
    tr.appendChild(itemsTd);

    // Progress cell
    const progressTd = document.createElement("td");
    const progressDiv = document.createElement("div");
    progressDiv.className =
      "progress-bar-container progress-bar-container--overview";
    progressDiv.textContent = "0%";
    progressTd.appendChild(progressDiv);
    tr.appendChild(progressTd);

    // Actions cell
    const actionsTd = document.createElement("td");
    actionsTd.className = "no-break";
    const easyBuy = document.createElement("button");
    easyBuy.className = "bl-btn bl-btn--tight primaryGreen--inverted";
    easyBuy.textContent = "Easy Buy";
    const setup = document.createElement("button");
    setup.className = "bl-btn bl-btn--tight l-margin-left--xs";
    setup.textContent = "Setup";
    actionsTd.appendChild(easyBuy);
    actionsTd.appendChild(setup);
    tr.appendChild(actionsTd);

    table.appendChild(tr);
  }

  return table;
}

/**
 * Creates a maintenance banner element.
 */
export function createMaintenanceBanner() {
  const div = document.createElement("div");
  div.className = "blp-sitewide-notification__item--monthlyMaintenance";
  div.textContent = "Scheduled maintenance in progress";
  return div;
}

/**
 * Creates a basic page link.
 */
export function createLink(href, text) {
  const a = document.createElement("a");
  a.href = href || "https://www.bricklink.com/somepage.asp";
  a.textContent = text || "Some Page";
  return a;
}

/**
 * Creates a wanted list edit table with rows of editable fields.
 * Each row = { want, have, price, condition, remarks, notify }
 */
export function createWantedListEditTable(rows) {
  const table = document.createElement("div");
  table.className = "table table-wl-edit";

  // Header row
  const header = document.createElement("div");
  header.className = "table-row l-flex l-center";
  for (const col of [
    "checkbox",
    "img",
    "desc",
    "condition",
    "price",
    "quantity",
    "remarks",
    "notify",
  ]) {
    const cell = document.createElement("div");
    cell.className = `wl-col-${col} wl-edit-cell`;
    cell.textContent =
      col.charAt(0).toUpperCase() + col.slice(1);
    header.appendChild(cell);
  }
  table.appendChild(header);

  for (const row of rows) {
    const tr = document.createElement("div");
    tr.className = "table-row l-flex l-center";

    // Checkbox
    const cbCell = document.createElement("div");
    cbCell.className = "wl-col-checkbox wl-edit-cell";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cbCell.appendChild(cb);
    tr.appendChild(cbCell);

    // Image
    const imgCell = document.createElement("div");
    imgCell.className = "wl-col-img wl-edit-cell";
    imgCell.textContent = "Image";
    tr.appendChild(imgCell);

    // Description
    const descCell = document.createElement("div");
    descCell.className = "wl-col-desc wl-edit-cell";
    descCell.textContent = row.description || "Part";
    tr.appendChild(descCell);

    // Condition (select)
    const condCell = document.createElement("div");
    condCell.className = "wl-col-condition wl-edit-cell";
    const condDiv = document.createElement("div");
    const sel = document.createElement("select");
    sel.className = "form-text";
    for (const opt of [
      { value: "X", text: "Any" },
      { value: "N", text: "New" },
      { value: "U", text: "Used" },
    ]) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.text;
      if (opt.value === (row.condition || "X")) o.defaultSelected = true;
      sel.appendChild(o);
    }
    condDiv.appendChild(sel);
    condCell.appendChild(condDiv);
    tr.appendChild(condCell);

    // Price
    const priceCell = document.createElement("div");
    priceCell.className = "wl-col-price wl-edit-cell";
    const priceWrap = document.createElement("div");
    priceWrap.className = "full-width";
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.className = "form-text";
    priceInput.value = row.price || "";
    priceInput.defaultValue = row.price || "";
    priceWrap.appendChild(priceInput);
    priceCell.appendChild(priceWrap);
    tr.appendChild(priceCell);

    // Quantity (want + have)
    const qtyCell = document.createElement("div");
    qtyCell.className = "wl-col-quantity wl-edit-cell";

    const wantWrap = document.createElement("div");
    wantWrap.className = "full-width";
    const wantLabel = document.createElement("span");
    wantLabel.textContent = "Want:";
    const wantInput = document.createElement("input");
    wantInput.type = "number";
    wantInput.className = "form-text width-small";
    wantInput.value = String(row.want ?? 1);
    wantInput.defaultValue = String(row.want ?? 1);
    wantWrap.appendChild(wantLabel);
    wantWrap.appendChild(document.createTextNode(" "));
    wantWrap.appendChild(wantInput);
    qtyCell.appendChild(wantWrap);

    const haveWrap = document.createElement("div");
    haveWrap.className = "full-width";
    const haveLabel = document.createElement("span");
    haveLabel.textContent = "Have:";
    const haveInput = document.createElement("input");
    haveInput.type = "number";
    haveInput.className = "form-text width-small";
    haveInput.value = String(row.have ?? 0);
    haveInput.defaultValue = String(row.have ?? 0);
    haveWrap.appendChild(haveLabel);
    haveWrap.appendChild(document.createTextNode(" "));
    haveWrap.appendChild(haveInput);
    qtyCell.appendChild(haveWrap);

    tr.appendChild(qtyCell);

    // Remarks
    const remCell = document.createElement("div");
    remCell.className = "wl-col-remarks wl-edit-cell";
    const textarea = document.createElement("textarea");
    textarea.className = "form-text";
    textarea.value = row.remarks || "";
    textarea.defaultValue = row.remarks || "";
    remCell.appendChild(textarea);
    tr.appendChild(remCell);

    // Notify
    const notCell = document.createElement("div");
    notCell.className = "wl-col-notify wl-edit-cell";
    const notifyCb = document.createElement("input");
    notifyCb.type = "checkbox";
    notifyCb.checked = row.notify || false;
    notifyCb.defaultChecked = row.notify || false;
    notCell.appendChild(notifyCb);
    tr.appendChild(notCell);

    table.appendChild(tr);
  }

  return table;
}
