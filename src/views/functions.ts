import { getFunctions, findFunc, hasConst, findType, getAllHeaders, cleanDll } from "../data";
import { el, clear } from "../dom";
import { matchQuery } from "../utils";
import { typeLink, constLink, renderTypeStr, headerLink, badge } from "../ui/links";
import { buildFilterDropdown, FilterDropdownHandle } from "../ui/filter-dropdown";
import { buildSearchInput, buildSortRow, renderFilterChips, renderNotFound, collapsibleSection, renderPagination } from "./shared";
import type { Func, Param } from "../types";

const PAGE_SIZE = 50;

function renderAbiDiagram(fn: Func): HTMLElement {
  const diagram = el("div", { className: "abi-diagram" });

  const regParams = fn.params.filter(p => p.abi.kind === "reg");
  const stackParams = fn.params.filter(p => p.abi.kind === "stack");
  const indirectParams = fn.params.filter(p => p.abi.kind === "indirect");

  if (regParams.length > 0) {
    const regSection = el("div", { className: "abi-section" });
    regSection.appendChild(el("div", { className: "abi-section-label" }, "Registers"));
    for (const p of regParams) {
      const row = el("div", { className: "abi-slot abi-reg-slot" });
      row.appendChild(el("div", { className: "abi-reg-badge" }, p.abi.register!));
      const info = el("div", { className: "abi-slot-info" });
      info.appendChild(el("span", { className: "abi-param-name" }, p.name ?? `arg${p.index}`));
      const typeEl = renderTypeStr(p.type, p.underlying_type);
      typeEl.className += " abi-param-type";
      info.appendChild(typeEl);
      for (const d of p.directions) info.appendChild(badge(d, `dir-${d}`));
      row.appendChild(info);
      row.appendChild(el("span", { className: "abi-param-size" }, `${p.abi.size}B`));
      regSection.appendChild(row);
    }
    diagram.appendChild(regSection);
  }

  if (stackParams.length > 0) {
    const stackSection = el("div", { className: "abi-section" });
    stackSection.appendChild(el("div", { className: "abi-section-label" }, "Stack Frame (callee-entry RSP-relative)"));
    const sorted = [...stackParams].sort((a, b) => (a.abi.offset ?? 0) - (b.abi.offset ?? 0));
    for (const p of sorted) {
      const row = el("div", { className: "abi-slot abi-stack-slot" });
      row.appendChild(el("div", { className: "abi-stack-badge" },
        `RSP+0x${(p.abi.offset ?? 0).toString(16).toUpperCase()}`));
      const info = el("div", { className: "abi-slot-info" });
      info.appendChild(el("span", { className: "abi-param-name" }, p.name ?? `arg${p.index}`));
      const typeEl = renderTypeStr(p.type, p.underlying_type);
      typeEl.className += " abi-param-type";
      info.appendChild(typeEl);
      for (const d of p.directions) info.appendChild(badge(d, `dir-${d}`));
      row.appendChild(info);
      row.appendChild(el("span", { className: "abi-param-size" }, `${p.abi.size}B`));
      stackSection.appendChild(row);
    }
    diagram.appendChild(stackSection);
  }

  if (indirectParams.length > 0) {
    const indSection = el("div", { className: "abi-section" });
    indSection.appendChild(el("div", { className: "abi-section-label" }, "Indirect (pointer to struct)"));
    for (const p of indirectParams) {
      const row = el("div", { className: "abi-slot abi-indirect-slot" });
      row.appendChild(el("div", { className: "abi-indirect-badge" }, "PTR"));
      const info = el("div", { className: "abi-slot-info" });
      info.appendChild(el("span", { className: "abi-param-name" }, p.name ?? `arg${p.index}`));
      const typeEl = renderTypeStr(p.type, p.underlying_type);
      typeEl.className += " abi-param-type";
      info.appendChild(typeEl);
      row.appendChild(info);
      indSection.appendChild(row);
    }
    diagram.appendChild(indSection);
  }

  const retRow = el("div", { className: "abi-return" });
  retRow.appendChild(el("span", { className: "abi-ret-label" }, "Return:"));
  retRow.appendChild(renderTypeStr(fn.return_type));
  if (fn.return_abi.kind === "reg") {
    retRow.appendChild(el("span", { className: "abi-ret-via" }, "via"));
    retRow.appendChild(badge(fn.return_abi.register!, "abi-reg"));
  } else if (fn.return_abi.kind === "indirect") {
    retRow.appendChild(el("span", { className: "abi-ret-via" }, "via"));
    retRow.appendChild(badge("indirect", "abi-indirect"));
  }
  diagram.appendChild(retRow);

  return diagram;
}

function renderParamValues(p: Param, limit: number): HTMLElement {
  const valKeys = Object.keys(p.values ?? {});
  if (valKeys.length === 0) return el("span", {});
  const container = el("div", { className: "param-values" });
  const render = (count: number) => {
    container.innerHTML = "";
    for (const vk of valKeys.slice(0, count)) {
      if (hasConst(vk)) container.appendChild(constLink(vk));
      else container.appendChild(el("code", { className: "dim" }, vk));
    }
    if (count < valKeys.length) {
      const more = el("button", { className: "expand-more-btn" }, `+${valKeys.length - count} more`);
      more.addEventListener("click", (e) => { e.preventDefault(); render(valKeys.length); });
      container.appendChild(more);
    }
  };
  render(limit);
  return container;
}

function renderFuncDetailView(fn: Func): HTMLElement {
  const detail = el("div", { className: "func-detail" });

  const sig = el("div", { className: "func-signature" });
  sig.appendChild(renderTypeStr(fn.return_type));
  sig.appendChild(document.createTextNode(" "));
  sig.appendChild(el("strong", { className: "func-name-sig" }, fn.name));
  sig.appendChild(document.createTextNode("("));
  fn.params.forEach((p, i) => {
    if (i > 0) sig.appendChild(document.createTextNode(", "));
    renderTypeStr(p.type, p.underlying_type).childNodes.forEach(n => sig.appendChild(n.cloneNode(true)));
    if (p.name) {
      sig.appendChild(document.createTextNode(" "));
      sig.appendChild(el("span", { className: "param-name-sig" }, p.name));
    }
  });
  sig.appendChild(document.createTextNode(");"));
  detail.appendChild(sig);

  const tags = el("div", { className: "tag-row" });
  tags.appendChild(badge(fn.arch, "tag-arch"));
  tags.appendChild(badge(fn.calling_convention, "tag-cc"));
  if (fn.is_dllimport) tags.appendChild(badge("exported", "tag-exported"));
  if (fn.has_body) tags.appendChild(badge("has body", "tag-body"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(fn.location.file ?? "?", "functions"));
  locTag.appendChild(document.createTextNode(`:${fn.location.line}`));
  tags.appendChild(locTag);
  detail.appendChild(tags);

  if (fn.metadata) {
    const grid = el("div", { className: "meta-grid" });
    if (fn.metadata.dll) {
      const cleaned = cleanDll(fn.metadata.dll);
      const dllRow = el("div", {});
      dllRow.appendChild(el("strong", {}, "DLL: "));
      dllRow.appendChild(el("a", { href: `#/functions?dll=${encodeURIComponent(cleaned)}`, className: "xref" }, cleaned));
      grid.appendChild(dllRow);
    }
    if (fn.metadata.lib) grid.appendChild(el("div", {}, el("strong", {}, "Lib: "), document.createTextNode(fn.metadata.lib)));
    if (fn.metadata.min_client) grid.appendChild(el("div", {}, el("strong", {}, "Min Client: "), document.createTextNode(fn.metadata.min_client)));
    if (fn.metadata.min_server) grid.appendChild(el("div", {}, el("strong", {}, "Min Server: "), document.createTextNode(fn.metadata.min_server)));
    if (fn.metadata.variants.length > 0) {
      const vars = el("div", {}, el("strong", {}, "Variants: "));
      fn.metadata.variants.forEach((v, i) => {
        if (i > 0) vars.appendChild(document.createTextNode(", "));
        vars.appendChild(el("code", {}, v));
      });
      grid.appendChild(vars);
    }
    if (fn.metadata.locations.length > 0) {
      const locs = el("div", {}, el("strong", {}, "Locations: "));
      locs.appendChild(el("span", { className: "dim" }, fn.metadata.locations.join(", ")));
      grid.appendChild(locs);
    }
    detail.appendChild(collapsibleSection("MSDN Metadata", grid));
  }

  if (fn.params.length > 0) {
    detail.appendChild(collapsibleSection("ABI Layout", renderAbiDiagram(fn)));
  }

  const paramsWithVals = fn.params.filter(p => Object.keys(p.values ?? {}).length > 0);
  if (paramsWithVals.length > 0) {
    const valContent = el("div", {});
    for (const p of paramsWithVals) {
      const pBlock = el("div", { className: "param-values-block" });
      pBlock.appendChild(el("span", { className: "mono bold" }, p.name ?? `arg${p.index}`));
      pBlock.appendChild(el("span", { className: "dim" }, ` (${p.type}):`));
      pBlock.appendChild(renderParamValues(p, 8));
      valContent.appendChild(pBlock);
    }
    detail.appendChild(collapsibleSection("Known Parameter Values", valContent));
  }

  const typesUsed = new Set<string>();
  for (const p of fn.params) {
    if (p.underlying_type && findType(p.underlying_type)) typesUsed.add(p.underlying_type);
  }
  if (typesUsed.size > 0) {
    const list = el("div", { className: "xref-list" });
    for (const t of typesUsed) {
      const td = findType(t);
      const item = el("span", { className: "xref-chip" });
      item.appendChild(typeLink(t));
      if (td?.size) item.appendChild(el("span", { className: "dim" }, ` (${td.size}B)`));
      list.appendChild(item);
    }
    detail.appendChild(collapsibleSection("Referenced Types", list));
  }

  return detail;
}

export function renderFunctionsList(container: Element, query: Record<string, string> = {}): void {
  clear(container);

  const hasQueryOverride = !!(query.header || query.dll || query.q || query.minParams || query.maxParams || query.ptrDepth || query.minClient || query.minServer);
  let filterExported: "all" | "yes" | "no" = hasQueryOverride ? "all" : "yes";
  const filterHeaders = new Set<string>();
  const filterReturnTypes = new Set<string>();
  const filterDlls = new Set<string>();
  let filterMinParams = parseInt(query.minParams ?? "") || 0;
  let filterMaxParams = parseInt(query.maxParams ?? "") || Infinity;
  let filterPointerDepth = parseInt(query.ptrDepth ?? "") || -1;
  let filterMinClient = query.minClient ?? "";
  let filterMinServer = query.minServer ?? "";
  let page = 0;
  let searchQuery = query.q ?? "";
  let useRegex = false;

  if (query.header) filterHeaders.add(query.header);
  if (query.dll) filterDlls.add(query.dll);
  if (query.returnType) filterReturnTypes.add(query.returnType);

  let headerDropdown: FilterDropdownHandle;
  let returnTypeDropdown: FilterDropdownHandle;
  let dllDropdown: FilterDropdownHandle;

  const pg = el("div", { className: "list-view" });
  pg.appendChild(el("div", { className: "title-row" }, el("h2", {}, "Functions")));

  const activeFiltersEl = el("div", { className: "active-filters" });
  pg.appendChild(activeFiltersEl);

  function refreshAll() {
    headerDropdown?.refresh();
    returnTypeDropdown?.refresh();
    dllDropdown?.refresh();
    rebuildChips();
    renderList();
  }

  function rebuildChips() {
    const chips: { label: string; onRemove: () => void }[] = [];
    for (const h of filterHeaders) chips.push({ label: `Header: ${h}`, onRemove: () => { filterHeaders.delete(h); page = 0; refreshAll(); } });
    for (const rt of filterReturnTypes) chips.push({ label: `Return: ${rt}`, onRemove: () => { filterReturnTypes.delete(rt); page = 0; refreshAll(); } });
    for (const dll of filterDlls) chips.push({ label: `DLL: ${dll}`, onRemove: () => { filterDlls.delete(dll); page = 0; refreshAll(); } });
    if (filterMinParams > 0 || filterMaxParams < Infinity) {
      const minS = String(filterMinParams), maxS = filterMaxParams < Infinity ? String(filterMaxParams) : "\u221e";
      chips.push({ label: `Params: ${minS}\u2013${maxS}`, onRemove: () => { filterMinParams = 0; filterMaxParams = Infinity; page = 0; refreshAll(); } });
    }
    if (filterPointerDepth >= 0) {
      chips.push({ label: `Ptr depth: ${filterPointerDepth}`, onRemove: () => { filterPointerDepth = -1; page = 0; refreshAll(); } });
    }
    if (filterMinClient) {
      chips.push({ label: `Client: ${filterMinClient}`, onRemove: () => { filterMinClient = ""; page = 0; refreshAll(); } });
    }
    if (filterMinServer) {
      chips.push({ label: `Server: ${filterMinServer}`, onRemove: () => { filterMinServer = ""; page = 0; refreshAll(); } });
    }
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();

  // Controls
  const controls = el("div", { className: "controls" });

  const search = buildSearchInput("Search by name (glob: *File*, Nt?lose*)...", (q, re) => {
    searchQuery = q; useRegex = re; page = 0; renderList();
  }, searchQuery);
  controls.appendChild(search.element);

  const exportSel = el("select", { className: "filter-select" }) as HTMLSelectElement;
  for (const [val, label] of [["all", "All"], ["yes", "Exported"], ["no", "Not Exported"]] as const) {
    const opt = el("option", { value: val }, label) as HTMLOptionElement;
    if (val === filterExported) opt.selected = true;
    exportSel.appendChild(opt);
  }
  exportSel.addEventListener("change", () => { filterExported = exportSel.value as any; page = 0; renderList(); });
  controls.appendChild(exportSel);

  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => { page = 0; refreshAll(); });
  controls.appendChild(headerDropdown.element);

  const allReturnTypes = [...new Set(getFunctions().map(f => f.return_type))].sort();
  returnTypeDropdown = buildFilterDropdown("Filter by Return Type", allReturnTypes, filterReturnTypes, () => { page = 0; refreshAll(); });
  controls.appendChild(returnTypeDropdown.element);

  const allDlls = [...new Set(getFunctions().filter(f => f.metadata?.dll).map(f => cleanDll(f.metadata!.dll!)))].sort();
  dllDropdown = buildFilterDropdown("Filter by DLL", allDlls, filterDlls, () => { page = 0; refreshAll(); });
  controls.appendChild(dllDropdown.element);

  pg.appendChild(controls);

  const sort = buildSortRow([["name", "Name"], ["params", "Params"]], { sortBy: "name", sortDir: "asc" }, () => { page = 0; renderList(); });
  pg.appendChild(sort.element);

  const listContainer = el("div", { className: "list-container" });
  pg.appendChild(listContainer);
  const pagContainer = el("div", {});
  pg.appendChild(pagContainer);
  const countEl = el("div", { className: "result-count" });
  pg.appendChild(countEl);
  container.appendChild(pg);

  function getFiltered(): Func[] {
    let funcs = getFunctions();
    if (searchQuery) funcs = funcs.filter(f => matchQuery(f.name, searchQuery, useRegex));
    if (filterExported === "yes") funcs = funcs.filter(f => f.is_dllimport);
    else if (filterExported === "no") funcs = funcs.filter(f => !f.is_dllimport);
    if (filterHeaders.size > 0) funcs = funcs.filter(f => f.location.file !== null && filterHeaders.has(f.location.file));
    if (filterReturnTypes.size > 0) funcs = funcs.filter(f => filterReturnTypes.has(f.return_type));
    if (filterDlls.size > 0) funcs = funcs.filter(f => f.metadata?.dll ? filterDlls.has(cleanDll(f.metadata.dll)) : false);
    if (filterMinParams > 0) funcs = funcs.filter(f => f.params.length >= filterMinParams);
    if (filterMaxParams < Infinity) funcs = funcs.filter(f => f.params.length <= filterMaxParams);
    if (filterPointerDepth >= 0) funcs = funcs.filter(f => f.params.some(p => (p.pointer_depth ?? 0) === filterPointerDepth));
    if (filterMinClient) funcs = funcs.filter(f => f.metadata?.min_client?.replace(/\u00a0/g, " ").includes(filterMinClient));
    if (filterMinServer) funcs = funcs.filter(f => f.metadata?.min_server?.replace(/\u00a0/g, " ").includes(filterMinServer));
    const { sortBy, sortDir } = sort.getState();
    funcs = [...funcs].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "params") cmp = a.params.length - b.params.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return funcs;
  }

  function renderList() {
    clear(listContainer);
    const filtered = getFiltered();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page >= totalPages) page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    countEl.textContent = `${filtered.length.toLocaleString()} functions`;

    for (const fn of pageItems) {
      const row = el("div", { className: "list-item func-item" });
      const header = el("div", { className: "item-header" });
      header.appendChild(el("a", { className: "item-name", href: `#/functions/${encodeURIComponent(fn.name)}` }, fn.name));
      const retSpan = el("span", { className: "item-ret" });
      retSpan.appendChild(renderTypeStr(fn.return_type));
      header.appendChild(retSpan);
      const info = el("span", { className: "item-info" });
      info.appendChild(badge(`${fn.params.length}p`, "tag-params"));
      if (fn.is_dllimport) info.appendChild(badge("dll", "tag-exported"));
      if (fn.metadata?.dll) info.appendChild(badge(cleanDll(fn.metadata.dll).split(".")[0], "tag-dll"));
      info.appendChild(headerLink(fn.location.file ?? "", "functions"));
      header.appendChild(info);
      row.appendChild(header);
      if (fn.params.length > 0) {
        const preview = el("div", { className: "item-preview mono dim" });
        preview.textContent = `(${fn.params.map(p => `${p.type} ${p.name ?? "_"}`).join(", ")})`;
        row.appendChild(preview);
      }
      listContainer.appendChild(row);
    }

    renderPagination(pagContainer, page, totalPages, (p) => {
      page = p; renderList();
      listContainer.scrollIntoView({ behavior: "smooth" });
    });
  }

  renderList();
}

export function renderFunctionDetail(container: Element, name: string): void {
  clear(container);
  const fn = findFunc(name);
  if (!fn) { renderNotFound(container, "Function", name, "#/functions", "All functions"); return; }

  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/functions", className: "back-link" }, "\u2190 All functions"));
  pg.appendChild(el("h2", {}, fn.name));
  pg.appendChild(renderFuncDetailView(fn));
  container.appendChild(pg);
}
