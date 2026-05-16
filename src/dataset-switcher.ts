import { getAvailableDatasets, getAvailableArchs, getCurrentDataset, getCurrentArch, getCurrentMode } from "./data";
import { navigate, setOnDatasetChange } from "./router";
import { $, $$, el } from "./dom";

/** Always include ds/arch/mode explicitly — prevents injectContext from
 *  re-adding the stale current values before the switch takes effect. */
function buildSwitchParams(ds: string, arch: string, mode: string): string {
  const params = new URLSearchParams();
  params.set("ds", ds);
  params.set("arch", arch);
  params.set("mode", mode);
  return `?${params}`;
}

export function setupDatasetSwitcher(): void {
  const dsButtons = $$(".dataset-btn");
  const archContainer = $(".arch-switcher")!;
  const modeContainer = $(".mode-switcher")!;

  function syncButtonStates() {
    const ds = getCurrentDataset();
    const arch = getCurrentArch();
    const mode = getCurrentMode();
    for (const btn of dsButtons) {
      btn.classList.toggle("active", btn.getAttribute("data-dataset") === ds);
    }
    for (const btn of archContainer.querySelectorAll(".arch-btn")) {
      btn.classList.toggle("active", btn.getAttribute("data-arch") === arch);
    }
    for (const btn of modeContainer.querySelectorAll(".mode-btn")) {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
    }
  }

  function currentPath(): string {
    const hash = window.location.hash.slice(1) || "/";
    return hash.split("?")[0];
  }

  async function refreshArchButtons() {
    archContainer.innerHTML = "";
    const available = await getAvailableArchs();
    if (available.length <= 1) {
      (archContainer as HTMLElement).style.display = "none";
      return;
    }
    (archContainer as HTMLElement).style.display = "";
    for (const arch of available) {
      const btn = el("button", {
        className: `arch-btn ${arch === getCurrentArch() ? "active" : ""}`,
        "data-arch": arch,
      }, arch);
      btn.addEventListener("click", () => {
        if (arch === getCurrentArch()) return;
        navigate(currentPath() + buildSwitchParams(getCurrentDataset(), arch, getCurrentMode()));
      });
      archContainer.appendChild(btn);
    }
  }

  // Dataset buttons
  for (const btn of dsButtons) {
    btn.addEventListener("click", async () => {
      const dataset = btn.getAttribute("data-dataset") as "winsdk" | "phnt";
      if (dataset === getCurrentDataset()) return;
      navigate(currentPath() + buildSwitchParams(dataset, getCurrentArch(), getCurrentMode()));
    });
  }

  // Mode buttons
  for (const btn of modeContainer.querySelectorAll(".mode-btn")) {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode") as "user" | "kernel";
      if (mode === getCurrentMode()) return;
      navigate(currentPath() + buildSwitchParams(getCurrentDataset(), getCurrentArch(), mode));
    });
  }

  // Sync button states when dataset/arch/mode changes (via URL navigation or back/forward)
  setOnDatasetChange(async () => {
    syncButtonStates();
    await refreshArchButtons();
    syncButtonStates();
  });

  // Sync on initial load (URL may already specify non-default values)
  syncButtonStates();

  getAvailableDatasets().then(available => {
    for (const btn of dsButtons) {
      const ds = btn.getAttribute("data-dataset")!;
      if (!available.includes(ds)) (btn as HTMLElement).style.display = "none";
    }
    if (available.length <= 1) {
      const switcher = $(".dataset-switcher");
      if (switcher) (switcher as HTMLElement).style.display = "none";
    }
  });

  // refreshArchButtons is async — sync again after arch buttons are created
  refreshArchButtons().then(syncButtonStates);
}
