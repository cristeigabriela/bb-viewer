import { findFunc, flexFindType, findConst, findEnum, searchAll, findSimilarNames } from "../data";
import { navigate, buildHash } from "../router";
import { el, clear } from "../dom";
import { badge } from "../ui/links";
import { renderNotFound } from "./shared";

export function renderLookup(container: Element, name: string): void {
  clear(container);

  // If the name has glob wildcards, redirect to a search on all categories
  if (name.includes("*") || name.includes("?")) {
    navigate(`/functions?q=${encodeURIComponent(name)}`);
    return;
  }

  // Try exact matches across all categories
  const matches: Array<{ kind: string; name: string }> = [];

  const fn = findFunc(name);
  if (fn) matches.push({ kind: "function", name: fn.name });

  const typeResult = flexFindType(name);
  if (typeResult) matches.push({ kind: "type", name: typeResult.canonical });

  const c = findConst(name);
  if (c) matches.push({ kind: "constant", name: c.name });

  const e = findEnum(name);
  if (e) matches.push({ kind: "enum", name: e.name });

  // One exact match → redirect
  if (matches.length === 1) {
    const m = matches[0];
    switch (m.kind) {
      case "function": navigate(`/functions/${encodeURIComponent(m.name)}`); return;
      case "type": navigate(`/types/${encodeURIComponent(m.name)}`); return;
      case "constant": navigate(`/constants/${encodeURIComponent(m.name)}`); return;
      case "enum": navigate(`/constants/enum/${encodeURIComponent(m.name)}`); return;
    }
  }

  // Multiple exact matches → disambiguation page
  if (matches.length > 1) {
    const pg = el("div", { className: "detail-view" });
    pg.appendChild(el("h2", {}, `Multiple matches for "${name}"`));
    pg.appendChild(el("p", { className: "dim" }, "This identifier exists in multiple categories:"));
    const list = el("div", { className: "suggestions" });
    for (const m of matches) {
      const href = m.kind === "function" ? buildHash(`/functions/${encodeURIComponent(m.name)}`)
        : m.kind === "type" ? buildHash(`/types/${encodeURIComponent(m.name)}`)
        : m.kind === "enum" ? buildHash(`/constants/enum/${encodeURIComponent(m.name)}`)
        : buildHash(`/constants/${encodeURIComponent(m.name)}`);
      const chip = el("span", { className: "suggestion-chip" },
        el("a", { href, className: "xref" }, m.name),
      );
      chip.appendChild(el("span", { className: "dim" }, ` (${m.kind})`));
      list.appendChild(chip);
    }
    pg.appendChild(list);
    container.appendChild(pg);
    return;
  }

  // No exact match → try searchAll for partial matches
  const results = searchAll(name, 50);
  if (results.length > 0) {
    const pg = el("div", { className: "detail-view" });
    pg.appendChild(el("h2", {}, `Search results for "${name}"`));
    const list = el("div", { className: "lookup-results" });
    for (const r of results) {
      const href = r.kind === "function" ? buildHash(`/functions/${encodeURIComponent(r.name)}`)
        : r.kind === "type" ? buildHash(`/types/${encodeURIComponent(r.name)}`)
        : r.kind === "enum" ? buildHash(`/constants/enum/${encodeURIComponent(r.name)}`)
        : buildHash(`/constants/${encodeURIComponent(r.name)}`);
      const row = el("div", { className: "lookup-result-item" });
      row.appendChild(badge(r.kind, `search-badge-${r.kind === "constant" ? "const" : r.kind}`));
      row.appendChild(el("a", { href, className: "xref" }, r.name));
      list.appendChild(row);
    }
    pg.appendChild(list);
    container.appendChild(pg);
    return;
  }

  // Nothing at all → not found with suggestions
  renderNotFound(container, "Identifier", name, buildHash("/"), "Home", findSimilarNames(name));
}
