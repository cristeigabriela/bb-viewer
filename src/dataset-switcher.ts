import { getAvailableDatasets, getAvailableArchs, getCurrentDataset, getCurrentArch } from "./data";
import { navigate, setOnDatasetChange } from "./router";
import { $, $$, el } from "./dom";

/** Always include ds/arch explicitly — prevents injectContext from
 *  re-adding the stale current values before the switch takes effect. */
function buildSwitchParams(ds: string, arch: string): string {
  const params = new URLSearchParams();
  params.set("ds", ds);
  params.set("arch", arch);
  return `?${params}`;
}

export function setupDatasetSwitcher(): void {
  const dsButtons = $$(".dataset-btn");
  const archContainer = $(".arch-switcher")!;

  function syncButtonStates() {
    const ds = getCurrentDataset();
    const arch = getCurrentArch();
    for (const btn of dsButtons) {
      btn.classList.toggle("active", btn.getAttribute("data-dataset") === ds);
    }
    for (const btn of archContainer.querySelectorAll(".arch-btn")) {
      btn.classList.toggle("active", btn.getAttribute("data-arch") === arch);
    }
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
        const hash = window.location.hash.slice(1) || "/";
        const [path] = hash.split("?");
        navigate(path + buildSwitchParams(getCurrentDataset(), arch));
      });
      archContainer.appendChild(btn);
    }
  }

  for (const btn of dsButtons) {
    btn.addEventListener("click", async () => {
      const dataset = btn.getAttribute("data-dataset") as "winsdk" | "phnt";
      if (dataset === getCurrentDataset()) return;
      const hash = window.location.hash.slice(1) || "/";
      const [path] = hash.split("?");
      navigate(path + buildSwitchParams(dataset, getCurrentArch()));
    });
  }

  // Sync button states when dataset changes (via URL navigation or back/forward)
  setOnDatasetChange(async () => {
    syncButtonStates();
    await refreshArchButtons();
    syncButtonStates();
  });

  // Sync on initial load (URL may already specify a non-default dataset/arch)
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
