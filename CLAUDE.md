# CLAUDE.md

Instructions for AI assistants working on this project.

## What is bb-viewer?

A vanilla TypeScript SPA that visualizes Windows SDK and PHNT header analysis data produced by [bb](https://github.com/cristeigabriela/bb) v0.3.2+. It shows functions (with ABI layouts, parameter details, MSDN metadata, kernel/driver metadata including IRQL), types (struct **and union** with memory layouts, field tables, nested expansion, anonymous-record inline expansion), typedefs (as first-class navigable entries with chain resolution), constants/enums (including the full `STATUS_*` set from `ntstatus.h`), and a type relationship graph.

Built with Bun. No framework — plain DOM manipulation with a hash-based router.

## Project structure

```
bb-viewer/
├── src/
│   ├── main.ts              # Entry point, route registration
│   ├── router.ts            # Hash-based SPA router
│   ├── data.ts              # Data loading, indexing, xref building, resolver
│   ├── types.ts             # TypeScript interfaces for all data
│   ├── dom.ts               # Core DOM primitives ($, $$, el, clear)
│   ├── utils.ts             # matchQuery (glob/regex), debounce
│   ├── primitives.ts        # KNOWN_PRIMITIVES set — TRUE C primitives only
│   │                        # (Win32 typedefs like HANDLE/DWORD/LPCWSTR are in
│   │                        # typedefsByName, not here)
│   ├── irql.ts              # IRQL filter parsing + range-based matching
│   ├── theme.ts             # Dark/light mode + accent color picker
│   ├── dataset-switcher.ts  # WinSDK/PHNT + architecture + mode switching
│   ├── search-modal.ts      # Global search modal with preview pane
│   ├── clippy.ts            # ASCII art clippy popup (cowsay)
│   ├── ui/
│   │   ├── links.ts         # typeLink, funcLink, enumLink, badge, renderTypeStr, highlightCode
│   │   └── filter-dropdown.ts  # Checkbox filter dropdown widget
│   └── views/
│       ├── shared.ts        # Shared view helpers (sort row, search input, filter chips, pagination, collapsible sections, not-found)
│       ├── home.ts          # Dashboard with stat cards and bar charts
│       ├── functions.ts     # Function list + detail views (kernel filters live here)
│       ├── types.ts         # Type list + detail views — dispatches between record and typedef detail
│       ├── constants.ts     # Constants/enums list + detail views
│       ├── type-graph.ts    # Cytoscape.js type relationship graph
│       └── lookup.ts        # Universal /q/:name lookup
├── public/
│   ├── index.html           # SPA shell
│   ├── styles.css           # All CSS (terminal theme, dark/light, accent colors, IRQL chips)
│   └── app.js               # Built output (generated)
├── test/
│   └── irql.test.ts         # Bun unit tests for IRQL range semantics
├── data/                    # Generated JSON data
│   ├── {winsdk,phnt}[-kernel]/
│   │   └── {amd64,x86,arm,arm64}/
│   │       ├── funcs.json     # Func[] with .driver, .metadata.source
│   │       ├── types.json     # types[] + referenced_types[] (anon) + typedefs[]
│   │       ├── consts.json
│   │       └── graph.json     # Precomputed type graph with positions
├── build.ts                 # Bun bundler config
├── build-graph.ts           # Precomputes type relationship graph (d3-force)
├── serve.ts                 # Dev server with file watching
├── generate-data.ps1        # PowerShell script to regenerate all data
└── package.json
```

## Building

```powershell
bun install
bun run build         # bundle src/ → public/app.js
bun run build:graph   # precompute graph.json files (needs data/ populated)
bun run dev           # dev server with auto-rebuild on localhost:3000
bun test              # run unit tests (currently IRQL parsing/matching)
```

## Generating data

Requires bb v0.3.2+ binaries and Windows SDK installed. Kernel mode additionally needs the WDK (`winget install --exact --id Microsoft.WindowsWDK.10.0.26100`).

```powershell
.\generate-data.ps1                                    # all datasets, all archs, all modes
.\generate-data.ps1 -Dataset phnt                      # only phnt
.\generate-data.ps1 -Arch amd64                        # only amd64
.\generate-data.ps1 -Mode kernel                       # only kernel mode
.\generate-data.ps1 -BbBinDir 'D:\dev\rust\bb\bb\target\debug'  # use local binaries
```

The script auto-detects the Windows SDK path. After generating data, also run `bun run build:graph` to update the type graphs.

**`--struct '*'` is mandatory for bb-types**: without it the `typedefs[]` array only contains record-targeting typedefs (struct/union). Pointer typedefs (HANDLE → void *), primitive typedefs (DWORD → unsigned long), enum typedefs (FILE_INFORMATION_CLASS → _FILE_INFORMATION_CLASS), function-pointer typedefs, and array typedefs are dropped. The script handles this — but if you call bb-types directly, remember the flag.

Note: `bb-funcs --arch arm` and `bb-funcs --arch arm64` will fail (ARM ABI not yet implemented in bb). Types and constants work for all architectures.

## Data flow

1. bb parses C/C++ headers via libclang → outputs JSON (`types.json` has top-level `types`, `referenced_types`, **`typedefs`**)
2. `generate-data.ps1` runs bb for each dataset/arch/mode combo → `data/{dataset}[-kernel]/{arch}/*.json`
3. `build-graph.ts` reads types.json, uses `typedefs[].canonical_decl_name` + per-record aliases for alias→decl mapping (no more `_prefix`/`LP`/`P` heuristics), builds adjacency graph, runs d3-force simulation → `graph.json`
4. Browser loads JSON at runtime, builds indexes and xrefs in `data.ts`

## Key conventions

- **No framework**: All rendering is imperative DOM construction via `el()`, `clear()`, etc.
- **State is local**: Each view function creates its own state as local variables. No module-level state that persists across navigations.
- **Filter dropdowns**: Use `buildFilterDropdown()` from `ui/filter-dropdown.ts` for all multi-select filters. Returns a `{ element, refresh() }` handle.
- **Shared view patterns**: Sort row, search input, filter chips, pagination, collapsible sections, and not-found pages all live in `views/shared.ts`.
- **Non-breaking spaces**: MSDN metadata contains ` ` (non-breaking space) in strings like "Windows 2000". Always normalize with `.replace(/ /g, " ")` before string matching.
- **DLL cleaning**: Use `cleanDll()` from `data.ts` to normalize DLL names (strips parenthetical suffixes and semicolon-separated entries).
- **Primitives list**: `src/primitives.ts` is the single source of truth for TRUE C primitives only (`void`, `int`, `unsigned`, `__int64`, etc.). Win32 typedefs (`HANDLE`, `DWORD`, `LPCWSTR`, `NTSTATUS`, `BOOL`, ...) are intentionally **not** in this set — they flow through the typedef index and are linkable. Shared by `data.ts` (browser) and `build-graph.ts` (build tool).

## Type/typedef/enum resolution model

The data layer maintains four lookup maps:

- `typesByName: Map<string, TypeDef>` — named records (struct + union), keyed by decl name (`_OVERLAPPED`, `_LARGE_INTEGER`, ...)
- `typedefsByName: Map<string, Typedef>` — typedef entries from `typedefs[]` (`OVERLAPPED`, `HANDLE`, `LPCWSTR`, `FILE_INFORMATION_CLASS`, ...)
- `aliasToDecl: Map<string, string>` — alias name → canonical record decl (for typedef aliases of records)
- `enumAliasToDecl: Map<string, string>` — typedef alias → enum decl name (e.g. `FILE_INFORMATION_CLASS` → `_FILE_INFORMATION_CLASS`)
- `anonByRef: Map<string, TypeDef>` — anonymous records keyed by `${enclosing_record}|${field_path.join("/")}`

Three resolver entry points cover all use cases:

- `findType(name)` / `findTypedef(name)` / `findEnum(name)` / `findAnon(enclosing, path)` — direct lookup
- `resolveTypeOrTypedef(name)` — used by `/types/:name`: returns `{kind: "type", type, canonical}` for records (resolving through aliases) or `{kind: "typedef", typedef}` for typedef-only names
- `resolveLinkName(token)` — used by `renderTypeStr` for tokens inside C type strings: returns `{kind: "type"|"typedef"|"enum", canonical}` so the renderer can pick `typeLink` vs `enumLink` for the right URL

## Anonymous records

Bb's PR #25 introduced anonymous nested records (`OVERLAPPED`'s union-of-(struct + Pointer)). They live in `types.referenced_types` with `is_anonymous: true`, `enclosing_record`, and `field_path`. The viewer's invariants:

- **Never name-keyed in the global type map** — `<anonymous_0>` collides across many parents. Stored in `anonByRef` keyed by `(enclosing_record, field_path)`.
- **No global identity** — never appear in search results, are not navigable via `/types/`, no separate detail page. They only render inline inside their parent record.
- **Field table**: collapsed by default with a `▶ anon (anonymous union, N fields)` toggle row. Clicking expands the inner field rows inline at their absolute offsets in the outer record.
- **C codegen**: emitted as `union {…};` / `struct {…};` unnamed members, recursively. Closing `};` carries `/* size: X, align: Y */`. Field offset comments inside use `/* 0xABS | 0xREL */` showing absolute (in outer record) and relative (in immediate anon parent) — top-level fields stay `/* 0xABS */`.

## Kernel-mode UI

Activated when `mode=kernel` is in the URL (the navbar mode toggle injects it). Only the **functions** view changes — types/constants/typedefs are mode-agnostic, but the kernel datasets have different `data/{winsdk,phnt}-kernel/{arch}/*.json` files.

Kernel-only additions on `/functions`:
- **IRQL filter** (`?irql=<= DISPATCH_LEVEL`) — see `src/irql.ts` for the range semantics ported from bb PR #26
- **Tech root / KMDF version / UMDF version** filters
- IRQL severity chip on each row (`tag-irql irql-{passive,apc,dispatch,high,unknown}`)

Kernel-only on `/`:
- Three extra charts inserted right after the "minimum Windows version" / "minimum server version" charts: **Functions by KMDF version**, **Functions by UMDF version**, **Functions by IRQL constraint**

Function detail (`/functions/:name`) always shows a **Driver Metadata** section when `fn.driver` is present, regardless of mode (a function with driver-docs metadata is meaningful even when viewing it through the user-mode SDK lens).

## URL state management

All view state is encoded in the URL hash for shareability and bookmarking.

- **Global params** (`ds`, `arch`, `mode`): Always present in every URL. Managed by `injectContext()` in `router.ts`. A global click interceptor on `document` catches all `<a href="#/...">` clicks and injects these params automatically — so plain `#/types` hrefs work without manual `buildHash()` calls.
- **View-specific params** (filters, sort, page, search query): Only present while that view is active. Each view reads all params on init and calls `syncViewUrl()` on every filter/sort/page change via `history.replaceState`. When navigating to a different view, `navigate()` only carries `ds`/`arch`/`mode` — view params naturally drop off.
- **Multi-value filters** (`header`, `dll`, `returnType`, `tech`, `kmdf`, `umdf`): Serialized as comma-separated values.
- **Default omission**: View params at default values (empty search, sort by name asc, page 0) are omitted from the URL to keep it clean.
- **Encoding**: All URL encoding/decoding goes through `URLSearchParams` for consistent `+`/`%20` handling. Never use raw `decodeURIComponent` for query strings.
- **`resolveTypeOrTypedef()`**: Replaces the previous `flexFindType` `_prefix` munging. The detail route dispatches between record and typedef rendering based on the resolution kind.
- **Glob in detail routes**: If a detail URL's name param contains `*` or `?`, it redirects to the corresponding list view with `?q=` set.
- **Universal lookup**: `/q/:name` searches all entity types, auto-redirects on single match, shows disambiguation for multiple matches.

## CSS theme system

- Terminal aesthetic: Courier New font, no rounded corners, scanline overlay, text shadows
- CSS variables for all colors: `--accent`, `--bg`, `--text`, etc.
- Accent colors: amber (default), green, cyan, red, white — set via `data-accent` attribute
- Dark/light mode: set via `data-theme` attribute
- Both persisted to localStorage
- **xref underlines**: All `.xref` links (types, typedefs, enums, funcs, consts) carry a subtle 30%-opacity underline that brightens on hover. `.xref-header` (file:line chrome) stays underline-on-hover only.
- **IRQL chips**: `.tag-irql.irql-{passive,apc,dispatch,high,unknown}` — green/yellow/orange/red severity tiers.

## CDN dependencies

- **arborium**: C syntax highlighting for type/enum definitions and constant expressions
- **cytoscape.js**: Type relationship graph rendering
