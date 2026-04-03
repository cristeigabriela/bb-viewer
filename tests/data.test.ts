import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(import.meta.dir, "..", "data");
const DATASETS = ["winsdk", "phnt"];
const ARCHS = ["amd64"];

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("data files exist and are valid JSON", () => {
  for (const ds of DATASETS) {
    for (const arch of ARCHS) {
      const dir = join(DATA_DIR, ds, arch);

      test(`${ds}/${arch}/funcs.json exists and parses`, () => {
        const path = join(dir, "funcs.json");
        expect(existsSync(path)).toBe(true);
        const data = loadJson(path);
        expect(data).toHaveProperty("functions");
        expect(Array.isArray(data.functions)).toBe(true);
        expect(data.functions.length).toBeGreaterThan(100);
      });

      test(`${ds}/${arch}/types.json exists and parses`, () => {
        const path = join(dir, "types.json");
        expect(existsSync(path)).toBe(true);
        const data = loadJson(path);
        expect(data).toHaveProperty("types");
        expect(Array.isArray(data.types)).toBe(true);
        expect(data.types.length).toBeGreaterThan(100);
      });

      test(`${ds}/${arch}/consts.json exists and parses`, () => {
        const path = join(dir, "consts.json");
        expect(existsSync(path)).toBe(true);
        const data = loadJson(path);
        expect(data).toHaveProperty("constants");
        expect(data).toHaveProperty("enums");
        expect(data.constants.length).toBeGreaterThan(100);
      });
    }
  }
});

describe("funcs.json schema", () => {
  const data = loadJson(join(DATA_DIR, "winsdk", "amd64", "funcs.json"));

  test("functions have required fields", () => {
    for (const fn of data.functions.slice(0, 50)) {
      expect(fn).toHaveProperty("name");
      expect(fn).toHaveProperty("params");
      expect(fn).toHaveProperty("return_type");
      expect(fn).toHaveProperty("arch");
      expect(fn).toHaveProperty("calling_convention");
      expect(fn).toHaveProperty("location");
      expect(fn).toHaveProperty("is_dllimport");
      expect(typeof fn.name).toBe("string");
      expect(Array.isArray(fn.params)).toBe(true);
    }
  });

  test("params have new fields (pointer_depth, is_pointer, etc)", () => {
    const withParams = data.functions.find((f: any) => f.params.length > 0);
    expect(withParams).toBeTruthy();
    const p = withParams.params[0];
    expect(p).toHaveProperty("pointer_depth");
    expect(p).toHaveProperty("is_pointer");
    expect(p).toHaveProperty("is_const");
    expect(p).toHaveProperty("is_array");
    expect(p).toHaveProperty("is_function_pointer");
    expect(p).toHaveProperty("is_volatile");
    expect(p).toHaveProperty("is_restrict");
    expect(typeof p.pointer_depth).toBe("number");
  });

  test("pointer_depth values are reasonable", () => {
    let maxDepth = 0;
    for (const fn of data.functions) {
      for (const p of fn.params) {
        if (p.pointer_depth > maxDepth) maxDepth = p.pointer_depth;
        expect(p.pointer_depth ?? 0).toBeGreaterThanOrEqual(0);
        expect(p.pointer_depth ?? 0).toBeLessThan(10);
      }
    }
    expect(maxDepth).toBeGreaterThan(0); // at least some pointers
  });

  test("some params have underlying_type", () => {
    let count = 0;
    for (const fn of data.functions) {
      for (const p of fn.params) {
        if (p.underlying_type) count++;
      }
    }
    expect(count).toBeGreaterThan(100);
  });

  test("metadata has min_client/min_server for dllimport functions", () => {
    const withMeta = data.functions.filter((f: any) => f.metadata);
    expect(withMeta.length).toBeGreaterThan(100);
    const withClient = withMeta.filter((f: any) => f.metadata.min_client);
    expect(withClient.length).toBeGreaterThan(100);
  });

  test("well-known functions exist", () => {
    const names = new Set(data.functions.map((f: any) => f.name));
    expect(names.has("CreateFileW")).toBe(true);
    expect(names.has("CloseHandle")).toBe(true);
    expect(names.has("ReadFile")).toBe(true);
    expect(names.has("VirtualAlloc")).toBe(true);
  });
});

describe("types.json schema", () => {
  const data = loadJson(join(DATA_DIR, "winsdk", "amd64", "types.json"));

  test("types have required fields", () => {
    for (const t of data.types.slice(0, 50)) {
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("fields");
      expect(t).toHaveProperty("location");
      expect(typeof t.name).toBe("string");
      expect(Array.isArray(t.fields)).toBe(true);
    }
  });

  test("fields have new attributes", () => {
    const withFields = data.types.find((t: any) => t.fields.length > 0);
    expect(withFields).toBeTruthy();
    const f = withFields.fields[0];
    expect(f).toHaveProperty("is_array");
    expect(f).toHaveProperty("is_const");
    expect(f).toHaveProperty("is_pointer");
  });

  test("array fields have array_size", () => {
    let found = false;
    for (const t of data.types) {
      for (const f of t.fields) {
        if (f.is_array) {
          expect(f.array_size).toBeGreaterThan(0);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  test("well-known types exist", () => {
    const names = new Set(data.types.map((t: any) => t.name));
    expect(names.has("_GUID")).toBe(true);
    expect(names.has("_SECURITY_ATTRIBUTES")).toBe(true);
  });
});

describe("consts.json schema", () => {
  const data = loadJson(join(DATA_DIR, "winsdk", "amd64", "consts.json"));

  test("constants have required fields", () => {
    for (const c of data.constants.slice(0, 50)) {
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("value");
      expect(c).toHaveProperty("hex");
      expect(typeof c.name).toBe("string");
    }
  });

  test("some constants have expression field", () => {
    const withExpr = data.constants.filter((c: any) => c.expression);
    expect(withExpr.length).toBeGreaterThan(100);
  });

  test("composed constants have components", () => {
    const composed = data.constants.filter((c: any) => c.components && c.components.length > 0);
    expect(composed.length).toBeGreaterThan(10);
  });

  test("enums have constants array", () => {
    expect(data.enums.length).toBeGreaterThan(10);
    for (const e of data.enums.slice(0, 10)) {
      expect(e).toHaveProperty("name");
      expect(e).toHaveProperty("constants");
      expect(Array.isArray(e.constants)).toBe(true);
    }
  });
});

describe("graph.json", () => {
  test("exists and has nodes/edges", () => {
    const path = join(DATA_DIR, "winsdk", "amd64", "graph.json");
    if (!existsSync(path)) return; // skip if not generated
    const data = loadJson(path);
    expect(data).toHaveProperty("nodes");
    expect(data).toHaveProperty("edges");
    expect(data.nodes.length).toBeGreaterThan(100);
    expect(data.edges.length).toBeGreaterThan(100);
  });

  test("nodes have precomputed positions", () => {
    const path = join(DATA_DIR, "winsdk", "amd64", "graph.json");
    if (!existsSync(path)) return;
    const data = loadJson(path);
    const node = data.nodes[0];
    expect(node).toHaveProperty("x");
    expect(node).toHaveProperty("y");
    expect(node).toHaveProperty("id");
    expect(node).toHaveProperty("degree");
    expect(typeof node.x).toBe("number");
    expect(typeof node.y).toBe("number");
  });
});
