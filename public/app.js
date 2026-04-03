// src/primitives.ts
var KNOWN_PRIMITIVES = new Set([
  "void",
  "int",
  "char",
  "short",
  "long",
  "float",
  "double",
  "unsigned",
  "signed",
  "const",
  "struct",
  "union",
  "enum",
  "volatile",
  "static",
  "extern",
  "inline",
  "restrict",
  "register",
  "typedef",
  "return",
  "__attribute__",
  "__stdcall",
  "__cdecl",
  "__fastcall",
  "VOID",
  "__int64",
  "__int32",
  "__int16",
  "__int8",
  "wchar_t",
  "size_t",
  "UCHAR",
  "USHORT",
  "ULONG",
  "ULONGLONG",
  "CHAR",
  "SHORT",
  "LONG",
  "LONGLONG",
  "BOOLEAN",
  "BOOL",
  "BYTE",
  "WORD",
  "DWORD",
  "DWORDLONG",
  "QWORD",
  "INT",
  "UINT",
  "FLOAT",
  "DOUBLE",
  "WCHAR",
  "PVOID",
  "LPVOID",
  "LPCVOID",
  "HANDLE",
  "HRESULT",
  "NTSTATUS",
  "HMODULE",
  "HINSTANCE",
  "HWND",
  "HDC",
  "HBITMAP",
  "HBRUSH",
  "HFONT",
  "HICON",
  "HMENU",
  "HPEN",
  "HRGN",
  "HPALETTE",
  "HKEY",
  "HMONITOR",
  "HGLOBAL",
  "HLOCAL",
  "SIZE_T",
  "SSIZE_T",
  "ULONG_PTR",
  "LONG_PTR",
  "DWORD_PTR",
  "UINT_PTR",
  "INT_PTR",
  "WPARAM",
  "LPARAM",
  "LRESULT",
  "ATOM",
  "COLORREF",
  "LCID",
  "LANGID",
  "LPSTR",
  "LPCSTR",
  "LPWSTR",
  "LPCWSTR",
  "BSTR",
  "VARIANT_BOOL",
  "SCODE",
  "DISPID",
  "MEMBERID",
  "LARGE_INTEGER",
  "ULARGE_INTEGER",
  "LUID",
  "PUCHAR",
  "PUSHORT",
  "PULONG",
  "PCHAR",
  "PSHORT",
  "PLONG",
  "PBOOL",
  "PBYTE",
  "PWORD",
  "PDWORD",
  "PFLOAT",
  "PDOUBLE",
  "LPBOOL",
  "LPBYTE",
  "LPWORD",
  "LPDWORD"
]);

// src/data.ts
var funcsData;
var typesData;
var constsData;
var xref;
var typesByName;
var funcsByName;
var constsByName;
var enumsByName;
var constSet;
var enumSet;
var allHeaders;
var currentDataset = "winsdk";
var currentArch = "amd64";
function extractTypeNames(typeStr) {
  const cleaned = typeStr.replace(/__attribute__\(\([^)]*\)\)/g, "").replace(/\([^)]*\)/g, " ").replace(/[*&\[\]{}(),;]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const results = [];
  for (const t of tokens) {
    if (!KNOWN_PRIMITIVES.has(t) && /^[A-Z_][A-Za-z0-9_]*$/.test(t) && t.length > 1) {
      results.push(t);
    }
  }
  return results;
}
function resolveTypeName(token) {
  if (typesByName.has(token))
    return token;
  return null;
}
function buildXRef() {
  const idx = {
    typeToFuncParams: new Map,
    typeToFuncReturns: new Map,
    typeToParentTypes: new Map,
    constToFunctions: new Map,
    constToConsts: new Map,
    enumForConstant: new Map
  };
  const addToMap = (map, key, val) => {
    let s = map.get(key);
    if (!s) {
      s = new Set;
      map.set(key, s);
    }
    s.add(val);
  };
  for (const fn of funcsData.functions) {
    for (const token of extractTypeNames(fn.return_type)) {
      const resolved = resolveTypeName(token);
      if (resolved)
        addToMap(idx.typeToFuncReturns, resolved, fn.name);
    }
    for (const p of fn.params) {
      if (p.underlying_type) {
        const resolved = resolveTypeName(p.underlying_type);
        if (resolved)
          addToMap(idx.typeToFuncParams, resolved, fn.name);
      } else {
        for (const token of extractTypeNames(p.type)) {
          const resolved = resolveTypeName(token);
          if (resolved)
            addToMap(idx.typeToFuncParams, resolved, fn.name);
        }
      }
      if (p.values) {
        for (const cname of Object.keys(p.values)) {
          if (constSet.has(cname))
            addToMap(idx.constToFunctions, cname, fn.name);
        }
      }
    }
  }
  for (const td of typesData.types) {
    for (const f of td.fields) {
      if (f.underlying_type) {
        const resolved = resolveTypeName(f.underlying_type);
        if (resolved && resolved !== td.name) {
          addToMap(idx.typeToParentTypes, resolved, td.name);
        }
      } else if (f.type) {
        for (const token of extractTypeNames(f.type)) {
          const resolved = resolveTypeName(token);
          if (resolved && resolved !== td.name) {
            addToMap(idx.typeToParentTypes, resolved, td.name);
          }
        }
      }
    }
  }
  for (const c of constsData.constants) {
    if (c.components) {
      for (const comp of c.components) {
        if (constSet.has(comp)) {
          addToMap(idx.constToConsts, comp, c.name);
        }
      }
    }
  }
  for (const e of constsData.enums) {
    for (const c of e.constants) {
      idx.enumForConstant.set(c.name, e.name);
    }
  }
  return idx;
}
function processData() {
  for (const rt of typesData.referenced_types) {
    if (!typesData.types.find((t) => t.name === rt.name)) {
      typesData.types.push(rt);
    }
  }
  for (const rc of constsData.referred_components) {
    if (!constsData.constants.find((c) => c.name === rc.name)) {
      constsData.constants.push(rc);
    }
  }
  typesByName = new Map(typesData.types.map((t) => [t.name, t]));
  funcsByName = new Map(funcsData.functions.map((f) => [f.name, f]));
  constsByName = new Map(constsData.constants.map((c) => [c.name, c]));
  enumsByName = new Map(constsData.enums.map((e) => [e.name, e]));
  constSet = new Set(constsByName.keys());
  for (const e of constsData.enums) {
    for (const c of e.constants)
      constSet.add(c.name);
  }
  enumSet = new Set(enumsByName.keys());
  allHeaders = new Set;
  for (const fn of funcsData.functions)
    if (fn.location.file)
      allHeaders.add(fn.location.file);
  for (const td of typesData.types)
    if (td.location.file)
      allHeaders.add(td.location.file);
  for (const c of constsData.constants)
    if (c.location.file)
      allHeaders.add(c.location.file);
  for (const e of constsData.enums)
    if (e.location.file)
      allHeaders.add(e.location.file);
  xref = buildXRef();
}
async function dataPathExists(prefix) {
  for (const file of ["funcs.json", "types.json", "consts.json"]) {
    try {
      const resp = await fetch(`${prefix}/${file}`, { method: "HEAD" });
      if (!resp.ok)
        continue;
      const len = resp.headers.get("content-length");
      if (len !== null && parseInt(len) === 0)
        continue;
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
async function loadData(dataset, arch) {
  if (dataset)
    currentDataset = dataset;
  if (arch)
    currentArch = arch;
  let prefix = `data/${currentDataset}/${currentArch}`;
  if (!await dataPathExists(prefix)) {
    prefix = `data/${currentDataset}`;
    if (!await dataPathExists(prefix)) {
      prefix = "data";
    }
  }
  const emptyFuncs = { command: "", functions: [] };
  const emptyTypes = { command: "", types: [], referenced_types: [] };
  const emptyConsts = { command: "", constants: [], enums: [], referred_components: [] };
  const fetchJson = async (url, fallback) => {
    try {
      const r = await fetch(url);
      if (!r.ok)
        return fallback;
      return await r.json();
    } catch {
      return fallback;
    }
  };
  const [f, t, c] = await Promise.all([
    fetchJson(prefix + "/funcs.json", emptyFuncs),
    fetchJson(prefix + "/types.json", emptyTypes),
    fetchJson(prefix + "/consts.json", emptyConsts)
  ]);
  funcsData = f;
  typesData = t;
  constsData = c;
  processData();
}
function getCurrentDataset() {
  return currentDataset;
}
function getCurrentArch() {
  return currentArch;
}
async function getAvailableDatasets() {
  const datasets = [];
  for (const ds of ["winsdk", "phnt"]) {
    for (const arch of ["amd64", "x86", "arm", "arm64"]) {
      if (await dataPathExists(`data/${ds}/${arch}`)) {
        datasets.push(ds);
        break;
      }
    }
    if (!datasets.includes(ds) && await dataPathExists(`data/${ds}`))
      datasets.push(ds);
  }
  if (datasets.length === 0)
    datasets.push("winsdk");
  return datasets;
}
async function getAvailableArchs(dataset) {
  const ds = dataset ?? currentDataset;
  const archs = [];
  for (const arch of ["amd64", "x86", "arm", "arm64"]) {
    if (await dataPathExists(`data/${ds}/${arch}`))
      archs.push(arch);
  }
  if (archs.length === 0)
    archs.push("amd64");
  return archs;
}
function getFunctions() {
  return funcsData.functions;
}
function getTypes() {
  return typesData.types;
}
function getConstants() {
  return constsData.constants;
}
function getEnums() {
  return constsData.enums;
}
function getXRef() {
  return xref;
}
function getAllHeaders() {
  return [...allHeaders].sort();
}
function hasConst(name) {
  return constSet.has(name);
}
function findType(name) {
  return typesByName.get(name);
}
function findFunc(name) {
  return funcsByName.get(name);
}
function findEnum(name) {
  return enumsByName.get(name);
}
function findConst(name) {
  return constsByName.get(name);
}
function cleanDll(dll) {
  const first = dll.split(";")[0].trim();
  return first.split(/\s/)[0];
}
function canonicalTypeName(token) {
  if (typesByName.has(token))
    return token;
  return null;
}
function searchAll(query, limit = 20) {
  if (!query || query.length < 2)
    return [];
  const q = query.toLowerCase();
  const results = [];
  const score = (name) => {
    const nl = name.toLowerCase();
    if (nl === q)
      return 100;
    if (nl.startsWith(q))
      return 80;
    const idx = nl.indexOf(q);
    if (idx >= 0)
      return 60 - idx * 0.1;
    return 0;
  };
  for (const f of funcsData.functions) {
    const s = score(f.name);
    if (s > 0)
      results.push({ kind: "function", name: f.name, score: s });
  }
  for (const t of typesData.types) {
    const s = score(t.name);
    if (s > 0)
      results.push({ kind: "type", name: t.name, score: s });
  }
  for (const c of constsData.constants) {
    const s = score(c.name);
    if (s > 0)
      results.push({ kind: "constant", name: c.name, score: s });
  }
  for (const e of constsData.enums) {
    const s = score(e.name);
    if (s > 0)
      results.push({ kind: "enum", name: e.name, score: s });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// src/router.ts
var routes = [];
function route(pattern, handler) {
  const keys = [];
  const regexStr = pattern.replace(/:([a-zA-Z_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  routes.push({ pattern: new RegExp("^" + regexStr + "$"), keys, handler });
}
function navigate(hash) {
  if (!hash.startsWith("#"))
    hash = "#" + hash;
  window.location.hash = hash;
}
function parseQuery(qs) {
  const params = {};
  if (!qs)
    return params;
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k)
      params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return params;
}
function startRouter() {
  const dispatch = () => {
    const raw = window.location.hash.slice(1) || "/";
    const [path, qs] = raw.split("?");
    const query = parseQuery(qs ?? "");
    for (const r of routes) {
      const m = path.match(r.pattern);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
        r.handler(params, query);
        return;
      }
    }
    routes[0]?.handler({}, query);
  };
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

// src/dom.ts
function $(sel, root = document) {
  return root.querySelector(sel);
}
function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className")
        e.className = v;
      else if (k.startsWith("data-"))
        e.setAttribute(k, v);
      else
        e[k] = v;
    }
  for (const c of children) {
    if (typeof c === "string")
      e.appendChild(document.createTextNode(c));
    else
      e.appendChild(c);
  }
  return e;
}
function clear(element) {
  element.innerHTML = "";
}

// src/theme.ts
function setupTheme() {
  const root = document.documentElement;
  const toggleBtn = $("#theme-toggle");
  const savedTheme = localStorage.getItem("bb-theme") ?? "dark";
  const savedAccent = localStorage.getItem("bb-accent") ?? "amber";
  root.setAttribute("data-theme", savedTheme);
  root.setAttribute("data-accent", savedAccent);
  toggleBtn.textContent = savedTheme === "dark" ? "\uD83C\uDF19" : "☀️";
  $$(".accent-swatch").forEach((s) => {
    s.classList.toggle("active", s.getAttribute("data-accent") === savedAccent);
  });
  toggleBtn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("bb-theme", next);
    toggleBtn.textContent = next === "dark" ? "\uD83C\uDF19" : "☀️";
  });
  for (const swatch of $$(".accent-swatch")) {
    swatch.addEventListener("click", () => {
      const accent = swatch.getAttribute("data-accent");
      root.setAttribute("data-accent", accent);
      localStorage.setItem("bb-accent", accent);
      $$(".accent-swatch").forEach((s) => s.classList.toggle("active", s === swatch));
    });
  }
}

// src/dataset-switcher.ts
async function reloadAndRedispatch() {
  const content = $("#content");
  const loading = el("div", { className: "dataset-loading" }, "Switching...");
  content.appendChild(loading);
  try {
    await loadData(getCurrentDataset(), getCurrentArch());
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch (e) {
    loading.textContent = `Failed to load data: ${e}`;
    loading.className = "error";
  }
}
function setupDatasetSwitcher() {
  const dsButtons = $$(".dataset-btn");
  const archContainer = $(".arch-switcher");
  async function refreshArchButtons() {
    archContainer.innerHTML = "";
    const available = await getAvailableArchs();
    if (available.length <= 1) {
      archContainer.style.display = "none";
      return;
    }
    archContainer.style.display = "";
    for (const arch of available) {
      const btn = el("button", {
        className: `arch-btn ${arch === getCurrentArch() ? "active" : ""}`,
        "data-arch": arch
      }, arch);
      btn.addEventListener("click", async () => {
        if (arch === getCurrentArch())
          return;
        archContainer.querySelectorAll(".arch-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        await loadData(undefined, arch);
        await reloadAndRedispatch();
      });
      archContainer.appendChild(btn);
    }
  }
  for (const btn of dsButtons) {
    btn.addEventListener("click", async () => {
      const dataset = btn.getAttribute("data-dataset");
      if (dataset === getCurrentDataset())
        return;
      dsButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      await loadData(dataset);
      await refreshArchButtons();
      await reloadAndRedispatch();
    });
  }
  getAvailableDatasets().then((available) => {
    for (const btn of dsButtons) {
      const ds = btn.getAttribute("data-dataset");
      if (!available.includes(ds))
        btn.style.display = "none";
    }
    if (available.length <= 1) {
      const switcher = $(".dataset-switcher");
      if (switcher)
        switcher.style.display = "none";
    }
  });
  refreshArchButtons();
}

// src/ui/links.ts
function typeLink(name, displayName) {
  const canonical = canonicalTypeName(name) ?? name;
  return el("a", {
    className: "xref xref-type",
    href: `#/types/${encodeURIComponent(canonical)}`
  }, displayName ?? name);
}
function funcLink(name) {
  return el("a", { className: "xref xref-func", href: `#/functions/${encodeURIComponent(name)}` }, name);
}
function constLink(name) {
  return el("a", { className: "xref xref-const", href: `#/constants/${encodeURIComponent(name)}` }, name);
}
function enumLink(name) {
  return el("a", { className: "xref xref-enum", href: `#/constants/enum/${encodeURIComponent(name)}` }, name);
}
function headerLink(header, view = "functions") {
  return el("a", {
    className: "xref xref-header",
    href: `#/${view}?header=${encodeURIComponent(header)}`
  }, header);
}
function badge(text, cls = "") {
  return el("span", { className: `badge ${cls}`.trim() }, text);
}
function renderTypeStr(typeStr, underlyingType) {
  const span = el("span", { className: "type-str" });
  const parts = typeStr.split(/\b/);
  let linked = false;
  for (const part of parts) {
    const canonical = canonicalTypeName(part);
    if (canonical) {
      span.appendChild(typeLink(canonical, part));
      linked = true;
    } else {
      span.appendChild(document.createTextNode(part));
    }
  }
  if (!linked && underlyingType) {
    const resolved = canonicalTypeName(underlyingType);
    if (resolved) {
      span.innerHTML = "";
      span.appendChild(typeLink(resolved, typeStr));
    }
  }
  return span;
}
function highlightCode(preEl) {
  if (typeof globalThis.arborium === "undefined")
    return;
  try {
    globalThis.arborium.highlightElement(preEl, "c");
  } catch {}
}

// src/utils.ts
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
function matchQuery(value, query, useRegex) {
  if (!query)
    return true;
  if (useRegex) {
    try {
      return new RegExp(query, "i").test(value);
    } catch {
      return false;
    }
  }
  if (!query.includes("*") && !query.includes("?")) {
    return value.toLowerCase().includes(query.toLowerCase());
  }
  return globToRegex(query).test(value);
}
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// src/search-modal.ts
var overlay;
var input;
var resultsList;
var previewPane;
var selectedIndex = -1;
var currentItems = [];
var previewTimer = null;
function getHref(item) {
  switch (item.kind) {
    case "function":
      return `#/functions/${encodeURIComponent(item.name)}`;
    case "type":
      return `#/types/${encodeURIComponent(item.name)}`;
    case "constant":
      return `#/constants/${encodeURIComponent(item.name)}`;
    case "enum":
      return `#/constants/enum/${encodeURIComponent(item.name)}`;
    default:
      return "#/";
  }
}
function getBadge(kind) {
  switch (kind) {
    case "function":
      return badge("fn", "search-badge-fn");
    case "type":
      return badge("type", "search-badge-type");
    case "constant":
      return badge("const", "search-badge-const");
    case "enum":
      return badge("enum", "search-badge-enum");
    case "page":
      return badge("go", "search-badge-page");
    default:
      return badge(kind);
  }
}
function renderPreview(item) {
  clear(previewPane);
  previewPane.classList.add("visible");
  const header = el("div", { className: "sp-header" });
  header.appendChild(getBadge(item.kind));
  header.appendChild(el("span", { className: "sp-name" }, item.name));
  previewPane.appendChild(header);
  if (item.kind === "function") {
    const fn = findFunc(item.name);
    if (fn) {
      const sig = el("div", { className: "sp-sig" });
      sig.appendChild(renderTypeStr(fn.return_type));
      sig.appendChild(document.createTextNode(" " + fn.name + "("));
      fn.params.forEach((p, i) => {
        if (i > 0)
          sig.appendChild(document.createTextNode(", "));
        sig.appendChild(renderTypeStr(p.type));
        if (p.name)
          sig.appendChild(document.createTextNode(" " + p.name));
      });
      sig.appendChild(document.createTextNode(")"));
      previewPane.appendChild(sig);
      const info = el("div", { className: "sp-info" });
      info.appendChild(el("div", {}, `header: ${fn.location.file ?? "?"}`));
      info.appendChild(el("div", {}, `params: ${fn.params.length}, ${fn.calling_convention}`));
      if (fn.is_dllimport)
        info.appendChild(el("div", {}, "exported"));
      if (fn.metadata?.dll)
        info.appendChild(el("div", {}, `dll: ${fn.metadata.dll.split(/[\s;]/)[0]}`));
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
function schedulePreview(item) {
  cancelPreview();
  previewTimer = setTimeout(() => renderPreview(item), 300);
}
function cancelPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}
function updateSelection() {
  const items = resultsList.querySelectorAll(".sm-result-item");
  items.forEach((el2, i) => {
    el2.classList.toggle("selected", i === selectedIndex);
  });
  if (selectedIndex >= 0 && items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: "nearest" });
    if (currentItems[selectedIndex]) {
      renderPreview(currentItems[selectedIndex]);
    }
  }
}
function selectAndGo() {
  if (selectedIndex >= 0 && currentItems[selectedIndex]) {
    closeModal();
    navigate(currentItems[selectedIndex].href.slice(1));
  }
}
function getShortcuts() {
  const shortcuts = [];
  for (const link of document.querySelectorAll(".nav-link")) {
    const text = link.textContent?.trim().toLowerCase() ?? "";
    const href = link.getAttribute("href") ?? "#/";
    if (text)
      shortcuts.push({ kind: "page", name: text, href });
  }
  shortcuts.push({ kind: "page", name: "type graph", href: "#/types/graph" });
  return shortcuts;
}
function renderResultRow(item, index) {
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
function doSearch() {
  const q = input.value.trim();
  clear(resultsList);
  previewPane.classList.remove("visible");
  clear(previewPane);
  selectedIndex = -1;
  currentItems = [];
  if (q.length < 1)
    return;
  const ql = q.toLowerCase();
  const matchedShortcuts = getShortcuts().filter((s) => s.name.includes(ql));
  const items = searchAll(q, 50);
  if (matchedShortcuts.length === 0 && items.length === 0) {
    resultsList.appendChild(el("div", { className: "sm-empty" }, "no results"));
    return;
  }
  for (const s of matchedShortcuts) {
    currentItems.push(s);
  }
  for (const item of items) {
    currentItems.push({ ...item, href: getHref(item) });
  }
  for (let i = 0;i < currentItems.length; i++) {
    resultsList.appendChild(renderResultRow(currentItems[i], i));
  }
}
function openModal() {
  overlay.classList.add("visible");
  input.value = "";
  clear(resultsList);
  previewPane.classList.remove("visible");
  clear(previewPane);
  selectedIndex = -1;
  currentItems = [];
  requestAnimationFrame(() => input.focus());
}
function closeModal() {
  overlay.classList.remove("visible");
  input.value = "";
  cancelPreview();
}
function setupSearchModal() {
  overlay = el("div", { className: "sm-overlay" });
  const modal = el("div", { className: "sm-modal" });
  const inputRow = el("div", { className: "sm-input-row" });
  const slash = el("span", { className: "sm-slash" }, "/");
  input = el("input", {
    type: "text",
    placeholder: "search everything...",
    className: "sm-input"
  });
  inputRow.appendChild(slash);
  inputRow.appendChild(input);
  modal.appendChild(inputRow);
  const body = el("div", { className: "sm-body" });
  resultsList = el("div", { className: "sm-results" });
  previewPane = el("div", { className: "sm-preview" });
  body.appendChild(resultsList);
  body.appendChild(previewPane);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  input.addEventListener("input", debounce(doSearch, 100));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay)
      closeModal();
  });
  input.addEventListener("keydown", (e) => {
    const len = currentItems.length;
    if (e.key === "ArrowDown" || e.ctrlKey && e.key === "j") {
      e.preventDefault();
      selectedIndex = len > 0 ? (selectedIndex + 1) % len : -1;
      updateSelection();
    } else if (e.key === "ArrowUp" || e.ctrlKey && e.key === "k") {
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
  document.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("visible")) {
      if (e.key === "Escape") {
        closeModal();
        e.preventDefault();
      }
      return;
    }
    const active = document.activeElement;
    if (active?.closest("input, textarea, select"))
      return;
    if (e.key === "/" || e.ctrlKey && e.key === "k") {
      e.preventDefault();
      openModal();
    }
  });
  const navSearch = document.getElementById("global-search");
  if (navSearch) {
    navSearch.addEventListener("click", () => openModal());
  }
}

// src/clippy.ts
function wordWrap(text, width) {
  const lines = [];
  for (const paragraph of text.split(`
`)) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (line.length + word.length + 1 > width && line.length > 0) {
        lines.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line)
      lines.push(line);
  }
  return lines;
}
function buildTextHouse(text, maxWidth) {
  if (maxWidth < 10)
    return [];
  const lines = wordWrap(text, maxWidth - 4);
  const padded = lines.map((l) => l.padEnd(maxWidth - 4));
  let edgeChars = ["/", "\\", "\\", "/"];
  let frameChar = "_";
  let contentChar = "|";
  let frame = [
    " " + frameChar.repeat(maxWidth - 2) + " ",
    edgeChars[0] + " ".repeat(maxWidth - 2) + edgeChars[1]
  ];
  for (const entry of padded) {
    frame.push(contentChar + " " + entry + " " + contentChar);
  }
  frame.push(edgeChars[2] + frameChar.repeat(maxWidth - 2) + edgeChars[3]);
  return [...frame];
}
function joinColumns(left, right, gap) {
  const leftWidth = Math.max(...left.map((l) => l.length), 0);
  const rightWidth = Math.max(...right.map((l) => l.length), 0);
  const rows = Math.max(left.length, right.length);
  const leftPad = Math.floor((rows - left.length) / 2);
  const rightPad = Math.floor((rows - right.length) / 2);
  const spacer = " ".repeat(gap);
  const result = [];
  for (let i = 0;i < rows; i++) {
    const l = (left[i - leftPad] ?? "").padEnd(leftWidth);
    const r = (right[i - rightPad] ?? "").padEnd(rightWidth);
    result.push(l + spacer + r);
  }
  return result;
}
var CLIPPY_ART = [
  " ___",
  "/   \\",
  "|   |",
  "@   @",
  "|| ||",
  "|| ||",
  "|\\_/|",
  "\\___/"
];
function cowsay(text, maxWidth = 30) {
  const clippyWidth = Math.max(...CLIPPY_ART.map((l) => l.length));
  const spacing = 3;
  const textHouse = buildTextHouse(text, maxWidth - clippyWidth - spacing);
  return joinColumns(CLIPPY_ART, textHouse, spacing).join(`
`);
}
var STORAGE_KEY = "bb-clippy-closed";
var MESSAGE = "it looks like you're doing some serious reverse engineering! wanna try out bb for the terminal?";
function initClippy() {
  const box = document.createElement("div");
  box.id = "clippy-box";
  document.body.appendChild(box);
  const qmark = document.createElement("span");
  qmark.className = "clippy-qmark";
  qmark.textContent = "?";
  box.appendChild(qmark);
  const content = document.createElement("div");
  content.className = "clippy-content";
  const closeBtn = document.createElement("button");
  closeBtn.className = "clippy-close";
  closeBtn.textContent = "x";
  closeBtn.title = "close";
  const pre = document.createElement("pre");
  pre.className = "clippy-ascii";
  pre.textContent = cowsay(MESSAGE, 50);
  const link = document.createElement("a");
  link.href = "https://github.com/cristeigabriela/bb";
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "clippy-link";
  link.textContent = "> github.com/cristeigabriela/bb";
  content.appendChild(closeBtn);
  content.appendChild(pre);
  content.appendChild(link);
  box.appendChild(content);
  const asciiText = pre.textContent;
  const asciiLines = asciiText.split(`
`);
  const maxCols = Math.max(...asciiLines.map((l) => l.length));
  const charW = 5.95;
  const lineH = 12.25;
  const padX = 10 * 2 + 2;
  const padY = 10 * 2 + 2 + 24;
  const expandedWidth = Math.ceil(maxCols * charW + padX);
  const expandedHeight = Math.ceil(asciiLines.length * lineH + padY);
  box.style.setProperty("--exp-w", expandedWidth + "px");
  box.style.setProperty("--exp-h", expandedHeight + "px");
  const wasClosed = localStorage.getItem(STORAGE_KEY) === "1";
  let isAnimating = false;
  function expand() {
    if (isAnimating)
      return;
    isAnimating = true;
    localStorage.removeItem(STORAGE_KEY);
    qmark.classList.add("hidden");
    box.offsetHeight;
    box.classList.add("expanded");
    setTimeout(() => {
      content.classList.add("visible");
      isAnimating = false;
    }, 380);
  }
  function collapse() {
    if (isAnimating)
      return;
    isAnimating = true;
    localStorage.setItem(STORAGE_KEY, "1");
    content.classList.remove("visible");
    setTimeout(() => {
      box.classList.remove("expanded");
      setTimeout(() => {
        qmark.classList.remove("hidden");
        isAnimating = false;
      }, 380);
    }, 250);
  }
  box.addEventListener("click", (e) => {
    if (!box.classList.contains("expanded"))
      expand();
  });
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapse();
  });
  if (wasClosed) {} else {
    setTimeout(() => expand(), 1500);
  }
}

// src/views/home.ts
function countBy(items, keyFn) {
  const counts = new Map;
  for (const item of items) {
    const k = keyFn(item);
    if (k)
      counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
function statCard(label, value, sub) {
  const card = el("div", { className: "stat-card" }, el("div", { className: "stat-value" }, String(value)), el("div", { className: "stat-label" }, label));
  if (sub)
    card.appendChild(el("div", { className: "stat-sub" }, sub));
  return card;
}
function showChartModal(title, items, onClick) {
  const overlay2 = el("div", { className: "chart-modal-overlay" });
  const modal = el("div", { className: "chart-modal" });
  const header = el("div", { className: "chart-modal-header" });
  header.appendChild(el("h2", {}, title));
  const closeBtn = el("button", { className: "chart-modal-close" }, "x");
  header.appendChild(closeBtn);
  modal.appendChild(header);
  const body = el("div", { className: "chart-modal-body" });
  const max = Math.max(...items.map((i) => i[1]), 1);
  for (const [label, count] of items) {
    const pct = count / max * 100;
    const isClickable = onClick && count > 0;
    const labelEl = isClickable ? el("a", { className: "chart-label clickable", href: "#" }, label) : el("span", { className: "chart-label" }, label);
    if (isClickable) {
      labelEl.addEventListener("click", (e) => {
        e.preventDefault();
        overlay2.remove();
        onClick(label);
      });
    }
    const row = el("div", { className: "chart-row" }, labelEl, el("div", { className: "chart-bar-bg" }, el("div", { className: "chart-bar", style: `width:${pct}%` })), el("span", { className: "chart-count" }, String(count)));
    body.appendChild(row);
  }
  modal.appendChild(body);
  overlay2.appendChild(modal);
  document.body.appendChild(overlay2);
  const close = () => overlay2.remove();
  closeBtn.addEventListener("click", close);
  overlay2.addEventListener("click", (e) => {
    if (e.target === overlay2)
      close();
  });
  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", handler);
    }
  });
}
function barChart(title, items, opts = {}) {
  const { onClick, clickableSet, allItems } = opts;
  const max = Math.max(...items.map((i) => i[1]), 1);
  const chart = el("div", { className: "chart-card" });
  const h3 = el("h3", { className: "chart-title-clickable" }, title);
  h3.addEventListener("click", () => {
    showChartModal(title, allItems ?? items, onClick);
  });
  chart.appendChild(h3);
  const body = el("div", { className: "chart-body" });
  for (const [label, count] of items) {
    const pct = count / max * 100;
    const isClickable = onClick && (!clickableSet || clickableSet.has(label)) && count > 0;
    const labelEl = isClickable ? el("a", { className: "chart-label clickable", href: "#" }, label) : el("span", { className: "chart-label" }, label);
    if (isClickable) {
      labelEl.addEventListener("click", (e) => {
        e.preventDefault();
        onClick(label);
      });
    }
    const row = el("div", { className: "chart-row" }, labelEl, el("div", { className: "chart-bar-bg" }, el("div", { className: "chart-bar", style: `width:${pct}%` })), el("span", { className: "chart-count" }, String(count)));
    body.appendChild(row);
  }
  chart.appendChild(body);
  return chart;
}
function sizeHistogram(types) {
  const buckets = [
    { label: "1-8 B", min: 1, max: 8 },
    { label: "9-32 B", min: 9, max: 32 },
    { label: "33-64 B", min: 33, max: 64 },
    { label: "65-128 B", min: 65, max: 128 },
    { label: "129-256 B", min: 129, max: 256 },
    { label: "257-512 B", min: 257, max: 512 },
    { label: "513-1024 B", min: 513, max: 1024 },
    { label: "1 KB+", min: 1025, max: 999999 }
  ];
  const counts = buckets.map((b) => [
    b.label,
    types.filter((t) => t.size !== null && t.size >= b.min && t.size <= b.max).length
  ]);
  const bucketMap = new Map(buckets.map((b) => [b.label, b]));
  return barChart("Type size distribution", counts.filter((c) => c[1] > 0), {
    onClick: (label) => {
      const bucket = bucketMap.get(label);
      if (bucket) {
        navigate(`/types?minSize=${bucket.min}&maxSize=${bucket.max}`);
      }
    }
  });
}
function renderHome(container) {
  clear(container);
  const funcs = getFunctions();
  const types = getTypes();
  const consts = getConstants();
  const enums = getEnums();
  const xref2 = getXRef();
  const page = el("div", { className: "home-view" });
  page.appendChild(el("div", { className: "hero" }, el("h1", {}, "bb viewer"), el("p", { className: "hero-sub" }, "Windows SDK & PHNT header analysis explorer")));
  const statsRow = el("div", { className: "stats-row" });
  const exported = funcs.filter((f) => f.is_exported).length;
  const withMeta = funcs.filter((f) => f.metadata).length;
  const withFields = types.filter((t) => t.fields.length > 0).length;
  const withComponents = consts.filter((c) => c.components && c.components.length > 0).length;
  const totalEnumVariants = enums.reduce((s, e) => s + e.constants.length, 0);
  const fnCard = statCard("Functions", funcs.length.toLocaleString(), `${exported.toLocaleString()} exported`);
  fnCard.style.cursor = "pointer";
  fnCard.addEventListener("click", () => navigate("/functions"));
  statsRow.appendChild(fnCard);
  const tCard = statCard("Types", types.length.toLocaleString(), `${withFields.toLocaleString()} with fields`);
  tCard.style.cursor = "pointer";
  tCard.addEventListener("click", () => navigate("/types"));
  statsRow.appendChild(tCard);
  const cCard = statCard("Constants", consts.length.toLocaleString(), `${withComponents.toLocaleString()} composed`);
  cCard.style.cursor = "pointer";
  cCard.addEventListener("click", () => navigate("/constants"));
  statsRow.appendChild(cCard);
  const eCard = statCard("Enums", enums.length.toLocaleString(), `${totalEnumVariants.toLocaleString()} variants`);
  eCard.style.cursor = "pointer";
  eCard.addEventListener("click", () => navigate("/constants"));
  statsRow.appendChild(eCard);
  statsRow.appendChild(statCard("With Metadata", withMeta.toLocaleString(), `of ${funcs.length.toLocaleString()} functions`));
  const typesWithSize = types.filter((t) => t.size !== null);
  const avgSize = typesWithSize.length > 0 ? Math.round(typesWithSize.reduce((s, t) => s + (t.size ?? 0), 0) / typesWithSize.length) : 0;
  statsRow.appendChild(statCard("Avg Type Size", avgSize + " B"));
  page.appendChild(statsRow);
  const chartsRow = el("div", { className: "charts-row" });
  function parseWinVersion(mc) {
    const s = mc.replace(/\u00a0/g, " ");
    if (s.includes("Windows 11"))
      return "Windows 11";
    if (s.includes("Windows 10"))
      return "Windows 10";
    if (s.includes("Windows 8.1"))
      return "Windows 8.1";
    if (s.includes("Windows 8"))
      return "Windows 8";
    if (s.includes("Windows 7"))
      return "Windows 7";
    if (s.includes("Windows Vista"))
      return "Windows Vista";
    if (s.includes("Windows XP"))
      return "Windows XP";
    if (s.includes("Windows 2000"))
      return "Windows 2000";
    if (s.includes("Windows NT"))
      return "Windows NT";
    return "other";
  }
  function parseServerVersion(ms) {
    const s = ms.replace(/\u00a0/g, " ");
    if (s.includes("2022"))
      return "Server 2022";
    if (s.includes("2019"))
      return "Server 2019";
    if (s.includes("2016"))
      return "Server 2016";
    if (s.includes("2012 R2"))
      return "Server 2012 R2";
    if (s.includes("2012"))
      return "Server 2012";
    if (s.includes("2008 R2"))
      return "Server 2008 R2";
    if (s.includes("2008"))
      return "Server 2008";
    if (s.includes("2003"))
      return "Server 2003";
    if (s.includes("2000"))
      return "Server 2000";
    return "other";
  }
  const versionCounts = new Map;
  for (const f of funcs) {
    if (f.metadata?.min_client)
      versionCounts.set(parseWinVersion(f.metadata.min_client), (versionCounts.get(parseWinVersion(f.metadata.min_client)) ?? 0) + 1);
  }
  const versionOrder = ["Windows NT", "Windows 2000", "Windows XP", "Windows Vista", "Windows 7", "Windows 8", "Windows 8.1", "Windows 10", "Windows 11"];
  const versionItems = versionOrder.filter((v) => versionCounts.has(v)).map((v) => [v, versionCounts.get(v)]);
  chartsRow.appendChild(barChart("Functions by minimum Windows version", versionItems, {
    allItems: versionItems,
    onClick: (ver) => navigate(`/functions?minClient=${encodeURIComponent(ver)}`)
  }));
  const serverCounts = new Map;
  for (const f of funcs) {
    if (f.metadata?.min_server)
      serverCounts.set(parseServerVersion(f.metadata.min_server), (serverCounts.get(parseServerVersion(f.metadata.min_server)) ?? 0) + 1);
  }
  const serverOrder = ["Server 2000", "Server 2003", "Server 2008", "Server 2008 R2", "Server 2012", "Server 2012 R2", "Server 2016", "Server 2019", "Server 2022"];
  const serverItems = serverOrder.filter((v) => serverCounts.has(v)).map((v) => [v, serverCounts.get(v)]);
  if (serverItems.length > 0) {
    chartsRow.appendChild(barChart("Functions by minimum server version", serverItems, {
      allItems: serverItems,
      onClick: (ver) => navigate(`/functions?minServer=${encodeURIComponent(ver)}`)
    }));
  }
  const allDlls = countBy(funcs.filter((f) => f.metadata?.dll), (f) => cleanDll(f.metadata.dll));
  chartsRow.appendChild(barChart("Top DLLs", allDlls.slice(0, 10), {
    allItems: allDlls,
    onClick: (dll) => navigate(`/functions?dll=${encodeURIComponent(dll)}`)
  }));
  const typeRefCounts = new Map;
  for (const [name, fns] of xref2.typeToFuncParams)
    typeRefCounts.set(name, (typeRefCounts.get(name) ?? 0) + fns.size);
  for (const [name, fns] of xref2.typeToFuncReturns)
    typeRefCounts.set(name, (typeRefCounts.get(name) ?? 0) + fns.size);
  const allTypeRefs = [...typeRefCounts.entries()].sort((a, b) => b[1] - a[1]);
  chartsRow.appendChild(barChart("Most referenced types (in functions)", allTypeRefs.slice(0, 10), {
    allItems: allTypeRefs,
    onClick: (t) => navigate(`/types/${encodeURIComponent(t)}`)
  }));
  const depthCounts = new Map;
  for (const f of funcs) {
    for (const p of f.params)
      depthCounts.set(p.pointer_depth ?? 0, (depthCounts.get(p.pointer_depth ?? 0) ?? 0) + 1);
  }
  const depthItems = [...depthCounts.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => [`depth ${d}`, n]);
  const depthMap = new Map(depthItems.map(([label], i) => [label, [...depthCounts.keys()].sort()[i]]));
  chartsRow.appendChild(barChart("Parameter pointer depth", depthItems, {
    onClick: (label) => {
      const d = depthMap.get(label);
      if (d !== undefined)
        navigate(`/functions?ptrDepth=${d}`);
    }
  }));
  let regCount = 0, stackCount = 0, indirectCount = 0;
  for (const f of funcs) {
    for (const p of f.params) {
      if (p.abi.kind === "reg")
        regCount++;
      else if (p.abi.kind === "stack")
        stackCount++;
      else if (p.abi.kind === "indirect")
        indirectCount++;
    }
  }
  chartsRow.appendChild(barChart("Parameter ABI locations", [
    ["Register", regCount],
    ["Stack", stackCount],
    ["Indirect", indirectCount]
  ]));
  const allFuncHeaders = countBy(funcs, (f) => f.location.file);
  chartsRow.appendChild(barChart("Top function headers", allFuncHeaders.slice(0, 10), {
    allItems: allFuncHeaders,
    onClick: (h) => navigate(`/functions?header=${encodeURIComponent(h)}`)
  }));
  const allReturnTypes = countBy(funcs, (f) => f.return_type);
  chartsRow.appendChild(barChart("Top return types", allReturnTypes.slice(0, 10), {
    allItems: allReturnTypes,
    onClick: (rt) => navigate(`/functions?returnType=${encodeURIComponent(rt)}`)
  }));
  const paramBucketDefs = [
    { label: "0 params", min: 0, max: 0 },
    { label: "1 param", min: 1, max: 1 },
    { label: "2 params", min: 2, max: 2 },
    { label: "3 params", min: 3, max: 3 },
    { label: "4 params", min: 4, max: 4 },
    { label: "5+ params", min: 5, max: 999 }
  ];
  const paramBuckets = paramBucketDefs.map((b) => [
    b.label,
    funcs.filter((f) => f.params.length >= b.min && f.params.length <= b.max).length
  ]);
  const paramBucketMap = new Map(paramBucketDefs.map((b) => [b.label, b]));
  chartsRow.appendChild(barChart("Function parameter count distribution", paramBuckets, {
    onClick: (label) => {
      const b = paramBucketMap.get(label);
      if (b)
        navigate(`/functions?minParams=${b.min}&maxParams=${b.max}`);
    }
  }));
  const allTypesBySize = types.filter((t) => t.size !== null).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).map((t) => [t.name, t.size]);
  chartsRow.appendChild(barChart("Largest types (by size in bytes)", allTypesBySize.slice(0, 10), {
    allItems: allTypesBySize,
    onClick: (t) => navigate(`/types/${encodeURIComponent(t)}`)
  }));
  chartsRow.appendChild(sizeHistogram(types));
  const allTypesByFields = [...types].sort((a, b) => b.fields.length - a.fields.length).filter((t) => t.fields.length > 0).map((t) => [t.name, t.fields.length]);
  chartsRow.appendChild(barChart("Types with most fields", allTypesByFields.slice(0, 10), {
    allItems: allTypesByFields,
    onClick: (t) => navigate(`/types/${encodeURIComponent(t)}`)
  }));
  const allEnumsBySize = enums.map((e) => [e.name, e.constants.length]).sort((a, b) => b[1] - a[1]);
  chartsRow.appendChild(barChart("Largest enums (by variants)", allEnumsBySize.slice(0, 10), {
    allItems: allEnumsBySize,
    onClick: (e) => navigate(`/constants/enum/${encodeURIComponent(e)}`)
  }));
  const allParamNames = countBy(funcs.flatMap((f) => f.params.filter((p) => p.name).map((p) => ({ n: p.name }))), (p) => p.n);
  chartsRow.appendChild(barChart("Most common parameter names", allParamNames.slice(0, 10), { allItems: allParamNames }));
  const allTypeHeaders = countBy(types.filter((t) => t.location.file), (t) => t.location.file);
  chartsRow.appendChild(barChart("Top type headers", allTypeHeaders.slice(0, 10), {
    allItems: allTypeHeaders,
    onClick: (h) => navigate(`/types?header=${encodeURIComponent(h)}`)
  }));
  const allConstHeaders = countBy(consts.filter((c) => c.location.file), (c) => c.location.file);
  chartsRow.appendChild(barChart("Top constant headers", allConstHeaders.slice(0, 10), {
    allItems: allConstHeaders,
    onClick: (h) => navigate(`/constants?header=${encodeURIComponent(h)}`)
  }));
  const alignItems = countBy(types.flatMap((t) => t.fields.map((f) => ({ a: f.alignment + "B" }))), (f) => f.a);
  chartsRow.appendChild(barChart("Field alignment distribution", alignItems));
  page.appendChild(chartsRow);
  container.appendChild(page);
}

// src/ui/filter-dropdown.ts
function buildFilterDropdown(label, allValues, activeSet, onChange) {
  const wrapper = el("div", { className: "filter-dropdown" });
  const trigger = el("button", { className: "filter-dropdown-trigger" });
  const menu = el("div", { className: "filter-dropdown-menu hidden" });
  const searchInput = el("input", {
    type: "text",
    placeholder: `Search ${label.toLowerCase()}...`,
    className: "filter-dropdown-search"
  });
  menu.appendChild(searchInput);
  const btnRow = el("div", { className: "filter-dropdown-actions" });
  const selectAllBtn = el("button", { className: "filter-action-btn" }, "All");
  const clearAllBtn = el("button", { className: "filter-action-btn" }, "None");
  btnRow.appendChild(selectAllBtn);
  btnRow.appendChild(clearAllBtn);
  menu.appendChild(btnRow);
  const optionsList = el("div", { className: "filter-dropdown-options" });
  menu.appendChild(optionsList);
  let currentFiltered = allValues;
  function updateTriggerLabel() {
    trigger.textContent = activeSet.size > 0 ? `${label} (${activeSet.size})` : label;
    trigger.className = `filter-dropdown-trigger ${activeSet.size > 0 ? "has-filters" : ""}`;
  }
  function renderOptions() {
    optionsList.innerHTML = "";
    const query = searchInput.value.toLowerCase();
    currentFiltered = query ? allValues.filter((v) => v.toLowerCase().includes(query)) : allValues;
    for (const val of currentFiltered) {
      const option = el("label", { className: "filter-dropdown-option" });
      const cb = el("input", { type: "checkbox" });
      cb.checked = activeSet.has(val);
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        if (cb.checked)
          activeSet.add(val);
        else
          activeSet.delete(val);
        updateTriggerLabel();
        onChange();
      });
      option.appendChild(cb);
      option.appendChild(el("span", { className: "filter-option-label" }, val));
      optionsList.appendChild(option);
    }
    if (currentFiltered.length === 0) {
      optionsList.appendChild(el("div", { className: "filter-dropdown-empty dim" }, "No matches"));
    }
  }
  selectAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    for (const v of currentFiltered)
      activeSet.add(v);
    renderOptions();
    updateTriggerLabel();
    onChange();
  });
  clearAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    activeSet.clear();
    renderOptions();
    updateTriggerLabel();
    onChange();
  });
  searchInput.addEventListener("input", () => renderOptions());
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".filter-dropdown-menu").forEach((m) => {
      if (m !== menu)
        m.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
    if (!menu.classList.contains("hidden")) {
      searchInput.value = "";
      renderOptions();
      searchInput.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  updateTriggerLabel();
  renderOptions();
  return {
    element: wrapper,
    refresh() {
      updateTriggerLabel();
      renderOptions();
    }
  };
}

// src/views/shared.ts
function buildSearchInput(placeholder, onChange, initial = "") {
  let useRegex = false;
  const wrap = el("div", { className: "search-with-toggle" });
  const input2 = el("input", {
    type: "text",
    placeholder,
    className: "search-input"
  });
  input2.value = initial;
  const regexBtn = el("button", { className: "regex-toggle-btn" }, ".*");
  regexBtn.title = "Toggle regex mode";
  regexBtn.addEventListener("click", () => {
    useRegex = !useRegex;
    regexBtn.classList.toggle("active", useRegex);
    input2.placeholder = useRegex ? placeholder.replace(/\(glob:.*?\)/i, "(regex)") : placeholder;
    onChange(input2.value, useRegex);
  });
  input2.addEventListener("input", debounce(() => {
    onChange(input2.value, useRegex);
  }, 200));
  wrap.appendChild(input2);
  wrap.appendChild(regexBtn);
  return { element: wrap, getValue: () => input2.value, isRegex: () => useRegex };
}
function buildSortRow(columns, initial, onChange) {
  const state = { ...initial };
  const row = el("div", { className: "sort-row" });
  const buttons = [];
  function refresh() {
    for (const btn of buttons) {
      const key = btn.getAttribute("data-sort-key");
      const lbl = btn.getAttribute("data-sort-label");
      btn.className = `sort-btn ${state.sortBy === key ? "active" : ""}`;
      btn.textContent = lbl + (state.sortBy === key ? state.sortDir === "asc" ? " ▲" : " ▼" : "");
    }
  }
  for (const [key, label] of columns) {
    const btn = el("button", { className: "sort-btn" }, label);
    btn.setAttribute("data-sort-key", key);
    btn.setAttribute("data-sort-label", label);
    btn.addEventListener("click", () => {
      if (state.sortBy === key)
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortBy = key;
        state.sortDir = "asc";
      }
      refresh();
      onChange(state);
    });
    buttons.push(btn);
    row.appendChild(btn);
  }
  refresh();
  return { element: row, getState: () => state, refresh };
}
function renderFilterChips(container, chips) {
  container.innerHTML = "";
  for (const chip of chips) {
    const span = el("span", { className: "active-filter" }, chip.label);
    const btn = el("button", { className: "clear-filter-btn" }, "×");
    btn.addEventListener("click", chip.onRemove);
    span.appendChild(btn);
    container.appendChild(span);
  }
}
function renderNotFound(container, entity, name, backHref, backLabel) {
  container.appendChild(el("div", { className: "not-found" }, el("h2", {}, `${entity} not found`), el("p", {}, `No ${entity.toLowerCase()} named "${name}" was found.`), el("a", { href: backHref }, `← ${backLabel}`)));
  return false;
}
function collapsibleSection(title, ...children) {
  const section = el("div", { className: "collapsible-section" });
  const header = el("div", { className: "section-header" });
  const arrow = el("span", { className: "section-arrow" }, "▼");
  header.appendChild(arrow);
  header.appendChild(el("h3", {}, title));
  section.appendChild(header);
  const body = el("div", { className: "section-body" });
  for (const child of children) {
    if (child)
      body.appendChild(child);
  }
  section.appendChild(body);
  header.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    arrow.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
  });
  return section;
}
function renderPagination(container, currentPage, totalPages, onPage) {
  clear(container);
  if (totalPages <= 1)
    return;
  const nav = el("nav", { className: "pagination" });
  const addBtn = (label, page, disabled, active = false) => {
    const btn = el("button", {
      className: `page-btn ${active ? "active" : ""} ${disabled ? "disabled" : ""}`.trim()
    }, label);
    if (!disabled && !active)
      btn.addEventListener("click", () => onPage(page));
    nav.appendChild(btn);
  };
  addBtn("«", 0, currentPage === 0);
  addBtn("‹", currentPage - 1, currentPage === 0);
  const windowSize = 3;
  let start = Math.max(0, currentPage - windowSize);
  let end = Math.min(totalPages - 1, currentPage + windowSize);
  if (start > 0) {
    addBtn("1", 0, false);
    if (start > 1)
      nav.appendChild(el("span", { className: "page-ellipsis" }, "…"));
  }
  for (let i = start;i <= end; i++) {
    addBtn(String(i + 1), i, false, i === currentPage);
  }
  if (end < totalPages - 1) {
    if (end < totalPages - 2)
      nav.appendChild(el("span", { className: "page-ellipsis" }, "…"));
    addBtn(String(totalPages), totalPages - 1, false);
  }
  addBtn("›", currentPage + 1, currentPage === totalPages - 1);
  addBtn("»", totalPages - 1, currentPage === totalPages - 1);
  container.appendChild(nav);
}

// src/views/functions.ts
var PAGE_SIZE = 50;
function renderAbiDiagram(fn) {
  const diagram = el("div", { className: "abi-diagram" });
  const regParams = fn.params.filter((p) => p.abi.kind === "reg");
  const stackParams = fn.params.filter((p) => p.abi.kind === "stack");
  const indirectParams = fn.params.filter((p) => p.abi.kind === "indirect");
  if (regParams.length > 0) {
    const regSection = el("div", { className: "abi-section" });
    regSection.appendChild(el("div", { className: "abi-section-label" }, "Registers"));
    for (const p of regParams) {
      const row = el("div", { className: "abi-slot abi-reg-slot" });
      row.appendChild(el("div", { className: "abi-reg-badge" }, p.abi.register));
      const info = el("div", { className: "abi-slot-info" });
      info.appendChild(el("span", { className: "abi-param-name" }, p.name ?? `arg${p.index}`));
      const typeEl = renderTypeStr(p.type, p.underlying_type);
      typeEl.className += " abi-param-type";
      info.appendChild(typeEl);
      for (const d of p.directions)
        info.appendChild(badge(d, `dir-${d}`));
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
      row.appendChild(el("div", { className: "abi-stack-badge" }, `RSP+0x${(p.abi.offset ?? 0).toString(16).toUpperCase()}`));
      const info = el("div", { className: "abi-slot-info" });
      info.appendChild(el("span", { className: "abi-param-name" }, p.name ?? `arg${p.index}`));
      const typeEl = renderTypeStr(p.type, p.underlying_type);
      typeEl.className += " abi-param-type";
      info.appendChild(typeEl);
      for (const d of p.directions)
        info.appendChild(badge(d, `dir-${d}`));
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
    retRow.appendChild(badge(fn.return_abi.register, "abi-reg"));
  } else if (fn.return_abi.kind === "indirect") {
    retRow.appendChild(el("span", { className: "abi-ret-via" }, "via"));
    retRow.appendChild(badge("indirect", "abi-indirect"));
  }
  diagram.appendChild(retRow);
  return diagram;
}
function renderParamValues(p, limit) {
  const valKeys = Object.keys(p.values ?? {});
  if (valKeys.length === 0)
    return el("span", {});
  const container = el("div", { className: "param-values" });
  const render = (count) => {
    container.innerHTML = "";
    for (const vk of valKeys.slice(0, count)) {
      if (hasConst(vk))
        container.appendChild(constLink(vk));
      else
        container.appendChild(el("code", { className: "dim" }, vk));
    }
    if (count < valKeys.length) {
      const more = el("button", { className: "expand-more-btn" }, `+${valKeys.length - count} more`);
      more.addEventListener("click", (e) => {
        e.preventDefault();
        render(valKeys.length);
      });
      container.appendChild(more);
    }
  };
  render(limit);
  return container;
}
function renderFuncDetailView(fn) {
  const detail = el("div", { className: "func-detail" });
  const sig = el("div", { className: "func-signature" });
  sig.appendChild(renderTypeStr(fn.return_type));
  sig.appendChild(document.createTextNode(" "));
  sig.appendChild(el("strong", { className: "func-name-sig" }, fn.name));
  sig.appendChild(document.createTextNode("("));
  fn.params.forEach((p, i) => {
    if (i > 0)
      sig.appendChild(document.createTextNode(", "));
    renderTypeStr(p.type, p.underlying_type).childNodes.forEach((n) => sig.appendChild(n.cloneNode(true)));
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
  if (fn.is_dllimport)
    tags.appendChild(badge("exported", "tag-exported"));
  if (fn.has_body)
    tags.appendChild(badge("has body", "tag-body"));
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
    if (fn.metadata.lib)
      grid.appendChild(el("div", {}, el("strong", {}, "Lib: "), document.createTextNode(fn.metadata.lib)));
    if (fn.metadata.min_client)
      grid.appendChild(el("div", {}, el("strong", {}, "Min Client: "), document.createTextNode(fn.metadata.min_client)));
    if (fn.metadata.min_server)
      grid.appendChild(el("div", {}, el("strong", {}, "Min Server: "), document.createTextNode(fn.metadata.min_server)));
    if (fn.metadata.variants.length > 0) {
      const vars = el("div", {}, el("strong", {}, "Variants: "));
      fn.metadata.variants.forEach((v, i) => {
        if (i > 0)
          vars.appendChild(document.createTextNode(", "));
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
  const paramsWithVals = fn.params.filter((p) => Object.keys(p.values ?? {}).length > 0);
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
  const typesUsed = new Set;
  for (const p of fn.params) {
    if (p.underlying_type && findType(p.underlying_type))
      typesUsed.add(p.underlying_type);
  }
  if (typesUsed.size > 0) {
    const list = el("div", { className: "xref-list" });
    for (const t of typesUsed) {
      const td = findType(t);
      const item = el("span", { className: "xref-chip" });
      item.appendChild(typeLink(t));
      if (td?.size)
        item.appendChild(el("span", { className: "dim" }, ` (${td.size}B)`));
      list.appendChild(item);
    }
    detail.appendChild(collapsibleSection("Referenced Types", list));
  }
  return detail;
}
function renderFunctionsList(container, query = {}) {
  clear(container);
  const hasQueryOverride = !!(query.header || query.dll || query.q || query.minParams || query.maxParams || query.ptrDepth || query.minClient || query.minServer);
  let filterExported = hasQueryOverride ? "all" : "yes";
  const filterHeaders = new Set;
  const filterReturnTypes = new Set;
  const filterDlls = new Set;
  let filterMinParams = parseInt(query.minParams ?? "") || 0;
  let filterMaxParams = parseInt(query.maxParams ?? "") || Infinity;
  let filterPointerDepth = parseInt(query.ptrDepth ?? "") || -1;
  let filterMinClient = query.minClient ?? "";
  let filterMinServer = query.minServer ?? "";
  let page = 0;
  let searchQuery = query.q ?? "";
  let useRegex = false;
  if (query.header)
    filterHeaders.add(query.header);
  if (query.dll)
    filterDlls.add(query.dll);
  if (query.returnType)
    filterReturnTypes.add(query.returnType);
  let headerDropdown;
  let returnTypeDropdown;
  let dllDropdown;
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
    const chips = [];
    for (const h of filterHeaders)
      chips.push({ label: `Header: ${h}`, onRemove: () => {
        filterHeaders.delete(h);
        page = 0;
        refreshAll();
      } });
    for (const rt of filterReturnTypes)
      chips.push({ label: `Return: ${rt}`, onRemove: () => {
        filterReturnTypes.delete(rt);
        page = 0;
        refreshAll();
      } });
    for (const dll of filterDlls)
      chips.push({ label: `DLL: ${dll}`, onRemove: () => {
        filterDlls.delete(dll);
        page = 0;
        refreshAll();
      } });
    if (filterMinParams > 0 || filterMaxParams < Infinity) {
      const minS = String(filterMinParams), maxS = filterMaxParams < Infinity ? String(filterMaxParams) : "∞";
      chips.push({ label: `Params: ${minS}–${maxS}`, onRemove: () => {
        filterMinParams = 0;
        filterMaxParams = Infinity;
        page = 0;
        refreshAll();
      } });
    }
    if (filterPointerDepth >= 0) {
      chips.push({ label: `Ptr depth: ${filterPointerDepth}`, onRemove: () => {
        filterPointerDepth = -1;
        page = 0;
        refreshAll();
      } });
    }
    if (filterMinClient) {
      chips.push({ label: `Client: ${filterMinClient}`, onRemove: () => {
        filterMinClient = "";
        page = 0;
        refreshAll();
      } });
    }
    if (filterMinServer) {
      chips.push({ label: `Server: ${filterMinServer}`, onRemove: () => {
        filterMinServer = "";
        page = 0;
        refreshAll();
      } });
    }
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();
  const controls = el("div", { className: "controls" });
  const search = buildSearchInput("Search by name (glob: *File*, Nt?lose*)...", (q, re) => {
    searchQuery = q;
    useRegex = re;
    page = 0;
    renderList();
  }, searchQuery);
  controls.appendChild(search.element);
  const exportSel = el("select", { className: "filter-select" });
  for (const [val, label] of [["all", "All"], ["yes", "Exported"], ["no", "Not Exported"]]) {
    const opt = el("option", { value: val }, label);
    if (val === filterExported)
      opt.selected = true;
    exportSel.appendChild(opt);
  }
  exportSel.addEventListener("change", () => {
    filterExported = exportSel.value;
    page = 0;
    renderList();
  });
  controls.appendChild(exportSel);
  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => {
    page = 0;
    refreshAll();
  });
  controls.appendChild(headerDropdown.element);
  const allReturnTypes = [...new Set(getFunctions().map((f) => f.return_type))].sort();
  returnTypeDropdown = buildFilterDropdown("Filter by Return Type", allReturnTypes, filterReturnTypes, () => {
    page = 0;
    refreshAll();
  });
  controls.appendChild(returnTypeDropdown.element);
  const allDlls = [...new Set(getFunctions().filter((f) => f.metadata?.dll).map((f) => cleanDll(f.metadata.dll)))].sort();
  dllDropdown = buildFilterDropdown("Filter by DLL", allDlls, filterDlls, () => {
    page = 0;
    refreshAll();
  });
  controls.appendChild(dllDropdown.element);
  pg.appendChild(controls);
  const sort = buildSortRow([["name", "Name"], ["params", "Params"]], { sortBy: "name", sortDir: "asc" }, () => {
    page = 0;
    renderList();
  });
  pg.appendChild(sort.element);
  const listContainer = el("div", { className: "list-container" });
  pg.appendChild(listContainer);
  const pagContainer = el("div", {});
  pg.appendChild(pagContainer);
  const countEl = el("div", { className: "result-count" });
  pg.appendChild(countEl);
  container.appendChild(pg);
  function getFiltered() {
    let funcs = getFunctions();
    if (searchQuery)
      funcs = funcs.filter((f) => matchQuery(f.name, searchQuery, useRegex));
    if (filterExported === "yes")
      funcs = funcs.filter((f) => f.is_dllimport);
    else if (filterExported === "no")
      funcs = funcs.filter((f) => !f.is_dllimport);
    if (filterHeaders.size > 0)
      funcs = funcs.filter((f) => f.location.file !== null && filterHeaders.has(f.location.file));
    if (filterReturnTypes.size > 0)
      funcs = funcs.filter((f) => filterReturnTypes.has(f.return_type));
    if (filterDlls.size > 0)
      funcs = funcs.filter((f) => f.metadata?.dll ? filterDlls.has(cleanDll(f.metadata.dll)) : false);
    if (filterMinParams > 0)
      funcs = funcs.filter((f) => f.params.length >= filterMinParams);
    if (filterMaxParams < Infinity)
      funcs = funcs.filter((f) => f.params.length <= filterMaxParams);
    if (filterPointerDepth >= 0)
      funcs = funcs.filter((f) => f.params.some((p) => (p.pointer_depth ?? 0) === filterPointerDepth));
    if (filterMinClient)
      funcs = funcs.filter((f) => f.metadata?.min_client?.replace(/\u00a0/g, " ").includes(filterMinClient));
    if (filterMinServer)
      funcs = funcs.filter((f) => f.metadata?.min_server?.replace(/\u00a0/g, " ").includes(filterMinServer));
    const { sortBy, sortDir } = sort.getState();
    funcs = [...funcs].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name")
        cmp = a.name.localeCompare(b.name);
      else if (sortBy === "params")
        cmp = a.params.length - b.params.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return funcs;
  }
  function renderList() {
    clear(listContainer);
    const filtered = getFiltered();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (page >= totalPages)
      page = Math.max(0, totalPages - 1);
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
      if (fn.is_dllimport)
        info.appendChild(badge("dll", "tag-exported"));
      if (fn.metadata?.dll)
        info.appendChild(badge(cleanDll(fn.metadata.dll).split(".")[0], "tag-dll"));
      info.appendChild(headerLink(fn.location.file ?? "", "functions"));
      header.appendChild(info);
      row.appendChild(header);
      if (fn.params.length > 0) {
        const preview = el("div", { className: "item-preview mono dim" });
        preview.textContent = `(${fn.params.map((p) => `${p.type} ${p.name ?? "_"}`).join(", ")})`;
        row.appendChild(preview);
      }
      listContainer.appendChild(row);
    }
    renderPagination(pagContainer, page, totalPages, (p) => {
      page = p;
      renderList();
      listContainer.scrollIntoView({ behavior: "smooth" });
    });
  }
  renderList();
}
function renderFunctionDetail(container, name) {
  clear(container);
  const fn = findFunc(name);
  if (!fn) {
    renderNotFound(container, "Function", name, "#/functions", "All functions");
    return;
  }
  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/functions", className: "back-link" }, "← All functions"));
  pg.appendChild(el("h2", {}, fn.name));
  pg.appendChild(renderFuncDetailView(fn));
  container.appendChild(pg);
}

// src/views/types.ts
var PAGE_SIZE2 = 50;
var FIELD_COLORS = [
  "#58a6ff",
  "#7ee787",
  "#d2a8ff",
  "#ffa657",
  "#ff7b72",
  "#79c0ff",
  "#e3b341",
  "#f778ba",
  "#a5d6ff",
  "#56d364",
  "#bc8cff",
  "#ffd33d",
  "#ff9a8b",
  "#6cb6ff",
  "#8b949e"
];
function renderFieldTable(fields, parentName, visited = new Set) {
  const table = el("table", { className: "data-table field-table" });
  table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Offset"), el("th", {}, "Bits"), el("th", {}, "Name"), el("th", {}, "Type"), el("th", {}, "Size"), el("th", {}, "Align"), el("th", {}, "Pad"))));
  const tbody = el("tbody", {});
  let prevEnd = 0;
  for (const f of fields) {
    const padding = f.offset - prevEnd;
    if (padding > 0) {
      const padRow = el("tr", { className: "padding-row" });
      padRow.appendChild(el("td", { className: "mono dim" }, `0x${prevEnd.toString(16).toUpperCase()}`));
      padRow.appendChild(el("td", {}));
      padRow.appendChild(el("td", { className: "dim" }, `[padding]`));
      padRow.appendChild(el("td", {}));
      padRow.appendChild(el("td", { className: "mono dim" }, `${padding}`));
      padRow.appendChild(el("td", {}));
      padRow.appendChild(el("td", { className: "mono padding-size" }, `${padding}B`));
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
    const ut = f.underlying_type;
    if (ut && ut !== parentName && !visited.has(ut)) {
      const nested = findType(ut);
      if (nested && nested.fields.length > 0) {
        const expRow = el("tr", { className: "nested-expansion-row" });
        const td = el("td", {});
        td.setAttribute("colspan", "7");
        const toggle = el("div", { className: "nested-toggle" });
        const arrow = el("span", { className: "collapse-arrow" }, "▶");
        toggle.appendChild(arrow);
        toggle.appendChild(typeLink(ut));
        toggle.appendChild(el("span", { className: "dim" }, ` (${nested.size ?? "?"}B, ${nested.fields.length} fields)`));
        const childVisited = new Set(visited);
        childVisited.add(ut);
        const nestedBody = el("div", { className: "nested-body collapsed" });
        nestedBody.appendChild(renderFieldTable(nested.fields, ut, childVisited));
        toggle.addEventListener("click", () => {
          nestedBody.classList.toggle("collapsed");
          arrow.textContent = nestedBody.classList.contains("collapsed") ? "▶" : "▼";
        });
        td.appendChild(toggle);
        td.appendChild(nestedBody);
        expRow.appendChild(td);
        tbody.appendChild(expRow);
      }
    }
  }
  table.appendChild(tbody);
  return table;
}
function renderMemoryLayout(td) {
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
  for (let i = 0;i <= markerCount; i++) {
    const offset = Math.min(i * step, totalBytes);
    scaleBar.appendChild(el("span", { className: "scale-marker", style: `left:${offset / totalBytes * 100}%` }, `0x${offset.toString(16).toUpperCase()}`));
  }
  visual.appendChild(scaleBar);
  let prevEnd = 0;
  td.fields.forEach((f, i) => {
    if (f.offset > prevEnd) {
      const padBar = el("div", {
        className: "layout-bar-item layout-padding",
        style: `left:${prevEnd / totalBytes * 100}%;width:${Math.max((f.offset - prevEnd) / totalBytes * 100, 0.5)}%`
      });
      padBar.title = `Padding: ${f.offset - prevEnd} bytes at 0x${prevEnd.toString(16).toUpperCase()}`;
      visual.appendChild(padBar);
    }
    const color = FIELD_COLORS[i % FIELD_COLORS.length];
    const bar = el("div", {
      className: "layout-bar-item",
      style: `left:${f.offset / totalBytes * 100}%;width:${Math.max(f.size / totalBytes * 100, 0.5)}%;background:${color}`
    });
    bar.title = `${f.name}: ${f.type ?? "?"} (${f.size}B at 0x${f.offset.toString(16).toUpperCase()})`;
    visual.appendChild(bar);
    prevEnd = f.offset + f.size;
  });
  if (prevEnd < totalBytes) {
    const padBar = el("div", {
      className: "layout-bar-item layout-padding",
      style: `left:${prevEnd / totalBytes * 100}%;width:${Math.max((totalBytes - prevEnd) / totalBytes * 100, 0.5)}%`
    });
    padBar.title = `Tail padding: ${totalBytes - prevEnd} bytes`;
    visual.appendChild(padBar);
  }
  gridContainer.appendChild(visual);
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
  for (const f of td.fields) {
    if (f.offset > pEnd)
      totalPadding += f.offset - pEnd;
    pEnd = f.offset + f.size;
  }
  if (pEnd < totalBytes)
    totalPadding += totalBytes - pEnd;
  if (totalPadding > 0) {
    const item = el("div", { className: "legend-item" });
    item.appendChild(el("span", { className: "legend-swatch", style: "background:repeating-linear-gradient(45deg,#30363d,#30363d 2px,transparent 2px,transparent 4px)" }));
    item.appendChild(el("span", { className: "legend-label dim" }, "padding"));
    item.appendChild(el("span", { className: "legend-info dim" }, `${totalPadding}B (${(totalPadding / totalBytes * 100).toFixed(1)}%)`));
    legend.appendChild(item);
  }
  gridContainer.appendChild(legend);
  content.appendChild(gridContainer);
  const stats = el("div", { className: "type-stats" });
  const dataBytes = td.fields.reduce((s, f) => s + f.size, 0);
  stats.appendChild(el("span", {}, `Total: ${totalBytes}B`));
  stats.appendChild(el("span", {}, `Data: ${dataBytes}B`));
  stats.appendChild(el("span", {}, `Padding: ${totalPadding}B (${(totalPadding / totalBytes * 100).toFixed(1)}%)`));
  stats.appendChild(el("span", {}, `Fields: ${td.fields.length}`));
  stats.appendChild(el("span", {}, `Max align: ${Math.max(...td.fields.map((f) => f.alignment), 1)}`));
  content.appendChild(stats);
  return content;
}
function renderTypesList(container, query = {}) {
  clear(container);
  const filterHeaders = new Set;
  if (query.header)
    filterHeaders.add(query.header);
  let filterMinSize = parseInt(query.minSize ?? "") || 0;
  let filterMaxSize = parseInt(query.maxSize ?? "") || Infinity;
  let filterHasFields = "all";
  let page = 0;
  let searchQuery = query.q ?? "";
  let useRegex = false;
  let headerDropdown;
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
    const chips = [];
    for (const h of filterHeaders)
      chips.push({ label: `Header: ${h}`, onRemove: () => {
        filterHeaders.delete(h);
        page = 0;
        refreshAll();
      } });
    if (filterMinSize > 0 || filterMaxSize < Infinity) {
      const minS = filterMinSize > 0 ? `${filterMinSize}B` : "0", maxS = filterMaxSize < Infinity ? `${filterMaxSize}B` : "∞";
      chips.push({ label: `Size: ${minS}–${maxS}`, onRemove: () => {
        filterMinSize = 0;
        filterMaxSize = Infinity;
        sizeMin.value = "";
        sizeMax.value = "";
        page = 0;
        refreshAll();
      } });
    }
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();
  const controls = el("div", { className: "controls" });
  const search = buildSearchInput("Search types (glob: _GUID, *INFO*)...", (q, re) => {
    searchQuery = q;
    useRegex = re;
    page = 0;
    renderList();
  }, searchQuery);
  controls.appendChild(search.element);
  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => {
    page = 0;
    refreshAll();
  });
  controls.appendChild(headerDropdown.element);
  const sizeMin = el("input", { type: "number", placeholder: "Min size", className: "filter-input size-filter" });
  if (filterMinSize > 0)
    sizeMin.value = String(filterMinSize);
  sizeMin.addEventListener("input", () => {
    filterMinSize = parseInt(sizeMin.value) || 0;
    page = 0;
    rebuildChips();
    renderList();
  });
  const sizeMax = el("input", { type: "number", placeholder: "Max size", className: "filter-input size-filter" });
  if (filterMaxSize < Infinity)
    sizeMax.value = String(filterMaxSize);
  sizeMax.addEventListener("input", () => {
    filterMaxSize = parseInt(sizeMax.value) || Infinity;
    page = 0;
    rebuildChips();
    renderList();
  });
  controls.appendChild(sizeMin);
  controls.appendChild(sizeMax);
  const fieldsSel = el("select", { className: "filter-select" });
  for (const [v, l] of [["all", "All types"], ["yes", "With fields"], ["no", "Opaque"]]) {
    const opt = el("option", { value: v }, l);
    if (v === filterHasFields)
      opt.selected = true;
    fieldsSel.appendChild(opt);
  }
  fieldsSel.addEventListener("change", () => {
    filterHasFields = fieldsSel.value;
    page = 0;
    renderList();
  });
  controls.appendChild(fieldsSel);
  pg.appendChild(controls);
  const sort = buildSortRow([["name", "Name"], ["size", "Size"], ["fields", "Fields"]], { sortBy: "name", sortDir: "asc" }, () => {
    page = 0;
    renderList();
  });
  pg.appendChild(sort.element);
  const listContainer = el("div", { className: "list-container" });
  pg.appendChild(listContainer);
  const pagContainer = el("div", {});
  pg.appendChild(pagContainer);
  const countEl = el("div", { className: "result-count" });
  pg.appendChild(countEl);
  container.appendChild(pg);
  function getFiltered() {
    let types = getTypes();
    if (searchQuery)
      types = types.filter((t) => matchQuery(t.name, searchQuery, useRegex) || t.fields.some((f) => matchQuery(f.name, searchQuery, useRegex)));
    if (filterHeaders.size > 0)
      types = types.filter((t) => t.location.file !== null && filterHeaders.has(t.location.file));
    if (filterMinSize > 0)
      types = types.filter((t) => (t.size ?? 0) >= filterMinSize);
    if (filterMaxSize < Infinity)
      types = types.filter((t) => (t.size ?? Infinity) <= filterMaxSize);
    if (filterHasFields === "yes")
      types = types.filter((t) => t.fields.length > 0);
    else if (filterHasFields === "no")
      types = types.filter((t) => t.fields.length === 0);
    const { sortBy, sortDir } = sort.getState();
    types = [...types].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name")
        cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size")
        cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sortBy === "fields")
        cmp = a.fields.length - b.fields.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return types;
  }
  function renderList() {
    clear(listContainer);
    const filtered = getFiltered();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE2);
    if (page >= totalPages)
      page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE2, (page + 1) * PAGE_SIZE2);
    countEl.textContent = `${filtered.length.toLocaleString()} types`;
    for (const td of pageItems) {
      const row = el("div", { className: "list-item type-item" });
      const header = el("div", { className: "item-header" });
      header.appendChild(el("a", { className: "item-name", href: `#/types/${encodeURIComponent(td.name)}` }, td.name));
      const info = el("span", { className: "item-info" });
      if (td.size !== null)
        info.appendChild(badge(`${td.size}B`, "tag-size"));
      else
        info.appendChild(badge("opaque", "tag-opaque"));
      if (td.fields.length > 0)
        info.appendChild(badge(`${td.fields.length}f`, "tag-fields"));
      info.appendChild(headerLink(td.location.file ?? "", "types"));
      header.appendChild(info);
      row.appendChild(header);
      if (td.fields.length > 0 && td.size) {
        const miniBar = el("div", { className: "mini-layout-bar" });
        td.fields.forEach((f, i) => {
          miniBar.appendChild(el("div", {
            className: "mini-bar-segment",
            style: `left:${f.offset / td.size * 100}%;width:${Math.max(f.size / td.size * 100, 0.3)}%;background:${FIELD_COLORS[i % FIELD_COLORS.length]}`,
            title: `${f.name}: ${f.size}B`
          }));
        });
        row.appendChild(miniBar);
      }
      listContainer.appendChild(row);
    }
    renderPagination(pagContainer, page, totalPages, (p) => {
      page = p;
      renderList();
      listContainer.scrollIntoView({ behavior: "smooth" });
    });
  }
  renderList();
}
function renderTypeDetail(container, name) {
  clear(container);
  const td = findType(name);
  if (!td) {
    renderNotFound(container, "Type", name, "#/types", "All types");
    return;
  }
  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/types", className: "back-link" }, "← All types"));
  pg.appendChild(el("h2", { className: "mono" }, td.name));
  const tags = el("div", { className: "tag-row" });
  if (td.size !== null)
    tags.appendChild(badge(`${td.size} bytes`, "tag-size"));
  else
    tags.appendChild(badge("opaque", "tag-opaque"));
  tags.appendChild(badge(`${td.fields.length} fields`, "tag-fields"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(td.location.file ?? "?", "types"));
  locTag.appendChild(document.createTextNode(`:${td.location.line}`));
  tags.appendChild(locTag);
  pg.appendChild(tags);
  if (td.fields.length > 0) {
    const proto = el("pre", { className: "c-prototype" });
    let code = `typedef struct ${td.name} {
`;
    for (const f of td.fields) {
      const offset = `0x${f.offset.toString(16).toUpperCase().padStart(4, "0")}`;
      let typeStr = f.type ?? "?";
      let nameStr = f.name;
      if (f.is_array && f.array_size != null) {
        typeStr = typeStr.replace(/\[\d+\]$/, "");
        nameStr = `${f.name}[${f.array_size}]`;
      }
      code += `  /* ${offset} */  ${typeStr} ${nameStr};  /* size: ${f.size}, align: ${f.alignment} */
`;
    }
    code += `} ${td.name.startsWith("_") ? td.name.slice(1) : td.name}, *P${td.name.startsWith("_") ? td.name.slice(1) : td.name};`;
    if (td.size)
      code += `  /* total size: 0x${td.size.toString(16).toUpperCase()} (${td.size}) */`;
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
  function renderFuncXref(title, fnSet) {
    if (!fnSet || fnSet.size === 0)
      return;
    const list = el("div", { className: "xref-list" });
    const sorted = [...fnSet].sort();
    let showing = 50;
    const render = () => {
      list.innerHTML = "";
      for (const fn of sorted.slice(0, showing))
        list.appendChild(el("span", { className: "xref-chip" }, funcLink(fn)));
      if (showing < sorted.length) {
        const more = el("button", { className: "expand-more-btn" }, `+${sorted.length - showing} more`);
        more.addEventListener("click", () => {
          showing = sorted.length;
          render();
        });
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
    for (const pt of [...parentTypes].sort())
      list.appendChild(el("span", { className: "xref-chip" }, typeLink(pt)));
    pg.appendChild(collapsibleSection(`Types containing this type (${parentTypes.size})`, list));
  }
  container.appendChild(pg);
}

// src/views/type-graph.ts
var cachedGraph = null;
var cachedKey = "";
async function loadGraphData() {
  const ds = getCurrentDataset();
  const arch = getCurrentArch();
  const key = `${ds}/${arch}`;
  if (cachedGraph && cachedKey === key)
    return cachedGraph;
  const resp = await fetch(`data/${ds}/${arch}/graph.json`);
  if (!resp.ok)
    throw new Error("graph.json not found");
  cachedGraph = await resp.json();
  cachedKey = key;
  return cachedGraph;
}
function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    bg: s.getPropertyValue("--bg").trim(),
    bgCard: s.getPropertyValue("--bg-card").trim(),
    border: s.getPropertyValue("--border").trim(),
    text: s.getPropertyValue("--text").trim(),
    textDim: s.getPropertyValue("--text-dim").trim(),
    textMuted: s.getPropertyValue("--text-muted").trim(),
    accent: s.getPropertyValue("--accent").trim(),
    accentDim: s.getPropertyValue("--accent-dim").trim()
  };
}
async function renderTypeGraph(container) {
  clear(container);
  const page = el("div", { className: "graph-view" });
  const tabRow = el("div", { className: "tabs" });
  const listTab = el("a", { href: "#/types", className: "tab-btn" }, "list");
  const graphTab = el("button", { className: "tab-btn active" }, "graph");
  tabRow.appendChild(listTab);
  tabRow.appendChild(graphTab);
  page.appendChild(tabRow);
  const body = el("div", { className: "graph-body" });
  const graphContainer = el("div", { className: "graph-container" });
  graphContainer.id = "cy-container";
  body.appendChild(graphContainer);
  const panel = el("div", { className: "graph-panel" });
  const searchInput = el("input", {
    type: "text",
    placeholder: "search types...",
    className: "graph-search"
  });
  panel.appendChild(searchInput);
  const sortRow = el("div", { className: "graph-sort-row" });
  const sortAlpha = el("button", { className: "sort-btn active", "data-sort": "alpha" }, "a-z");
  const sortDegree = el("button", { className: "sort-btn", "data-sort": "degree" }, "most connected");
  sortRow.appendChild(sortAlpha);
  sortRow.appendChild(sortDegree);
  panel.appendChild(sortRow);
  const searchResults = el("div", { className: "graph-search-results" });
  panel.appendChild(searchResults);
  const unselectBtn = el("button", { className: "graph-unselect-btn hidden" }, "unselect");
  panel.appendChild(unselectBtn);
  const nodeInfo = el("div", { className: "graph-node-info" });
  panel.appendChild(nodeInfo);
  body.appendChild(panel);
  page.appendChild(body);
  container.appendChild(page);
  graphContainer.innerHTML = '<div class="graph-loading">loading graph...</div>';
  let cy;
  let graph;
  try {
    graph = await loadGraphData();
  } catch (e) {
    graphContainer.innerHTML = `<div class="graph-loading">failed to load graph data</div>`;
    return;
  }
  const colors = getThemeColors();
  const elements = [];
  const maxDegree = Math.max(...graph.nodes.map((n) => n.degree), 1);
  for (const node of graph.nodes) {
    const sz = 6 + node.degree / maxDegree * 20;
    elements.push({
      group: "nodes",
      data: {
        id: node.id,
        label: node.id,
        nodeSize: sz,
        degree: node.degree,
        typeSize: node.size,
        fields: node.fields,
        header: node.header
      },
      position: { x: node.x, y: node.y }
    });
  }
  for (const edge of graph.edges) {
    elements.push({
      group: "edges",
      data: { source: edge.source, target: edge.target }
    });
  }
  graphContainer.innerHTML = "";
  cy = cytoscape({
    container: graphContainer,
    elements,
    layout: { name: "preset" },
    style: [
      {
        selector: "node",
        style: {
          width: "data(nodeSize)",
          height: "data(nodeSize)",
          "background-color": colors.textMuted,
          "border-width": 1,
          "border-color": colors.border,
          label: "",
          "font-family": '"Courier New", monospace',
          "font-size": 8,
          color: colors.textDim,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "min-zoomed-font-size": 6
        }
      },
      {
        selector: "node:selected",
        style: {
          "background-color": colors.accent,
          "border-color": colors.accent,
          "border-width": 2,
          label: "data(label)",
          color: colors.accent,
          "font-size": 10,
          "font-weight": "bold"
        }
      },
      {
        selector: "node.highlighted",
        style: {
          "background-color": colors.accent,
          "border-color": colors.accent,
          "border-width": 2,
          label: "data(label)",
          color: colors.accent,
          "font-size": 9
        }
      },
      {
        selector: "node.neighbor",
        style: {
          "background-color": colors.textDim,
          "border-color": colors.accent,
          "border-width": 1,
          label: "data(label)",
          "font-size": 7,
          color: colors.textDim
        }
      },
      {
        selector: "node.dimmed",
        style: {
          opacity: 0.15
        }
      },
      {
        selector: "edge",
        style: {
          width: 0.5,
          "line-color": colors.border,
          "curve-style": "bezier",
          opacity: 0.3
        }
      },
      {
        selector: "edge.highlighted",
        style: {
          "line-color": colors.accent,
          width: 1.5,
          opacity: 0.8
        }
      },
      {
        selector: "edge.dimmed",
        style: {
          opacity: 0.05
        }
      }
    ],
    textureOnViewport: false,
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 5
  });
  cy.on("zoom", () => {
    const zoom = cy.zoom();
    if (zoom > 0.8) {
      cy.style().selector("node").style("label", "data(label)").update();
    } else {
      cy.style().selector("node").style("label", "").update();
    }
  });
  function focusNode(nodeId) {
    const node = cy.getElementById(nodeId);
    if (!node || node.length === 0)
      return;
    cy.elements().removeClass("highlighted neighbor dimmed");
    const neighborhood = node.neighborhood();
    cy.elements().addClass("dimmed");
    node.removeClass("dimmed").addClass("highlighted");
    neighborhood.removeClass("dimmed");
    neighborhood.nodes().addClass("neighbor");
    neighborhood.edges().addClass("highlighted");
    cy.animate({
      center: { eles: node },
      zoom: 1.5
    }, { duration: 400 });
    showNodeInfo(node.data());
  }
  function clearFocus() {
    cy.elements().removeClass("highlighted neighbor dimmed");
    nodeInfo.innerHTML = "";
    unselectBtn.classList.add("hidden");
  }
  cy.on("tap", "node", (evt) => {
    const node = evt.target;
    focusNode(node.id());
  });
  cy.on("tap", (evt) => {
    if (evt.target === cy)
      clearFocus();
  });
  unselectBtn.addEventListener("click", () => {
    clearFocus();
    searchInput.value = "";
    cy.fit(undefined, 30);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector(".sm-overlay.visible")) {
      if (!unselectBtn.classList.contains("hidden")) {
        clearFocus();
        searchInput.value = "";
        cy.fit(undefined, 30);
      }
    }
  });
  cy.on("dbltap", "node", (evt) => {
    window.location.hash = `#/types/${encodeURIComponent(evt.target.id())}`;
  });
  function showNodeInfo(data) {
    nodeInfo.innerHTML = "";
    unselectBtn.classList.remove("hidden");
    const name = el("a", {
      href: `#/types/${encodeURIComponent(data.id)}`,
      className: "gni-name"
    }, data.id);
    nodeInfo.appendChild(name);
    const info = el("div", { className: "gni-details" });
    if (data.typeSize !== null)
      info.appendChild(el("div", {}, `size: ${data.typeSize}B`));
    info.appendChild(el("div", {}, `fields: ${data.fields}`));
    info.appendChild(el("div", {}, `connections: ${data.degree}`));
    if (data.header)
      info.appendChild(el("div", {}, `header: ${data.header}`));
    nodeInfo.appendChild(info);
    const node = cy.getElementById(data.id);
    if (node.length > 0) {
      const neighbors = node.neighborhood().nodes();
      if (neighbors.length > 0) {
        const connTitle = el("div", { className: "gni-conn-title" }, `connected (${neighbors.length})`);
        nodeInfo.appendChild(connTitle);
        const connList = el("div", { className: "gni-conn-list" });
        neighbors.sort((a, b) => a.id().localeCompare(b.id()));
        for (const n of neighbors.toArray().slice(0, 30)) {
          const link = el("a", {
            href: "#",
            className: "gni-conn-item"
          }, n.id());
          link.addEventListener("click", (e) => {
            e.preventDefault();
            focusNode(n.id());
            searchInput.value = n.id();
          });
          connList.appendChild(link);
        }
        if (neighbors.length > 30) {
          connList.appendChild(el("div", { className: "dim" }, `+${neighbors.length - 30} more`));
        }
        nodeInfo.appendChild(connList);
      }
    }
  }
  const nodesByAlpha = graph.nodes.map((n) => n.id).sort();
  const nodesByDegree = [...graph.nodes].sort((a, b) => b.degree - a.degree).map((n) => n.id);
  const degreeMap = new Map(graph.nodes.map((n) => [n.id, n.degree]));
  let sortMode = "alpha";
  function renderSearchList(query) {
    searchResults.innerHTML = "";
    const q = query.trim().toLowerCase();
    const source = sortMode === "alpha" ? nodesByAlpha : nodesByDegree;
    const matches = q.length > 0 ? source.filter((id) => id.toLowerCase().includes(q)) : source;
    for (const id of matches.slice(0, 100)) {
      const item = el("a", { href: "#", className: "graph-search-item" }, id);
      if (sortMode === "degree") {
        item.appendChild(el("span", { className: "graph-search-degree" }, String(degreeMap.get(id) ?? 0)));
      }
      item.addEventListener("click", (e) => {
        e.preventDefault();
        focusNode(id);
        searchInput.value = id;
      });
      searchResults.appendChild(item);
    }
    if (matches.length > 100) {
      searchResults.appendChild(el("div", { className: "dim graph-search-item" }, `+${matches.length - 100} more`));
    }
  }
  sortAlpha.addEventListener("click", () => {
    sortMode = "alpha";
    sortAlpha.classList.add("active");
    sortDegree.classList.remove("active");
    renderSearchList(searchInput.value);
  });
  sortDegree.addEventListener("click", () => {
    sortMode = "degree";
    sortDegree.classList.add("active");
    sortAlpha.classList.remove("active");
    renderSearchList(searchInput.value);
  });
  renderSearchList("");
  searchInput.addEventListener("input", debounce(() => {
    renderSearchList(searchInput.value);
  }, 100));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim().toLowerCase();
      const match = nodesByAlpha.find((id) => id.toLowerCase() === q) ?? nodesByAlpha.find((id) => id.toLowerCase().includes(q));
      if (match) {
        focusNode(match);
        searchInput.value = match;
        searchResults.innerHTML = "";
      }
    }
  });
  cy.fit(undefined, 30);
}

// src/views/constants.ts
var PAGE_SIZE3 = 50;
function renderConstantsList(container, query = {}) {
  clear(container);
  let tab = "macros";
  let searchQuery = query.q ?? "";
  let useRegex = false;
  const filterHeaders = new Set;
  if (query.header)
    filterHeaders.add(query.header);
  let page = 0;
  let headerDropdown;
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
    const chips = [];
    for (const h of filterHeaders)
      chips.push({ label: `Header: ${h}`, onRemove: () => {
        filterHeaders.delete(h);
        page = 0;
        refreshAll();
      } });
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();
  const tabs = el("div", { className: "tabs" });
  const macroTab = el("button", { className: `tab-btn ${tab === "macros" ? "active" : ""}` }, `Macro Constants (${getConstants().length.toLocaleString()})`);
  const enumTab = el("button", { className: `tab-btn ${tab === "enums" ? "active" : ""}` }, `Enums (${getEnums().length.toLocaleString()})`);
  macroTab.addEventListener("click", () => {
    tab = "macros";
    page = 0;
    render();
  });
  enumTab.addEventListener("click", () => {
    tab = "enums";
    page = 0;
    render();
  });
  tabs.appendChild(macroTab);
  tabs.appendChild(enumTab);
  pg.appendChild(tabs);
  const controls = el("div", { className: "controls" });
  const search = buildSearchInput("Search (glob: STATUS_*, *ACCESS*)...", (q, re) => {
    searchQuery = q;
    useRegex = re;
    page = 0;
    render();
  }, searchQuery);
  controls.appendChild(search.element);
  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => {
    page = 0;
    refreshAll();
  });
  controls.appendChild(headerDropdown.element);
  pg.appendChild(controls);
  const macroSort = buildSortRow([["name", "Name"], ["value", "Value"]], { sortBy: "name", sortDir: "asc" }, () => {
    page = 0;
    render();
  });
  const enumSort = buildSortRow([["name", "Name"], ["value", "Variants"]], { sortBy: "name", sortDir: "asc" }, () => {
    page = 0;
    render();
  });
  const sortContainer = el("div", {});
  pg.appendChild(sortContainer);
  const listContainer = el("div", { className: "list-container" });
  pg.appendChild(listContainer);
  const pagContainer = el("div", {});
  pg.appendChild(pagContainer);
  const countEl = el("div", { className: "result-count" });
  pg.appendChild(countEl);
  container.appendChild(pg);
  function getFilteredMacros() {
    let consts = getConstants();
    if (searchQuery)
      consts = consts.filter((c) => matchQuery(c.name, searchQuery, useRegex) || matchQuery(c.hex, searchQuery, useRegex));
    if (filterHeaders.size > 0)
      consts = consts.filter((c) => c.location.file !== null && filterHeaders.has(c.location.file));
    const { sortBy, sortDir } = macroSort.getState();
    consts = [...consts].sort((a, b) => {
      let cmp = sortBy === "name" ? a.name.localeCompare(b.name) : a.value - b.value;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return consts;
  }
  function getFilteredEnums() {
    let enums = getEnums();
    if (searchQuery)
      enums = enums.filter((e) => matchQuery(e.name, searchQuery, useRegex) || e.constants.some((c) => matchQuery(c.name, searchQuery, useRegex)));
    if (filterHeaders.size > 0)
      enums = enums.filter((e) => e.location.file !== null && filterHeaders.has(e.location.file));
    const { sortBy, sortDir } = enumSort.getState();
    enums = [...enums].sort((a, b) => {
      let cmp = sortBy === "name" ? a.name.localeCompare(b.name) : a.constants.length - b.constants.length;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return enums;
  }
  function render() {
    clear(listContainer);
    clear(sortContainer);
    macroTab.className = `tab-btn ${tab === "macros" ? "active" : ""}`;
    enumTab.className = `tab-btn ${tab === "enums" ? "active" : ""}`;
    sortContainer.appendChild(tab === "macros" ? macroSort.element : enumSort.element);
    if (tab === "macros")
      renderMacros();
    else
      renderEnumsList();
  }
  function renderMacros() {
    const filtered = getFilteredMacros();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE3);
    if (page >= totalPages)
      page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE3, (page + 1) * PAGE_SIZE3);
    countEl.textContent = `${filtered.length.toLocaleString()} constants`;
    const table = el("table", { className: "data-table const-table" });
    table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Value"), el("th", {}, "Hex"), el("th", {}, "Expression"), el("th", {}, "Components"), el("th", {}, "Header"))));
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
          if (hasConst(comp))
            compTd.appendChild(constLink(comp));
          else
            compTd.appendChild(el("span", {}, comp));
          compTd.appendChild(document.createTextNode(" "));
        }
        if (c.components.length > 3)
          compTd.appendChild(el("span", { className: "dim" }, `+${c.components.length - 3}`));
      }
      tr.appendChild(compTd);
      const hTd = el("td", {});
      hTd.appendChild(headerLink(c.location.file ?? "(built-in)", "constants"));
      tr.appendChild(hTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listContainer.appendChild(table);
    renderPagination(pagContainer, page, totalPages, (p) => {
      page = p;
      render();
      listContainer.scrollIntoView({ behavior: "smooth" });
    });
  }
  function renderEnumsList() {
    const filtered = getFilteredEnums();
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE3);
    if (page >= totalPages)
      page = Math.max(0, totalPages - 1);
    const pageItems = filtered.slice(page * PAGE_SIZE3, (page + 1) * PAGE_SIZE3);
    countEl.textContent = `${filtered.length.toLocaleString()} enums`;
    for (const e of pageItems) {
      const row = el("div", { className: "list-item enum-item" });
      const header = el("div", { className: "item-header" });
      const arrow = el("span", { className: "collapse-arrow" }, "▶");
      header.appendChild(arrow);
      header.appendChild(el("a", { className: "item-name", href: `#/constants/enum/${encodeURIComponent(e.name)}` }, e.name));
      const info = el("span", { className: "item-info" });
      info.appendChild(badge(`${e.constants.length} variants`, "tag-fields"));
      if (e.constants.length > 0)
        info.appendChild(badge(`${e.constants[0].value}–${e.constants[e.constants.length - 1].value}`, "tag-range"));
      info.appendChild(headerLink(e.location.file ?? "", "constants"));
      header.appendChild(info);
      const body = el("div", { className: "collapsible-body collapsed" });
      const table = el("table", { className: "data-table enum-detail-table" });
      table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Name"), el("th", {}, "Value"), el("th", {}, "Hex"))));
      const etbody = el("tbody", {});
      for (const c of e.constants) {
        etbody.appendChild(el("tr", {}, el("td", { className: "mono bold" }, c.name), el("td", { className: "mono val-col" }, String(c.value)), el("td", { className: "mono hex-col" }, c.hex)));
      }
      table.appendChild(etbody);
      body.appendChild(table);
      header.addEventListener("click", (ev) => {
        if (ev.target.tagName === "A")
          return;
        body.classList.toggle("collapsed");
        arrow.textContent = body.classList.contains("collapsed") ? "▶" : "▼";
      });
      row.appendChild(header);
      row.appendChild(body);
      listContainer.appendChild(row);
    }
    renderPagination(pagContainer, page, totalPages, (p) => {
      page = p;
      render();
      listContainer.scrollIntoView({ behavior: "smooth" });
    });
  }
  render();
}
function renderConstantDetail(container, name) {
  clear(container);
  const c = findConst(name);
  if (!c) {
    renderNotFound(container, "Constant", name, "#/constants", "All constants");
    return;
  }
  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/constants", className: "back-link" }, "← All constants"));
  pg.appendChild(el("h2", { className: "mono" }, c.name));
  const valContent = el("div", {});
  valContent.appendChild(el("div", { className: "const-big-value" }, el("span", { className: "const-decimal" }, String(c.value)), el("span", { className: "const-hex" }, c.hex)));
  const tags = el("div", { className: "tag-row" });
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(c.location.file ?? "(built-in)", "constants"));
  if (c.location.line)
    locTag.appendChild(document.createTextNode(`:${c.location.line}`));
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
  if (c.value >= 0 && c.value <= 4294967295) {
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
      if (hasConst(comp))
        nameTd.appendChild(constLink(comp));
      else
        nameTd.appendChild(document.createTextNode(comp));
      tr.appendChild(nameTd);
      tr.appendChild(el("td", { className: "mono val-col" }, cr ? String(cr.value) : "?"));
      tr.appendChild(el("td", { className: "mono hex-col" }, cr ? cr.hex : "?"));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    pg.appendChild(collapsibleSection("Composition", table));
  }
  const xref2 = getXRef();
  const enumName = xref2.enumForConstant.get(c.name);
  if (enumName)
    pg.appendChild(collapsibleSection("Part of enum", el("div", { className: "xref-list" }, el("span", { className: "xref-chip" }, enumLink(enumName)))));
  const usedBy = xref2.constToConsts.get(c.name);
  if (usedBy && usedBy.size > 0) {
    const list = el("div", { className: "xref-list" });
    for (const cn of [...usedBy].sort())
      list.appendChild(el("span", { className: "xref-chip" }, constLink(cn)));
    pg.appendChild(collapsibleSection(`Used by (${usedBy.size} constants)`, list));
  }
  const funcsUsing = xref2.constToFunctions.get(c.name);
  if (funcsUsing && funcsUsing.size > 0) {
    const list = el("div", { className: "xref-list" });
    const sorted = [...funcsUsing].sort();
    let showing = 30;
    const renderFn = () => {
      list.innerHTML = "";
      for (const fn of sorted.slice(0, showing))
        list.appendChild(el("span", { className: "xref-chip" }, funcLink(fn)));
      if (showing < sorted.length) {
        const more = el("button", { className: "expand-more-btn" }, `+${sorted.length - showing} more`);
        more.addEventListener("click", () => {
          showing = sorted.length;
          renderFn();
        });
        list.appendChild(more);
      }
    };
    renderFn();
    pg.appendChild(collapsibleSection(`Functions referencing this (${funcsUsing.size})`, list));
  }
  container.appendChild(pg);
}
function renderEnumDetail(container, name) {
  clear(container);
  const e = findEnum(name);
  if (!e) {
    renderNotFound(container, "Enum", name, "#/constants", "All constants");
    return;
  }
  const pg = el("div", { className: "detail-view" });
  pg.appendChild(el("a", { href: "#/constants", className: "back-link" }, "← All constants"));
  pg.appendChild(el("h2", { className: "mono" }, e.name));
  const tags = el("div", { className: "tag-row" });
  tags.appendChild(badge(`${e.constants.length} variants`, "tag-fields"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(e.location.file ?? "", "constants"));
  tags.appendChild(locTag);
  if (e.type)
    tags.appendChild(badge(`type: ${e.type}`, "tag-arch"));
  pg.appendChild(tags);
  const proto = el("pre", { className: "c-prototype" });
  let code = `typedef enum ${e.name} {
`;
  e.constants.forEach((c, i) => {
    code += `    ${c.name} = ${c.value}`;
    if (c.hex !== `0x${c.value.toString(16).toUpperCase()}` && c.hex !== `0x${c.value.toString(16)}`)
      code += ` /* ${c.hex} */`;
    if (i < e.constants.length - 1)
      code += ",";
    code += `
`;
  });
  code += `} ${e.name};`;
  proto.textContent = code;
  pg.appendChild(collapsibleSection("C Definition", proto));
  requestAnimationFrame(() => highlightCode(proto));
  const table = el("table", { className: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "#"), el("th", {}, "Name"), el("th", {}, "Value"), el("th", {}, "Hex"))));
  const tbody = el("tbody", {});
  e.constants.forEach((c, i) => {
    tbody.appendChild(el("tr", {}, el("td", { className: "mono dim" }, String(i)), el("td", { className: "mono bold" }, c.name), el("td", { className: "mono val-col" }, String(c.value)), el("td", { className: "mono hex-col" }, c.hex)));
  });
  table.appendChild(tbody);
  pg.appendChild(collapsibleSection("Variants", table));
  container.appendChild(pg);
}

// src/main.ts
var content = () => $("#content");
function setActiveNav(name) {
  for (const a of document.querySelectorAll(".nav-link")) {
    a.classList.toggle("active", a.getAttribute("data-view") === name);
  }
}
async function init() {
  setupTheme();
  try {
    await loadData();
  } catch (e) {
    $("#loading").innerHTML = `<div class="error">Failed to load data: ${e}</div>`;
    return;
  }
  $("#loading").classList.add("hidden");
  $("#app").style.display = "";
  setupSearchModal();
  setupDatasetSwitcher();
  initClippy();
  route("/", () => {
    setActiveNav("home");
    renderHome(content());
  });
  route("/functions", (_, q) => {
    setActiveNav("functions");
    renderFunctionsList(content(), q);
  });
  route("/functions/:name", (p) => {
    setActiveNav("functions");
    renderFunctionDetail(content(), decodeURIComponent(p.name));
  });
  route("/types", (_, q) => {
    setActiveNav("types");
    renderTypesList(content(), q);
  });
  route("/types/graph", () => {
    setActiveNav("types");
    renderTypeGraph(content());
  });
  route("/types/:name", (p) => {
    setActiveNav("types");
    renderTypeDetail(content(), decodeURIComponent(p.name));
  });
  route("/constants", (_, q) => {
    setActiveNav("constants");
    renderConstantsList(content(), q);
  });
  route("/constants/:name", (p) => {
    setActiveNav("constants");
    renderConstantDetail(content(), decodeURIComponent(p.name));
  });
  route("/constants/enum/:name", (p) => {
    setActiveNav("constants");
    renderEnumDetail(content(), decodeURIComponent(p.name));
  });
  startRouter();
}
init();
