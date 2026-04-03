import { el, clear } from "../dom";
import { debounce } from "../utils";

/* ── Search input with regex toggle ── */

export interface SearchInputHandle {
  element: HTMLElement;
  getValue: () => string;
  isRegex: () => boolean;
}

export function buildSearchInput(
  placeholder: string,
  onChange: (query: string, regex: boolean) => void,
  initial = "",
): SearchInputHandle {
  let useRegex = false;
  const wrap = el("div", { className: "search-with-toggle" });
  const input = el("input", {
    type: "text", placeholder, className: "search-input"
  }) as HTMLInputElement;
  input.value = initial;
  const regexBtn = el("button", { className: "regex-toggle-btn" }, ".*");
  regexBtn.title = "Toggle regex mode";
  regexBtn.addEventListener("click", () => {
    useRegex = !useRegex;
    regexBtn.classList.toggle("active", useRegex);
    input.placeholder = useRegex
      ? placeholder.replace(/\(glob:.*?\)/i, "(regex)")
      : placeholder;
    onChange(input.value, useRegex);
  });
  input.addEventListener("input", debounce(() => {
    onChange(input.value, useRegex);
  }, 200));
  wrap.appendChild(input);
  wrap.appendChild(regexBtn);
  return { element: wrap, getValue: () => input.value, isRegex: () => useRegex };
}

/* ── Sort row ── */

export interface SortState {
  sortBy: string;
  sortDir: "asc" | "desc";
}

export interface SortRowHandle {
  element: HTMLElement;
  getState: () => SortState;
  refresh: () => void;
}

export function buildSortRow(
  columns: ReadonlyArray<readonly [string, string]>,
  initial: SortState,
  onChange: (state: SortState) => void,
): SortRowHandle {
  const state = { ...initial };
  const row = el("div", { className: "sort-row" });
  const buttons: HTMLElement[] = [];

  function refresh() {
    for (const btn of buttons) {
      const key = btn.getAttribute("data-sort-key")!;
      const lbl = btn.getAttribute("data-sort-label")!;
      btn.className = `sort-btn ${state.sortBy === key ? "active" : ""}`;
      btn.textContent = lbl + (state.sortBy === key ? (state.sortDir === "asc" ? " \u25b2" : " \u25bc") : "");
    }
  }

  for (const [key, label] of columns) {
    const btn = el("button", { className: "sort-btn" }, label);
    btn.setAttribute("data-sort-key", key);
    btn.setAttribute("data-sort-label", label);
    btn.addEventListener("click", () => {
      if (state.sortBy === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortBy = key; state.sortDir = "asc"; }
      refresh();
      onChange(state);
    });
    buttons.push(btn);
    row.appendChild(btn);
  }
  refresh();

  return { element: row, getState: () => state, refresh };
}

/* ── Active filter chips ── */

export interface FilterChip {
  label: string;
  onRemove: () => void;
}

export function renderFilterChips(container: HTMLElement, chips: FilterChip[]): void {
  container.innerHTML = "";
  for (const chip of chips) {
    const span = el("span", { className: "active-filter" }, chip.label);
    const btn = el("button", { className: "clear-filter-btn" }, "\u00d7");
    btn.addEventListener("click", chip.onRemove);
    span.appendChild(btn);
    container.appendChild(span);
  }
}

/* ── Not found page ── */

export function renderNotFound(container: Element, entity: string, name: string, backHref: string, backLabel: string): boolean {
  container.appendChild(el("div", { className: "not-found" },
    el("h2", {}, `${entity} not found`),
    el("p", {}, `No ${entity.toLowerCase()} named "${name}" was found.`),
    el("a", { href: backHref }, `\u2190 ${backLabel}`),
  ));
  return false;
}

/* ── Collapsible section ── */

export function collapsibleSection(title: string, ...children: (Node | null)[]): HTMLElement {
  const section = el("div", { className: "collapsible-section" });
  const header = el("div", { className: "section-header" });
  const arrow = el("span", { className: "section-arrow" }, "\u25bc");
  header.appendChild(arrow);
  header.appendChild(el("h3", {}, title));
  section.appendChild(header);

  const body = el("div", { className: "section-body" });
  for (const child of children) {
    if (child) body.appendChild(child);
  }
  section.appendChild(body);

  header.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    arrow.textContent = body.classList.contains("collapsed") ? "\u25b6" : "\u25bc";
  });

  return section;
}

/* ── Pagination ── */

export function renderPagination(
  container: Element,
  currentPage: number,
  totalPages: number,
  onPage: (page: number) => void
): void {
  clear(container);
  if (totalPages <= 1) return;

  const nav = el("nav", { className: "pagination" });
  const addBtn = (label: string, page: number, disabled: boolean, active: boolean = false) => {
    const btn = el("button", {
      className: `page-btn ${active ? "active" : ""} ${disabled ? "disabled" : ""}`.trim()
    }, label);
    if (!disabled && !active) btn.addEventListener("click", () => onPage(page));
    nav.appendChild(btn);
  };

  addBtn("\u00ab", 0, currentPage === 0);
  addBtn("\u2039", currentPage - 1, currentPage === 0);

  const windowSize = 3;
  let start = Math.max(0, currentPage - windowSize);
  let end = Math.min(totalPages - 1, currentPage + windowSize);

  if (start > 0) {
    addBtn("1", 0, false);
    if (start > 1) nav.appendChild(el("span", { className: "page-ellipsis" }, "\u2026"));
  }
  for (let i = start; i <= end; i++) {
    addBtn(String(i + 1), i, false, i === currentPage);
  }
  if (end < totalPages - 1) {
    if (end < totalPages - 2) nav.appendChild(el("span", { className: "page-ellipsis" }, "\u2026"));
    addBtn(String(totalPages), totalPages - 1, false);
  }

  addBtn("\u203a", currentPage + 1, currentPage === totalPages - 1);
  addBtn("\u00bb", totalPages - 1, currentPage === totalPages - 1);

  container.appendChild(nav);
}
