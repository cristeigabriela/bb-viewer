import type { FuncsData, TypesData, ConstsData, XRefIndex, Func, TypeDef, Typedef, Constant, EnumDef, Field } from "./types";
import { KNOWN_PRIMITIVES } from "./primitives";
import { levenshtein } from "./utils";

let funcsData: FuncsData;
let typesData: TypesData;
let constsData: ConstsData;
let xref: XRefIndex;

let typesByName: Map<string, TypeDef>;
let typedefsByName: Map<string, Typedef>;
/** Alternative names (typedef aliases) → canonical decl name of a record. */
let aliasToDecl: Map<string, string>;
/** Typedef alias → enum decl name (e.g. FILE_INFORMATION_CLASS → _FILE_INFORMATION_CLASS). */
let enumAliasToDecl: Map<string, string>;
/** Anonymous records keyed by `${enclosing_record}|${field_path.join("/")}`. */
let anonByRef: Map<string, TypeDef>;
let funcsByName: Map<string, Func>;
let constsByName: Map<string, Constant>;
let enumsByName: Map<string, EnumDef>;

/** Universe of names that should be treated as user-defined linkable identifiers. */
let knownNames: Set<string>;

let constSet: Set<string>;
let enumSet: Set<string>;

let allHeaders: Set<string>;

let currentDataset: "winsdk" | "phnt" = "winsdk";
let currentArch: string = "amd64";
let currentMode: "user" | "kernel" = "user";

const anonKey = (enclosing: string, path: string[]) => `${enclosing}|${path.join("/")}`;

function extractTypeNames(typeStr: string | null | undefined): string[] {
  if (!typeStr) return [];
  const cleaned = typeStr
    .replace(/__attribute__\(\([^)]*\)\)/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*&\[\]{}(),;]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const results: string[] = [];
  for (const t of tokens) {
    if (!KNOWN_PRIMITIVES.has(t) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) && t.length > 1) {
      results.push(t);
    }
  }
  return results;
}

function isAnonName(name: string): boolean {
  return name.startsWith("<anonymous_");
}

function buildXRef(): XRefIndex {
  const idx: XRefIndex = {
    nameToFuncParams: new Map(),
    nameToFuncReturns: new Map(),
    nameToParentTypes: new Map(),
    constToFunctions: new Map(),
    constToConsts: new Map(),
    enumForConstant: new Map(),
  };

  const addToMap = (map: Map<string, Set<string>>, key: string, val: string) => {
    if (!key || isAnonName(key)) return;
    let s = map.get(key);
    if (!s) { s = new Set(); map.set(key, s); }
    s.add(val);
  };

  const indexName = (map: Map<string, Set<string>>, raw: string | null | undefined, fname: string) => {
    if (!raw) return;
    for (const token of extractTypeNames(raw)) {
      if (knownNames.has(token)) addToMap(map, token, fname);
    }
  };

  for (const fn of funcsData.functions) {
    indexName(idx.nameToFuncReturns, fn.return_type, fn.name);
    for (const p of fn.params) {
      indexName(idx.nameToFuncParams, p.type, fn.name);
      if (p.underlying_record) addToMap(idx.nameToFuncParams, p.underlying_record, fn.name);
      if (p.values) {
        for (const cname of Object.keys(p.values)) {
          if (constSet.has(cname)) addToMap(idx.constToFunctions, cname, fn.name);
        }
      }
    }
  }

  for (const td of typesData.types) {
    if (td.is_anonymous) continue;
    for (const f of td.fields) {
      indexName(idx.nameToParentTypes, f.type, td.name);
      if (f.underlying_record && f.underlying_record !== td.name) {
        addToMap(idx.nameToParentTypes, f.underlying_record, td.name);
      }
    }
  }

  for (const c of constsData.constants) {
    if (c.components) {
      for (const comp of c.components) {
        if (constSet.has(comp)) addToMap(idx.constToConsts, comp, c.name);
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
  typesByName = new Map();
  anonByRef = new Map();
  aliasToDecl = new Map();
  enumAliasToDecl = new Map();
  typedefsByName = new Map();

  // Named records → typesByName; anonymous records → anonByRef.
  for (const td of typesData.types) {
    if (td.is_anonymous && td.enclosing_record && td.field_path) {
      anonByRef.set(anonKey(td.enclosing_record, td.field_path), td);
    } else if (!isAnonName(td.name)) {
      typesByName.set(td.name, td);
    }
  }
  for (const rt of typesData.referenced_types) {
    if (rt.is_anonymous && rt.enclosing_record && rt.field_path) {
      anonByRef.set(anonKey(rt.enclosing_record, rt.field_path), rt);
    } else if (!isAnonName(rt.name) && !typesByName.has(rt.name)) {
      typesByName.set(rt.name, rt);
    }
  }

  // Register alias names so they resolve to their canonical record.
  for (const td of typesByName.values()) {
    if (td.aliases) {
      for (const a of td.aliases) {
        if (!aliasToDecl.has(a)) aliasToDecl.set(a, td.name);
      }
    }
  }

  for (const t of typesData.typedefs ?? []) {
    typedefsByName.set(t.name, t);
    if (t.canonical_decl_name && typesByName.has(t.canonical_decl_name)) {
      if (!aliasToDecl.has(t.name)) aliasToDecl.set(t.name, t.canonical_decl_name);
    }
    // Enum-kind typedefs register an enum-alias mapping for type-string linking.
    if (t.kind === "enum" && t.canonical_decl_name) {
      if (!enumAliasToDecl.has(t.name)) enumAliasToDecl.set(t.name, t.canonical_decl_name);
    }
  }

  // Flatten referred_components into constants (these are independent
  // constants that other constants reference; the bb shape returns them
  // separately to avoid massive duplication).
  for (const rc of constsData.referred_components) {
    if (!constsData.constants.find(c => c.name === rc.name)) {
      constsData.constants.push(rc);
    }
  }

  funcsByName = new Map(funcsData.functions.map(f => [f.name, f]));
  constsByName = new Map(constsData.constants.map(c => [c.name, c]));
  enumsByName = new Map(constsData.enums.map(e => [e.name, e]));

  constSet = new Set(constsByName.keys());
  for (const e of constsData.enums) {
    for (const c of e.constants) constSet.add(c.name);
  }
  enumSet = new Set(enumsByName.keys());

  // Fallback: infer enum aliases from (param.type, param.underlying_record) and
  // (field.type, field.underlying_record) pairs where underlying_record matches
  // an enum decl. Useful until bb's full typedef dump lands.
  const registerEnumAlias = (typeStr: string | null | undefined, underlying: string | undefined) => {
    if (!typeStr || !underlying) return;
    if (!enumsByName.has(underlying)) return;
    // The typedef alias is the bare identifier in typeStr (strip pointer/array/const noise).
    const m = typeStr.match(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!m) return;
    const alias = m[0];
    if (alias === underlying) return;
    if (KNOWN_PRIMITIVES.has(alias)) return;
    if (!enumAliasToDecl.has(alias)) enumAliasToDecl.set(alias, underlying);
  };
  for (const fn of funcsData.functions) {
    for (const p of fn.params) registerEnumAlias(p.type, p.underlying_record);
  }
  for (const td of typesByName.values()) {
    if (td.is_anonymous) continue;
    for (const f of td.fields) registerEnumAlias(f.type, f.underlying_record);
  }

  // Universe of linkable names: record decls + typedef names + aliases + enum decls + enum aliases.
  knownNames = new Set<string>();
  for (const n of typesByName.keys()) knownNames.add(n);
  for (const n of typedefsByName.keys()) knownNames.add(n);
  for (const n of aliasToDecl.keys()) knownNames.add(n);
  for (const n of enumsByName.keys()) knownNames.add(n);
  for (const n of enumAliasToDecl.keys()) knownNames.add(n);

  allHeaders = new Set<string>();
  for (const fn of funcsData.functions) if (fn.location.file) allHeaders.add(fn.location.file);
  for (const td of typesByName.values()) if (td.location.file) allHeaders.add(td.location.file);
  for (const t of typedefsByName.values()) if (t.location.file) allHeaders.add(t.location.file);
  for (const c of constsData.constants) if (c.location.file) allHeaders.add(c.location.file);
  for (const e of constsData.enums) if (e.location.file) allHeaders.add(e.location.file);

  xref = buildXRef();
}

async function dataPathExists(prefix: string): Promise<boolean> {
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

export async function loadData(dataset?: "winsdk" | "phnt", arch?: string, mode?: "user" | "kernel"): Promise<void> {
  if (dataset) currentDataset = dataset;
  if (arch) currentArch = arch;
  if (mode) currentMode = mode;

  const suffix = currentMode === "kernel" ? "-kernel" : "";
  let prefix = `data/${currentDataset}${suffix}/${currentArch}`;
  if (!await dataPathExists(prefix)) {
    prefix = `data/${currentDataset}${suffix}`;
    if (!await dataPathExists(prefix)) {
      prefix = "data";
    }
  }

  const emptyFuncs: FuncsData = { command: "", functions: [] };
  const emptyTypes: TypesData = { command: "", types: [], referenced_types: [], typedefs: [] };
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
  if (!typesData.typedefs) typesData.typedefs = [];

  processData();
}

export function getCurrentDataset(): "winsdk" | "phnt" { return currentDataset; }
export function getCurrentArch(): string { return currentArch; }
export function getCurrentMode(): "user" | "kernel" { return currentMode; }

export async function getAvailableDatasets(): Promise<string[]> {
  const datasets: string[] = [];
  for (const ds of ["winsdk", "phnt"]) {
    for (const arch of ["amd64", "x86", "arm", "arm64"]) {
      if (await dataPathExists(`data/${ds}/${arch}`)) { datasets.push(ds); break; }
    }
    if (!datasets.includes(ds) && await dataPathExists(`data/${ds}`)) datasets.push(ds);
  }
  if (datasets.length === 0) datasets.push("winsdk");
  return datasets;
}

export async function getAvailableArchs(dataset?: string, mode?: "user" | "kernel"): Promise<string[]> {
  const ds = dataset ?? currentDataset;
  const m = mode ?? currentMode;
  const suffix = m === "kernel" ? "-kernel" : "";
  const archs: string[] = [];
  for (const arch of ["amd64", "x86", "arm", "arm64"]) {
    if (await dataPathExists(`data/${ds}${suffix}/${arch}`)) archs.push(arch);
  }
  if (archs.length === 0) archs.push("amd64");
  return archs;
}

export function getFunctions(): Func[] { return funcsData.functions; }
/** All NAMED records (struct + union). Excludes synthetic anon entries. */
export function getTypes(): TypeDef[] { return [...typesByName.values()]; }
export function getTypedefs(): Typedef[] { return typesData.typedefs ?? []; }
export function getConstants(): Constant[] { return constsData.constants; }
export function getEnums(): EnumDef[] { return constsData.enums; }
export function getXRef(): XRefIndex { return xref; }
export function getAllHeaders(): string[] { return [...allHeaders].sort(); }

export function hasType(name: string): boolean { return typesByName.has(name) || aliasToDecl.has(name); }
export function hasTypedef(name: string): boolean { return typedefsByName.has(name); }
export function hasConst(name: string): boolean { return constSet.has(name); }
export function hasEnum(name: string): boolean { return enumSet.has(name); }
export function isKnownName(name: string): boolean { return knownNames.has(name); }

/** Look up a record by its decl name, or by an alias name. Returns null otherwise. */
export function findType(name: string): TypeDef | undefined {
  return typesByName.get(name) ?? typesByName.get(aliasToDecl.get(name) ?? "");
}

export function findTypedef(name: string): Typedef | undefined {
  return typedefsByName.get(name);
}

/** Look up an anonymous record by its (enclosing_record, field_path) ref. */
export function findAnon(enclosing: string, path: string[]): TypeDef | undefined {
  return anonByRef.get(anonKey(enclosing, path));
}

export type NameResolution =
  | { kind: "type"; type: TypeDef; canonical: string }
  | { kind: "typedef"; typedef: Typedef };

/** Unified resolution: prefer record, then typedef. Used by /types/:name. */
export function resolveTypeOrTypedef(name: string): NameResolution | undefined {
  const td = typesByName.get(name);
  if (td) return { kind: "type", type: td, canonical: name };
  const t = typedefsByName.get(name);
  if (t) return { kind: "typedef", typedef: t };
  const alias = aliasToDecl.get(name);
  if (alias) {
    const aliased = typesByName.get(alias);
    if (aliased) return { kind: "type", type: aliased, canonical: alias };
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

/** Resolve a raw token to a canonical name suitable for linking. Returns the
 *  decl name for records, the typedef name itself for typedefs (since typedefs
 *  are first-class navigable), or null for unknowns and primitives. */
export function canonicalTypeName(token: string): string | null {
  if (typesByName.has(token)) return token;
  if (typedefsByName.has(token)) return token;
  const aliased = aliasToDecl.get(token);
  if (aliased) return aliased;
  return null;
}

/** Resolution result for a token appearing inside a C type string. */
export type LinkResolution =
  | { kind: "type"; canonical: string }
  | { kind: "typedef"; canonical: string }
  | { kind: "enum"; canonical: string };

/** Resolve a token for type-string linking. Tries records, typedefs (record
 *  aliases first), then enums (and their typedef aliases). */
export function resolveLinkName(token: string): LinkResolution | null {
  if (typesByName.has(token)) return { kind: "type", canonical: token };
  const aliased = aliasToDecl.get(token);
  if (aliased) return { kind: "type", canonical: aliased };
  if (typedefsByName.has(token)) return { kind: "typedef", canonical: token };
  if (enumsByName.has(token)) return { kind: "enum", canonical: token };
  const enumAlias = enumAliasToDecl.get(token);
  if (enumAlias) return { kind: "enum", canonical: enumAlias };
  return null;
}

export interface SearchHit { kind: string; name: string }

export function searchAll(query: string, limit = 20): SearchHit[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const results: Array<SearchHit & { score: number }> = [];

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
  for (const t of typesByName.values()) {
    if (isAnonName(t.name)) continue;
    const s = score(t.name);
    if (s > 0) results.push({ kind: "type", name: t.name, score: s });
  }
  for (const td of typedefsByName.values()) {
    if (isAnonName(td.name)) continue;
    const s = score(td.name);
    if (s > 0) results.push({ kind: "typedef", name: td.name, score: s });
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

export function findSimilarNames(query: string, limit = 5): SearchHit[] {
  const q = query.toLowerCase();
  const maxDist = Math.max(5, Math.floor(q.length * 0.4));
  const candidates: Array<SearchHit & { dist: number }> = [];

  const check = (name: string, kind: string) => {
    if (isAnonName(name)) return;
    const d = levenshtein(q, name.toLowerCase());
    if (d > 0 && d <= maxDist) candidates.push({ kind, name, dist: d });
  };

  for (const f of funcsData.functions) check(f.name, "function");
  for (const t of typesByName.values()) check(t.name, "type");
  for (const t of typedefsByName.values()) check(t.name, "typedef");
  for (const c of constsData.constants) check(c.name, "constant");
  for (const e of constsData.enums) check(e.name, "enum");

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, limit);
}

/** Walk fields, resolving each anonymous-ref entry inline. Visited tracks
 *  named records to short-circuit cycles; anon refs are always followed. */
export interface ResolvedField {
  field: Field;
  /** For anon fields, the resolved anonymous record (with its own fields). */
  anonRecord?: TypeDef;
}

export function resolveFields(td: TypeDef): ResolvedField[] {
  return td.fields.map(f => {
    if (f.is_anonymous && f.anon_ref) {
      const rec = findAnon(f.anon_ref.enclosing_record, f.anon_ref.field_path);
      return { field: f, anonRecord: rec };
    }
    return { field: f };
  });
}
