import { loadData, getAvailableDatasets, getAvailableArchs, getCurrentDataset, getCurrentArch } from "./data";
import { $, $$, el } from "./dom";

async function reloadAndRedispatch(): Promise<void> {
  const content = $("#content")!;
  const loading = el("div", { className: "dataset-loading" }, "Switching...");
  content.appendChild(loading);
  try {
    await loadData(getCurrentDataset(), getCurrentArch());
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch (e) {
    loading.textContent = `Failed to load data: ${e}`;
    loading.className = "error";
  }
}

export function setupDatasetSwitcher(): void {
  const dsButtons = $$(".dataset-btn");
  const archContainer = $(".arch-switcher")!;

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
      btn.addEventListener("click", async () => {
        if (arch === getCurrentArch()) return;
        archContainer.querySelectorAll(".arch-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        await loadData(undefined, arch);
        await reloadAndRedispatch();
      });
      archContainer.appendChild(btn);
    }
  }

  for (const btn of dsButtons) {
    btn.addEventListener("click", async () => {
      const dataset = btn.getAttribute("data-dataset") as "winsdk" | "phnt";
      if (dataset === getCurrentDataset()) return;
      dsButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      await loadData(dataset);
      await refreshArchButtons();
      await reloadAndRedispatch();
    });
  }

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

  refreshArchButtons();
}
