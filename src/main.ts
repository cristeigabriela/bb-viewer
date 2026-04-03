import { loadData } from "./data";
import { route, startRouter } from "./router";
import { $ } from "./dom";
import { setupTheme } from "./theme";
import { setupDatasetSwitcher } from "./dataset-switcher";
import { setupSearchModal } from "./search-modal";
import { initClippy } from "./clippy";
import { renderHome } from "./views/home";
import { renderFunctionsList, renderFunctionDetail } from "./views/functions";
import { renderTypesList, renderTypeDetail } from "./views/types";
import { renderTypeGraph } from "./views/type-graph";
import { renderConstantsList, renderConstantDetail, renderEnumDetail } from "./views/constants";

const content = () => $("#content")!;

function setActiveNav(name: string) {
  for (const a of document.querySelectorAll(".nav-link")) {
    a.classList.toggle("active", a.getAttribute("data-view") === name);
  }
}

async function init() {
  setupTheme();

  try {
    await loadData();
  } catch (e) {
    $("#loading")!.innerHTML = `<div class="error">Failed to load data: ${e}</div>`;
    return;
  }

  $("#loading")!.classList.add("hidden");
  ($("#app") as HTMLElement).style.display = "";

  setupSearchModal();
  setupDatasetSwitcher();
  initClippy();

  route("/", () => { setActiveNav("home"); renderHome(content()); });
  route("/functions", (_, q) => { setActiveNav("functions"); renderFunctionsList(content(), q); });
  route("/functions/:name", (p) => { setActiveNav("functions"); renderFunctionDetail(content(), decodeURIComponent(p.name)); });
  route("/types", (_, q) => { setActiveNav("types"); renderTypesList(content(), q); });
  route("/types/graph", () => { setActiveNav("types"); renderTypeGraph(content()); });
  route("/types/:name", (p) => { setActiveNav("types"); renderTypeDetail(content(), decodeURIComponent(p.name)); });
  route("/constants", (_, q) => { setActiveNav("constants"); renderConstantsList(content(), q); });
  route("/constants/:name", (p) => { setActiveNav("constants"); renderConstantDetail(content(), decodeURIComponent(p.name)); });
  route("/constants/enum/:name", (p) => { setActiveNav("constants"); renderEnumDetail(content(), decodeURIComponent(p.name)); });

  startRouter();
}

init();
