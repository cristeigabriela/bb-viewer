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
  process.exit(1);
}

console.log("Built app.js successfully");
