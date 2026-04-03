import { getTypes, findType, getXRef, getAllHeaders } from "../data";
import { el, clear } from "../dom";
import { matchQuery } from "../utils";
import { typeLink, funcLink, renderTypeStr, headerLink, badge, highlightCode } from "../ui/links";
import { buildFilterDropdown, FilterDropdownHandle } from "../ui/filter-dropdown";
import { buildSearchInput, buildSortRow, renderFilterChips, renderNotFound, collapsibleSection, renderPagination } from "./shared";
import type { TypeDef, Field } from "../types";

const PAGE_SIZE = 50;

const FIELD_COLORS = [
  "#58a6ff", "#7ee787", "#d2a8ff", "#ffa657", "#ff7b72",
  "#79c0ff", "#e3b341", "#f778ba", "#a5d6ff", "#56d364",
  "#bc8cff", "#ffd33d", "#ff9a8b", "#6cb6ff", "#8b949e",
];

function renderFieldTable(fields: Field[], parentName?: string, visited: Set<string> = new Set()): HTMLElement {
  const table = el("table", { className: "data-table field-table" });
  table.appendChild(el("thead", {},
    el("tr", {},
      el("th", {}, "Offset"), el("th", {}, "Bits"), el("th", {}, "Name"),
      el("th", {}, "Type"), el("th", {}, "Size"), el("th", {}, "Align"), el("th", {}, "Pad"),
    )
  ));
  const tbody = el("tbody", {});
  let prevEnd = 0;
  for (const f of fields) {
    const padding = f.offset - prevEnd;
    if (padding > 0) {
      const padRow = el("tr", { className: "padding-row" });
      padRow.appendChild(el("td", { className: "mono dim" }, `0x${prevEnd.toString(16).toUpperCase()}`));
      padRow.appendChild(el("td", {})); padRow.appendChild(el("td", { className: "dim" }, `[padding]`));
      padRow.appendChild(el("td", {})); padRow.appendChild(el("td", { className: "mono dim" }, `${padding}`));
      padRow.appendChild(el("td", {})); padRow.appendChild(el("td", { className: "mono padding-size" }, `${padding}B`));
      tbody.appendChild(padRow);
    }
    const tr = el("tr", {});
    tr.appendChild(el("td", { className: "mono offset-col" }, `0x${f.offset.toString(16).toUpperCase()}`));
    tr.appendChild(el("td", { className: "mono dim" }, f.offset_bits % 8 !== 0 ? `+${f.offset_bits % 8}b` : ""));
    tr.appendChild(el("td", { className: "mono bold field-name-col" }, f.name));
    const typeTd = el("td", { className: "mono" });
    typeTd.appendChild(renderTypeStr(f.type ?? "(anonymous)", f.underlying_type));
    tr.appendChild(typeTd);
    tr.appendChild(el("td", { className: "mono size-col" }, `${f.size}`));
    tr.appendChild(el("td", { className: "mono dim" }, `${f.alignment}`));
    tr.appendChild(el("td", {}));
    tbody.appendChild(tr);
    prevEnd = f.offset + f.size;

    // Inline nested type expansion (using underlying_type from bb)
    const ut = f.underlying_type;
    if (ut && ut !== parentName && !visited.has(ut)) {
      const nested = findType(ut);
      if (nested && nested.fields.length > 0) {
        const expRow = el("tr", { className: "nested-expansion-row" });
        const td = el("td", {}); td.setAttribute("colspan", "7");
        const toggle = el("div", { className: "nested-toggle" });
        const arrow = el("span", { className: "collapse-arrow" }, "\u25b6");
        toggle.appendChild(arrow);
        toggle.appendChild(typeLink(ut));
        toggle.appendChild(el("span", { className: "dim" }, ` (${nested.size ?? "?"}B, ${nested.fields.length} fields)`));
        const childVisited = new Set(visited); childVisited.add(ut);
        const nestedBody = el("div", { className: "nested-body collapsed" });
        nestedBody.appendChild(renderFieldTable(nested.fields, ut, childVisited));
        toggle.addEventListener("click", () => {
          nestedBody.classList.toggle("collapsed");
          arrow.textContent = nestedBody.classList.contains("collapsed") ? "\u25b6" : "\u25bc";
        });
        td.appendChild(toggle); td.appendChild(nestedBody);
        expRow.appendChild(td); tbody.appendChild(expRow);
      }
    }
  }
  table.appendChild(tbody);
  return table;
}

function renderMemoryLayout(td: TypeDef): HTMLElement {
  const content = el("div", {});
  if (!td.size || td.fields.length === 0) {
    content.appendChild(el("p", { className: "dim" }, "No layout information available."));
    return content;
  }
  const totalBytes = td.size;
  const gridContainer = el("div", { className: "layout-grid-container" });
  const visual = el("div", { className: "layout-visual" });
  const scaleBar = el("div", { className: "layout-scale" });
  const markerCount = Math.min(8, totalBytes);
  const step = Math.ceil(totalBytes / markerCount);
  for (let i = 0; i <= markerCount; i++) {
    const offset = Math.min(i * step, totalBytes);
    scaleBar.appendChild(el("span", { className: "scale-marker", style: `left:${(offset / totalBytes) * 100}%` },
      `0x${offset.toString(16).toUpperCase()}`));
  }
  visual.appendChild(scaleBar);
  let prevEnd = 0;
  td.fields.forEach((f, i) => {
    if (f.offset > prevEnd) {
      const padBar = el("div", { className: "layout-bar-item layout-padding",
        style: `left:${(prevEnd / totalBytes) * 100}%;width:${Math.max(((f.offset - prevEnd) / totalBytes) * 100, 0.5)}%` });
      padBar.title = `Padding: ${f.offset - prevEnd} bytes at 0x${prevEnd.toString(16).toUpperCase()}`;
      visual.appendChild(padBar);
    }
    const color = FIELD_COLORS[i % FIELD_COLORS.length];
    const bar = el("div", { className: "layout-bar-item",
      style: `left:${(f.offset / totalBytes) * 100}%;width:${Math.max((f.size / totalBytes) * 100, 0.5)}%;background:${color}` });
    bar.title = `${f.name}: ${f.type ?? "?"} (${f.size}B at 0x${f.offset.toString(16).toUpperCase()})`;
    visual.appendChild(bar);
    prevEnd = f.offset + f.size;
  });
  if (prevEnd < totalBytes) {
    const padBar = el("div", { className: "layout-bar-item layout-padding",
      style: `left:${(prevEnd / totalBytes) * 100}%;width:${Math.max(((totalBytes - prevEnd) / totalBytes) * 100, 0.5)}%` });
    padBar.title = `Tail padding: ${totalBytes - prevEnd} bytes`;
    visual.appendChild(padBar);
  }
  gridContainer.appendChild(visual);
  // Legend
  const legend = el("div", { className: "layout-legend" });
  td.fields.forEach((f, i) => {
    const color = FIELD_COLORS[i % FIELD_COLORS.length];
    const item = el("div", { className: "legend-item" });
    item.appendChild(el("span", { className: "legend-swatch", style: `background:${color}` }));
    item.appendChild(el("span", { className: "legend-label mono" }, f.name));
    item.appendChild(el("span", { className: "legend-info dim" }, `${f.size}B @ 0x${f.offset.toString(16).toUpperCase()}`));
    legend.appendChild(item);
  });
  let totalPadding = 0, pEnd = 0;
  for (const f of td.fields) { if (f.offset > pEnd) totalPadding += f.offset - pEnd; pEnd = f.offset + f.size; }
  if (pEnd < totalBytes) totalPadding += totalBytes - pEnd;
  if (totalPadding > 0) {
    const item = el("div", { className: "legend-item" });
    item.appendChild(el("span", { className: "legend-swatch", style: "background:repeating-linear-gradient(45deg,#30363d,#30363d 2px,transparent 2px,transparent 4px)" }));
    item.appendChild(el("span", { className: "legend-label dim" }, "padding"));
    item.appendChild(el("span", { className: "legend-info dim" }, `${totalPadding}B (${((totalPadding / totalBytes) * 100).toFixed(1)}%)`));
    legend.appendChild(item);
  }
  gridContainer.appendChild(legend);
  content.appendChild(gridContainer);
  const stats = el("div", { className: "type-stats" });
  const dataBytes = td.fields.reduce((s, f) => s + f.size, 0);
  stats.appendChild(el("span", {}, `Total: ${totalBytes}B`));
  stats.appendChild(el("span", {}, `Data: ${dataBytes}B`));
  stats.appendChild(el("span", {}, `Padding: ${totalPadding}B (${((totalPadding / totalBytes) * 100).toFixed(1)}%)`));
  stats.appendChild(el("span", {}, `Fields: ${td.fields.length}`));
  stats.appendChild(el("span", {}, `Max align: ${Math.max(...td.fields.map(f => f.alignment), 1)}`));
  content.appendChild(stats);
  return content;
}

export function renderTypesList(container: Element, query: Record<string, string> = {}): void {
  clear(container);

  const filterHeaders = new Set<string>();
  if (query.header) filterHeaders.add(query.header);
  let filterMinSize = parseInt(query.minSize ?? "") || 0;
  let filterMaxSize = parseInt(query.maxSize ?? "") || Infinity;
  let filterHasFields: "all" | "yes" | "no" = "all";
  let page = 0;
  let searchQuery = query.q ?? "";
  let useRegex = false;
  let headerDropdown: FilterDropdownHandle;

  const pg = el("div", { className: "list-view" });

  const tabRow = el("div", { className: "tabs" });
  tabRow.appendChild(el("button", { className: "tab-btn active" }, "list"));
  tabRow.appendChild(el("a", { href: "#/types/graph", className: "tab-btn" }, "graph"));
  pg.appendChild(tabRow);

  pg.appendChild(el("div", { className: "title-row" }, el("h2", {}, "Types")));

  const activeFiltersEl = el("div", { className: "active-filters" });
  pg.appendChild(activeFiltersEl);

  function refreshAll() {
    headerDropdown?.refresh();
    rebuildChips();
    renderList();
  }

  function rebuildChips() {
    const chips: { label: string; onRemove: () => void }[] = [];
    for (const h of filterHeaders) chips.push({ label: `Header: ${h}`, onRemove: () => { filterHeaders.delete(h); page = 0; refreshAll(); } });
    if (filterMinSize > 0 || filterMaxSize < Infinity) {
      const minS = filterMinSize > 0 ? `${filterMinSize}B` : "0", maxS = filterMaxSize < Infinity ? `${filterMaxSize}B` : "\u221e";
      chips.push({ label: `Size: ${minS}\u2013${maxS}`, onRemove: () => { filterMinSize = 0; filterMaxSize = Infinity; sizeMin.value = ""; sizeMax.value = ""; page = 0; refreshAll(); } });
    }
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();

  const controls = el("div", { className: "controls" });
  const search = buildSearchInput("Search types (glob: _GUID, *INFO*)...", (q, re) => {
    searchQuery = q; useRegex = re; page = 0; renderList();
  }, searchQuery);
  controls.appendChild(search.element);

  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => { page = 0; refreshAll(); });
  controls.appendChild(headerDropdown.element);

  const sizeMin = el("input", { type: "number", placeholder: "Min size", className: "filter-input size-filter" }) as HTMLInputElement;
  if (filterMinSize > 0) sizeMin.value = String(filterMinSize);
  sizeMin.addEventListener("input", () => { filterMinSize = parseInt(sizeMin.value) || 0; page = 0; rebuildChips(); renderList(); });

  const sizeMax = el("input", { type: "number", placeholder: "Max size", className: "filter-input size-filter" }) as HTMLInputElement;
  if (filterMaxSize < Infinity) sizeMax.value = String(filterMaxSize);
  sizeMax.addEventListener("input", () => { filterMaxSize = parseInt(sizeMax.value) || Infinity; page = 0; rebuildChips(); renderList(); });

  controls.appendChild(sizeMin); controls.appendChild(sizeMax);

  const fieldsSel = el("select", { className: "filter-select" }) as HTMLSelectElement;
  for (const [v, l] of [["all", "All types"], ["yes", "With fields"], ["no", "Opaque"]] as const) {
    const opt = el("option", { value: v }, l) as HTMLOptionElement;
    if (v === filterHasFields) opt.selected = true;
    fieldsSel.appendChild(opt);
  }
  fieldsSel.addEventListener("change", () => { filterHasFields = fieldsSel.value as any; page = 0; renderList(); });
  controls.appendChild(fieldsSel);
  pg.appendChild(controls);

  const sort = buildSortRow([["name", "Name"], ["size", "Size"], ["fields", "Fields"]], { sortBy: "name", sortDir: "asc" }, () => { page = 0; renderList(); });
  pg.appendChild(sort.element);

  const listContainer = el("div", { className: "list-container" });
  pg.appendChild(listContainer);
  const pagContainer = el("div", {});
  pg.appendChild(pagContainer);
  const countEl = el("div", { className: "result-count" });
  pg.appendChild(countEl);
  container.appendChild(pg);

  function getFiltered(): TypeDef[] {
    let types = getTypes();
    if (searchQuery) types = types.filter(t => matchQuery(t.name, searchQuery, useRegex) || t.fields.some(f => matchQuery(f.name, searchQuery, useRegex)));
    if (filterHeaders.size > 0) types = types.filter(t => t.location.file !== null && filterHeaders.has(t.location.file));
    if (filterMinSize > 0) types = types.filter(t => (t.size ?? 0) >= filterMinSize);
    if (filterMaxSize < Infinity) types = types.filter(t => (t.size ?? Infinity) <= filterMaxSize);
    if (filterHasFields === "yes") types = types.filter(t => t.fields.length > 0);
    else if (filterHasFields === "no") types = types.filter(t => t.fields.length === 0);
    const { sortBy, sortDir } = sort.getState();
    types = [...types].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sortBy === "fields") cmp = a.fields.length - b.fields.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return types;
  }

  function renderList() {
    clear(listContainer);
    const filtered = getFiltered();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page >= totalPages) page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    countEl.textContent = `${filtered.length.toLocaleString()} types`;
    for (const td of pageItems) {
      const row = el("div", { className: "list-item type-item" });
      const header = el("div", { className: "item-header" });
      header.appendChild(el("a", { className: "item-name", href: `#/types/${encodeURIComponent(td.name)}` }, td.name));
      const info = el("span", { className: "item-info" });
      if (td.size !== null) info.appendChild(badge(`${td.size}B`, "tag-size"));
      else info.appendChild(badge("opaque", "tag-opaque"));
      if (td.fields.length > 0) info.appendChild(badge(`${td.fields.length}f`, "tag-fields"));
      info.appendChild(headerLink(td.location.file ?? "", "types"));
      header.appendChild(info);
      row.appendChild(header);
      if (td.fields.length > 0 && td.size) {
        const miniBar = el("div", { className: "mini-layout-bar" });
        td.fields.forEach((f, i) => {
          miniBar.appendChild(el("div", { className: "mini-bar-segment",
            style: `left:${(f.offset / td.size!) * 100}%;width:${Math.max((f.size / td.size!) * 100, 0.3)}%;background:${FIELD_COLORS[i % FIELD_COLORS.length]}`,
            title: `${f.name}: ${f.size}B`
          }));
        });
        row.appendChild(miniBar);
      }
      listContainer.appendChild(row);
    }
    renderPagination(pagContainer, page, totalPages, (p) => { page = p; renderList(); listContainer.scrollIntoView({ behavior: "smooth" }); });
  }

  renderList();
}

export function renderTypeDetail(container: Element, name: string): void {
  clear(container);
  const td = findType(name);
  if (!td) { renderNotFound(container, "Type", name, "#/types", "All types"); return; }

  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/types", className: "back-link" }, "\u2190 All types"));
  pg.appendChild(el("h2", { className: "mono" }, td.name));

  const tags = el("div", { className: "tag-row" });
  if (td.size !== null) tags.appendChild(badge(`${td.size} bytes`, "tag-size"));
  else tags.appendChild(badge("opaque", "tag-opaque"));
  tags.appendChild(badge(`${td.fields.length} fields`, "tag-fields"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(td.location.file ?? "?", "types"));
  locTag.appendChild(document.createTextNode(`:${td.location.line}`));
  tags.appendChild(locTag);
  pg.appendChild(tags);

  if (td.fields.length > 0) {
    const proto = el("pre", { className: "c-prototype" });
    let code = `typedef struct ${td.name} {\n`;
    for (const f of td.fields) {
      const offset = `0x${f.offset.toString(16).toUpperCase().padStart(4, "0")}`;
      let typeStr = f.type ?? "?";
      let nameStr = f.name;
      // Split array suffix from type into the name: "WORD[3]" → "WORD", "name[3]"
      if (f.is_array && f.array_size != null) {
        typeStr = typeStr.replace(/\[\d+\]$/, "");
        nameStr = `${f.name}[${f.array_size}]`;
      }
      code += `  /* ${offset} */  ${typeStr} ${nameStr};  /* size: ${f.size}, align: ${f.alignment} */\n`;
    }
    code += `} ${td.name.startsWith("_") ? td.name.slice(1) : td.name}, *P${td.name.startsWith("_") ? td.name.slice(1) : td.name};`;
    if (td.size) code += `  /* total size: 0x${td.size.toString(16).toUpperCase()} (${td.size}) */`;
    proto.textContent = code;
    pg.appendChild(collapsibleSection("C Definition", proto));
    requestAnimationFrame(() => highlightCode(proto));
  }

  pg.appendChild(collapsibleSection("Memory Layout", renderMemoryLayout(td)));

  if (td.fields.length > 0) {
    pg.appendChild(collapsibleSection("Fields", renderFieldTable(td.fields, td.name, new Set([td.name]))));
  } else {
    pg.appendChild(el("p", { className: "dim" }, "This type has no visible fields (opaque/forward declaration)."));
  }

  const xrefData = getXRef();

  function renderFuncXref(title: string, fnSet: Set<string> | undefined) {
    if (!fnSet || fnSet.size === 0) return;
    const list = el("div", { className: "xref-list" });
    const sorted = [...fnSet].sort();
    let showing = 50;
    const render = () => {
      list.innerHTML = "";
      for (const fn of sorted.slice(0, showing)) list.appendChild(el("span", { className: "xref-chip" }, funcLink(fn)));
      if (showing < sorted.length) {
        const more = el("button", { className: "expand-more-btn" }, `+${sorted.length - showing} more`);
        more.addEventListener("click", () => { showing = sorted.length; render(); });
        list.appendChild(more);
      }
    };
    render();
    pg.appendChild(collapsibleSection(`${title} (${fnSet.size})`, list));
  }

  renderFuncXref("Functions that take this type", xrefData.typeToFuncParams.get(td.name));
  renderFuncXref("Functions that return this type", xrefData.typeToFuncReturns.get(td.name));

  const parentTypes = xrefData.typeToParentTypes.get(td.name);
  if (parentTypes && parentTypes.size > 0) {
    const list = el("div", { className: "xref-list" });
    for (const pt of [...parentTypes].sort()) list.appendChild(el("span", { className: "xref-chip" }, typeLink(pt)));
    pg.appendChild(collapsibleSection(`Types containing this type (${parentTypes.size})`, list));
  }

  container.appendChild(pg);
}
