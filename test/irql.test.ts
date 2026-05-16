import { describe, test, expect } from "bun:test";
import {
  IRQL_LEVELS,
  isNumericLevel,
  parseIrqlExpr,
  constraintRange,
  irqlMatches,
  formatIrql,
  irqlSeverityClass,
} from "../src/irql";

describe("parseIrqlExpr", () => {
  test("bare LEVEL", () => {
    expect(parseIrqlExpr("PASSIVE_LEVEL")).toEqual({ op: null, level: "PASSIVE_LEVEL" });
    expect(parseIrqlExpr("dispatch_level")).toEqual({ op: null, level: "DISPATCH_LEVEL" });
  });
  test("op + LEVEL with whitespace", () => {
    expect(parseIrqlExpr("<= DISPATCH_LEVEL")).toEqual({ op: "<=", level: "DISPATCH_LEVEL" });
    expect(parseIrqlExpr(">=PASSIVE_LEVEL")).toEqual({ op: ">=", level: "PASSIVE_LEVEL" });
    expect(parseIrqlExpr(" > APC_LEVEL ")).toEqual({ op: ">", level: "APC_LEVEL" });
  });
  test("all operators", () => {
    for (const op of ["<", "<=", "=", "==", ">=", ">"] as const) {
      expect(parseIrqlExpr(`${op} HIGH_LEVEL`)).toEqual({ op, level: "HIGH_LEVEL" });
    }
  });
  test("rejects malformed input", () => {
    expect(parseIrqlExpr("")).toBeNull();
    expect(parseIrqlExpr("PASSIVE LEVEL")).toBeNull(); // space inside level
    expect(parseIrqlExpr("? DISPATCH_LEVEL")).toBeNull();
    expect(parseIrqlExpr("<<< DISPATCH_LEVEL")).toBeNull();
  });
});

describe("isNumericLevel", () => {
  test("known numeric levels", () => {
    expect(isNumericLevel("PASSIVE_LEVEL")).toBe(true);
    expect(isNumericLevel("APC_LEVEL")).toBe(true);
    expect(isNumericLevel("DISPATCH_LEVEL")).toBe(true);
    expect(isNumericLevel("DPC_LEVEL")).toBe(true);
    expect(isNumericLevel("HIGH_LEVEL")).toBe(true);
    expect(isNumericLevel("IPI_LEVEL")).toBe(true);
  });
  test("non-numeric levels", () => {
    expect(isNumericLevel("DEVICE_LEVEL")).toBe(false);
    expect(isNumericLevel("DIRQL")).toBe(false);
    expect(isNumericLevel("ANY")).toBe(false);
    expect(isNumericLevel("BOGUS")).toBe(false);
  });
  test("level values match bb's macro-preprocessed TU", () => {
    expect(IRQL_LEVELS.PASSIVE_LEVEL).toBe(0);
    expect(IRQL_LEVELS.APC_LEVEL).toBe(1);
    expect(IRQL_LEVELS.DISPATCH_LEVEL).toBe(2);
    expect(IRQL_LEVELS.DPC_LEVEL).toBe(2);
    expect(IRQL_LEVELS.HIGH_LEVEL).toBe(31);
  });
});

describe("constraintRange", () => {
  test("bare = exact point range", () => {
    expect(constraintRange({ op: null, level: "PASSIVE_LEVEL" })).toEqual([0, 0]);
    expect(constraintRange({ op: null, level: "DISPATCH_LEVEL" })).toEqual([2, 2]);
    expect(constraintRange({ op: "=", level: "APC_LEVEL" })).toEqual([1, 1]);
  });
  test(">= LEVEL extends to HIGH", () => {
    expect(constraintRange({ op: ">=", level: "PASSIVE_LEVEL" })).toEqual([0, 31]);
    expect(constraintRange({ op: ">=", level: "DISPATCH_LEVEL" })).toEqual([2, 31]);
  });
  test("<= LEVEL anchors at 0", () => {
    expect(constraintRange({ op: "<=", level: "DISPATCH_LEVEL" })).toEqual([0, 2]);
    expect(constraintRange({ op: "<=", level: "PASSIVE_LEVEL" })).toEqual([0, 0]);
  });
  test("strict > / < shift by 1", () => {
    expect(constraintRange({ op: ">", level: "PASSIVE_LEVEL" })).toEqual([1, 31]);
    expect(constraintRange({ op: "<", level: "DISPATCH_LEVEL" })).toEqual([0, 1]);
  });
  test("non-numeric levels return null", () => {
    expect(constraintRange({ op: null, level: "DEVICE_LEVEL" })).toBeNull();
    expect(constraintRange({ op: "<=", level: "DIRQL" })).toBeNull();
  });
});

/* The truth table from bb PR #26 that the matcher must reproduce. */
describe("irqlMatches (PR #26 truth table)", () => {
  const filter = { op: ">", level: "PASSIVE_LEVEL" } as const;

  test("bare DISPATCH (range [2,2]) > PASSIVE → match", () => {
    expect(irqlMatches(filter, { op: null, level: "DISPATCH_LEVEL" })).toBe(true);
  });
  test(">= DISPATCH (range [2,31]) > PASSIVE → match", () => {
    expect(irqlMatches(filter, { op: ">=", level: "DISPATCH_LEVEL" })).toBe(true);
  });
  test("<= DISPATCH (range [0,2]) > PASSIVE → NO match (regression case)", () => {
    expect(irqlMatches(filter, { op: "<=", level: "DISPATCH_LEVEL" })).toBe(false);
  });
  test("= PASSIVE (range [0,0]) > PASSIVE → NO match", () => {
    expect(irqlMatches(filter, { op: "=", level: "PASSIVE_LEVEL" })).toBe(false);
  });
});

describe("irqlMatches — reachability semantics", () => {
  const at = { op: null, level: "APC_LEVEL" } as const;
  test("bare filter = exact reachability of that level", () => {
    expect(irqlMatches(at, { op: "<=", level: "DISPATCH_LEVEL" })).toBe(true);  // [0,2] reaches 1
    expect(irqlMatches(at, { op: ">=", level: "DISPATCH_LEVEL" })).toBe(false); // [2,31] doesn't reach 1
    expect(irqlMatches(at, { op: null, level: "APC_LEVEL" })).toBe(true);
    expect(irqlMatches(at, { op: null, level: "PASSIVE_LEVEL" })).toBe(false);
  });
});

describe("irqlMatches — <=, >=, < edge cases", () => {
  test("<= filter passes when fnMax ≤ filter level", () => {
    const filter = { op: "<=", level: "DISPATCH_LEVEL" } as const;
    expect(irqlMatches(filter, { op: null, level: "PASSIVE_LEVEL" })).toBe(true);   // [0,0] ≤ 2
    expect(irqlMatches(filter, { op: null, level: "DISPATCH_LEVEL" })).toBe(true);  // [2,2] ≤ 2
    expect(irqlMatches(filter, { op: ">=", level: "DISPATCH_LEVEL" })).toBe(false); // [2,31] !≤ 2
  });
  test("< filter is strict", () => {
    const filter = { op: "<", level: "DISPATCH_LEVEL" } as const;
    expect(irqlMatches(filter, { op: null, level: "PASSIVE_LEVEL" })).toBe(true);   // [0,0] < 2
    expect(irqlMatches(filter, { op: null, level: "APC_LEVEL" })).toBe(true);       // [1,1] < 2
    expect(irqlMatches(filter, { op: null, level: "DISPATCH_LEVEL" })).toBe(false); // [2,2] !< 2
  });
  test("non-numeric function constraint → no match (filtered out)", () => {
    const filter = { op: "<=", level: "DISPATCH_LEVEL" } as const;
    expect(irqlMatches(filter, { op: null, level: "DEVICE_LEVEL" })).toBe(false);
    expect(irqlMatches(filter, null)).toBe(false);
    expect(irqlMatches(filter, undefined)).toBe(false);
  });
  test("non-numeric filter → no match (per CLI semantics)", () => {
    const filter = { op: "<=", level: "DIRQL" } as const;
    expect(irqlMatches(filter, { op: null, level: "DISPATCH_LEVEL" })).toBe(false);
  });
});

describe("formatIrql", () => {
  test("bare level", () => {
    expect(formatIrql({ op: null, level: "PASSIVE_LEVEL" })).toBe("PASSIVE_LEVEL");
  });
  test("op + level", () => {
    expect(formatIrql({ op: "<=", level: "DISPATCH_LEVEL" })).toBe("<= DISPATCH_LEVEL");
    expect(formatIrql({ op: ">", level: "APC_LEVEL" })).toBe("> APC_LEVEL");
  });
});

describe("irqlSeverityClass", () => {
  test("buckets levels by severity for UI coloring", () => {
    expect(irqlSeverityClass({ op: null, level: "PASSIVE_LEVEL" })).toBe("irql-passive");
    expect(irqlSeverityClass({ op: null, level: "APC_LEVEL" })).toBe("irql-apc");
    expect(irqlSeverityClass({ op: null, level: "DISPATCH_LEVEL" })).toBe("irql-dispatch");
    expect(irqlSeverityClass({ op: null, level: "DPC_LEVEL" })).toBe("irql-dispatch");
    expect(irqlSeverityClass({ op: null, level: "HIGH_LEVEL" })).toBe("irql-high");
  });
  test("unknown levels fall through", () => {
    expect(irqlSeverityClass({ op: null, level: "DEVICE_LEVEL" })).toBe("irql-unknown");
  });
});
