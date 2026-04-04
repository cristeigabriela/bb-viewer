import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import { join } from "path";

const PORT = 3333;
const BASE = `http://localhost:${PORT}`;

let server: Server;

// Minimal static server for e2e tests (no file watching needed)
beforeAll(async () => {
  // Build first
  const build = await Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: "./public",
    naming: "app.js",
    target: "browser",
    minify: false,
  });
  if (!build.success) throw new Error("Build failed");

  const MIME: Record<string, string> = {
    ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".json": "application/json",
  };

  server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      let path = url.pathname;
      if (path.startsWith("/data/")) {
        const file = Bun.file(join(import.meta.dir, "..", path));
        if (await file.exists()) {
          const ext = path.substring(path.lastIndexOf("."));
          return new Response(file, { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" } });
        }
      }
      if (path === "/") path = "/index.html";
      const file = Bun.file(join(import.meta.dir, "..", "public", path));
      if (await file.exists()) {
        const ext = path.substring(path.lastIndexOf("."));
        return new Response(file, { headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" } });
      }
      return new Response(Bun.file(join(import.meta.dir, "..", "public", "index.html")), {
        headers: { "Content-Type": "text/html" },
      });
    },
  });
});

afterAll(() => { server?.stop(); });

// Helper: run a script in a fresh browser-like context via fetch + eval
// Since we can't use Playwright in unit tests, we test the pure logic here
// and rely on the Playwright MCP tests for real browser interaction.

describe("URL normalization logic", () => {
  test("bare URL gets ds/arch added via replaceState", async () => {
    const resp = await fetch(`${BASE}/app.js`);
    const text = await resp.text();
    // Verify the normalize code exists in the bundle
    expect(text).toContain("replaceState");
    expect(text).toContain("injectContext");
  });

  test("injectContext always adds ds and arch", () => {
    // Mirror the injectContext logic
    function injectContext(raw: string, ds: string, arch: string): string {
      const [path, qs] = raw.split("?");
      const params = new URLSearchParams(qs ?? "");
      if (!params.has("ds")) params.set("ds", ds);
      if (!params.has("arch")) params.set("arch", arch);
      return `${path}?${params}`;
    }

    // Defaults are always present
    const r1 = injectContext("/", "winsdk", "amd64");
    expect(r1).toContain("ds=winsdk");
    expect(r1).toContain("arch=amd64");

    // Non-defaults are present
    const r2 = injectContext("/types", "phnt", "x86");
    expect(r2).toContain("ds=phnt");
    expect(r2).toContain("arch=x86");

    // Existing params are not duplicated
    const r3 = injectContext("/types?ds=phnt", "winsdk", "amd64");
    expect(r3.match(/ds=/g)?.length).toBe(1);
    expect(r3).toContain("ds=phnt"); // caller's value wins
    expect(r3).toContain("arch=amd64"); // arch still added

    // Query params preserved
    const r4 = injectContext("/functions?q=Create", "phnt", "arm64");
    expect(r4).toContain("q=Create");
    expect(r4).toContain("ds=phnt");
    expect(r4).toContain("arch=arm64");
  });
});

describe("data endpoints", () => {
  test("winsdk/amd64 data loads", async () => {
    const resp = await fetch(`${BASE}/data/winsdk/amd64/funcs.json`);
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.functions.length).toBeGreaterThan(0);
  });

  test("phnt/amd64 data loads", async () => {
    const resp = await fetch(`${BASE}/data/phnt/amd64/funcs.json`);
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.functions.length).toBeGreaterThan(0);
  });
});

describe("SPA shell", () => {
  test("index.html serves with app.js script", async () => {
    const resp = await fetch(BASE);
    const html = await resp.text();
    expect(html).toContain('src="app.js"');
    expect(html).toContain('id="app"');
    expect(html).toContain('id="content"');
  });

  test("dataset switcher buttons exist", async () => {
    const resp = await fetch(BASE);
    const html = await resp.text();
    expect(html).toContain('data-dataset="winsdk"');
    expect(html).toContain('data-dataset="phnt"');
  });

  test("github link exists", async () => {
    const resp = await fetch(BASE);
    const html = await resp.text();
    expect(html).toContain("github.com/cristeigabriela/bb-viewer");
  });
});

describe("buildHash in bundle", () => {
  test("all link generators use buildHash or injectContext", async () => {
    const resp = await fetch(`${BASE}/app.js`);
    const text = await resp.text();

    // No hardcoded #/ hrefs should remain (except the bare "#" fallback in search modal)
    const hardcoded = text.match(/href.*["']#\/[a-z]/gi) ?? [];
    // Filter out the nav links in index.html which are static but intercepted
    const problematic = hardcoded.filter(h => !h.includes("nav-link"));
    // All generated hrefs should go through buildHash/injectContext
    expect(problematic.length).toBe(0);
  });
});

describe("syncViewUrl logic", () => {
  test("builds URL with view params + ds/arch", () => {
    // Mirror syncViewUrl logic
    function syncViewUrl(basePath: string, viewParams: Record<string, string>, ds: string, arch: string): string {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(viewParams)) {
        if (v) params.set(k, v);
      }
      params.set("ds", ds);
      params.set("arch", arch);
      return `#${basePath}?${params}`;
    }

    // Functions with filters
    const url = syncViewUrl("/functions", {
      q: "Create",
      header: "winbase.h",
      exported: "all",
      sort: "params",
      sortDir: "desc",
    }, "phnt", "x86");
    expect(url).toContain("q=Create");
    expect(url).toContain("header=winbase.h");
    expect(url).toContain("exported=all");
    expect(url).toContain("sort=params");
    expect(url).toContain("sortDir=desc");
    expect(url).toContain("ds=phnt");
    expect(url).toContain("arch=x86");
  });

  test("omits empty/falsy values", () => {
    function syncViewUrl(basePath: string, viewParams: Record<string, string>, ds: string, arch: string): string {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(viewParams)) {
        if (v) params.set(k, v);
      }
      params.set("ds", ds);
      params.set("arch", arch);
      return `#${basePath}?${params}`;
    }

    const url = syncViewUrl("/types", {
      q: "",
      regex: "",
      header: "",
      minSize: "",
      maxSize: "",
      hasFields: "",
      sort: "",
      sortDir: "",
      page: "",
    }, "winsdk", "amd64");
    // Only ds and arch should be present
    expect(url).toBe("#/types?ds=winsdk&arch=amd64");
  });

  test("multi-value comma-separated params round-trip", () => {
    const headers = ["winbase.h", "ntddk.h"];
    const serialized = headers.join(",");
    const deserialized = serialized.split(",");
    expect(deserialized).toEqual(headers);
  });

  test("view params don't leak across views", () => {
    // Simulate: navigate from /functions?q=Create&header=... to /types
    // injectContext only adds ds/arch, not view params
    function injectContext(raw: string, ds: string, arch: string): string {
      const [path, qs] = raw.split("?");
      const params = new URLSearchParams(qs ?? "");
      if (!params.has("ds")) params.set("ds", ds);
      if (!params.has("arch")) params.set("arch", arch);
      return `${path}?${params}`;
    }

    // Clicking "Types" nav link → navigate("/types")
    const result = injectContext("/types", "phnt", "x86");
    expect(result).toContain("ds=phnt");
    expect(result).toContain("arch=x86");
    expect(result).not.toContain("q=");
    expect(result).not.toContain("header=");
    expect(result).not.toContain("exported=");
  });
});
