import { describe, test, expect } from "bun:test";

// Test the injectContext logic directly (same algorithm as router.ts)
// ds/arch are ALWAYS injected — no default-omission.
function injectContext(
  raw: string,
  currentDs: string,
  currentArch: string,
): string {
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs ?? "");
  if (!params.has("ds")) params.set("ds", currentDs);
  if (!params.has("arch")) params.set("arch", currentArch);
  return `${path}?${params}`;
}

describe("injectContext", () => {
  test("always includes ds and arch, even for defaults", () => {
    const result = injectContext("/types", "winsdk", "amd64");
    expect(result).toContain("ds=winsdk");
    expect(result).toContain("arch=amd64");
  });

  test("injects non-default ds", () => {
    const result = injectContext("/types", "phnt", "amd64");
    expect(result).toContain("ds=phnt");
    expect(result).toContain("arch=amd64");
  });

  test("injects non-default arch", () => {
    const result = injectContext("/types", "winsdk", "x86");
    expect(result).toContain("ds=winsdk");
    expect(result).toContain("arch=x86");
  });

  test("injects both when both non-default", () => {
    const result = injectContext("/functions", "phnt", "arm64");
    expect(result).toContain("ds=phnt");
    expect(result).toContain("arch=arm64");
  });

  test("preserves existing query params", () => {
    const result = injectContext("/functions?q=Create", "phnt", "amd64");
    expect(result).toContain("q=Create");
    expect(result).toContain("ds=phnt");
    expect(result).toContain("arch=amd64");
  });

  test("does not duplicate existing ds param", () => {
    const result = injectContext("/types?ds=phnt", "phnt", "amd64");
    const matches = result.match(/ds=/g);
    expect(matches?.length).toBe(1);
  });

  test("does not duplicate existing arch param", () => {
    const result = injectContext("/types?arch=x86", "winsdk", "x86");
    const matches = result.match(/arch=/g);
    expect(matches?.length).toBe(1);
  });

  test("does not override caller-provided ds with current", () => {
    const result = injectContext("/types?ds=winsdk", "phnt", "amd64");
    expect(result).toContain("ds=winsdk");
    expect(result).not.toContain("ds=phnt");
  });
});

describe("query param round-trip (spaces and special chars)", () => {
  function parseQuery(qs: string): Record<string, string> {
    const params: Record<string, string> = {};
    if (!qs) return params;
    for (const [k, v] of new URLSearchParams(qs)) params[k] = v;
    return params;
  }

  test("spaces survive inject → parse round-trip", () => {
    const injected = injectContext("/functions?minClient=Windows%2010", "phnt", "amd64");
    const [, qs] = injected.split("?");
    const parsed = parseQuery(qs);
    expect(parsed.minClient).toBe("Windows 10");
    expect(parsed.ds).toBe("phnt");
  });

  test("special chars survive round-trip", () => {
    const injected = injectContext("/functions?q=Nt%3FCreate*", "phnt", "x86");
    const [, qs] = injected.split("?");
    const parsed = parseQuery(qs);
    expect(parsed.q).toBe("Nt?Create*");
    expect(parsed.ds).toBe("phnt");
    expect(parsed.arch).toBe("x86");
  });

  test("non-breaking space in version strings", () => {
    const injected = injectContext("/functions?minClient=Windows%C2%A02000", "winsdk", "amd64");
    const [, qs] = injected.split("?");
    const parsed = parseQuery(qs);
    expect(parsed.minClient).toBe("Windows\u00a02000");
  });

  test("empty query string returns empty object", () => {
    expect(parseQuery("")).toEqual({});
  });
});

describe("dispatch ds/arch resolution", () => {
  function resolveFromUrl(query: Record<string, string>) {
    const effectiveDs = (query.ds ?? "winsdk") as string;
    const effectiveArch = query.arch ?? "amd64";
    return { ds: effectiveDs, arch: effectiveArch };
  }

  test("absent params default to winsdk/amd64", () => {
    const { ds, arch } = resolveFromUrl({});
    expect(ds).toBe("winsdk");
    expect(arch).toBe("amd64");
  });

  test("explicit ds is respected", () => {
    const { ds } = resolveFromUrl({ ds: "phnt" });
    expect(ds).toBe("phnt");
  });

  test("explicit arch is respected", () => {
    const { arch } = resolveFromUrl({ arch: "x86" });
    expect(arch).toBe("x86");
  });

  test("both explicit", () => {
    const { ds, arch } = resolveFromUrl({ ds: "phnt", arch: "arm64" });
    expect(ds).toBe("phnt");
    expect(arch).toBe("arm64");
  });
});
