/** Core DOM primitives. No dependencies on data or other modules. */

export function $(sel: string, root: Element | Document = document): Element | null {
  return root.querySelector(sel);
}

export function $$(sel: string, root: Element | Document = document): Element[] {
  return [...root.querySelectorAll(sel)];
}

export function el(tag: string, attrs?: Record<string, string>, ...children: (string | Node)[]): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") e.className = v;
    else if (k.startsWith("data-")) e.setAttribute(k, v);
    else (e as any)[k] = v;
  }
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

export function clear(element: Element): void {
  element.innerHTML = "";
}
