# CLAUDE.md

Instructions for AI assistants working on this project.

## What is bb-viewer?

A vanilla TypeScript SPA that visualizes Windows SDK and PHNT header analysis data produced by [bb](https://github.com/cristeigabriela/bb). It shows functions (with ABI layouts, parameter details, MSDN metadata), types (with memory layouts, field tables, nested expansion), constants/enums, and a type relationship graph.

Built with Bun. No framework — plain DOM manipulation with a hash-based router.

## Project structure

```
bb-viewer/
├── src/
│   ├── main.ts              # Entry point, route registration
│   ├── router.ts            # Hash-based SPA router
│   ├── data.ts              # Data loading, indexing, xref building, search
│   ├── types.ts             # TypeScript interfaces for all data
│   ├── dom.ts               # Core DOM primitives ($, $$, el, clear)
│   ├── utils.ts             # matchQuery (glob/regex), debounce
│   ├── primitives.ts        # KNOWN_PRIMITIVES set (shared with build-graph)
│   ├── theme.ts             # Dark/light mode + accent color picker
│   ├── dataset-switcher.ts  # WinSDK/PHNT + architecture switching
│   ├── search-modal.ts      # Global search modal with preview pane
│   ├── clippy.ts            # ASCII art clippy popup (cowsay)
│   ├── ui/
│   │   ├── links.ts         # typeLink, funcLink, badge, renderTypeStr, highlightCode
│   │   └── filter-dropdown.ts  # Checkbox filter dropdown widget
│   └── views/
│       ├── shared.ts        # Shared view helpers (sort row, search input, filter chips, pagination, collapsible sections, not-found)
│       ├── home.ts          # Dashboard with stat cards and bar charts
│       ├── functions.ts     # Function list + detail views
│       ├── types.ts         # Type list + detail views
│       ├── constants.ts     # Constants/enums list + detail views
│       └── type-graph.ts    # Cytoscape.js type relationship graph
├── public/
│   ├── index.html           # SPA shell
│   ├── styles.css           # All CSS (terminal theme, dark/light, accent colors)
│   └── app.js               # Built output (generated)
├── data/                    # Generated JSON data
│   ├── {winsdk,phnt}/
│   │   └── {amd64,x86,arm,arm64}/
│   │       ├── funcs.json
│   │       ├── types.json
│   │       ├── consts.json
│   │       └── graph.json   # Precomputed type graph with positions
├── build.ts                 # Bun bundler config
├── build-graph.ts           # Precomputes type relationship graph (d3-force)
├── serve.ts                 # Dev server with file watching
├── generate-data.ps1        # PowerShell script to regenerate all data
└── package.json
```

## Building

```powershell
bun install           # install d3-force dependency
bun run build         # bundle src/ → public/app.js
bun run build:graph   # precompute graph.json files (needs data/ populated)
bun run dev           # dev server with auto-rebuild on localhost:3000
```

## Generating data

Requires bb built at `C:\dev\rust\bb\bb` and Windows SDK installed.

```powershell
.\generate-data.ps1                          # all datasets, all archs
.\generate-data.ps1 -Dataset phnt            # only phnt
.\generate-data.ps1 -Arch amd64             # only amd64
.\generate-data.ps1 -Dataset winsdk -Arch x86
```

The script auto-detects the Windows SDK path. After generating data, also run `bun run build:graph` to update the type graphs.

Note: `bb-funcs --arch arm` and `bb-funcs --arch arm64` will fail (ARM ABI not yet implemented in bb). Types and constants work for all architectures.

## Data flow

1. bb parses C/C++ headers via libclang → outputs JSON
2. `generate-data.ps1` runs bb for each dataset/arch combo → `data/{dataset}/{arch}/*.json`
3. `build-graph.ts` reads types.json, builds adjacency graph, runs d3-force simulation → `graph.json`
4. Browser loads JSON at runtime, builds indexes and xrefs in `data.ts`

## Key conventions

- **No framework**: All rendering is imperative DOM construction via `el()`, `clear()`, etc.
- **State is local**: Each view function creates its own state as local variables. No module-level state that persists across navigations.
- **Filter dropdowns**: Use `buildFilterDropdown()` from `ui/filter-dropdown.ts` for all multi-select filters. Returns a `{ element, refresh() }` handle.
- **Shared view patterns**: Sort row, search input, filter chips, pagination, collapsible sections, and not-found pages all live in `views/shared.ts`.
- **Non-breaking spaces**: MSDN metadata contains `\u00a0` (non-breaking space) in strings like "Windows\u00a02000". Always normalize with `.replace(/\u00a0/g, " ")` before string matching.
- **DLL cleaning**: Use `cleanDll()` from `data.ts` to normalize DLL names (strips parenthetical suffixes and semicolon-separated entries).
- **Primitives list**: `src/primitives.ts` is the single source of truth for known primitive types. Shared by `data.ts` (browser) and `build-graph.ts` (build tool).

## CSS theme system

- Terminal aesthetic: Courier New font, no rounded corners, scanline overlay, text shadows
- CSS variables for all colors: `--accent`, `--bg`, `--text`, etc.
- Accent colors: amber (default), green, cyan, red, white — set via `data-accent` attribute
- Dark/light mode: set via `data-theme` attribute
- Both persisted to localStorage

## CDN dependencies

- **arborium**: C syntax highlighting for type/enum definitions and constant expressions
- **cytoscape.js**: Type relationship graph rendering
