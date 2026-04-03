import { watch } from "fs";
import { join } from "path";

async function build() {
  const result = await Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: "./public",
    naming: "app.js",
    target: "browser",
    minify: false,
  });
  if (!result.success) {
    console.error("Build failed:");
    for (const msg of result.logs) console.error(msg);
    return false;
  }
  return true;
}

// Initial build
if (!await build()) process.exit(1);
console.log("Initial build done");

// Watch for changes
const srcDir = join(import.meta.dir, "src");
let buildTimeout: ReturnType<typeof setTimeout> | null = null;

watch(srcDir, { recursive: true }, (event, filename) => {
  if (!filename?.endsWith(".ts")) return;
  if (buildTimeout) clearTimeout(buildTimeout);
  buildTimeout = setTimeout(async () => {
    console.log(`Rebuilding (${filename} changed)...`);
    if (await build()) console.log("Rebuilt successfully");
  }, 100);
});

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Serve data files
    if (path.startsWith("/data/")) {
      const filePath = join(import.meta.dir, path);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const ext = path.substring(path.lastIndexOf("."));
        return new Response(file, {
          headers: {
            "Content-Type": MIME[ext] ?? "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Serve static files from public/
    if (path === "/") path = "/index.html";
    const filePath = join(import.meta.dir, "public", path);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = path.substring(path.lastIndexOf("."));
      return new Response(file, {
        headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
      });
    }

    // SPA fallback
    return new Response(Bun.file(join(import.meta.dir, "public", "index.html")), {
      headers: { "Content-Type": "text/html" },
    });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
