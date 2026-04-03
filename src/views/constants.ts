import { getConstants, getEnums, findConst, findEnum, hasConst, getXRef, getAllHeaders } from "../data";
import { el, clear } from "../dom";
import { matchQuery } from "../utils";
import { constLink, enumLink, funcLink, headerLink, badge, highlightCode } from "../ui/links";
import { buildFilterDropdown, FilterDropdownHandle } from "../ui/filter-dropdown";
import { buildSearchInput, buildSortRow, renderFilterChips, renderNotFound, collapsibleSection, renderPagination } from "./shared";
import type { Constant, EnumDef } from "../types";

const PAGE_SIZE = 50;

export function renderConstantsList(container: Element, query: Record<string, string> = {}): void {
  clear(container);

  let tab: "macros" | "enums" = "macros";
  let searchQuery = query.q ?? "";
  let useRegex = false;
  const filterHeaders = new Set<string>();
  if (query.header) filterHeaders.add(query.header);
  let page = 0;
  let headerDropdown: FilterDropdownHandle;

  const pg = el("div", { className: "list-view" });
  pg.appendChild(el("div", { className: "title-row" }, el("h2", {}, "Constants")));

  const activeFiltersEl = el("div", { className: "active-filters" });
  pg.appendChild(activeFiltersEl);

  function refreshAll() {
    headerDropdown?.refresh();
    rebuildChips();
    render();
  }

  function rebuildChips() {
    const chips: { label: string; onRemove: () => void }[] = [];
    for (const h of filterHeaders) chips.push({ label: `Header: ${h}`, onRemove: () => { filterHeaders.delete(h); page = 0; refreshAll(); } });
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();

  // Tabs
  const tabs = el("div", { className: "tabs" });
  const macroTab = el("button", { className: `tab-btn ${tab === "macros" ? "active" : ""}` },
    `Macro Constants (${getConstants().length.toLocaleString()})`);
  const enumTab = el("button", { className: `tab-btn ${tab === "enums" ? "active" : ""}` },
    `Enums (${getEnums().length.toLocaleString()})`);
  macroTab.addEventListener("click", () => { tab = "macros"; page = 0; render(); });
  enumTab.addEventListener("click", () => { tab = "enums"; page = 0; render(); });
  tabs.appendChild(macroTab); tabs.appendChild(enumTab);
  pg.appendChild(tabs);

  // Controls
  const controls = el("div", { className: "controls" });
  const search = buildSearchInput("Search (glob: STATUS_*, *ACCESS*)...", (q, re) => {
    searchQuery = q; useRegex = re; page = 0; render();
  }, searchQuery);
  controls.appendChild(search.element);

  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => { page = 0; refreshAll(); });
  controls.appendChild(headerDropdown.element);
  pg.appendChild(controls);

  // Sort
  const macroSort = buildSortRow([["name", "Name"], ["value", "Value"]], { sortBy: "name", sortDir: "asc" }, () => { page = 0; render(); });
  const enumSort = buildSortRow([["name", "Name"], ["value", "Variants"]], { sortBy: "name", sortDir: "asc" }, () => { page = 0; render(); });
  const sortContainer = el("div", {});
  pg.appendChild(sortContainer);

  const listContainer = el("div", { className: "list-container" });
  pg.appendChild(listContainer);
  const pagContainer = el("div", {});
  pg.appendChild(pagContainer);
  const countEl = el("div", { className: "result-count" });
  pg.appendChild(countEl);
  container.appendChild(pg);

  function getFilteredMacros(): Constant[] {
    let consts = getConstants();
    if (searchQuery) consts = consts.filter(c => matchQuery(c.name, searchQuery, useRegex) || matchQuery(c.hex, searchQuery, useRegex));
    if (filterHeaders.size > 0) consts = consts.filter(c => c.location.file !== null && filterHeaders.has(c.location.file));
    const { sortBy, sortDir } = macroSort.getState();
    consts = [...consts].sort((a, b) => {
      let cmp = sortBy === "name" ? a.name.localeCompare(b.name) : a.value - b.value;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return consts;
  }

  function getFilteredEnums(): EnumDef[] {
    let enums = getEnums();
    if (searchQuery) enums = enums.filter(e => matchQuery(e.name, searchQuery, useRegex) || e.constants.some(c => matchQuery(c.name, searchQuery, useRegex)));
    if (filterHeaders.size > 0) enums = enums.filter(e => e.location.file !== null && filterHeaders.has(e.location.file));
    const { sortBy, sortDir } = enumSort.getState();
    enums = [...enums].sort((a, b) => {
      let cmp = sortBy === "name" ? a.name.localeCompare(b.name) : a.constants.length - b.constants.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return enums;
  }

  function render() {
    clear(listContainer); clear(sortContainer);
    macroTab.className = `tab-btn ${tab === "macros" ? "active" : ""}`;
    enumTab.className = `tab-btn ${tab === "enums" ? "active" : ""}`;
    sortContainer.appendChild(tab === "macros" ? macroSort.element : enumSort.element);
    if (tab === "macros") renderMacros(); else renderEnumsList();
  }

  function renderMacros() {
    const filtered = getFilteredMacros();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page >= totalPages) page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    countEl.textContent = `${filtered.length.toLocaleString()} constants`;

    const table = el("table", { className: "data-table const-table" });
    table.appendChild(el("thead", {}, el("tr", {},
      el("th", {}, "Name"), el("th", {}, "Value"), el("th", {}, "Hex"), el("th", {}, "Expression"), el("th", {}, "Components"), el("th", {}, "Header"),
    )));
    const tbody = el("tbody", {});
    for (const c of pageItems) {
      const tr = el("tr", {});
      const nameTd = el("td", { className: "mono" });
      nameTd.appendChild(el("a", { className: "item-name", href: `#/constants/${encodeURIComponent(c.name)}` }, c.name));
      tr.appendChild(nameTd);
      tr.appendChild(el("td", { className: "mono val-col" }, String(c.value)));
      tr.appendChild(el("td", { className: "mono hex-col" }, c.hex));
      const exprText = c.expression && c.expression !== String(c.value) && c.expression !== c.hex ? c.expression : "";
      const exprTd = el("td", { className: "mono" });
      if (exprText) {
        const exprCode = el("code", { className: "c-prototype-inline" }, exprText);
        exprTd.appendChild(exprCode);
        requestAnimationFrame(() => highlightCode(exprCode));
      }
      tr.appendChild(exprTd);
      const compTd = el("td", { className: "mono" });
      if (c.components && c.components.length > 0) {
        for (const comp of c.components.slice(0, 3)) {
          if (hasConst(comp)) compTd.appendChild(constLink(comp));
          else compTd.appendChild(el("span", {}, comp));
          compTd.appendChild(document.createTextNode(" "));
        }
        if (c.components.length > 3) compTd.appendChild(el("span", { className: "dim" }, `+${c.components.length - 3}`));
      }
      tr.appendChild(compTd);
      const hTd = el("td", {}); hTd.appendChild(headerLink(c.location.file ?? "(built-in)", "constants"));
      tr.appendChild(hTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listContainer.appendChild(table);
    renderPagination(pagContainer, page, totalPages, (p) => { page = p; render(); listContainer.scrollIntoView({ behavior: "smooth" }); });
  }

  function renderEnumsList() {
    const filtered = getFilteredEnums();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page >= totalPages) page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    countEl.textContent = `${filtered.length.toLocaleString()} enums`;

    for (const e of pageItems) {
      const row = el("div", { className: "list-item enum-item" });
      const header = el("div", { className: "item-header" });
      const arrow = el("span", { className: "collapse-arrow" }, "\u25b6");
      header.appendChild(arrow);
      header.appendChild(el("a", { className: "item-name", href: `#/constants/enum/${encodeURIComponent(e.name)}` }, e.name));
      const info = el("span", { className: "item-info" });
      info.appendChild(badge(`${e.constants.length} variants`, "tag-fields"));
      if (e.constants.length > 0) info.appendChild(badge(`${e.constants[0].value}\u2013${e.constants[e.constants.length - 1].value}`, "tag-range"));
      info.appendChild(headerLink(e.location.file ?? "", "constants"));
      header.appendChild(info);
      const body = el("div", { className: "collapsible-body collapsed" });
      const table = el("table", { className: "data-table enum-detail-table" });
      table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Value"), el("th", {}, "Hex"))));
      const etbody = el("tbody", {});
      for (const c of e.constants) {
        etbody.appendChild(el("tr", {},
          el("td", { className: "mono bold" }, c.name),
          el("td", { className: "mono val-col" }, String(c.value)),
          el("td", { className: "mono hex-col" }, c.hex)));
      }
      table.appendChild(etbody); body.appendChild(table);
      header.addEventListener("click", (ev) => {
        if ((ev.target as Element).tagName === "A") return;
        body.classList.toggle("collapsed");
        arrow.textContent = body.classList.contains("collapsed") ? "\u25b6" : "\u25bc";
      });
      row.appendChild(header); row.appendChild(body);
      listContainer.appendChild(row);
    }
    renderPagination(pagContainer, page, totalPages, (p) => { page = p; render(); listContainer.scrollIntoView({ behavior: "smooth" }); });
  }

  render();
}

export function renderConstantDetail(container: Element, name: string): void {
  clear(container);
  const c = findConst(name);
  if (!c) { renderNotFound(container, "Constant", name, "#/constants", "All constants"); return; }

  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/constants", className: "back-link" }, "\u2190 All constants"));
  pg.appendChild(el("h2", { className: "mono" }, c.name));

  const valContent = el("div", {});
  valContent.appendChild(el("div", { className: "const-big-value" },
    el("span", { className: "const-decimal" }, String(c.value)),
    el("span", { className: "const-hex" }, c.hex)));
  const tags = el("div", { className: "tag-row" });
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(c.location.file ?? "(built-in)", "constants"));
  if (c.location.line) locTag.appendChild(document.createTextNode(`:${c.location.line}`));
  tags.appendChild(locTag);
  valContent.appendChild(tags);
  if (c.expression && c.expression !== String(c.value) && c.expression !== c.hex) {
    const exprSection = el("div", { className: "const-expression" });
    exprSection.appendChild(el("strong", {}, "Expression: "));
    const exprCode = el("code", { className: "c-prototype-inline" }, c.expression);
    exprSection.appendChild(exprCode);
    requestAnimationFrame(() => highlightCode(exprCode));
    valContent.appendChild(exprSection);
  }
  if (c.value >= 0 && c.value <= 0xFFFFFFFF) {
    const binSection = el("div", { className: "const-binary" });
    binSection.appendChild(el("strong", {}, "Binary: "));
    binSection.appendChild(el("code", { className: "mono" }, (c.value >>> 0).toString(2).padStart(32, "0").replace(/(.{4})/g, "$1 ").trim()));
    valContent.appendChild(binSection);
  }
  pg.appendChild(valContent);

  if (c.components && c.components.length > 0) {
    const table = el("table", { className: "data-table" });
    table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Component"), el("th", {}, "Value"), el("th", {}, "Hex"))));
    const tbody = el("tbody", {});
    for (const comp of c.components) {
      const cr = findConst(comp);
      const tr = el("tr", {});
      const nameTd = el("td", { className: "mono" });
      if (hasConst(comp)) nameTd.appendChild(constLink(comp));
      else nameTd.appendChild(document.createTextNode(comp));
      tr.appendChild(nameTd);
      tr.appendChild(el("td", { className: "mono val-col" }, cr ? String(cr.value) : "?"));
      tr.appendChild(el("td", { className: "mono hex-col" }, cr ? cr.hex : "?"));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    pg.appendChild(collapsibleSection("Composition", table));
  }

  const xref = getXRef();
  const enumName = xref.enumForConstant.get(c.name);
  if (enumName) pg.appendChild(collapsibleSection("Part of enum", el("div", { className: "xref-list" }, el("span", { className: "xref-chip" }, enumLink(enumName)))));

  const usedBy = xref.constToConsts.get(c.name);
  if (usedBy && usedBy.size > 0) {
    const list = el("div", { className: "xref-list" });
    for (const cn of [...usedBy].sort()) list.appendChild(el("span", { className: "xref-chip" }, constLink(cn)));
    pg.appendChild(collapsibleSection(`Used by (${usedBy.size} constants)`, list));
  }

  const funcsUsing = xref.constToFunctions.get(c.name);
  if (funcsUsing && funcsUsing.size > 0) {
    const list = el("div", { className: "xref-list" });
    const sorted = [...funcsUsing].sort();
    let showing = 30;
    const renderFn = () => {
      list.innerHTML = "";
      for (const fn of sorted.slice(0, showing)) list.appendChild(el("span", { className: "xref-chip" }, funcLink(fn)));
      if (showing < sorted.length) {
        const more = el("button", { className: "expand-more-btn" }, `+${sorted.length - showing} more`);
        more.addEventListener("click", () => { showing = sorted.length; renderFn(); });
        list.appendChild(more);
      }
    };
    renderFn();
    pg.appendChild(collapsibleSection(`Functions referencing this (${funcsUsing.size})`, list));
  }

  container.appendChild(pg);
}

export function renderEnumDetail(container: Element, name: string): void {
  clear(container);
  const e = findEnum(name);
  if (!e) { renderNotFound(container, "Enum", name, "#/constants", "All constants"); return; }

  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/constants", className: "back-link" }, "\u2190 All constants"));
  pg.appendChild(el("h2", { className: "mono" }, e.name));

  const tags = el("div", { className: "tag-row" });
  tags.appendChild(badge(`${e.constants.length} variants`, "tag-fields"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(e.location.file ?? "", "constants"));
  tags.appendChild(locTag);
  if (e.type) tags.appendChild(badge(`type: ${e.type}`, "tag-arch"));
  pg.appendChild(tags);

  const proto = el("pre", { className: "c-prototype" });
  let code = `typedef enum ${e.name} {\n`;
  e.constants.forEach((c, i) => {
    code += `    ${c.name} = ${c.value}`;
    if (c.hex !== `0x${c.value.toString(16).toUpperCase()}` && c.hex !== `0x${c.value.toString(16)}`) code += ` /* ${c.hex} */`;
    if (i < e.constants.length - 1) code += ",";
    code += "\n";
  });
  code += `} ${e.name};`;
  proto.textContent = code;
  pg.appendChild(collapsibleSection("C Definition", proto));
  requestAnimationFrame(() => highlightCode(proto));

  const table = el("table", { className: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "#"), el("th", {}, "Name"), el("th", {}, "Value"), el("th", {}, "Hex"))));
  const tbody = el("tbody", {});
  e.constants.forEach((c, i) => {
    tbody.appendChild(el("tr", {},
      el("td", { className: "mono dim" }, String(i)),
      el("td", { className: "mono bold" }, c.name),
      el("td", { className: "mono val-col" }, String(c.value)),
      el("td", { className: "mono hex-col" }, c.hex)));
  });
  table.appendChild(tbody);
  pg.appendChild(collapsibleSection("Variants", table));

  container.appendChild(pg);
}
