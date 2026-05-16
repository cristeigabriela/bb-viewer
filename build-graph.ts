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

interface FieldEntry {
  name: string;
  type: string | null;
  size: number;
  offset: number;
  is_anonymous?: boolean;
  underlying_record?: string;
}

interface TypeEntry {
  name: string;
  size: number | null;
  fields: FieldEntry[];
  location: { file: string | null };
  kind?: "struct" | "union";
  is_anonymous?: boolean;
  aliases?: string[];
}

interface TypedefEntry {
  name: string;
  canonical_decl_name?: string;
}

function extractTypeTokens(typeStr: string): string[] {
  const cleaned = typeStr
    .replace(/__attribute__\(\([^)]*\)\)/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*&\[\]{}(),;]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return tokens.filter(t => !KNOWN_PRIMITIVES.has(t) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) && t.length > 2);
}

function buildGraph(typesPath: string): { nodes: any[]; edges: any[]; } | null {
  if (!existsSync(typesPath)) return null;
  const raw = JSON.parse(readFileSync(typesPath, "utf-8"));

  // Only named records become graph nodes; anonymous records exist solely as
  // memory-layout sub-decls of their parent and are not standalone identities.
  const namedRecords: TypeEntry[] = [];
  for (const t of (raw.types ?? []) as TypeEntry[]) {
    if (!t.is_anonymous && !t.name.startsWith("<anonymous_")) namedRecords.push(t);
  }
  // referenced_types is mostly anonymous post bb PR #25; include only any named
  // fallbacks (e.g. forward-decl shells that didn't make it to types[]).
  for (const t of (raw.referenced_types ?? []) as TypeEntry[]) {
    if (!t.is_anonymous && !t.name.startsWith("<anonymous_") &&
        !namedRecords.find(n => n.name === t.name)) {
      namedRecords.push(t);
    }
  }

  const typeSet = new Set(namedRecords.map(t => t.name));

  // Build alias map from first-class typedefs (no more _prefix / LP / P hacks).
  // Also include the per-record `aliases` array as a backup for older data.
  const aliases = new Map<string, string>();
  for (const td of (raw.typedefs ?? []) as TypedefEntry[]) {
    if (td.canonical_decl_name && typeSet.has(td.canonical_decl_name) && !typeSet.has(td.name)) {
      aliases.set(td.name, td.canonical_decl_name);
    }
  }
  for (const t of namedRecords) {
    if (t.aliases) {
      for (const a of t.aliases) {
        if (!typeSet.has(a) && !aliases.has(a)) aliases.set(a, t.name);
      }
    }
  }

  const resolve = (token: string): string | null => {
    if (typeSet.has(token)) return token;
    return aliases.get(token) ?? null;
  };

  const edgeSet = new Set<string>();
  const edges: Array<{ source: string; target: string }> = [];
  const connectedTypes = new Set<string>();

  for (const td of namedRecords) {
    if (td.fields.length === 0) continue;
    for (const f of td.fields) {
      // Synthetic anonymous-record sub-decls — skip, they have no outward identity.
      if (f.is_anonymous) continue;
      // Prefer the canonical record name when bb gave us one.
      const direct = f.underlying_record;
      if (direct && typeSet.has(direct) && direct !== td.name) {
        const key = `${td.name}->${direct}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: td.name, target: direct });
          connectedTypes.add(td.name);
          connectedTypes.add(direct);
        }
        continue;
      }
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

  const typeMap = new Map(namedRecords.map(t => [t.name, t]));
  const nodes: Array<{ id: string; size: number | null; fields: number; header: string | null; degree: number; kind?: string }> = [];
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
      kind: td?.kind ?? "struct",
    });
  }

  return { nodes, edges };
}

function computePositions(graph: { nodes: any[]; edges: any[] }): void {
  console.log(`  running force simulation on ${graph.nodes.length} nodes, ${graph.edges.length} edges...`);

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

  const ticks = Math.min(300, 100 + graph.nodes.length / 10);
  for (let i = 0; i < ticks; i++) sim.tick();

  for (let i = 0; i < graph.nodes.length; i++) {
    graph.nodes[i].x = Math.round((simNodes[i] as any).x * 10) / 10;
    graph.nodes[i].y = Math.round((simNodes[i] as any).y * 10) / 10;
  }
}

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
