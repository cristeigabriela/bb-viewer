import { describe, test, expect } from "bun:test";
import { matchQuery, levenshtein } from "../src/utils";

describe("matchQuery", () => {
  test("empty query matches everything", () => {
    expect(matchQuery("anything", "", false)).toBe(true);
  });

  test("substring match (no wildcards, no regex)", () => {
    expect(matchQuery("NtCreateFile", "Create", false)).toBe(true);
    expect(matchQuery("NtCreateFile", "create", false)).toBe(true); // case-insensitive
    expect(matchQuery("NtCreateFile", "Delete", false)).toBe(false);
  });

  test("? without * auto-wraps for contains matching", () => {
    // Nt?lose (only ?) → auto-wrapped to *Nt?lose* → matches _NtClose
    expect(matchQuery("NtClose", "Nt?lose", false)).toBe(true);
    expect(matchQuery("_NtClose", "Nt?lose", false)).toBe(true);
  });

  test("explicit * anchoring is respected (no auto-wrap)", () => {
    // *NtClose — ends with NtClose
    expect(matchQuery("NtClose", "*NtClose", false)).toBe(true);
    expect(matchQuery("NtCloseHandle", "*NtClose", false)).toBe(false); // doesn't end with NtClose
    // NtCreate* — starts with NtCreate
    expect(matchQuery("NtCreateFile", "NtCreate*", false)).toBe(true);
    expect(matchQuery("_NtCreateFile", "NtCreate*", false)).toBe(false); // doesn't start with NtCreate
  });

  test("glob with * on both sides works as contains", () => {
    expect(matchQuery("NtCreateFile", "*Create*", false)).toBe(true);
    expect(matchQuery("NtCreateFile", "*Delete*", false)).toBe(false);
    expect(matchQuery("_KUSER_SHARED_DATA", "*kuser*", false)).toBe(true);
  });

  test("regex mode", () => {
    expect(matchQuery("NtCreateFile", "Nt.*File", true)).toBe(true);
    expect(matchQuery("NtCreateFile", "^NtCreate", true)).toBe(true);
    expect(matchQuery("NtCreateFile", "^Create", true)).toBe(false);
  });

  test("invalid regex returns false", () => {
    expect(matchQuery("anything", "[invalid", true)).toBe(false);
  });
});

describe("levenshtein", () => {
  test("identical strings have distance 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  test("empty vs non-empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  test("single character changes", () => {
    expect(levenshtein("cat", "bat")).toBe(1); // substitution
    expect(levenshtein("cat", "cats")).toBe(1); // insertion
    expect(levenshtein("cats", "cat")).toBe(1); // deletion
  });

  test("realistic type name typos", () => {
    expect(levenshtein("KUSER_SHARED", "KUSER_SHARED_DATA")).toBe(5);
    expect(levenshtein("NtClose", "NtClos")).toBe(1);
    expect(levenshtein("CreateFileW", "CreateFile")).toBe(1);
  });

  test("case sensitive", () => {
    expect(levenshtein("ABC", "abc")).toBe(3);
  });
});
