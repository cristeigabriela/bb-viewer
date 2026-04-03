import { canonicalTypeName } from "../data";
import { el } from "../dom";

/** Create a type link, resolving aliases (LP*, P*, _prefix) */
export function typeLink(name: string, displayName?: string): HTMLElement {
  const canonical = canonicalTypeName(name) ?? name;
  return el("a", {
    className: "xref xref-type",
    href: `#/types/${encodeURIComponent(canonical)}`
  }, displayName ?? name);
}

export function funcLink(name: string): HTMLElement {
  return el("a", { className: "xref xref-func", href: `#/functions/${encodeURIComponent(name)}` }, name);
}

export function constLink(name: string): HTMLElement {
  return el("a", { className: "xref xref-const", href: `#/constants/${encodeURIComponent(name)}` }, name);
}

export function enumLink(name: string): HTMLElement {
  return el("a", { className: "xref xref-enum", href: `#/constants/enum/${encodeURIComponent(name)}` }, name);
}

export function headerLink(header: string, view: string = "functions"): HTMLElement {
  return el("a", {
    className: "xref xref-header",
    href: `#/${view}?header=${encodeURIComponent(header)}`
  }, header);
}

export function badge(text: string, cls: string = ""): HTMLElement {
  return el("span", { className: `badge ${cls}`.trim() }, text);
}

/** Render a C type string with clickable xrefs for recognized types.
 *  Optionally accepts an underlying_type for better resolution. */
export function renderTypeStr(typeStr: string, underlyingType?: string): HTMLElement {
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
  // If nothing linked but we have an underlying_type, try to link the whole string
  if (!linked && underlyingType) {
    const resolved = canonicalTypeName(underlyingType);
    if (resolved) {
      span.innerHTML = "";
      span.appendChild(typeLink(resolved, typeStr));
    }
  }
  return span;
}

/** Try to highlight a pre element with arborium */
export function highlightCode(preEl: HTMLElement): void {
  if (typeof (globalThis as any).arborium === "undefined") return;
  try { (globalThis as any).arborium.highlightElement(preEl, "c"); } catch {}
}
