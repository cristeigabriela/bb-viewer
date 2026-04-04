import { getCurrentDataset, getCurrentArch } from "../data";
import { buildHash } from "../router";
import { el, clear } from "../dom";
import { debounce } from "../utils";

declare const cytoscape: any;

interface GraphNode {
  id: string;
  size: number | null;
  fields: number;
  header: string | null;
  degree: number;
  x: number;
  y: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: Array<{ source: string; target: string }>;
}

let cachedGraph: GraphData | null = null;
let cachedKey = "";

async function loadGraphData(): Promise<GraphData> {
  const ds = getCurrentDataset();
  const arch = getCurrentArch();
  const key = `${ds}/${arch}`;
  if (cachedGraph && cachedKey === key) return cachedGraph;

  const resp = await fetch(`data/${ds}/${arch}/graph.json`);
  if (!resp.ok) throw new Error("graph.json not found");
  cachedGraph = await resp.json();
  cachedKey = key;
  return cachedGraph!;
}

function getAccentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ffb000";
}

function getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    bg: s.getPropertyValue("--bg").trim(),
    bgCard: s.getPropertyValue("--bg-card").trim(),
    border: s.getPropertyValue("--border").trim(),
    text: s.getPropertyValue("--text").trim(),
    textDim: s.getPropertyValue("--text-dim").trim(),
    textMuted: s.getPropertyValue("--text-muted").trim(),
    accent: s.getPropertyValue("--accent").trim(),
    accentDim: s.getPropertyValue("--accent-dim").trim(),
  };
}

export async function renderTypeGraph(container: Element): void {
  clear(container);

  const page = el("div", { className: "graph-view" });

  // Subtab nav
  const tabRow = el("div", { className: "tabs" });
  const listTab = el("a", { href: buildHash("/types"), className: "tab-btn" }, "list");
  const graphTab = el("button", { className: "tab-btn active" }, "graph");
  tabRow.appendChild(listTab);
  tabRow.appendChild(graphTab);
  page.appendChild(tabRow);

  const body = el("div", { className: "graph-body" });

  // Graph canvas
  const graphContainer = el("div", { className: "graph-container" });
  graphContainer.id = "cy-container";
  body.appendChild(graphContainer);

  // Right panel
  const panel = el("div", { className: "graph-panel" });

  const searchInput = el("input", {
    type: "text",
    placeholder: "search types...",
    className: "graph-search",
  }) as HTMLInputElement;
  panel.appendChild(searchInput);

  // Sort toggle: alphabetical vs by connections
  const sortRow = el("div", { className: "graph-sort-row" });
  const sortAlpha = el("button", { className: "sort-btn active", "data-sort": "alpha" }, "a-z");
  const sortDegree = el("button", { className: "sort-btn", "data-sort": "degree" }, "most connected");
  sortRow.appendChild(sortAlpha);
  sortRow.appendChild(sortDegree);
  panel.appendChild(sortRow);

  const searchResults = el("div", { className: "graph-search-results" });
  panel.appendChild(searchResults);

  // Unselect button + node info
  const unselectBtn = el("button", { className: "graph-unselect-btn hidden" }, "unselect");
  panel.appendChild(unselectBtn);

  const nodeInfo = el("div", { className: "graph-node-info" });
  panel.appendChild(nodeInfo);

  body.appendChild(panel);
  page.appendChild(body);
  container.appendChild(page);

  // Loading
  graphContainer.innerHTML = '<div class="graph-loading">loading graph...</div>';

  let cy: any;
  let graph: GraphData;

  try {
    graph = await loadGraphData();
  } catch (e) {
    graphContainer.innerHTML = `<div class="graph-loading">failed to load graph data</div>`;
    return;
  }

  const colors = getThemeColors();

  // Build cytoscape elements
  const elements: any[] = [];

  // Size nodes by degree
  const maxDegree = Math.max(...graph.nodes.map(n => n.degree), 1);

  for (const node of graph.nodes) {
    const sz = 6 + (node.degree / maxDegree) * 20;
    elements.push({
      group: "nodes",
      data: {
        id: node.id,
        label: node.id,
        nodeSize: sz,
        degree: node.degree,
        typeSize: node.size,
        fields: node.fields,
        header: node.header,
      },
      position: { x: node.x, y: node.y },
    });
  }

  for (const edge of graph.edges) {
    elements.push({
      group: "edges",
      data: { source: edge.source, target: edge.target },
    });
  }

  graphContainer.innerHTML = "";

  cy = cytoscape({
    container: graphContainer,
    elements,
    layout: { name: "preset" },
    style: [
      {
        selector: "node",
        style: {
          width: "data(nodeSize)",
          height: "data(nodeSize)",
          "background-color": colors.textMuted,
          "border-width": 1,
          "border-color": colors.border,
          label: "",
          "font-family": '"Courier New", monospace',
          "font-size": 8,
          color: colors.textDim,
          "text-valign": "bottom",
          "text-margin-y": 4,
          "min-zoomed-font-size": 6,
        },
      },
      {
        selector: "node:selected",
        style: {
          "background-color": colors.accent,
          "border-color": colors.accent,
          "border-width": 2,
          label: "data(label)",
          color: colors.accent,
          "font-size": 10,
          "font-weight": "bold",
        },
      },
      {
        selector: "node.highlighted",
        style: {
          "background-color": colors.accent,
          "border-color": colors.accent,
          "border-width": 2,
          label: "data(label)",
          color: colors.accent,
          "font-size": 9,
        },
      },
      {
        selector: "node.neighbor",
        style: {
          "background-color": colors.textDim,
          "border-color": colors.accent,
          "border-width": 1,
          label: "data(label)",
          "font-size": 7,
          color: colors.textDim,
        },
      },
      {
        selector: "node.dimmed",
        style: {
          opacity: 0.15,
        },
      },
      {
        selector: "edge",
        style: {
          width: 0.5,
          "line-color": colors.border,
          "curve-style": "bezier",
          opacity: 0.3,
        },
      },
      {
        selector: "edge.highlighted",
        style: {
          "line-color": colors.accent,
          width: 1.5,
          opacity: 0.8,
        },
      },
      {
        selector: "edge.dimmed",
        style: {
          opacity: 0.05,
        },
      },
    ],
    // Show labels when zoomed in
    textureOnViewport: false,
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 5,
  });

  // Show labels on zoom
  cy.on("zoom", () => {
    const zoom = cy.zoom();
    if (zoom > 0.8) {
      cy.style().selector("node").style("label", "data(label)").update();
    } else {
      cy.style().selector("node").style("label", "").update();
    }
  });

  // Click node → show info and highlight neighborhood
  function focusNode(nodeId: string) {
    const node = cy.getElementById(nodeId);
    if (!node || node.length === 0) return;

    // Clear previous
    cy.elements().removeClass("highlighted neighbor dimmed");

    // Highlight neighborhood
    const neighborhood = node.neighborhood();
    cy.elements().addClass("dimmed");
    node.removeClass("dimmed").addClass("highlighted");
    neighborhood.removeClass("dimmed");
    neighborhood.nodes().addClass("neighbor");
    neighborhood.edges().addClass("highlighted");

    // Center on node
    cy.animate({
      center: { eles: node },
      zoom: 1.5,
    }, { duration: 400 });

    // Show info
    showNodeInfo(node.data());
  }

  function clearFocus() {
    cy.elements().removeClass("highlighted neighbor dimmed");
    nodeInfo.innerHTML = "";
    unselectBtn.classList.add("hidden");
  }

  cy.on("tap", "node", (evt: any) => {
    const node = evt.target;
    focusNode(node.id());
  });

  cy.on("tap", (evt: any) => {
    if (evt.target === cy) clearFocus();
  });

  unselectBtn.addEventListener("click", () => {
    clearFocus();
    searchInput.value = "";
    cy.fit(undefined, 30);
  });

  // Escape to unselect (only if search modal isn't open)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector(".sm-overlay.visible")) {
      if (!unselectBtn.classList.contains("hidden")) {
        clearFocus();
        searchInput.value = "";
        cy.fit(undefined, 30);
      }
    }
  });

  // Double-click → navigate to type detail
  cy.on("dbltap", "node", (evt: any) => {
    window.location.hash = buildHash(`/types/${encodeURIComponent(evt.target.id())}`);
  });

  function showNodeInfo(data: any) {
    nodeInfo.innerHTML = "";
    unselectBtn.classList.remove("hidden");
    const name = el("a", {
      href: buildHash(`/types/${encodeURIComponent(data.id)}`),
      className: "gni-name",
    }, data.id);
    nodeInfo.appendChild(name);

    const info = el("div", { className: "gni-details" });
    if (data.typeSize !== null) info.appendChild(el("div", {}, `size: ${data.typeSize}B`));
    info.appendChild(el("div", {}, `fields: ${data.fields}`));
    info.appendChild(el("div", {}, `connections: ${data.degree}`));
    if (data.header) info.appendChild(el("div", {}, `header: ${data.header}`));
    nodeInfo.appendChild(info);

    // Show connections list
    const node = cy.getElementById(data.id);
    if (node.length > 0) {
      const neighbors = node.neighborhood().nodes();
      if (neighbors.length > 0) {
        const connTitle = el("div", { className: "gni-conn-title" }, `connected (${neighbors.length})`);
        nodeInfo.appendChild(connTitle);
        const connList = el("div", { className: "gni-conn-list" });
        neighbors.sort((a: any, b: any) => a.id().localeCompare(b.id()));
        for (const n of neighbors.toArray().slice(0, 30)) {
          const link = el("a", {
            href: "#",
            className: "gni-conn-item",
          }, n.id());
          link.addEventListener("click", (e) => {
            e.preventDefault();
            focusNode(n.id());
            searchInput.value = n.id();
          });
          connList.appendChild(link);
        }
        if (neighbors.length > 30) {
          connList.appendChild(el("div", { className: "dim" }, `+${neighbors.length - 30} more`));
        }
        nodeInfo.appendChild(connList);
      }
    }
  }

  // Search with sort modes
  const nodesByAlpha = graph.nodes.map(n => n.id).sort();
  const nodesByDegree = [...graph.nodes].sort((a, b) => b.degree - a.degree).map(n => n.id);
  const degreeMap = new Map(graph.nodes.map(n => [n.id, n.degree]));
  let sortMode: "alpha" | "degree" = "alpha";

  function renderSearchList(query: string) {
    searchResults.innerHTML = "";
    const q = query.trim().toLowerCase();
    const source = sortMode === "alpha" ? nodesByAlpha : nodesByDegree;
    const matches = q.length > 0
      ? source.filter(id => id.toLowerCase().includes(q))
      : source;
    for (const id of matches.slice(0, 100)) {
      const item = el("a", { href: "#", className: "graph-search-item" }, id);
      if (sortMode === "degree") {
        item.appendChild(el("span", { className: "graph-search-degree" }, String(degreeMap.get(id) ?? 0)));
      }
      item.addEventListener("click", (e) => {
        e.preventDefault();
        focusNode(id);
        searchInput.value = id;
      });
      searchResults.appendChild(item);
    }
    if (matches.length > 100) {
      searchResults.appendChild(el("div", { className: "dim graph-search-item" }, `+${matches.length - 100} more`));
    }
  }

  sortAlpha.addEventListener("click", () => {
    sortMode = "alpha";
    sortAlpha.classList.add("active");
    sortDegree.classList.remove("active");
    renderSearchList(searchInput.value);
  });
  sortDegree.addEventListener("click", () => {
    sortMode = "degree";
    sortDegree.classList.add("active");
    sortAlpha.classList.remove("active");
    renderSearchList(searchInput.value);
  });

  // Show all types initially
  renderSearchList("");

  searchInput.addEventListener("input", debounce(() => {
    renderSearchList(searchInput.value);
  }, 100));

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim().toLowerCase();
      const match = nodesByAlpha.find(id => id.toLowerCase() === q)
        ?? nodesByAlpha.find(id => id.toLowerCase().includes(q));
      if (match) {
        focusNode(match);
        searchInput.value = match;
        searchResults.innerHTML = "";
      }
    }
  });

  // Fit to view
  cy.fit(undefined, 30);
}
