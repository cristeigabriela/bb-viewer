import { canonicalTypeName, resolveLinkName } from "../data";
import { buildHash } from "../router";
import { el } from "../dom";

/** Type/typedef link. Resolves aliases via the typedef index so e.g.
 *  `OVERLAPPED` lands on its typedef page (which itself links to `_OVERLAPPED`). */
export function typeLink(name: string, displayName?: string): HTMLElement {
  const canonical = canonicalTypeName(name) ?? name;
  return el("a", {
    className: "xref xref-type",
    href: buildHash("/types/" + encodeURIComponent(canonical))
  }, displayName ?? name);
}

export function funcLink(name: string): HTMLElement {
  return el("a", { className: "xref xref-func", href: buildHash("/functions/" + encodeURIComponent(name)) }, name);
}

export function constLink(name: string): HTMLElement {
  return el("a", { className: "xref xref-const", href: buildHash("/constants/" + encodeURIComponent(name)) }, name);
}

export function enumLink(name: string, displayName?: string): HTMLElement {
  return el("a", {
    className: "xref xref-enum",
    href: buildHash("/constants/enum/" + encodeURIComponent(name))
  }, displayName ?? name);
}

export function headerLink(header: string, view: string = "functions"): HTMLElement {
  return el("a", {
    className: "xref xref-header",
    href: buildHash("/" + view + "?header=" + encodeURIComponent(header))
  }, header);
}

export function badge(text: string, cls: string = ""): HTMLElement {
  return el("span", { className: `badge ${cls}`.trim() }, text);
}

function linkForResolution(displayName: string, r: ReturnType<typeof resolveLinkName>): HTMLElement | null {
  if (!r) return null;
  if (r.kind === "enum") return enumLink(r.canonical, displayName);
  return typeLink(r.canonical, displayName);
}

/** Render a C type string with clickable xrefs for recognized type/typedef/enum tokens. */
export function renderTypeStr(typeStr: string | null, underlyingType?: string): HTMLElement {
  const span = el("span", { className: "type-str" });
  if (!typeStr) {
    span.appendChild(document.createTextNode("(anonymous)"));
    return span;
  }
  const parts = typeStr.split(/\b/);
  let linked = false;
  for (const part of parts) {
    const r = resolveLinkName(part);
    if (r) {
      const link = linkForResolution(part, r);
      if (link) {
        span.appendChild(link);
        linked = true;
        continue;
      }
    }
    span.appendChild(document.createTextNode(part));
  }
  if (!linked && underlyingType) {
    const r = resolveLinkName(underlyingType);
    if (r) {
      const link = linkForResolution(typeStr, r);
      if (link) {
        span.innerHTML = "";
        span.appendChild(link);
      }
    }
  }
  return span;
}

/** Try to highlight a pre element with arborium */
export function highlightCode(preEl: HTMLElement): void {
  if (typeof (globalThis as any).arborium === "undefined") return;
  try { (globalThis as any).arborium.highlightElement(preEl, "c"); } catch {}
}
