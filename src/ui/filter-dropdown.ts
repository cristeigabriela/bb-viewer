import { el } from "../dom";

export interface FilterDropdownHandle {
  element: HTMLElement;
  refresh: () => void;
}

/** Build a filter-by dropdown menu component. Returns element + refresh handle. */
export function buildFilterDropdown(
  label: string,
  allValues: string[],
  activeSet: Set<string>,
  onChange: () => void,
): FilterDropdownHandle {
  const wrapper = el("div", { className: "filter-dropdown" });

  const trigger = el("button", { className: "filter-dropdown-trigger" });
  const menu = el("div", { className: "filter-dropdown-menu hidden" });

  const searchInput = el("input", {
    type: "text", placeholder: `Search ${label.toLowerCase()}...`,
    className: "filter-dropdown-search"
  }) as HTMLInputElement;
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
    trigger.textContent = activeSet.size > 0
      ? `${label} (${activeSet.size})`
      : label;
    trigger.className = `filter-dropdown-trigger ${activeSet.size > 0 ? "has-filters" : ""}`;
  }

  function renderOptions() {
    optionsList.innerHTML = "";
    const query = searchInput.value.toLowerCase();
    currentFiltered = query
      ? allValues.filter(v => v.toLowerCase().includes(query))
      : allValues;
    for (const val of currentFiltered) {
      const option = el("label", { className: "filter-dropdown-option" });
      const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = activeSet.has(val);
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        if (cb.checked) activeSet.add(val);
        else activeSet.delete(val);
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
    for (const v of currentFiltered) activeSet.add(v);
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
    document.querySelectorAll(".filter-dropdown-menu").forEach(m => {
      if (m !== menu) m.classList.add("hidden");
    });
    menu.classList.toggle("hidden");
    if (!menu.classList.contains("hidden")) {
      searchInput.value = "";
      renderOptions();
      searchInput.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target as Node)) {
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
