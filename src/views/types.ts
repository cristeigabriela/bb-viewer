import { getTypes, getTypedefs, findType, findTypedef, findAnon, findEnum, resolveTypeOrTypedef, findSimilarNames, getXRef, getAllHeaders } from "../data";
import { navigate } from "../router";
import { el, clear } from "../dom";
import { matchQuery } from "../utils";
import { typeLink, funcLink, enumLink, renderTypeStr, headerLink, badge, highlightCode } from "../ui/links";
import { buildHash } from "../router";
import { buildFilterDropdown, FilterDropdownHandle } from "../ui/filter-dropdown";
import { buildSearchInput, buildSortRow, renderFilterChips, renderNotFound, collapsibleSection, renderPagination, syncViewUrl, renderBreadcrumb, renderOutlinePanel, withGutter } from "./shared";
import type { TypeDef, Field, Typedef } from "../types";

const PAGE_SIZE = 50;

const FIELD_COLORS = [
  "#58a6ff", "#7ee787", "#d2a8ff", "#ffa657", "#ff7b72",
  "#79c0ff", "#e3b341", "#f778ba", "#a5d6ff", "#56d364",
  "#bc8cff", "#ffd33d", "#ff9a8b", "#6cb6ff", "#8b949e",
];

const recordKind = (td: TypeDef): "struct" | "union" => td.kind ?? "struct";

/** Drop synthetic `<anonymous_N>` fields whose underlying anon record is also
 *  referenced by a NAMED field (e.g. `_LARGE_INTEGER` exposes both a sibling
 *  anon record entry and the `u` variable that uses it — same physical struct
 *  at the same file:line). Without this we render the same inline struct
 *  twice. The named entry is preferred because it carries the variable name. */
function dedupAnonSiblings(td: TypeDef): Field[] {
  const namedLocs = new Set<string>();
  const loc = (a: TypeDef | undefined) => a ? `${a.location.file}:${a.location.line}:${a.location.column}` : null;
  for (const f of td.fields) {
    if (!f.anon_ref) continue;
    if (f.is_anonymous || f.name.startsWith("<anonymous_")) continue;
    const anon = findAnon(f.anon_ref.enclosing_record, f.anon_ref.field_path);
    const key = loc(anon);
    if (key) namedLocs.add(key);
  }
  if (namedLocs.size === 0) return td.fields;
  return td.fields.filter(f => {
    if (!f.anon_ref) return true;
    if (!f.is_anonymous && !f.name.startsWith("<anonymous_")) return true;
    const anon = findAnon(f.anon_ref.enclosing_record, f.anon_ref.field_path);
    const key = loc(anon);
    return !key || !namedLocs.has(key);
  });
}

/* ── Field table (struct/union/anon-aware) ──────────────────────────── */

interface FieldTableOpts {
  parentName: string;
  parentKind: "struct" | "union";
  /** Absolute offset of this scope inside the outermost record (for anon nesting). */
  baseOffset: number;
  /** Set of NAMED records visited so far (cycle guard). */
  visited: Set<string>;
}

function renderFieldTable(fields: Field[], opts: FieldTableOpts): HTMLElement {
  const table = el("table", { className: "data-table field-table" });
  table.appendChild(el("thead", {},
    el("tr", {},
      el("th", {}, "Offset"), el("th", {}, "Bits"), el("th", {}, "Name"),
      el("th", {}, "Type"), el("th", {}, "Size"), el("th", {}, "Align"),
    )
  ));
  const tbody = el("tbody", {});
  appendFieldRows(tbody, fields, opts);
  table.appendChild(tbody);
  return table;
}

function appendFieldRows(tbody: HTMLElement, fields: Field[], opts: FieldTableOpts): void {
  const { parentKind, baseOffset, visited } = opts;
  let prevEnd = 0;

  // De-dupe synthetic anon siblings when a named field references the same
  // underlying record (DUMMYSTRUCTNAME / DUMMYUNIONNAME macro patterns).
  const visibleFields = dedupAnonSiblings({ name: opts.parentName, fields, location: { file: null, line: 0, column: 0 }, size: null } as TypeDef);
  for (const f of visibleFields) {
    // Padding only between siblings in a struct (union members overlap).
    if (parentKind === "struct" && f.offset > prevEnd) {
      const padding = f.offset - prevEnd;
      const padRow = el("tr", { className: "padding-row anon-child" });
      padRow.appendChild(el("td", { className: "mono dim" }, `0x${(baseOffset + prevEnd).toString(16).toUpperCase()}`));
      padRow.appendChild(el("td", {}));
      padRow.appendChild(el("td", { className: "dim" }, "[padding]"));
      padRow.appendChild(el("td", {}));
      padRow.appendChild(el("td", { className: "mono dim" }, `${padding}`));
      padRow.appendChild(el("td", {}));
      tbody.appendChild(padRow);
    }

    const absoluteOffset = baseOffset + f.offset;

    // `anon_ref` (with no `is_anonymous`) covers NAMED anonymous-typed members
    // like `union { ... } u` in _LARGE_INTEGER. We still inline-expand them,
    // but preserve the variable name (e.g. "u") in the toggle row.
    if (f.anon_ref) {
      const anon = findAnon(f.anon_ref.enclosing_record, f.anon_ref.field_path);
      const isUnnamed = f.is_anonymous || f.name.startsWith("<anonymous_");
      if (anon) {
        const anonKind = recordKind(anon);
        const groupId = `anon-${anon.enclosing_record ?? "?"}-${(anon.field_path ?? []).join("-")}-${Math.random().toString(36).slice(2, 7)}`;
        const headerRow = el("tr", { className: "anon-row anon-header", "data-anon-id": groupId });
        const arrow = el("span", { className: "collapse-arrow" }, "▶");
        headerRow.appendChild(el("td", { className: "mono offset-col" },
          `0x${absoluteOffset.toString(16).toUpperCase()}`));
        headerRow.appendChild(el("td", {}));
        const nameTd = el("td", { className: `anon-toggle-cell${isUnnamed ? " dim italic" : " mono bold"}` });
        nameTd.appendChild(arrow);
        nameTd.appendChild(document.createTextNode(isUnnamed ? " anon" : ` ${f.name}`));
        headerRow.appendChild(nameTd);
        const typeTd = el("td", { className: "mono italic dim" });
        typeTd.appendChild(document.createTextNode(`(anonymous ${anonKind}, ${anon.fields.length} fields)`));
        headerRow.appendChild(typeTd);
        headerRow.appendChild(el("td", { className: "mono size-col" }, `${f.size}`));
        headerRow.appendChild(el("td", { className: "mono dim" }, `${f.alignment}`));
        headerRow.style.cursor = "pointer";
        tbody.appendChild(headerRow);

        // Record where child rows start so the toggle can hide them.
        const childRows: HTMLElement[] = [];
        const childrenTbody = tbody;
        const startLength = childrenTbody.childNodes.length;
        appendFieldRows(childrenTbody, anon.fields, {
          parentName: opts.parentName,
          parentKind: anonKind,
          baseOffset: absoluteOffset,
          visited,
        });
        for (let i = startLength; i < childrenTbody.childNodes.length; i++) {
          const child = childrenTbody.childNodes[i] as HTMLElement;
          if (child.classList) child.classList.add("anon-child", `anon-child-${groupId}`);
          childRows.push(child);
        }
        // Default to collapsed.
        for (const r of childRows) (r as HTMLElement).style.display = "none";
        headerRow.addEventListener("click", () => {
          const collapsed = childRows[0]?.style.display === "none";
          for (const r of childRows) (r as HTMLElement).style.display = collapsed ? "" : "none";
          arrow.textContent = collapsed ? "▼" : "▶";
        });
      } else {
        const errRow = el("tr", { className: "anon-row" });
        errRow.appendChild(el("td", { className: "mono offset-col" }, `0x${absoluteOffset.toString(16).toUpperCase()}`));
        errRow.appendChild(el("td", {}));
        errRow.appendChild(el("td", { className: isUnnamed ? "dim italic" : "mono bold" },
          isUnnamed ? "anonymous (unresolved)" : `${f.name} (unresolved anon)`));
        errRow.appendChild(el("td", {}));
        errRow.appendChild(el("td", { className: "mono size-col" }, `${f.size}`));
        errRow.appendChild(el("td", { className: "mono dim" }, `${f.alignment}`));
        tbody.appendChild(errRow);
      }
    } else {
      const tr = el("tr", {});
      tr.appendChild(el("td", { className: "mono offset-col" }, `0x${absoluteOffset.toString(16).toUpperCase()}`));
      tr.appendChild(el("td", { className: "mono dim" }, f.offset_bits % 8 !== 0 ? `+${f.offset_bits % 8}b` : ""));
      tr.appendChild(el("td", { className: "mono bold field-name-col" }, f.name));
      const typeTd = el("td", { className: "mono" });
      typeTd.appendChild(renderTypeStr(f.type, f.underlying_type ?? f.underlying_record));
      tr.appendChild(typeTd);
      tr.appendChild(el("td", { className: "mono size-col" }, `${f.size}`));
      tr.appendChild(el("td", { className: "mono dim" }, `${f.alignment}`));
      tbody.appendChild(tr);

      // Inline nested expansion for named records (existing behavior, scoped to underlying_record).
      const recordName = f.underlying_record;
      if (recordName && recordName !== opts.parentName && !visited.has(recordName)) {
        const nested = findType(recordName);
        if (nested && nested.fields.length > 0) {
          const expRow = el("tr", { className: "nested-expansion-row" });
          const td = el("td", {}); td.setAttribute("colspan", "6");
          const toggle = el("div", { className: "nested-toggle" });
          const arrow = el("span", { className: "collapse-arrow" }, "▶");
          toggle.appendChild(arrow);
          toggle.appendChild(typeLink(recordName));
          toggle.appendChild(el("span", { className: "dim" },
            ` (${nested.size ?? "?"}B, ${nested.fields.length} fields, ${recordKind(nested)})`));
          const childVisited = new Set(visited); childVisited.add(recordName);
          const nestedBody = el("div", { className: "nested-body collapsed" });
          nestedBody.appendChild(renderFieldTable(nested.fields, {
            parentName: recordName, parentKind: recordKind(nested),
            baseOffset: 0, visited: childVisited,
          }));
          toggle.addEventListener("click", () => {
            nestedBody.classList.toggle("collapsed");
            arrow.textContent = nestedBody.classList.contains("collapsed") ? "▶" : "▼";
          });
          td.appendChild(toggle); td.appendChild(nestedBody);
          expRow.appendChild(td); tbody.appendChild(expRow);
        }
      }
    }

    // Advance the running end-offset. Unions overlap → use max, not sum.
    if (parentKind === "union") {
      prevEnd = Math.max(prevEnd, f.offset + f.size);
    } else {
      prevEnd = f.offset + f.size;
    }
  }
}

/* ── Recursive C-definition codegen ─────────────────────────────────── */

/**
 * Field offset comments always show the field's absolute byte offset within the
 * outermost (top-level) record, regardless of how many anonymous union/struct
 * wrappings sit between the field and the outer record. The `baseOffset`
 * accumulator propagates downward through recursion.
 */

function fmtAbsOffset(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;
}

function emitRecord(
  td: TypeDef,
  indent: string,
  asMember: boolean,
  baseOffset: number = 0,
  depth: number = 0,
  /** Member variable name for a NAMED anonymous-typed member (e.g. `u` in
   *  `union { ... } u`). Unnamed members pass undefined. */
  instanceName?: string,
): string[] {
  const lines: string[] = [];
  const keyword = recordKind(td) === "union" ? "union" : "struct";

  if (asMember) {
    lines.push(`${indent}${keyword} {`);
  } else {
    lines.push(`typedef ${keyword} ${td.name} {`);
  }
  const inner = indent + "    ";

  for (const f of dedupAnonSiblings(td)) {
    const absOffset = baseOffset + f.offset;
    // Anonymous-typed members — recurse whether or not the variable has a name.
    // Unnamed members emit `struct {…};`, named members emit `struct {…} u;`.
    if (f.anon_ref) {
      const anon = findAnon(f.anon_ref.enclosing_record, f.anon_ref.field_path);
      const isUnnamed = f.is_anonymous || f.name.startsWith("<anonymous_");
      if (anon) {
        const inst = isUnnamed ? undefined : f.name;
        for (const ln of emitRecord(anon, inner, true, absOffset, depth + 1, inst)) lines.push(ln);
      } else {
        lines.push(`${inner}/* unresolved anonymous ${f.anon_ref.kind}${isUnnamed ? "" : " " + f.name} */`);
      }
    } else {
      let typeStr = f.type ?? "?";
      let nameStr = f.name;
      if (f.is_array && f.array_size != null) {
        typeStr = typeStr.replace(/\[\d+\]$/, "");
        nameStr = `${f.name}[${f.array_size}]`;
      }
      // Inside an anonymous wrapper, show `abs | relative` so you can read both
      // the field's true position in the outer record and its position within
      // its immediate (anonymous) parent.
      const offComment = depth === 0
        ? fmtAbsOffset(absOffset)
        : `${fmtAbsOffset(absOffset)} | ${fmtAbsOffset(f.offset)}`;
      lines.push(`${inner}/* ${offComment} */  ${typeStr} ${nameStr};  /* size: ${f.size}, align: ${f.alignment} */`);
    }
  }

  if (asMember) {
    let suffix = `${indent}}${instanceName ? ` ${instanceName}` : ""};`;
    if (td.size != null) suffix += `  /* size: ${td.size}, align: ${maxAlign(td)} */`;
    lines.push(suffix);
  } else {
    const nameTrim = td.name.startsWith("_") ? td.name.slice(1) : td.name;
    let suffix = `} ${nameTrim}, *P${nameTrim};`;
    if (td.size != null) suffix += `  /* total size: 0x${td.size.toString(16).toUpperCase()} (${td.size}) */`;
    lines.push(`${indent}${suffix}`);
  }

  return lines;
}

function maxAlign(td: TypeDef): number {
  let m = 1;
  for (const f of td.fields) {
    if (f.alignment > m) m = f.alignment;
    if (f.is_anonymous && f.anon_ref) {
      const a = findAnon(f.anon_ref.enclosing_record, f.anon_ref.field_path);
      if (a) {
        const am = maxAlign(a);
        if (am > m) m = am;
      }
    }
  }
  return m;
}

/* ── Memory layout viz ──────────────────────────────────────────────── */

/** Unions don't have a "layout" the way structs do — every member starts at
 *  offset 0 and the record's size is the max of the member sizes. Render them
 *  as a member-overlay diagram: one horizontal row per member, each showing
 *  the bytes it actually occupies, against a faded full-width union bar. */
function renderUnionOverlay(td: TypeDef): HTMLElement {
  const content = el("div", {});
  // Use the same dedup pass as field-table / C codegen so the overlay doesn't
  // show synthetic <anonymous_N> rows alongside their named twin.
  const members = dedupAnonSiblings(td);
  const totalBytes = td.size ?? Math.max(...members.map(f => f.size), 0);
  if (!totalBytes || members.length === 0) {
    content.appendChild(el("p", { className: "dim" }, "No member overlay information available."));
    return content;
  }

  const wrap = el("div", { className: "union-overlay-blend" });

  // Top scale (byte offsets across the union width).
  const scale = el("div", { className: "union-overlay-scale" });
  const markerCount = Math.min(8, totalBytes);
  const step = Math.max(1, Math.ceil(totalBytes / markerCount));
  for (let off = 0; off <= totalBytes; off += step) {
    const o = Math.min(off, totalBytes);
    scale.appendChild(el("span", {
      className: "scale-marker",
      style: `left:${(o / totalBytes) * 100}%`,
    }, `0x${o.toString(16).toUpperCase()}`));
  }
  wrap.appendChild(scale);

  // Single track with one translucent layer per member, all anchored at offset 0.
  // mix-blend-mode: screen makes overlapping regions visually accumulate, so
  // the byte range covered by the most members ends up the brightest.
  const track = el("div", { className: "union-overlay-blend-track" });
  members.forEach((f, i) => {
    const color = FIELD_COLORS[i % FIELD_COLORS.length];
    const isAnon = f.is_anonymous || f.name.startsWith("<anonymous_");
    const layer = el("div", {
      className: `union-overlay-blend-layer${isAnon ? " union-overlay-anon" : ""}`,
      style: `width:${(f.size / totalBytes) * 100}%;background:${color};`,
    });
    layer.title = `${isAnon ? "(anon " + (f.anon_ref?.kind ?? "") + ")" : f.name}: bytes 0x0–0x${(f.size - 1).toString(16).toUpperCase()}`;
    track.appendChild(layer);
  });
  wrap.appendChild(track);

  // Legend.
  const legend = el("div", { className: "union-overlay-blend-legend" });
  members.forEach((f, i) => {
    const color = FIELD_COLORS[i % FIELD_COLORS.length];
    const isAnon = f.is_anonymous || f.name.startsWith("<anonymous_");
    const item = el("div", { className: "union-overlay-legend-item" });
    item.appendChild(el("span", { className: "union-overlay-legend-swatch", style: `background:${color}` }));
    const name = isAnon ? `(anon ${f.anon_ref?.kind ?? ""})` : f.name;
    item.appendChild(el("span", { className: "union-overlay-legend-name mono bold", style: `color:${color}` }, name));
    const meta = `${f.size}B${f.type ? ` · ${f.type}` : ""}`;
    item.appendChild(el("span", { className: "union-overlay-legend-meta dim" }, meta));
    legend.appendChild(item);
  });
  wrap.appendChild(legend);

  content.appendChild(wrap);

  const stats = el("div", { className: "type-stats" });
  const maxMember = Math.max(...members.map(f => f.size), 0);
  stats.appendChild(el("span", {}, "Kind: union"));
  stats.appendChild(el("span", {}, `Size: ${totalBytes}B (max of ${members.length} members)`));
  stats.appendChild(el("span", {}, `Largest member: ${maxMember}B`));
  if (members.length > 0) {
    stats.appendChild(el("span", {}, `Max align: ${Math.max(...members.map(f => f.alignment), 1)}`));
  }
  content.appendChild(stats);
  return content;
}

function renderMemoryLayout(td: TypeDef): HTMLElement {
  if (recordKind(td) === "union") return renderUnionOverlay(td);
  const content = el("div", {});
  if (!td.size || td.fields.length === 0) {
    content.appendChild(el("p", { className: "dim" }, "No layout information available."));
    return content;
  }
  const kind = recordKind(td);
  const totalBytes = td.size;
  const gridContainer = el("div", { className: "layout-grid-container" });
  const visual = el("div", { className: `layout-visual layout-${kind}` });
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
    // For struct, draw padding gaps. For union, every field starts at 0 so no padding.
    if (kind === "struct" && f.offset > prevEnd) {
      const padBar = el("div", {
        className: "layout-bar-item layout-padding",
        style: `left:${(prevEnd / totalBytes) * 100}%;width:${Math.max(((f.offset - prevEnd) / totalBytes) * 100, 0.5)}%`,
      });
      padBar.title = `Padding: ${f.offset - prevEnd} bytes at 0x${prevEnd.toString(16).toUpperCase()}`;
      visual.appendChild(padBar);
    }
    const color = FIELD_COLORS[i % FIELD_COLORS.length];
    const isAnon = f.is_anonymous;
    const bar = el("div", {
      className: `layout-bar-item${isAnon ? " layout-anon" : ""}`,
      style: `left:${(f.offset / totalBytes) * 100}%;width:${Math.max((f.size / totalBytes) * 100, 0.5)}%;background:${color}`,
    });
    bar.title = `${f.name}: ${f.type ?? "(anonymous)"} (${f.size}B at 0x${f.offset.toString(16).toUpperCase()})`;
    visual.appendChild(bar);
    prevEnd = kind === "union" ? Math.max(prevEnd, f.offset + f.size) : f.offset + f.size;
  });
  if (kind === "struct" && prevEnd < totalBytes) {
    const padBar = el("div", {
      className: "layout-bar-item layout-padding",
      style: `left:${(prevEnd / totalBytes) * 100}%;width:${Math.max(((totalBytes - prevEnd) / totalBytes) * 100, 0.5)}%`,
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
    item.appendChild(el("span", { className: "legend-info dim" },
      `${f.size}B @ 0x${f.offset.toString(16).toUpperCase()}`));
    legend.appendChild(item);
  });
  let totalPadding = 0;
  if (kind === "struct") {
    let pEnd = 0;
    for (const f of td.fields) {
      if (f.offset > pEnd) totalPadding += f.offset - pEnd;
      pEnd = f.offset + f.size;
    }
    if (pEnd < totalBytes) totalPadding += totalBytes - pEnd;
  }
  if (totalPadding > 0) {
    const item = el("div", { className: "legend-item" });
    item.appendChild(el("span", {
      className: "legend-swatch",
      style: "background:repeating-linear-gradient(45deg,#30363d,#30363d 2px,transparent 2px,transparent 4px)",
    }));
    item.appendChild(el("span", { className: "legend-label dim" }, "padding"));
    item.appendChild(el("span", { className: "legend-info dim" },
      `${totalPadding}B (${((totalPadding / totalBytes) * 100).toFixed(1)}%)`));
    legend.appendChild(item);
  }
  gridContainer.appendChild(legend);
  content.appendChild(gridContainer);

  const stats = el("div", { className: "type-stats" });
  const dataBytes = td.fields.reduce((s, f) => s + f.size, 0);
  stats.appendChild(el("span", {}, `Kind: ${kind}`));
  stats.appendChild(el("span", {}, `Total: ${totalBytes}B`));
  if (kind === "struct") {
    stats.appendChild(el("span", {}, `Data: ${dataBytes}B`));
    stats.appendChild(el("span", {}, `Padding: ${totalPadding}B (${((totalPadding / totalBytes) * 100).toFixed(1)}%)`));
  } else {
    const maxMember = Math.max(...td.fields.map(f => f.size), 0);
    stats.appendChild(el("span", {}, `Largest member: ${maxMember}B`));
  }
  stats.appendChild(el("span", {}, `Fields: ${td.fields.length}`));
  if (td.fields.length > 0) {
    stats.appendChild(el("span", {}, `Max align: ${Math.max(...td.fields.map(f => f.alignment), 1)}`));
  }
  content.appendChild(stats);
  return content;
}

/* ── List view ──────────────────────────────────────────────────────── */

type KindFilter = "all" | "struct" | "union";

export function renderTypesList(container: Element, query: Record<string, string> = {}): void {
  clear(container);

  const filterHeaders = new Set<string>(query.header ? query.header.split(",") : []);
  let filterMinSize = parseInt(query.minSize ?? "") || 0;
  let filterMaxSize = parseInt(query.maxSize ?? "") || Infinity;
  let filterHasFields: "all" | "yes" | "no" = (query.hasFields as any) ?? "all";
  let filterKind: KindFilter = (query.kind as KindFilter) ?? "all";
  let page = parseInt(query.page ?? "") || 0;
  let searchQuery = query.q ?? "";
  let useRegex = query.regex === "1";
  let headerDropdown: FilterDropdownHandle;

  function syncUrl() {
    const s = sort?.getState();
    syncViewUrl("/types", {
      q: searchQuery,
      regex: useRegex ? "1" : "",
      header: [...filterHeaders].join(","),
      minSize: filterMinSize > 0 ? String(filterMinSize) : "",
      maxSize: filterMaxSize < Infinity ? String(filterMaxSize) : "",
      hasFields: filterHasFields !== "all" ? filterHasFields : "",
      kind: filterKind !== "all" ? filterKind : "",
      sort: s && s.sortBy !== "name" ? s.sortBy : "",
      sortDir: s && s.sortDir !== "asc" ? s.sortDir : "",
      page: page > 0 ? String(page) : "",
    });
  }

  const pg = el("div", { className: "list-view" });

  const tabRow = el("div", { className: "tabs" });
  tabRow.appendChild(el("button", { className: "tab-btn active" }, "list"));
  tabRow.appendChild(el("a", { href: buildHash("/types/graph"), className: "tab-btn" }, "graph"));
  pg.appendChild(tabRow);

  pg.appendChild(el("div", { className: "title-row" }, el("h2", {}, "Types")));

  const activeFiltersEl = el("div", { className: "active-filters" });
  pg.appendChild(activeFiltersEl);

  function refreshAll() {
    headerDropdown?.refresh();
    rebuildChips();
    renderList();
    syncUrl();
  }

  function rebuildChips() {
    const chips: { label: string; onRemove: () => void }[] = [];
    for (const h of filterHeaders) chips.push({ label: `Header: ${h}`, onRemove: () => { filterHeaders.delete(h); page = 0; refreshAll(); } });
    if (filterMinSize > 0 || filterMaxSize < Infinity) {
      const minS = filterMinSize > 0 ? `${filterMinSize}B` : "0";
      const maxS = filterMaxSize < Infinity ? `${filterMaxSize}B` : "∞";
      chips.push({ label: `Size: ${minS}–${maxS}`, onRemove: () => { filterMinSize = 0; filterMaxSize = Infinity; sizeMin.value = ""; sizeMax.value = ""; page = 0; refreshAll(); } });
    }
    if (filterKind !== "all") chips.push({ label: `Kind: ${filterKind}`, onRemove: () => { filterKind = "all"; kindSel.value = "all"; page = 0; refreshAll(); } });
    renderFilterChips(activeFiltersEl, chips);
  }
  rebuildChips();

  const controls = el("div", { className: "controls" });
  const search = buildSearchInput("Search types (glob: _GUID, *INFO*)...", (q, re) => {
    searchQuery = q; useRegex = re; page = 0; renderList(); syncUrl();
  }, searchQuery, useRegex);
  controls.appendChild(search.element);

  headerDropdown = buildFilterDropdown("Filter by Header", getAllHeaders(), filterHeaders, () => { page = 0; refreshAll(); });
  controls.appendChild(headerDropdown.element);

  const sizeMin = el("input", { type: "number", placeholder: "Min size", className: "filter-input size-filter" }) as HTMLInputElement;
  if (filterMinSize > 0) sizeMin.value = String(filterMinSize);
  sizeMin.addEventListener("input", () => { filterMinSize = parseInt(sizeMin.value) || 0; page = 0; rebuildChips(); renderList(); syncUrl(); });

  const sizeMax = el("input", { type: "number", placeholder: "Max size", className: "filter-input size-filter" }) as HTMLInputElement;
  if (filterMaxSize < Infinity) sizeMax.value = String(filterMaxSize);
  sizeMax.addEventListener("input", () => { filterMaxSize = parseInt(sizeMax.value) || Infinity; page = 0; rebuildChips(); renderList(); syncUrl(); });

  controls.appendChild(sizeMin); controls.appendChild(sizeMax);

  const fieldsSel = el("select", { className: "filter-select" }) as HTMLSelectElement;
  for (const [v, l] of [["all", "All types"], ["yes", "With fields"], ["no", "Opaque"]] as const) {
    const opt = el("option", { value: v }, l) as HTMLOptionElement;
    if (v === filterHasFields) opt.selected = true;
    fieldsSel.appendChild(opt);
  }
  fieldsSel.addEventListener("change", () => { filterHasFields = fieldsSel.value as any; page = 0; renderList(); syncUrl(); });
  controls.appendChild(fieldsSel);

  const kindSel = el("select", { className: "filter-select" }) as HTMLSelectElement;
  for (const [v, l] of [["all", "Struct + Union"], ["struct", "Struct only"], ["union", "Union only"]] as const) {
    const opt = el("option", { value: v }, l) as HTMLOptionElement;
    if (v === filterKind) opt.selected = true;
    kindSel.appendChild(opt);
  }
  kindSel.addEventListener("change", () => {
    filterKind = kindSel.value as KindFilter; page = 0; rebuildChips(); renderList(); syncUrl();
  });
  controls.appendChild(kindSel);

  pg.appendChild(controls);

  const initSort = query.sort ?? "name";
  const initSortDir = (query.sortDir ?? "asc") as "asc" | "desc";
  const sort = buildSortRow([["name", "Name"], ["size", "Size"], ["fields", "Fields"]], { sortBy: initSort, sortDir: initSortDir }, () => { page = 0; renderList(); syncUrl(); });
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
    if (searchQuery) {
      types = types.filter(t =>
        matchQuery(t.name, searchQuery, useRegex) ||
        (t.aliases?.some(a => matchQuery(a, searchQuery, useRegex)) ?? false) ||
        t.fields.some(f => matchQuery(f.name, searchQuery, useRegex))
      );
    }
    if (filterHeaders.size > 0) types = types.filter(t => t.location.file !== null && filterHeaders.has(t.location.file));
    if (filterMinSize > 0) types = types.filter(t => (t.size ?? 0) >= filterMinSize);
    if (filterMaxSize < Infinity) types = types.filter(t => (t.size ?? Infinity) <= filterMaxSize);
    if (filterHasFields === "yes") types = types.filter(t => t.fields.length > 0);
    else if (filterHasFields === "no") types = types.filter(t => t.fields.length === 0);
    if (filterKind === "struct") types = types.filter(t => recordKind(t) === "struct");
    else if (filterKind === "union") types = types.filter(t => recordKind(t) === "union");
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
      header.appendChild(el("a", { className: "item-name", href: buildHash(`/types/${encodeURIComponent(td.name)}`) }, td.name));
      const info = el("span", { className: "item-info" });
      info.appendChild(badge(recordKind(td), recordKind(td) === "union" ? "tag-union" : "tag-struct"));
      if (td.size !== null) info.appendChild(badge(`${td.size}B`, "tag-size"));
      else info.appendChild(badge("opaque", "tag-opaque"));
      if (td.fields.length > 0) info.appendChild(badge(`${td.fields.length}f`, "tag-fields"));
      info.appendChild(headerLink(td.location.file ?? "", "types"));
      header.appendChild(info);
      row.appendChild(header);
      if (td.fields.length > 0 && td.size) {
        const miniBar = el("div", { className: "mini-layout-bar" });
        td.fields.forEach((f, i) => {
          miniBar.appendChild(el("div", {
            className: "mini-bar-segment",
            style: `left:${(f.offset / td.size!) * 100}%;width:${Math.max((f.size / td.size!) * 100, 0.3)}%;background:${FIELD_COLORS[i % FIELD_COLORS.length]}`,
            title: `${f.name}: ${f.size}B`,
          }));
        });
        row.appendChild(miniBar);
      }
      listContainer.appendChild(row);
    }
    renderPagination(pagContainer, page, totalPages, (p) => { page = p; renderList(); syncUrl(); listContainer.scrollIntoView({ behavior: "smooth" }); });
  }

  renderList();
}

/* ── Detail dispatcher: handles both records and typedefs ───────────── */

export function renderTypeDetail(container: Element, name: string): void {
  clear(container);
  if (name.includes("*") || name.includes("?")) { navigate(`/types?q=${encodeURIComponent(name)}`); return; }
  const resolved = resolveTypeOrTypedef(name);
  if (!resolved) {
    renderNotFound(container, "Type", name, buildHash("/types"), "All types", findSimilarNames(name));
    return;
  }
  if (resolved.kind === "type") {
    if (resolved.canonical !== name) {
      navigate("/types/" + encodeURIComponent(resolved.canonical));
      return;
    }
    renderRecordDetail(container, resolved.type);
  } else {
    renderTypedefDetail(container, resolved.typedef);
  }
}

/* ── Record detail (struct / union) ─────────────────────────────────── */

function renderRecordDetail(container: Element, td: TypeDef): void {
  const kind = recordKind(td);
  const pg = el("div", { className: "detail-view" });
  pg.appendChild(renderBreadcrumb([
    { label: "types", href: buildHash("/types") },
    { label: `${kind}: ${td.name}` },
  ]));
  pg.appendChild(el("h2", { className: "mono" }, td.name));

  const tags = el("div", { className: "tag-row" });
  tags.appendChild(badge(kind, kind === "union" ? "tag-union" : "tag-struct"));
  if (td.size !== null) tags.appendChild(badge(`${td.size} bytes`, "tag-size"));
  else tags.appendChild(badge("opaque", "tag-opaque"));
  tags.appendChild(badge(`${td.fields.length} fields`, "tag-fields"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(td.location.file ?? "?", "types"));
  locTag.appendChild(document.createTextNode(`:${td.location.line}`));
  tags.appendChild(locTag);
  pg.appendChild(tags);

  if (td.aliases && td.aliases.length > 0) {
    const aliasRow = el("div", { className: "tag-row alias-row" });
    aliasRow.appendChild(el("span", { className: "dim" }, "aka:"));
    for (const a of td.aliases) {
      aliasRow.appendChild(typeLink(a));
    }
    pg.appendChild(aliasRow);
  }

  if (td.fields.length > 0) {
    const proto = el("pre", { className: "c-prototype" });
    proto.textContent = emitRecord(td, "", false).join("\n");
    pg.appendChild(collapsibleSection("C Definition", withGutter(proto)));
    requestAnimationFrame(() => highlightCode(proto));
  }

  pg.appendChild(collapsibleSection(
    kind === "union" ? "Member Overlay" : "Memory Layout",
    renderMemoryLayout(td)));

  if (td.fields.length > 0) {
    pg.appendChild(collapsibleSection("Fields", renderFieldTable(td.fields, {
      parentName: td.name, parentKind: kind, baseOffset: 0, visited: new Set([td.name]),
    })));
  } else {
    pg.appendChild(el("p", { className: "dim" }, "This type has no visible fields (opaque/forward declaration)."));
  }

  appendXRefs(pg, td.name);
  // Also surface xrefs registered under any alias name.
  if (td.aliases) {
    for (const a of td.aliases) appendXRefs(pg, a, ` via ${a}`);
  }

  container.appendChild(pg);
  renderOutlinePanel(pg);
}

/* ── Typedef detail ─────────────────────────────────────────────────── */

function renderTypedefDetail(container: Element, t: Typedef): void {
  const pg = el("div", { className: "detail-view" });
  pg.appendChild(renderBreadcrumb([
    { label: "types", href: buildHash("/types") },
    { label: `typedef: ${t.name}` },
  ]));
  pg.appendChild(el("h2", { className: "mono" }, t.name));

  const tags = el("div", { className: "tag-row" });
  tags.appendChild(badge("typedef", "tag-typedef"));
  tags.appendChild(badge(`kind: ${t.kind}`, `tag-typedef-${t.kind}`));
  if (t.is_pointer) tags.appendChild(badge(`pointer depth ${t.pointer_depth}`, "tag-ptr"));
  if (t.is_array) tags.appendChild(badge("array", "tag-arr"));
  if (t.is_function_pointer) tags.appendChild(badge("function pointer", "tag-fnptr"));
  if (t.is_const) tags.appendChild(badge("const", "tag-const"));
  const locTag = el("span", { className: "badge tag-loc" });
  locTag.appendChild(headerLink(t.location.file ?? "?", "types"));
  if (t.location.line) locTag.appendChild(document.createTextNode(`:${t.location.line}`));
  tags.appendChild(locTag);
  pg.appendChild(tags);

  // Chain visualization: name → step1 → step2 → ... → canonical
  const chainContainer = el("div", { className: "typedef-chain" });
  chainContainer.appendChild(el("span", { className: "mono bold" }, t.name));
  chainContainer.appendChild(document.createTextNode(" → "));
  const chainSteps: string[] = t.chain.length > 0 ? t.chain : [t.canonical];
  chainSteps.forEach((step, i) => {
    if (i > 0) chainContainer.appendChild(document.createTextNode(" → "));
    chainContainer.appendChild(renderTypeStr(step));
  });
  pg.appendChild(collapsibleSection("Typedef chain", chainContainer));

  // C definition line
  const cdef = el("pre", { className: "c-prototype" });
  cdef.textContent = `typedef ${t.canonical} ${t.name};`;
  pg.appendChild(collapsibleSection("C Definition", withGutter(cdef)));
  requestAnimationFrame(() => highlightCode(cdef));

  // Underlying record/enum link (if any). The typedef.kind discriminator tells
  // us which entity table to look in (records live in /types, enums in /constants/enum).
  if (t.underlying_record) {
    const underlyingRecord = findType(t.underlying_record);
    const underlyingEnum = !underlyingRecord ? findEnum(t.underlying_record) : undefined;
    if (underlyingRecord) {
      const linkPara = el("div", { className: "typedef-underlying" });
      linkPara.appendChild(el("strong", {}, "Underlying record: "));
      linkPara.appendChild(typeLink(t.underlying_record));
      linkPara.appendChild(el("span", { className: "dim" },
        ` (${recordKind(underlyingRecord)}, ${underlyingRecord.size ?? "?"}B, ${underlyingRecord.fields.length} fields)`));
      pg.appendChild(linkPara);

      if (underlyingRecord.fields.length > 0) {
        pg.appendChild(collapsibleSection(`Underlying — ${underlyingRecord.name}`,
          renderFieldTable(underlyingRecord.fields, {
            parentName: underlyingRecord.name,
            parentKind: recordKind(underlyingRecord),
            baseOffset: 0,
            visited: new Set([underlyingRecord.name]),
          })));
      }
    } else if (underlyingEnum) {
      const linkPara = el("div", { className: "typedef-underlying" });
      linkPara.appendChild(el("strong", {}, "Underlying enum: "));
      linkPara.appendChild(enumLink(underlyingEnum.name));
      linkPara.appendChild(el("span", { className: "dim" },
        ` (${underlyingEnum.constants.length} variants${underlyingEnum.type ? `, ${underlyingEnum.type}` : ""})`));
      pg.appendChild(linkPara);
    } else {
      pg.appendChild(el("div", { className: "typedef-underlying" },
        el("strong", {}, "Underlying record: "),
        document.createTextNode(`${t.underlying_record} (not in current dataset)`)));
    }
  } else if (t.underlying_type) {
    const linkPara = el("div", { className: "typedef-underlying" });
    linkPara.appendChild(el("strong", {}, "Terminal primitive: "));
    linkPara.appendChild(el("code", { className: "mono" }, t.underlying_type));
    pg.appendChild(linkPara);
  }

  appendXRefs(pg, t.name);

  container.appendChild(pg);
  renderOutlinePanel(pg);
}

/* ── Shared xref renderer ───────────────────────────────────────────── */

function appendXRefs(pg: HTMLElement, name: string, titleSuffix = ""): void {
  const xrefData = getXRef();

  const renderFuncXref = (title: string, fnSet: Set<string> | undefined) => {
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
    pg.appendChild(collapsibleSection(`${title}${titleSuffix} (${fnSet.size})`, list));
  };

  renderFuncXref("Functions that take this type", xrefData.nameToFuncParams.get(name));
  renderFuncXref("Functions that return this type", xrefData.nameToFuncReturns.get(name));

  const parentTypes = xrefData.nameToParentTypes.get(name);
  if (parentTypes && parentTypes.size > 0) {
    const list = el("div", { className: "xref-list" });
    for (const pt of [...parentTypes].sort()) list.appendChild(el("span", { className: "xref-chip" }, typeLink(pt)));
    pg.appendChild(collapsibleSection(`Types containing this type${titleSuffix} (${parentTypes.size})`, list));
  }
}
