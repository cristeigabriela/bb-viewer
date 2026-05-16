/**
 * IRQL filter expression parsing + range-based matching.
 *
 * Ports the semantics that `bb-funcs --irql` uses (see bb PR #26): a function's
 * documented IRQL constraint resolves to a callable range [min, max]; a user
 * filter expresses a comparison the function's range must satisfy. Bare LEVEL
 * (no operator) is treated as exact reachability of that level.
 *
 *   filter             function constraint                  matches when
 *   ─────────────────  ──────────────────────────────────   ────────────────────
 *   PASSIVE_LEVEL      (any)                                fnMin ≤ 0 ≤ fnMax
 *   <= DISPATCH_LEVEL  (any)                                fnMax ≤ 2
 *   > PASSIVE_LEVEL    `<= DISPATCH_LEVEL` → [0, 2]         fnMin > 0  →  false
 *   > PASSIVE_LEVEL    bare `DISPATCH_LEVEL` → [2, 2]       fnMin > 0  →  true
 */

import type { IrqlConstraint } from "./types";

export type IrqlOp = "<" | "<=" | "=" | "==" | ">=" | ">" | null;

export interface IrqlExpr {
  op: IrqlOp;
  level: string;
}

/** Numeric resolution of symbolic IRQL levels (matches bb's macro-preprocessed TU). */
export const IRQL_LEVELS: Record<string, number> = {
  PASSIVE_LEVEL: 0,
  APC_LEVEL: 1,
  DISPATCH_LEVEL: 2,
  DPC_LEVEL: 2,
  HIGH_LEVEL: 31,
  IPI_LEVEL: 31,
};

export function isNumericLevel(level: string): boolean {
  return level.toUpperCase() in IRQL_LEVELS;
}

/** Parse `"<= DISPATCH_LEVEL"`, `"PASSIVE_LEVEL"`, etc. Returns null on parse failure. */
export function parseIrqlExpr(input: string): IrqlExpr | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(<=|>=|==|<|>|=)?\s*([A-Za-z_]+)$/);
  if (!m) return null;
  const op = (m[1] as IrqlOp) ?? null;
  const level = m[2].toUpperCase();
  return { op, level };
}

/** Compute the [min, max] callable range a function's constraint allows.
 *  Returns null for non-numeric levels (DEVICE_LEVEL, DIRQL, ANY). */
export function constraintRange(c: IrqlExpr | IrqlConstraint): [number, number] | null {
  const level = c.level.toUpperCase();
  if (!isNumericLevel(level)) return null;
  const v = IRQL_LEVELS[level];
  switch (c.op) {
    case null:
    case undefined:
    case "=":
    case "==": return [v, v];
    case ">=": return [v, 31];
    case ">":  return v >= 31 ? null : [v + 1, 31];
    case "<=": return [0, v];
    case "<":  return v <= 0 ? null : [0, v - 1];
    default:   return [v, v];
  }
}

/** Does `fn`'s IRQL constraint satisfy the user's filter expression? */
export function irqlMatches(filter: IrqlExpr, fn: IrqlConstraint | null | undefined): boolean {
  if (!fn) return false;
  if (!isNumericLevel(filter.level)) return false;
  const fnRange = constraintRange(fn);
  if (!fnRange) return false;
  const [fnMin, fnMax] = fnRange;
  const v = IRQL_LEVELS[filter.level.toUpperCase()];
  switch (filter.op) {
    case null:
    case "=":
    case "==": return fnMin <= v && v <= fnMax;
    case "<":  return fnMax < v;
    case "<=": return fnMax <= v;
    case ">":  return fnMin > v;
    case ">=": return fnMin >= v;
  }
}

/** Pretty-print an IRQL expression for chip display. */
export function formatIrql(expr: IrqlExpr | IrqlConstraint): string {
  if (!expr.op) return expr.level;
  return `${expr.op} ${expr.level}`;
}

/** Color class for an IRQL level — green for low (safe), red for high (dangerous). */
export function irqlSeverityClass(expr: IrqlConstraint): string {
  if (!isNumericLevel(expr.level)) return "irql-unknown";
  const v = IRQL_LEVELS[expr.level.toUpperCase()];
  if (v === 0) return "irql-passive";
  if (v <= 1) return "irql-apc";
  if (v <= 2) return "irql-dispatch";
  return "irql-high";
}
