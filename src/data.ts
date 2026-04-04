import type { FuncsData, TypesData, ConstsData, XRefIndex, Func, TypeDef, Constant, EnumDef } from "./types";
import { KNOWN_PRIMITIVES } from "./primitives";
import { levenshtein } from "./utils";

let funcsData: FuncsData;
let typesData: TypesData;
let constsData: ConstsData;
let xref: XRefIndex;

// Fast lookup maps (indexed)
let typesByName: Map<string, TypeDef>;
let funcsByName: Map<string, Func>;
let constsByName: Map<string, Constant>;
let enumsByName: Map<string, EnumDef>;

let constSet: Set<string>;
let enumSet: Set<string>;

// All unique headers across all data
let allHeaders: Set<string>;

// Current dataset and architecture
let currentDataset: "winsdk" | "phnt" = "winsdk";
let currentArch: string = "amd64";


function extractTypeNames(typeStr: string): string[] {
  const cleaned = typeStr
    .replace(/__attribute__\(\([^)]*\)\)/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*&\[\]{}(),;]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const results: string[] = [];
  for (const t of tokens) {
    if (!KNOWN_PRIMITIVES.has(t) && /^[A-Z_][A-Za-z0-9_]*$/.test(t) && t.length > 1) {
      results.push(t);
    }
  }
  return results;
}

/** Resolve a type token to its canonical type name, or null */
export function resolveTypeName(token: string): string | null {
  if (typesByName.has(token)) return token;
  return null;
}

function buildXRef(): XRefIndex {
  const idx: XRefIndex = {
    typeToFuncParams: new Map(),
    typeToFuncReturns: new Map(),
    typeToParentTypes: new Map(),
    constToFunctions: new Map(),
    constToConsts: new Map(),
    enumForConstant: new Map(),
  };

  const addToMap = (map: Map<string, Set<string>>, key: string, val: string) => {
    let s = map.get(key);
    if (!s) { s = new Set(); map.set(key, s); }
    s.add(val);
  };

  for (const fn of funcsData.functions) {
    // Return type → typeToFuncReturns
    for (const token of extractTypeNames(fn.return_type)) {
      const resolved = resolveTypeName(token);
      if (resolved) addToMap(idx.typeToFuncReturns, resolved, fn.name);
    }
    // Param types → typeToFuncParams (using underlying_type when available)
    for (const p of fn.params) {
      if (p.underlying_type) {
        const resolved = resolveTypeName(p.underlying_type);
        if (resolved) addToMap(idx.typeToFuncParams, resolved, fn.name);
      } else {
        for (const token of extractTypeNames(p.type)) {
          const resolved = resolveTypeName(token);
          if (resolved) addToMap(idx.typeToFuncParams, resolved, fn.name);
        }
      }
      if (p.values) {
        for (const cname of Object.keys(p.values)) {
          if (constSet.has(cname)) addToMap(idx.constToFunctions, cname, fn.name);
        }
      }
    }
  }

  for (const td of typesData.types) {
    for (const f of td.fields) {
      // Use underlying_type when available (authoritative from libclang)
      if (f.underlying_type) {
        const resolved = resolveTypeName(f.underlying_type);
        if (resolved && resolved !== td.name) {
          addToMap(idx.typeToParentTypes, resolved, td.name);
        }
      } else if (f.type) {
        // Fallback to token extraction for primitive fields without underlying_type
        for (const token of extractTypeNames(f.type)) {
          const resolved = resolveTypeName(token);
          if (resolved && resolved !== td.name) {
            addToMap(idx.typeToParentTypes, resolved, td.name);
          }
        }
      }
    }
  }

  for (const c of constsData.constants) {
    if (c.components) {
      for (const comp of c.components) {
        if (constSet.has(comp)) {
          addToMap(idx.constToConsts, comp, c.name);
        }
      }
    }
  }

  for (const e of constsData.enums) {
    for (const c of e.constants) {
      idx.enumForConstant.set(c.name, e.name);
    }
  }

  return idx;
}

function processData(): void {
  // Flatten referenced_types into types (mark them as opaque)
  for (const rt of typesData.referenced_types) {
    if (!typesData.types.find(t => t.name === rt.name)) {
      typesData.types.push(rt);
    }
  }

  // Flatten referred_components into constants
  for (const rc of constsData.referred_components) {
    if (!constsData.constants.find(c => c.name === rc.name)) {
      constsData.constants.push(rc);
    }
  }

  // Build indexed lookups
  typesByName = new Map(typesData.types.map(t => [t.name, t]));
  funcsByName = new Map(funcsData.functions.map(f => [f.name, f]));
  constsByName = new Map(constsData.constants.map(c => [c.name, c]));
  enumsByName = new Map(constsData.enums.map(e => [e.name, e]));

  constSet = new Set(constsByName.keys());
  for (const e of constsData.enums) {
    for (const c of e.constants) constSet.add(c.name);
  }
  enumSet = new Set(enumsByName.keys());

  // Build type aliases (LP*, P*, _prefix)
  // Collect all headers
  allHeaders = new Set<string>();
  for (const fn of funcsData.functions) if (fn.location.file) allHeaders.add(fn.location.file);
  for (const td of typesData.types) if (td.location.file) allHeaders.add(td.location.file);
  for (const c of constsData.constants) if (c.location.file) allHeaders.add(c.location.file);
  for (const e of constsData.enums) if (e.location.file) allHeaders.add(e.location.file);

  xref = buildXRef();
}

/** Check if data files exist and have content at the given path prefix */
async function dataPathExists(prefix: string): Promise<boolean> {
  // Check for any of the three data files
  for (const file of ["funcs.json", "types.json", "consts.json"]) {
    try {
      const resp = await fetch(`${prefix}/${file}`, { method: "HEAD" });
      if (!resp.ok) continue;
      const len = resp.headers.get("content-length");
      if (len !== null && parseInt(len) === 0) continue;
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function loadData(dataset?: "winsdk" | "phnt", arch?: string): Promise<void> {
  if (dataset) currentDataset = dataset;
  if (arch) currentArch = arch;

  // Try paths in order: data/{dataset}/{arch}/, data/{dataset}/, data/
  let prefix = `data/${currentDataset}/${currentArch}`;
  if (!await dataPathExists(prefix)) {
    prefix = `data/${currentDataset}`;
    if (!await dataPathExists(prefix)) {
      prefix = "data";
    }
  }

  const emptyFuncs: FuncsData = { command: "", functions: [] };
  const emptyTypes: TypesData = { command: "", types: [], referenced_types: [] };
  const emptyConsts: ConstsData = { command: "", constants: [], enums: [], referred_components: [] };

  const fetchJson = async <T>(url: string, fallback: T): Promise<T> => {
    try {
      const r = await fetch(url);
      if (!r.ok) return fallback;
      return await r.json();
    } catch { return fallback; }
  };

  const [f, t, c] = await Promise.all([
    fetchJson(prefix + "/funcs.json", emptyFuncs),
    fetchJson(prefix + "/types.json", emptyTypes),
    fetchJson(prefix + "/consts.json", emptyConsts),
  ]);
  funcsData = f; typesData = t; constsData = c;

  processData();
}

export function getCurrentDataset(): "winsdk" | "phnt" { return currentDataset; }
export function getCurrentArch(): string { return currentArch; }

export async function getAvailableDatasets(): Promise<string[]> {
  const datasets: string[] = [];
  for (const ds of ["winsdk", "phnt"]) {
    // Check for any arch subdir, or flat dataset dir
    for (const arch of ["amd64", "x86", "arm", "arm64"]) {
      if (await dataPathExists(`data/${ds}/${arch}`)) { datasets.push(ds); break; }
    }
    if (!datasets.includes(ds) && await dataPathExists(`data/${ds}`)) datasets.push(ds);
  }
  if (datasets.length === 0) datasets.push("winsdk");
  return datasets;
}

export async function getAvailableArchs(dataset?: string): Promise<string[]> {
  const ds = dataset ?? currentDataset;
  const archs: string[] = [];
  for (const arch of ["amd64", "x86", "arm", "arm64"]) {
    if (await dataPathExists(`data/${ds}/${arch}`)) archs.push(arch);
  }
  if (archs.length === 0) archs.push("amd64");
  return archs;
}

export function getFunctions(): Func[] { return funcsData.functions; }
export function getTypes(): TypeDef[] { return typesData.types; }
export function getConstants(): Constant[] { return constsData.constants; }
export function getEnums(): EnumDef[] { return constsData.enums; }
export function getXRef(): XRefIndex { return xref; }
export function getAllHeaders(): string[] { return [...allHeaders].sort(); }

export function hasType(name: string): boolean { return typesByName.has(name); }
export function hasConst(name: string): boolean { return constSet.has(name); }
export function hasEnum(name: string): boolean { return enumSet.has(name); }

export function findType(name: string): TypeDef | undefined {
  return typesByName.get(name);
}
export function flexFindType(name: string): { canonical: string; item: TypeDef } | undefined {
  let t = typesByName.get(name);
  if (t) return { canonical: name, item: t };
  t = typesByName.get("_" + name);
  if (t) return { canonical: "_" + name, item: t };
  if (name.startsWith("_")) {
    t = typesByName.get(name.slice(1));
    if (t) return { canonical: name.slice(1), item: t };
  }
  return undefined;
}
export function findFunc(name: string): Func | undefined {
  return funcsByName.get(name);
}
export function findEnum(name: string): EnumDef | undefined {
  return enumsByName.get(name);
}
export function findConst(name: string): Constant | undefined {
  return constsByName.get(name);
}

/** Clean DLL name: strip parenthetical suffixes, semicolons, lowercase.
 *  HACK: .lib→.dll is a workaround for sdk-api data having "Kernel32.lib"
 *  in the DLL field for 4 functions. Fix submitted upstream to Microsoft. */
export function cleanDll(dll: string): string {
  let name = dll.split(";")[0].trim().split(/\s/)[0].toLowerCase();
  if (name.endsWith(".lib")) name = name.slice(0, -4) + ".dll";
  return name;
}

/** Get the canonical type name for linking (resolves aliases) */
export function canonicalTypeName(token: string): string | null {
  if (typesByName.has(token)) return token;
  return null;
}

export function searchAll(query: string, limit = 20): Array<{ kind: string; name: string }> {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const results: Array<{ kind: string; name: string; score: number }> = [];

  const score = (name: string): number => {
    const nl = name.toLowerCase();
    if (nl === q) return 100;
    if (nl.startsWith(q)) return 80;
    const idx = nl.indexOf(q);
    if (idx >= 0) return 60 - idx * 0.1;
    return 0;
  };

  for (const f of funcsData.functions) {
    const s = score(f.name);
    if (s > 0) results.push({ kind: "function", name: f.name, score: s });
  }
  for (const t of typesData.types) {
    const s = score(t.name);
    if (s > 0) results.push({ kind: "type", name: t.name, score: s });
  }
  for (const c of constsData.constants) {
    const s = score(c.name);
    if (s > 0) results.push({ kind: "constant", name: c.name, score: s });
  }
  for (const e of constsData.enums) {
    const s = score(e.name);
    if (s > 0) results.push({ kind: "enum", name: e.name, score: s });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function findSimilarNames(query: string, limit = 5): Array<{ kind: string; name: string }> {
  const q = query.toLowerCase();
  const maxDist = Math.max(5, Math.floor(q.length * 0.4));
  const candidates: Array<{ kind: string; name: string; dist: number }> = [];

  const check = (name: string, kind: string) => {
    const d = levenshtein(q, name.toLowerCase());
    if (d > 0 && d <= maxDist) candidates.push({ kind, name, dist: d });
  };

  for (const f of funcsData.functions) check(f.name, "function");
  for (const t of typesData.types) check(t.name, "type");
  for (const c of constsData.constants) check(c.name, "constant");
  for (const e of constsData.enums) check(e.name, "enum");

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, limit);
}
