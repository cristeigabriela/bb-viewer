export interface Location {
  column: number;
  file: string | null;
  line: number;
}

export interface AbiInfo {
  kind: "reg" | "stack" | "indirect" | "void";
  register?: string;
  size?: number;
  offset?: number;
  base?: string;
}

export interface ParamValue {
  source: Location;
  value?: number;
}

export interface Param {
  abi: AbiInfo;
  array_size?: number;
  directions: string[];
  index: number;
  is_array: boolean;
  is_const: boolean;
  is_function_pointer: boolean;
  is_pointer: boolean;
  is_restrict: boolean;
  is_volatile: boolean;
  location: Location;
  name: string | null;
  pointer_depth: number;
  type: string;
  /** Terminal primitive at the bottom of the canonical chain (void, unsigned long, ...).
   *  Absent when the leaf is a record — use underlying_record instead. */
  underlying_type?: string;
  /** Record/enum decl name after one level of pointer/array indirection (post bb PR #25). */
  underlying_record?: string;
  values: Record<string, ParamValue>;
}

export interface FuncMetadata {
  dll: string | null;
  lib: string | null;
  locations: string[];
  min_client: string | null;
  min_server: string | null;
  variants: string[];
  /** Which sparse dataset enriched this entry (post bb PR #21). */
  source?: "sdk" | "driver";
}

/** Parsed IRQL constraint. `op === null` means bare/exact-level. */
export interface IrqlConstraint {
  level: string;
  op: "<" | "<=" | "=" | "==" | ">=" | ">" | null;
}

/** Kernel/driver-specific metadata from windows-driver-docs-ddi (post bb PR #26). */
export interface DriverMetadata {
  construct_type: string | null;
  include_header: string | null;
  irql: IrqlConstraint | null;
  irql_raw: string | null;
  kmdf_ver: string | null;
  umdf_ver: string | null;
  target_type: string | null;
  tech_root: string | null;
}

export interface Func {
  arch: string;
  calling_convention: string;
  has_body: boolean;
  is_dllimport: boolean;
  location: Location;
  metadata: FuncMetadata | null;
  driver?: DriverMetadata | null;
  name: string;
  params: Param[];
  return_abi: AbiInfo;
  return_location?: unknown;
  return_type: string;
}

/** Reference from an anonymous record sub-decl back to its entry in
 *  TypesData.referenced_types. Key = (enclosing_record, field_path). */
export interface AnonRef {
  kind: "struct" | "union";
  enclosing_record: string;
  field_path: string[];
}

export interface Field {
  alignment: number;
  is_array: boolean;
  array_size?: number;
  is_const: boolean;
  is_function_pointer: boolean;
  is_pointer: boolean;
  is_restrict: boolean;
  is_volatile: boolean;
  location: Location;
  name: string;
  offset: number;
  offset_bits: number;
  pointer_depth: number;
  size: number;
  /** May be null for synthetic anonymous-record entries (then anon_ref is set). */
  type: string | null;
  underlying_type?: string;
  underlying_record?: string;
  /** True for synthetic <anonymous_N> entries that point at a sibling anon record. */
  is_anonymous?: boolean;
  anon_ref?: AnonRef;
}

export interface TypeDef {
  fields: Field[];
  location: Location;
  name: string;
  size: number | null;
  /** "struct" or "union". Older data may omit; treat missing as "struct". */
  kind?: "struct" | "union";
  /** Typedef alias names (e.g. ["OVERLAPPED"] on _OVERLAPPED). */
  aliases?: string[];
  /** Anonymous-record metadata (only set on entries in TypesData.referenced_types). */
  is_anonymous?: boolean;
  enclosing_record?: string;
  field_path?: string[];
}

/** Classification of a typedef's target. */
export type TypedefKind =
  | "struct" | "union" | "enum"
  | "pointer" | "function_pointer"
  | "array" | "primitive"
  | "other";

export interface Typedef {
  name: string;
  /** Each step of the typedef chain (display order, leaf last). */
  chain: string[];
  /** Final type written out (e.g. "void *", "unsigned long", "_OVERLAPPED"). */
  canonical: string;
  /** When chain bottoms out in a record, the decl name (e.g. "_OVERLAPPED"). */
  canonical_decl_name?: string;
  kind: TypedefKind;
  is_array: boolean;
  is_const: boolean;
  is_function_pointer: boolean;
  is_pointer: boolean;
  is_restrict: boolean;
  is_volatile: boolean;
  pointer_depth: number;
  location: Location;
  underlying_type?: string;
  underlying_record?: string;
}

export interface Constant {
  components?: string[];
  expression?: string;
  hex: string;
  location: Location;
  name: string;
  value: number;
  type?: string;
}

export interface EnumDef {
  constants: Constant[];
  location: Location;
  name: string;
  type: string | null;
}

export interface FuncsData {
  command: string;
  functions: Func[];
}

export interface TypesData {
  command: string;
  referenced_types: TypeDef[];
  types: TypeDef[];
  /** Post bb PR #25 — first-class typedefs. May be absent in older data. */
  typedefs?: Typedef[];
}

export interface ConstsData {
  command: string;
  constants: Constant[];
  enums: EnumDef[];
  referred_components: Constant[];
}

/** All maps key on the as-written name (type decl name OR typedef name).
 *  Resolution of which kind it is happens at the call site via resolveName(). */
export interface XRefIndex {
  /** name → fn names that take it as a param type */
  nameToFuncParams: Map<string, Set<string>>;
  /** name → fn names that return it */
  nameToFuncReturns: Map<string, Set<string>>;
  /** name → record names whose fields reference it */
  nameToParentTypes: Map<string, Set<string>>;
  constToFunctions: Map<string, Set<string>>;
  constToConsts: Map<string, Set<string>>;
  enumForConstant: Map<string, string>;
}
