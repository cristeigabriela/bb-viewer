import { searchAll, findFunc, findType, findConst, findEnum } from "./data";
import { el, clear } from "./dom";
import { badge, renderTypeStr } from "./ui/links";
import { debounce } from "./utils";
import { navigate } from "./router";

let overlay: HTMLElement;
let input: HTMLInputElement;
let resultsList: HTMLElement;
let previewPane: HTMLElement;
let selectedIndex = -1;
let currentItems: Array<{ kind: string; name: string; href: string }> = [];
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function getHref(item: { kind: string; name: string }): string {
  switch (item.kind) {
    case "function": return `#/functions/${encodeURIComponent(item.name)}`;
    case "type": return `#/types/${encodeURIComponent(item.name)}`;
    case "constant": return `#/constants/${encodeURIComponent(item.name)}`;
    case "enum": return `#/constants/enum/${encodeURIComponent(item.name)}`;
    default: return "#/";
  }
}

function getBadge(kind: string): HTMLElement {
  switch (kind) {
    case "function": return badge("fn", "search-badge-fn");
    case "type": return badge("type", "search-badge-type");
    case "constant": return badge("const", "search-badge-const");
    case "enum": return badge("enum", "search-badge-enum");
    case "page": return badge("go", "search-badge-page");
    default: return badge(kind);
  }
}

function renderPreview(item: { kind: string; name: string }): void {
  clear(previewPane);
  previewPane.classList.add("visible");

  const header = el("div", { className: "sp-header" });
  header.appendChild(getBadge(item.kind));
  header.appendChild(el("span", { className: "sp-name" }, item.name));
  previewPane.appendChild(header);

  if (item.kind === "function") {
    const fn = findFunc(item.name);
    if (fn) {
      // Signature
      const sig = el("div", { className: "sp-sig" });
      sig.appendChild(renderTypeStr(fn.return_type));
      sig.appendChild(document.createTextNode(" " + fn.name + "("));
      fn.params.forEach((p, i) => {
        if (i > 0) sig.appendChild(document.createTextNode(", "));
        sig.appendChild(renderTypeStr(p.type));
        if (p.name) sig.appendChild(document.createTextNode(" " + p.name));
      });
      sig.appendChild(document.createTextNode(")"));
      previewPane.appendChild(sig);

      // Info
      const info = el("div", { className: "sp-info" });
      info.appendChild(el("div", {}, `header: ${fn.location.file ?? "?"}`));
      info.appendChild(el("div", {}, `params: ${fn.params.length}, ${fn.calling_convention}`));
      if (fn.is_dllimport /* exported */) info.appendChild(el("div", {}, "exported"));
      if (fn.metadata?.dll) info.appendChild(el("div", {}, `dll: ${fn.metadata.dll.split(/[\s;]/)[0]}`));
      previewPane.appendChild(info);
    }
  } else if (item.kind === "type") {
    const td = findType(item.name);
    if (td) {
      const info = el("div", { className: "sp-info" });
      info.appendChild(el("div", {}, `size: ${td.size !== null ? td.size + "B" : "opaque"}`));
      info.appendChild(el("div", {}, `fields: ${td.fields.length}`));
      info.appendChild(el("div", {}, `header: ${td.location.file ?? "?"}`));
      previewPane.appendChild(info);

      if (td.fields.length > 0) {
        const fields = el("div", { className: "sp-fields" });
        for (const f of td.fields.slice(0, 12)) {
          const row = el("div", { className: "sp-field-row" });
          row.appendChild(el("span", { className: "sp-field-off" }, `0x${f.offset.toString(16).toUpperCase()}`));
          row.appendChild(el("span", { className: "sp-field-name" }, f.name));
          row.appendChild(el("span", { className: "sp-field-type" }, f.type ?? "?"));
          fields.appendChild(row);
        }
        if (td.fields.length > 12) {
          fields.appendChild(el("div", { className: "dim" }, `+${td.fields.length - 12} more fields`));
        }
        previewPane.appendChild(fields);
      }
    }
  } else if (item.kind === "constant") {
    const c = findConst(item.name);
    if (c) {
      const info = el("div", { className: "sp-info" });
      info.appendChild(el("div", {}, `value: ${c.value}`));
      info.appendChild(el("div", {}, `hex: ${c.hex}`));
      info.appendChild(el("div", {}, `header: ${c.location.file ?? "?"}`));
      if (c.components && c.components.length > 0) {
        info.appendChild(el("div", {}, `components: ${c.components.slice(0, 5).join(", ")}${c.components.length > 5 ? "..." : ""}`));
      }
      previewPane.appendChild(info);
    }
  } else if (item.kind === "enum") {
    const e = findEnum(item.name);
    if (e) {
      const info = el("div", { className: "sp-info" });
      info.appendChild(el("div", {}, `variants: ${e.constants.length}`));
      info.appendChild(el("div", {}, `header: ${e.location.file ?? "?"}`));
      previewPane.appendChild(info);

      const variants = el("div", { className: "sp-fields" });
      for (const c of e.constants.slice(0, 12)) {
        const row = el("div", { className: "sp-field-row" });
        row.appendChild(el("span", { className: "sp-field-name" }, c.name));
        row.appendChild(el("span", { className: "sp-field-type" }, `= ${c.value}`));
        variants.appendChild(row);
      }
      if (e.constants.length > 12) {
        variants.appendChild(el("div", { className: "dim" }, `+${e.constants.length - 12} more`));
      }
      previewPane.appendChild(variants);
    }
  }
}

function schedulePreview(item: { kind: string; name: string }): void {
  cancelPreview();
  previewTimer = setTimeout(() => renderPreview(item), 300);
}

function cancelPreview(): void {
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
}

function updateSelection(): void {
  const items = resultsList.querySelectorAll(".sm-result-item");
  items.forEach((el, i) => {
    el.classList.toggle("selected", i === selectedIndex);
  });
  // Scroll selected into view
  if (selectedIndex >= 0 && items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: "nearest" });
    // Show preview for selected item
    if (currentItems[selectedIndex]) {
      renderPreview(currentItems[selectedIndex]);
    }
  }
}

function selectAndGo(): void {
  if (selectedIndex >= 0 && currentItems[selectedIndex]) {
    closeModal();
    navigate(currentItems[selectedIndex].href.slice(1)); // remove #
  }
}

/** Collect page shortcuts from navbar links + known subtabs */
function getShortcuts(): Array<{ kind: string; name: string; href: string }> {
  const shortcuts: Array<{ kind: string; name: string; href: string }> = [];
  for (const link of document.querySelectorAll(".nav-link")) {
    const text = link.textContent?.trim().toLowerCase() ?? "";
    const href = link.getAttribute("href") ?? "#/";
    if (text) shortcuts.push({ kind: "page", name: text, href });
  }
  // Subtab pages not in the navbar
  shortcuts.push({ kind: "page", name: "type graph", href: "#/types/graph" });
  return shortcuts;
}

function renderResultRow(item: { kind: string; name: string; href: string }, index: number): HTMLElement {
  const row = el("a", { href: item.href, className: "sm-result-item" });
  row.appendChild(getBadge(item.kind));
  row.appendChild(el("span", { className: "sm-result-name" }, item.name));
  row.addEventListener("click", (e) => {
    e.preventDefault();
    selectedIndex = index;
    selectAndGo();
  });
  row.addEventListener("mouseenter", () => {
    selectedIndex = index;
    updateSelection();
    schedulePreview(item);
  });
  row.addEventListener("mouseleave", () => cancelPreview());
  return row;
}

function doSearch(): void {
  const q = input.value.trim();
  clear(resultsList);
  previewPane.classList.remove("visible");
  clear(previewPane);
  selectedIndex = -1;
  currentItems = [];

  if (q.length < 1) return;

  // Match shortcuts first
  const ql = q.toLowerCase();
  const matchedShortcuts = getShortcuts().filter(s => s.name.includes(ql));

  const items = searchAll(q, 50);

  if (matchedShortcuts.length === 0 && items.length === 0) {
    resultsList.appendChild(el("div", { className: "sm-empty" }, "no results"));
    return;
  }

  // Shortcuts at the top
  for (const s of matchedShortcuts) {
    currentItems.push(s);
  }
  // Then regular results
  for (const item of items) {
    currentItems.push({ ...item, href: getHref(item) });
  }

  for (let i = 0; i < currentItems.length; i++) {
    resultsList.appendChild(renderResultRow(currentItems[i], i));
  }
}

function openModal(): void {
  overlay.classList.add("visible");
  input.value = "";
  clear(resultsList);
  previewPane.classList.remove("visible");
  clear(previewPane);
  selectedIndex = -1;
  currentItems = [];
  requestAnimationFrame(() => input.focus());
}

function closeModal(): void {
  overlay.classList.remove("visible");
  input.value = "";
  cancelPreview();
}

export function setupSearchModal(): void {
  // Build the modal DOM
  overlay = el("div", { className: "sm-overlay" });

  const modal = el("div", { className: "sm-modal" });

  // Search input row
  const inputRow = el("div", { className: "sm-input-row" });
  const slash = el("span", { className: "sm-slash" }, "/");
  input = el("input", {
    type: "text",
    placeholder: "search everything...",
    className: "sm-input",
  }) as HTMLInputElement;
  inputRow.appendChild(slash);
  inputRow.appendChild(input);
  modal.appendChild(inputRow);

  // Body: results + preview
  const body = el("div", { className: "sm-body" });
  resultsList = el("div", { className: "sm-results" });
  previewPane = el("div", { className: "sm-preview" });
  body.appendChild(resultsList);
  body.appendChild(previewPane);
  modal.appendChild(body);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Search on input
  input.addEventListener("input", debounce(doSearch, 100));

  // Close on clicking backdrop
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Keyboard navigation
  input.addEventListener("keydown", (e) => {
    const len = currentItems.length;
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "j")) {
      e.preventDefault();
      selectedIndex = len > 0 ? (selectedIndex + 1) % len : -1;
      updateSelection();
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "k")) {
      e.preventDefault();
      selectedIndex = len > 0 ? (selectedIndex - 1 + len) % len : -1;
      updateSelection();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0) {
        selectAndGo();
      } else if (currentItems.length > 0) {
        selectedIndex = 0;
        selectAndGo();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });

  // Global keyboard shortcut to open
  document.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("visible")) {
      if (e.key === "Escape") { closeModal(); e.preventDefault(); }
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest("input, textarea, select")) return;
    if (e.key === "/" || (e.ctrlKey && e.key === "k")) {
      e.preventDefault();
      openModal();
    }
  });

  // Wire the navbar search trigger to open the modal
  const navSearch = document.getElementById("global-search");
  if (navSearch) {
    navSearch.addEventListener("click", () => openModal());
  }
}
