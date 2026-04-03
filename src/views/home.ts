import { getFunctions, getTypes, getConstants, getEnums, getXRef, cleanDll } from "../data";
import { el, clear } from "../dom";
import { navigate } from "../router";
import type { Func, TypeDef } from "../types";

function countBy<T>(items: T[], keyFn: (item: T) => string | null): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function topN<T>(items: T[], keyFn: (item: T) => string | null, n: number): [string, number][] {
  return countBy(items, keyFn).slice(0, n);
}

function statCard(label: string, value: string | number, sub?: string): HTMLElement {
  const card = el("div", { className: "stat-card" },
    el("div", { className: "stat-value" }, String(value)),
    el("div", { className: "stat-label" }, label),
  );
  if (sub) card.appendChild(el("div", { className: "stat-sub" }, sub));
  return card;
}

interface BarChartOpts {
  onClick?: (label: string) => void;
  /** If provided, only labels in this set are clickable */
  clickableSet?: Set<string>;
}

function showChartModal(title: string, items: [string, number][], onClick?: (label: string) => void): void {
  const overlay = el("div", { className: "chart-modal-overlay" });
  const modal = el("div", { className: "chart-modal" });

  const header = el("div", { className: "chart-modal-header" });
  header.appendChild(el("h2", {}, title));
  const closeBtn = el("button", { className: "chart-modal-close" }, "x");
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = el("div", { className: "chart-modal-body" });
  const max = Math.max(...items.map(i => i[1]), 1);
  for (const [label, count] of items) {
    const pct = (count / max) * 100;
    const isClickable = onClick && count > 0;
    const labelEl = isClickable
      ? el("a", { className: "chart-label clickable", href: "#" }, label)
      : el("span", { className: "chart-label" }, label);
    if (isClickable) {
      labelEl.addEventListener("click", (e) => { e.preventDefault(); overlay.remove(); onClick!(label); });
    }
    const row = el("div", { className: "chart-row" },
      labelEl,
      el("div", { className: "chart-bar-bg" },
        el("div", { className: "chart-bar", style: `width:${pct}%` })
      ),
      el("span", { className: "chart-count" }, String(count)),
    );
    body.appendChild(row);
  }
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", handler); }
  });
}

function barChart(title: string, items: [string, number][], opts: BarChartOpts & { allItems?: [string, number][] } = {}): HTMLElement {
  const { onClick, clickableSet, allItems } = opts;
  const max = Math.max(...items.map(i => i[1]), 1);
  const chart = el("div", { className: "chart-card" });
  const h3 = el("h3", { className: "chart-title-clickable" }, title);
  h3.addEventListener("click", () => {
    showChartModal(title, allItems ?? items, onClick);
  });
  chart.appendChild(h3);
  const body = el("div", { className: "chart-body" });
  for (const [label, count] of items) {
    const pct = (count / max) * 100;
    const isClickable = onClick && (!clickableSet || clickableSet.has(label)) && count > 0;
    const labelEl = isClickable
      ? el("a", { className: "chart-label clickable", href: "#" }, label)
      : el("span", { className: "chart-label" }, label);
    if (isClickable) {
      labelEl.addEventListener("click", (e) => { e.preventDefault(); onClick!(label); });
    }
    const row = el("div", { className: "chart-row" },
      labelEl,
      el("div", { className: "chart-bar-bg" },
        el("div", { className: "chart-bar", style: `width:${pct}%` })
      ),
      el("span", { className: "chart-count" }, String(count)),
    );
    body.appendChild(row);
  }
  chart.appendChild(body);
  return chart;
}

function sizeHistogram(types: TypeDef[]): HTMLElement {
  const buckets = [
    { label: "1-8 B", min: 1, max: 8 },
    { label: "9-32 B", min: 9, max: 32 },
    { label: "33-64 B", min: 33, max: 64 },
    { label: "65-128 B", min: 65, max: 128 },
    { label: "129-256 B", min: 129, max: 256 },
    { label: "257-512 B", min: 257, max: 512 },
    { label: "513-1024 B", min: 513, max: 1024 },
    { label: "1 KB+", min: 1025, max: 999999 },
  ];
  const counts: [string, number][] = buckets.map(b => [
    b.label,
    types.filter(t => t.size !== null && t.size >= b.min && t.size <= b.max).length
  ]);

  // Build a map from label to bucket for click handler
  const bucketMap = new Map(buckets.map(b => [b.label, b]));

  return barChart("Type size distribution", counts.filter(c => c[1] > 0), {
    onClick: (label) => {
      const bucket = bucketMap.get(label);
      if (bucket) {
        navigate(`/types?minSize=${bucket.min}&maxSize=${bucket.max}`);
      }
    }
  });
}

export function renderHome(container: Element): void {
  clear(container);
  const funcs = getFunctions();
  const types = getTypes();
  const consts = getConstants();
  const enums = getEnums();
  const xref = getXRef();

  const page = el("div", { className: "home-view" });

  // Hero
  page.appendChild(el("div", { className: "hero" },
    el("h1", {}, "bb viewer"),
    el("p", { className: "hero-sub" }, "Windows SDK & PHNT header analysis explorer"),
  ));

  // Stats row
  const statsRow = el("div", { className: "stats-row" });
  const exported = funcs.filter(f => f.is_exported).length;
  const withMeta = funcs.filter(f => f.metadata).length;
  const withFields = types.filter(t => t.fields.length > 0).length;
  const withComponents = consts.filter(c => c.components && c.components.length > 0).length;
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

  const typesWithSize = types.filter(t => t.size !== null);
  const avgSize = typesWithSize.length > 0 ? Math.round(typesWithSize.reduce((s, t) => s + (t.size ?? 0), 0) / typesWithSize.length) : 0;
  statsRow.appendChild(statCard("Avg Type Size", avgSize + " B"));

  page.appendChild(statsRow);

  // Charts — ordered by interest to a Windows reverse engineer / API nerd
  const chartsRow = el("div", { className: "charts-row" });

  // --- Version helpers ---
  function parseWinVersion(mc: string): string {
    const s = mc.replace(/\u00a0/g, " ");
    if (s.includes("Windows 11")) return "Windows 11";
    if (s.includes("Windows 10")) return "Windows 10";
    if (s.includes("Windows 8.1")) return "Windows 8.1";
    if (s.includes("Windows 8")) return "Windows 8";
    if (s.includes("Windows 7")) return "Windows 7";
    if (s.includes("Windows Vista")) return "Windows Vista";
    if (s.includes("Windows XP")) return "Windows XP";
    if (s.includes("Windows 2000")) return "Windows 2000";
    if (s.includes("Windows NT")) return "Windows NT";
    return "other";
  }
  function parseServerVersion(ms: string): string {
    const s = ms.replace(/\u00a0/g, " ");
    if (s.includes("2022")) return "Server 2022";
    if (s.includes("2019")) return "Server 2019";
    if (s.includes("2016")) return "Server 2016";
    if (s.includes("2012 R2")) return "Server 2012 R2";
    if (s.includes("2012")) return "Server 2012";
    if (s.includes("2008 R2")) return "Server 2008 R2";
    if (s.includes("2008")) return "Server 2008";
    if (s.includes("2003")) return "Server 2003";
    if (s.includes("2000")) return "Server 2000";
    return "other";
  }

  // 1. Functions by minimum Windows version — "when was this API introduced?"
  const versionCounts = new Map<string, number>();
  for (const f of funcs) {
    if (f.metadata?.min_client) versionCounts.set(parseWinVersion(f.metadata.min_client), (versionCounts.get(parseWinVersion(f.metadata.min_client)) ?? 0) + 1);
  }
  const versionOrder = ["Windows NT", "Windows 2000", "Windows XP", "Windows Vista", "Windows 7", "Windows 8", "Windows 8.1", "Windows 10", "Windows 11"];
  const versionItems: [string, number][] = versionOrder.filter(v => versionCounts.has(v)).map(v => [v, versionCounts.get(v)!]);
  chartsRow.appendChild(barChart("Functions by minimum Windows version", versionItems, {
    allItems: versionItems, onClick: (ver) => navigate(`/functions?minClient=${encodeURIComponent(ver)}`)
  }));

  // 2. Functions by minimum server version
  const serverCounts = new Map<string, number>();
  for (const f of funcs) {
    if (f.metadata?.min_server) serverCounts.set(parseServerVersion(f.metadata.min_server), (serverCounts.get(parseServerVersion(f.metadata.min_server)) ?? 0) + 1);
  }
  const serverOrder = ["Server 2000", "Server 2003", "Server 2008", "Server 2008 R2", "Server 2012", "Server 2012 R2", "Server 2016", "Server 2019", "Server 2022"];
  const serverItems: [string, number][] = serverOrder.filter(v => serverCounts.has(v)).map(v => [v, serverCounts.get(v)!]);
  if (serverItems.length > 0) {
    chartsRow.appendChild(barChart("Functions by minimum server version", serverItems, {
      allItems: serverItems, onClick: (ver) => navigate(`/functions?minServer=${encodeURIComponent(ver)}`)
    }));
  }

  // 3. Top DLLs — "where do these functions live?"
  const allDlls = countBy(funcs.filter(f => f.metadata?.dll), f => cleanDll(f.metadata!.dll!));
  chartsRow.appendChild(barChart("Top DLLs", allDlls.slice(0, 10), {
    allItems: allDlls, onClick: (dll) => navigate(`/functions?dll=${encodeURIComponent(dll)}`)
  }));

  // 4. Most referenced types — "what types show up everywhere?"
  // Combine param + return refs for total usage count
  const typeRefCounts = new Map<string, number>();
  for (const [name, fns] of xref.typeToFuncParams) typeRefCounts.set(name, (typeRefCounts.get(name) ?? 0) + fns.size);
  for (const [name, fns] of xref.typeToFuncReturns) typeRefCounts.set(name, (typeRefCounts.get(name) ?? 0) + fns.size);
  const allTypeRefs: [string, number][] = [...typeRefCounts.entries()]
    .sort((a, b) => b[1] - a[1]);
  chartsRow.appendChild(barChart("Most referenced types (in functions)", allTypeRefs.slice(0, 10), {
    allItems: allTypeRefs, onClick: (t) => navigate(`/types/${encodeURIComponent(t)}`)
  }));

  // 5. Pointer depth — "how deep does the indirection go?"
  const depthCounts = new Map<number, number>();
  for (const f of funcs) {
    for (const p of f.params) depthCounts.set(p.pointer_depth ?? 0, (depthCounts.get(p.pointer_depth ?? 0) ?? 0) + 1);
  }
  const depthItems: [string, number][] = [...depthCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, n]) => [`depth ${d}`, n]);
  const depthMap = new Map(depthItems.map(([label], i) => [label, [...depthCounts.keys()].sort()[i]]));
  chartsRow.appendChild(barChart("Parameter pointer depth", depthItems, {
    onClick: (label) => {
      const d = depthMap.get(label);
      if (d !== undefined) navigate(`/functions?ptrDepth=${d}`);
    }
  }));

  // 7. ABI breakdown — "registers vs stack"
  let regCount = 0, stackCount = 0, indirectCount = 0;
  for (const f of funcs) {
    for (const p of f.params) {
      if (p.abi.kind === "reg") regCount++;
      else if (p.abi.kind === "stack") stackCount++;
      else if (p.abi.kind === "indirect") indirectCount++;
    }
  }
  chartsRow.appendChild(barChart("Parameter ABI locations", [
    ["Register", regCount], ["Stack", stackCount], ["Indirect", indirectCount],
  ]));

  // 8. Top function headers — "which headers define the most?"
  const allFuncHeaders = countBy(funcs, f => f.location.file);
  chartsRow.appendChild(barChart("Top function headers", allFuncHeaders.slice(0, 10), {
    allItems: allFuncHeaders, onClick: (h) => navigate(`/functions?header=${encodeURIComponent(h)}`)
  }));

  // 9. Top return types
  const allReturnTypes = countBy(funcs, f => f.return_type);
  chartsRow.appendChild(barChart("Top return types", allReturnTypes.slice(0, 10), {
    allItems: allReturnTypes, onClick: (rt) => navigate(`/functions?returnType=${encodeURIComponent(rt)}`)
  }));

  // 10. Param count distribution
  const paramBucketDefs = [
    { label: "0 params", min: 0, max: 0 }, { label: "1 param", min: 1, max: 1 },
    { label: "2 params", min: 2, max: 2 }, { label: "3 params", min: 3, max: 3 },
    { label: "4 params", min: 4, max: 4 }, { label: "5+ params", min: 5, max: 999 },
  ];
  const paramBuckets: [string, number][] = paramBucketDefs.map(b => [
    b.label, funcs.filter(f => f.params.length >= b.min && f.params.length <= b.max).length
  ]);
  const paramBucketMap = new Map(paramBucketDefs.map(b => [b.label, b]));
  chartsRow.appendChild(barChart("Function parameter count distribution", paramBuckets, {
    onClick: (label) => { const b = paramBucketMap.get(label); if (b) navigate(`/functions?minParams=${b.min}&maxParams=${b.max}`); }
  }));

  // 11. Largest types by size
  const allTypesBySize: [string, number][] = types
    .filter(t => t.size !== null).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).map(t => [t.name, t.size!]);
  chartsRow.appendChild(barChart("Largest types (by size in bytes)", allTypesBySize.slice(0, 10), {
    allItems: allTypesBySize, onClick: (t) => navigate(`/types/${encodeURIComponent(t)}`)
  }));

  // 12. Type size distribution
  chartsRow.appendChild(sizeHistogram(types));

  // 13. Types with most fields
  const allTypesByFields: [string, number][] = [...types]
    .sort((a, b) => b.fields.length - a.fields.length).filter(t => t.fields.length > 0).map(t => [t.name, t.fields.length]);
  chartsRow.appendChild(barChart("Types with most fields", allTypesByFields.slice(0, 10), {
    allItems: allTypesByFields, onClick: (t) => navigate(`/types/${encodeURIComponent(t)}`)
  }));

  // 14. Largest enums
  const allEnumsBySize: [string, number][] = enums
    .map(e => [e.name, e.constants.length] as [string, number]).sort((a, b) => b[1] - a[1]);
  chartsRow.appendChild(barChart("Largest enums (by variants)", allEnumsBySize.slice(0, 10), {
    allItems: allEnumsBySize, onClick: (e) => navigate(`/constants/enum/${encodeURIComponent(e)}`)
  }));

  // 15. Most common parameter names
  const allParamNames = countBy(funcs.flatMap(f => f.params.filter(p => p.name).map(p => ({ n: p.name! }))), p => p.n);
  chartsRow.appendChild(barChart("Most common parameter names", allParamNames.slice(0, 10), { allItems: allParamNames }));

  // 16. Top type headers
  const allTypeHeaders = countBy(types.filter(t => t.location.file), t => t.location.file);
  chartsRow.appendChild(barChart("Top type headers", allTypeHeaders.slice(0, 10), {
    allItems: allTypeHeaders, onClick: (h) => navigate(`/types?header=${encodeURIComponent(h)}`)
  }));

  // 17. Top constant headers
  const allConstHeaders = countBy(consts.filter(c => c.location.file), c => c.location.file);
  chartsRow.appendChild(barChart("Top constant headers", allConstHeaders.slice(0, 10), {
    allItems: allConstHeaders, onClick: (h) => navigate(`/constants?header=${encodeURIComponent(h)}`)
  }));

  // 18. Field alignment distribution
  const alignItems = countBy(types.flatMap(t => t.fields.map(f => ({ a: f.alignment + "B" }))), f => f.a);
  chartsRow.appendChild(barChart("Field alignment distribution", alignItems));

  page.appendChild(chartsRow);
  container.appendChild(page);
}
