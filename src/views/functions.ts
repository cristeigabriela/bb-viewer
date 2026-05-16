import { getFunctions, findFunc, findSimilarNames, hasConst, findType, getAllHeaders, cleanDll, getCurrentMode } from "../data";
import { el, clear } from "../dom";
import { matchQuery } from "../utils";
import { typeLink, constLink, renderTypeStr, headerLink, badge } from "../ui/links";
import { buildHash, navigate } from "../router";
import { buildFilterDropdown, FilterDropdownHandle } from "../ui/filter-dropdown";
import { buildSearchInput, buildSortRow, renderFilterChips, renderNotFound, collapsibleSection, renderPagination, syncViewUrl } from "./shared";
import { parseIrqlExpr, irqlMatches, formatIrql, irqlSeverityClass } from "../irql";
import type { Func, Param } from "../types";

const PAGE_SIZE = 50;

function stackBytes(fn: Func): number {
  return fn.params.filter(p => p.abi.kind === "stack").reduce((s, p) => s + (p.abi.size ?? 0), 0);
}

function maxStackParam(fn: Func): number {
  let m = 0;
  for (const p of fn.params) if (p.abi.kind === "stack" && (p.abi.size ?? 0) > m) m = p.abi.size!;
  return m;
}

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
      const typeEl = renderTypeStr(p.type, p.underlying_type ?? p.underlying_record);
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
      const typeEl = renderTypeStr(p.type, p.underlying_type ?? p.underlying_record);
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
      const typeEl = renderTypeStr(p.type, p.underlying_type ?? p.underlying_record);
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
    renderTypeStr(p.type, p.underlying_type ?? p.underlying_record).childNodes.forEach(n => sig.appendChild(n.cloneNode(true)));
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
  if (fn.metadata?.source) tags.appendChild(badge(`source: ${fn.metadata.source}`, `tag-src-${fn.metadata.source}`));
  if (fn.driver?.tech_root) tags.appendChild(badge(`tech: ${fn.driver.tech_root}`, "tag-tech"));
  if (fn.driver?.irql) {
    const sev = irqlSeverityClass(fn.driver.irql);
    tags.appendChild(badge(`IRQL ${formatIrql(fn.driver.irql)}`, `tag-irql ${sev}`));
  }
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
      dllRow.appendChild(el("a", { href: buildHash(`/functions?dll=${encodeURIComponent(cleaned)}`), className: "xref" }, cleaned));
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

  if (fn.driver) {
    const d = fn.driver;
    const dgrid = el("div", { className: "meta-grid" });
    if (d.tech_root) dgrid.appendChild(el("div", {}, el("strong", {}, "Tech root: "), document.createTextNode(d.tech_root)));
    if (d.include_header) dgrid.appendChild(el("div", {}, el("strong", {}, "Include header: "), el("code", {}, d.include_header)));
    if (d.target_type) dgrid.appendChild(el("div", {}, el("strong", {}, "Target type: "), document.createTextNode(d.target_type)));
    if (d.construct_type) dgrid.appendChild(el("div", {}, el("strong", {}, "Construct type: "), document.createTextNode(d.construct_type)));
    if (d.kmdf_ver) dgrid.appendChild(el("div", {}, el("strong", {}, "KMDF version: "), document.createTextNode(`${d.kmdf_ver}+`)));
    if (d.umdf_ver) dgrid.appendChild(el("div", {}, el("strong", {}, "UMDF version: "), document.createTextNode(`${d.umdf_ver}+`)));
    if (d.irql) {
      const row = el("div", {});
      row.appendChild(el("strong", {}, "IRQL: "));
      row.appendChild(badge(formatIrql(d.irql), `tag-irql ${irqlSeverityClass(d.irql)}`));
      dgrid.appendChild(row);
    }
    if (d.irql_raw && (!d.irql || d.irql_raw !== formatIrql(d.irql))) {
      dgrid.appendChild(el("div", {},
        el("strong", {}, "IRQL (raw): "), el("span", { className: "dim mono" }, d.irql_raw)));
    }
    if (dgrid.childNodes.length > 0) {
      detail.appendChild(collapsibleSection("Driver Metadata", dgrid));
    }
  }

  if (fn.params.length > 0) {
    detail.appendChild(collapsibleSection("ABI Layout", renderAbiDiagram(fn)));
    const sb = stackBytes(fn);
    if (sb > 0) {
      detail.appendChild(el("div", { className: "abi-stack-summary dim" },
        `Stack-passed: ${sb}B total, largest single param ${maxStackParam(fn)}B`));
    }
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
    const ref = p.underlying_record;
    if (ref && findType(ref)) typesUsed.add(ref);
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

/* ── List view ──────────────────────────────────────────────────────── */

export function renderFunctionsList(container: Element, query: Record<string, string> = {}): void {
  clear(container);
  const isKernel = getCurrentMode() === "kernel";

  const hasQueryOverride = !!(query.header || query.dll || query.q || query.returnType || query.minParams || query.maxParams || query.ptrDepth || query.minClient || query.minServer || query.exported || query.irql || query.source || query.tech || query.kmdf || query.umdf);
  let filterExported: "all" | "yes" | "no" = query.exported as any ?? (hasQueryOverride ? "all" : "yes");
  const filterHeaders = new Set<string>(query.header ? query.header.split(",") : []);
  const filterReturnTypes = new Set<string>(query.returnType ? query.returnType.split(",") : []);
  const filterDlls = new Set<string>(query.dll ? query.dll.split(",") : []);
  let filterMinParams = parseInt(query.minParams ?? "") || 0;
  let filterMaxParams = parseInt(query.maxParams ?? "") || Infinity;
  let filterPointerDepth = parseInt(query.ptrDepth ?? "") || -1;
  let filterMinClient = query.minClient ?? "";
  let filterMinServer = query.minServer ?? "";
  let filterIrql = query.irql ?? "";
  let filterSource = query.source ?? "";
  const filterTech = new Set<string>(query.tech ? query.tech.split(",") : []);
  const filterKmdf = new Set<string>(query.kmdf ? query.kmdf.split(",") : []);
  const filterUmdf = new Set<string>(query.umdf ? query.umdf.split(",") : []);
  let page = parseInt(query.page ?? "") || 0;
  let searchQuery = query.q ?? "";
  let useRegex = query.regex === "1";

  let headerDropdown: FilterDropdownHandle;
  let returnTypeDropdown: FilterDropdownHandle;
  let dllDropdown: FilterDropdownHandle;
  let techDropdown: FilterDropdownHandle | undefined;
  let kmdfDropdown: FilterDropdownHandle | undefined;
  let umdfDropdown: FilterDropdownHandle | undefined;

  function syncUrl() {
    const s = sort?.getState();
    syncViewUrl("/functions", {
      q: searchQuery,
      regex: useRegex ? "1" : "",
      header: [...filterHeaders].join(","),
      dll: [...filterDlls].join(","),
      returnType: [...filterReturnTypes].join(","),
      exported: filterExported !== "yes" ? filterExported : "",
      minParams: filterMinParams > 0 ? String(filterMinParams) : "",
      maxParams: filterMaxParams < Infinity ? String(filterMaxParams) : "",
      ptrDepth: filterPointerDepth >= 0 ? String(filterPointerDepth) : "",
      minClient: filterMinClient,
      minServer: filterMinServer,
      irql: filterIrql,
      source: filterSource,
      tech: [...filterTech].join(","),
      kmdf: [...filterKmdf].join(","),
      umdf: [...filterUmdf].join(","),
      sort: s && s.sortBy !== "name" ? s.sortBy : "",
      sortDir: s && s.sortDir !== "asc" ? s.sortDir : "",
      page: page > 0 ? String(page) : "",
    });
  }

  const pg = el("div", { className: "list-view" });
  pg.appendChild(el("div", { className: "title-row" }, el("h2", {}, "Functions")));

  const activeFiltersEl = el("div", { className: "active-filters" });
  pg.appendChild(activeFiltersEl);

  function refreshAll() {
    headerDropdown?.refresh();
    returnTypeDropdown?.refresh();
    dllDropdown?.refresh();
    techDropdown?.refresh();
    kmdfDropdown?.refresh();
    umdfDropdown?.refresh();
    rebuildChips();
    renderList();
    syncUrl();
  }

  function rebuildChips() {
    const chips: { label: string; onRemove: () => void }[] = [];
    for (const h of filterHeaders) chips.push({ label: `Header: ${h}`, onRemove: () => { filterHeaders.delete(h); page = 0; refreshAll(); } });
    for (const rt of filterReturnTypes) chips.push({ label: `Return: ${rt}`, onRemove: () => { filterReturnTypes.delete(rt); page = 0; refreshAll(); } });
    for (const dll of filterDlls) chips.push({ label: `DLL: ${dll}`, onRemove: () => { filterDlls.delete(dll); page = 0; refreshAll(); } });
    if (filterMinParams > 0 || filterMaxParams < Infinity) {
      const minS = String(filterMinParams), maxS = filterMaxParams < Infinity ? String(filterMaxParams) : "∞";
      chips.push({ label: `Params: ${minS}–${maxS}`, onRemove: () => { filterMinParams = 0; filterMaxParams = Infinity; page = 0; refreshAll(); } });
    }
    if (filterPointerDepth >= 0) chips.push({ label: `Ptr depth: ${filterPointerDepth}`, onRemove: () => { filterPointerDepth = -1; page = 0; refreshAll(); } });
    if (filterMinClient) chips.push({ label: `Client: ${filterMinClient}`, onRemove: () => { filterMinClient = ""; page = 0; refreshAll(); } });
    if (filterMinServer) chips.push({ label: `Server: ${filterMinServer}`, onRemove: () => { filterMinServer = ""; page = 0; refreshAll(); } });
    if (filterIrql) chips.push({ label: `IRQL: ${filterIrql}`, onRemove: () => { filterIrql = ""; if (irqlInput) irqlInput.value = ""; page = 0; refreshAll(); } });
    if (filterSource) chips.push({ label: `Source: ${filterSource}`, onRemove: () => { filterSource = ""; page = 0; refreshAll(); } });
    for (const t of filterTech) chips.push({ label: `Tech: ${t}`, onRemove: () => { filterTech.delete(t); page = 0; refreshAll(); } });
    for (const v of filterKmdf) chips.push({ label: `KMDF: ${v}`, onRemove: () => { filterKmdf.delete(v); page = 0; refreshAll(); } });
    for (const v of filterUmdf) chips.push({ label: `UMDF: ${v}`, onRemove: () => { filterUmdf.delete(v); page = 0; refreshAll(); } });
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();

  const controls = el("div", { className: "controls" });

  const search = buildSearchInput("Search by name (glob: *File*, Nt?lose*)...", (q, re) => {
    searchQuery = q; useRegex = re; page = 0; renderList(); syncUrl();
  }, searchQuery, useRegex);
  controls.appendChild(search.element);

  const exportSel = el("select", { className: "filter-select" }) as HTMLSelectElement;
  for (const [val, label] of [["all", "All"], ["yes", "Exported"], ["no", "Not Exported"]] as const) {
    const opt = el("option", { value: val }, label) as HTMLOptionElement;
    if (val === filterExported) opt.selected = true;
    exportSel.appendChild(opt);
  }
  exportSel.addEventListener("change", () => { filterExported = exportSel.value as any; page = 0; renderList(); syncUrl(); });
  controls.appendChild(exportSel);

  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => { page = 0; refreshAll(); });
  controls.appendChild(headerDropdown.element);

  const allReturnTypes = [...new Set(getFunctions().map(f => f.return_type))].sort();
  returnTypeDropdown = buildFilterDropdown("Filter by Return Type", allReturnTypes, filterReturnTypes, () => { page = 0; refreshAll(); });
  controls.appendChild(returnTypeDropdown.element);

  const allDlls = [...new Set(getFunctions().filter(f => f.metadata?.dll).map(f => cleanDll(f.metadata!.dll!)))].sort();
  dllDropdown = buildFilterDropdown("Filter by DLL", allDlls, filterDlls, () => { page = 0; refreshAll(); });
  controls.appendChild(dllDropdown.element);

  // Source filter is meaningful in both modes (driver vs sdk surface)
  const sourceSel = el("select", { className: "filter-select" }) as HTMLSelectElement;
  for (const [val, label] of [["", "Any source"], ["sdk", "Source: SDK"], ["driver", "Source: Driver"]] as const) {
    const opt = el("option", { value: val }, label) as HTMLOptionElement;
    if (val === filterSource) opt.selected = true;
    sourceSel.appendChild(opt);
  }
  sourceSel.addEventListener("change", () => { filterSource = sourceSel.value; page = 0; rebuildChips(); renderList(); syncUrl(); });
  controls.appendChild(sourceSel);

  // ─ Kernel-mode-only controls ─
  let irqlInput: HTMLInputElement | undefined;
  if (isKernel) {
    irqlInput = el("input", {
      type: "text", placeholder: "IRQL: PASSIVE, <= DISPATCH, ...",
      className: "filter-input irql-filter",
    }) as HTMLInputElement;
    irqlInput.value = filterIrql;
    irqlInput.addEventListener("input", () => {
      filterIrql = irqlInput!.value.trim();
      page = 0; rebuildChips(); renderList(); syncUrl();
    });
    controls.appendChild(irqlInput);

    const allTechs = [...new Set(getFunctions().map(f => f.driver?.tech_root).filter((v): v is string => !!v))].sort();
    techDropdown = buildFilterDropdown("Filter by Tech", allTechs, filterTech, () => { page = 0; refreshAll(); });
    controls.appendChild(techDropdown.element);

    const allKmdfVers = [...new Set(getFunctions().map(f => f.driver?.kmdf_ver).filter((v): v is string => !!v))].sort();
    if (allKmdfVers.length > 0) {
      kmdfDropdown = buildFilterDropdown("KMDF version", allKmdfVers, filterKmdf, () => { page = 0; refreshAll(); });
      controls.appendChild(kmdfDropdown.element);
    }

    const allUmdfVers = [...new Set(getFunctions().map(f => f.driver?.umdf_ver).filter((v): v is string => !!v))].sort();
    if (allUmdfVers.length > 0) {
      umdfDropdown = buildFilterDropdown("UMDF version", allUmdfVers, filterUmdf, () => { page = 0; refreshAll(); });
      controls.appendChild(umdfDropdown.element);
    }
  }

  pg.appendChild(controls);

  const initSort = query.sort ?? "name";
  const initSortDir = (query.sortDir ?? "asc") as "asc" | "desc";
  const sort = buildSortRow(
    [["name", "Name"], ["params", "Params"], ["stack", "Stack"], ["maxStack", "Max stack"]],
    { sortBy: initSort, sortDir: initSortDir },
    () => { page = 0; renderList(); syncUrl(); }
  );
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
    if (filterMinClient) funcs = funcs.filter(f => f.metadata?.min_client?.replace(/ /g, " ").includes(filterMinClient));
    if (filterMinServer) funcs = funcs.filter(f => f.metadata?.min_server?.replace(/ /g, " ").includes(filterMinServer));
    if (filterSource) funcs = funcs.filter(f => f.metadata?.source === filterSource);
    if (filterIrql) {
      const expr = parseIrqlExpr(filterIrql);
      if (expr) funcs = funcs.filter(f => irqlMatches(expr, f.driver?.irql));
    }
    if (filterTech.size > 0) funcs = funcs.filter(f => f.driver?.tech_root ? filterTech.has(f.driver.tech_root) : false);
    if (filterKmdf.size > 0) funcs = funcs.filter(f => f.driver?.kmdf_ver ? filterKmdf.has(f.driver.kmdf_ver) : false);
    if (filterUmdf.size > 0) funcs = funcs.filter(f => f.driver?.umdf_ver ? filterUmdf.has(f.driver.umdf_ver) : false);
    const { sortBy, sortDir } = sort.getState();
    funcs = [...funcs].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "params") cmp = a.params.length - b.params.length;
      else if (sortBy === "stack") cmp = stackBytes(a) - stackBytes(b);
      else if (sortBy === "maxStack") cmp = maxStackParam(a) - maxStackParam(b);
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
      header.appendChild(el("a", { className: "item-name", href: buildHash(`/functions/${encodeURIComponent(fn.name)}`) }, fn.name));
      const retSpan = el("span", { className: "item-ret" });
      retSpan.appendChild(renderTypeStr(fn.return_type));
      header.appendChild(retSpan);
      const info = el("span", { className: "item-info" });
      info.appendChild(badge(`${fn.params.length}p`, "tag-params"));
      if (fn.is_dllimport) info.appendChild(badge("dll", "tag-exported"));
      if (fn.metadata?.dll) info.appendChild(badge(cleanDll(fn.metadata.dll).split(".")[0], "tag-dll"));
      if (isKernel && fn.driver?.irql) {
        info.appendChild(badge(formatIrql(fn.driver.irql), `tag-irql ${irqlSeverityClass(fn.driver.irql)}`));
      }
      if (isKernel && fn.driver?.tech_root && fn.driver.tech_root !== "kernel") {
        info.appendChild(badge(fn.driver.tech_root, "tag-tech"));
      }
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
      page = p; renderList(); syncUrl();
      listContainer.scrollIntoView({ behavior: "smooth" });
    });
  }

  renderList();
}

export function renderFunctionDetail(container: Element, name: string): void {
  clear(container);
  if (name.includes("*") || name.includes("?")) { navigate(`/functions?q=${encodeURIComponent(name)}`); return; }
  const fn = findFunc(name);
  if (!fn) { renderNotFound(container, "Function", name, buildHash("/functions"), "All functions", findSimilarNames(name)); return; }

  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: buildHash("/functions"), className: "back-link" }, "← All functions"));
  pg.appendChild(el("h2", {}, fn.name));
  pg.appendChild(renderFuncDetailView(fn));
  container.appendChild(pg);
}
