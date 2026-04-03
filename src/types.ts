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
}

export interface ParamValue {
  source: Location;
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
  underlying_type?: string;
  values: Record<string, ParamValue>;
}

export interface FuncMetadata {
  dll: string | null;
  lib: string | null;
  locations: string[];
  min_client: string | null;
  min_server: string | null;
  variants: string[];
}

export interface Func {
  arch: string;
  calling_convention: string;
  has_body: boolean;
  is_dllimport: boolean;
  location: Location;
  metadata: FuncMetadata | null;
  name: string;
  params: Param[];
  return_abi: AbiInfo;
  return_location?: Location;
  return_type: string;
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
  type: string;
  underlying_type?: string;
}

export interface TypeDef {
  fields: Field[];
  location: Location;
  name: string;
  size: number | null;
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
}

export interface ConstsData {
  command: string;
  constants: Constant[];
  enums: EnumDef[];
  referred_components: Constant[];
}

export interface XRefIndex {
  typeToFuncParams: Map<string, Set<string>>;
  typeToFuncReturns: Map<string, Set<string>>;
  typeToParentTypes: Map<string, Set<string>>;
  constToFunctions: Map<string, Set<string>>;
  constToConsts: Map<string, Set<string>>;
  enumForConstant: Map<string, string>;
}
