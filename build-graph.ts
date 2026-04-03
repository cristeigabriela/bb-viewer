/**
 * Precompute type relationship graphs with force-directed positions.
 * Run: bun run build-graph.ts
 * Generates data/{dataset}/{arch}/graph.json for each available dataset.
 */
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { readdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { KNOWN_PRIMITIVES } from "./src/primitives";

const DATA_DIR = join(import.meta.dir, "data");

interface TypeEntry {
  name: string;
  size: number | null;
  fields: Array<{ name: string; type: string; size: number; offset: number }>;
  location: { file: string | null };
}

function extractTypeTokens(typeStr: string): string[] {
  const cleaned = typeStr
    .replace(/__attribute__\(\([^)]*\)\)/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*&\[\]{}(),;]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return tokens.filter(t => !KNOWN_PRIMITIVES.has(t) && /^[A-Z_][A-Za-z0-9_]*$/.test(t) && t.length > 2);
}

function buildGraph(typesPath: string): { nodes: any[]; edges: any[]; } | null {
  if (!existsSync(typesPath)) return null;
  const raw = JSON.parse(readFileSync(typesPath, "utf-8"));
  const allTypes: TypeEntry[] = [...(raw.types ?? []), ...(raw.referenced_types ?? [])];

  const typeSet = new Set(allTypes.map(t => t.name));

  // Build alias map (same as data.ts)
  const aliases = new Map<string, string>();
  for (const name of typeSet) {
    if (name.startsWith("_") && !name.startsWith("__")) {
      const stripped = name.slice(1);
      if (!typeSet.has(stripped)) aliases.set(stripped, name);
      if (!typeSet.has("LP" + stripped)) aliases.set("LP" + stripped, name);
      if (!typeSet.has("P" + stripped)) aliases.set("P" + stripped, name);
    }
    if (name.startsWith("tag") && name.length > 3 && name[3] >= "A" && name[3] <= "Z") {
      const stripped = name.slice(3);
      if (!typeSet.has(stripped)) aliases.set(stripped, name);
    }
  }

  const resolve = (token: string): string | null => {
    if (typeSet.has(token)) return token;
    return aliases.get(token) ?? null;
  };

  // Build edges: type A contains field of type B
  const edgeSet = new Set<string>();
  const edges: Array<{ source: string; target: string }> = [];
  const connectedTypes = new Set<string>();

  for (const td of allTypes) {
    if (td.fields.length === 0) continue;
    for (const f of td.fields) {
      if (!f.type) continue;
      for (const token of extractTypeTokens(f.type)) {
        const resolved = resolve(token);
        if (resolved && resolved !== td.name) {
          const key = `${td.name}->${resolved}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: td.name, target: resolved });
            connectedTypes.add(td.name);
            connectedTypes.add(resolved);
          }
        }
      }
    }
  }

  // Only include types that have at least one connection
  const typeMap = new Map(allTypes.map(t => [t.name, t]));
  const nodes: Array<{ id: string; size: number | null; fields: number; header: string | null; degree: number }> = [];
  const degreeMap = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
  }

  for (const name of connectedTypes) {
    const td = typeMap.get(name);
    nodes.push({
      id: name,
      size: td?.size ?? null,
      fields: td?.fields.length ?? 0,
      header: td?.location.file ?? null,
      degree: degreeMap.get(name) ?? 0,
    });
  }

  return { nodes, edges };
}

function computePositions(graph: { nodes: any[]; edges: any[] }): void {
  console.log(`  running force simulation on ${graph.nodes.length} nodes, ${graph.edges.length} edges...`);

  // Create simulation nodes/links
  const simNodes = graph.nodes.map(n => ({
    id: n.id,
    x: Math.random() * 2000 - 1000,
    y: Math.random() * 2000 - 1000,
  }));
  const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]));

  const simLinks = graph.edges
    .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
    .map(e => ({
      source: nodeIndex.get(e.source)!,
      target: nodeIndex.get(e.target)!,
    }));

  const sim = forceSimulation(simNodes as any)
    .force("link", forceLink(simLinks).distance(60).strength(0.3))
    .force("charge", forceManyBody().strength(-80).distanceMax(500))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(8))
    .stop();

  // Run ticks
  const ticks = Math.min(300, 100 + graph.nodes.length / 10);
  for (let i = 0; i < ticks; i++) sim.tick();

  // Write positions back to nodes
  for (let i = 0; i < graph.nodes.length; i++) {
    graph.nodes[i].x = Math.round((simNodes[i] as any).x * 10) / 10;
    graph.nodes[i].y = Math.round((simNodes[i] as any).y * 10) / 10;
  }
}

// Main
const datasets = readdirSync(DATA_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== "." && d.name !== "..")
  .map(d => d.name);

let total = 0;
for (const ds of datasets) {
  const dsDir = join(DATA_DIR, ds);
  const archs = readdirSync(dsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const arch of archs) {
    const typesPath = join(dsDir, arch, "types.json");
    const graphPath = join(dsDir, arch, "graph.json");

    console.log(`${ds}/${arch}:`);
    const graph = buildGraph(typesPath);
    if (!graph) {
      console.log("  no types.json, skipping");
      continue;
    }

    console.log(`  ${graph.nodes.length} connected types, ${graph.edges.length} edges`);
    computePositions(graph);
    writeFileSync(graphPath, JSON.stringify(graph));
    const sizeMb = (Buffer.byteLength(JSON.stringify(graph)) / 1024 / 1024).toFixed(1);
    console.log(`  wrote graph.json (${sizeMb}MB)`);
    total++;
  }
}

console.log(`\ndone. generated ${total} graph files.`);
