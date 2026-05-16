import { findFunc, resolveTypeOrTypedef, findConst, findEnum, searchAll, findSimilarNames, loadData, getCurrentDataset } from "../data";
import { navigate, buildHash } from "../router";
import { el, clear } from "../dom";
import { badge } from "../ui/links";
import { renderNotFound } from "./shared";

type Match = { kind: string; name: string };

function collectExactMatches(name: string): Match[] {
  const matches: Match[] = [];

  const fn = findFunc(name);
  if (fn) matches.push({ kind: "function", name: fn.name });

  const typeResult = resolveTypeOrTypedef(name);
  if (typeResult) {
    const canonicalName = typeResult.kind === "type" ? typeResult.canonical : typeResult.typedef.name;
    matches.push({ kind: typeResult.kind === "typedef" ? "typedef" : "type", name: canonicalName });
  }

  const c = findConst(name);
  if (c) matches.push({ kind: "constant", name: c.name });

  const e = findEnum(name);
  if (e) matches.push({ kind: "enum", name: e.name });

  return matches;
}

function entityHref(m: Match): string {
  switch (m.kind) {
    case "function": return `/functions/${encodeURIComponent(m.name)}`;
    case "type":
    case "typedef": return `/types/${encodeURIComponent(m.name)}`;
    case "enum": return `/constants/enum/${encodeURIComponent(m.name)}`;
    default: return `/constants/${encodeURIComponent(m.name)}`;
  }
}

/**
 * Universal lookup. Per the user-facing contract, `/q/:name` cares about
 * dataset but not mode: it always tries user mode first, falls back to kernel
 * if no exact match is found, and lets `navigate()` pick up whichever mode
 * yielded the hit. Arch is pinned to amd64 (most universally available).
 */
export async function renderLookup(container: Element, name: string): Promise<void> {
  clear(container);

  // Glob → redirect to full-text search.
  if (name.includes("*") || name.includes("?")) {
    navigate(`/functions?q=${encodeURIComponent(name)}`);
    return;
  }

  // Loading placeholder (matters when both modes need network round-trips).
  const loader = el("div", { className: "detail-view" });
  loader.appendChild(el("h2", {}, `Resolving "${name}"…`));
  loader.appendChild(el("p", { className: "dim" }, "Trying user mode, then kernel mode."));
  container.appendChild(loader);

  const ds = getCurrentDataset();
  const arch = "amd64";

  await loadData(ds, arch, "user");
  let matches = collectExactMatches(name);
  if (matches.length === 0) {
    await loadData(ds, arch, "kernel");
    matches = collectExactMatches(name);
  }

  clear(container);

  // One exact match → redirect (navigate uses the currently-loaded mode).
  if (matches.length === 1) {
    navigate(entityHref(matches[0]));
    return;
  }

  // Multiple exact matches → disambiguation.
  if (matches.length > 1) {
    const pg = el("div", { className: "detail-view" });
    pg.appendChild(el("h2", {}, `Multiple matches for "${name}"`));
    pg.appendChild(el("p", { className: "dim" }, "This identifier exists in multiple categories:"));
    const list = el("div", { className: "suggestions" });
    for (const m of matches) {
      const chip = el("span", { className: "suggestion-chip" },
        el("a", { href: buildHash(entityHref(m)), className: "xref" }, m.name),
      );
      chip.appendChild(el("span", { className: "dim" }, ` (${m.kind})`));
      list.appendChild(chip);
    }
    pg.appendChild(list);
    container.appendChild(pg);
    return;
  }

  // No exact match in either mode → partial-match search on whatever's loaded.
  const results = searchAll(name, 50);
  if (results.length > 0) {
    const pg = el("div", { className: "detail-view" });
    pg.appendChild(el("h2", {}, `Search results for "${name}"`));
    const list = el("div", { className: "lookup-results" });
    for (const r of results) {
      const row = el("div", { className: "lookup-result-item" });
      row.appendChild(badge(r.kind, `search-badge-${r.kind === "constant" ? "const" : r.kind}`));
      row.appendChild(el("a", { href: buildHash(entityHref(r)), className: "xref" }, r.name));
      list.appendChild(row);
    }
    pg.appendChild(list);
    container.appendChild(pg);
    return;
  }

  renderNotFound(container, "Identifier", name, buildHash("/"), "Home", findSimilarNames(name));
}
