# bb viewer

[**open the viewer**](https://cristeigabriela.github.io/bb-viewer/index.html)

a terminal-themed web explorer for windows sdk and phnt header analysis data, produced by [bb](https://github.com/cristeigabriela/bb).

browse **15,000+ functions** with full abi layouts, **15,000+ types** (struct + union) with memory visualizations, **25,000+ typedefs** with chain resolution, **45,000+ constants** (including the full `STATUS_*` set from `ntstatus.h`), and an interactive type relationship graph — across **windows sdk + phnt**, **user + kernel mode**, on **amd64, x86, arm, arm64**.

![home page](media/home.png)

## features

### functions

browse, search (glob/regex), and filter windows api functions by header, dll, return type, parameter count, pointer depth, minimum windows/server version, and msdn source (sdk vs driver-docs).

each function detail page shows the full c prototype with every type/typedef/enum identifier clickable, abi register/stack layout, msdn metadata (dll, lib, min client/server, variants), known parameter values with linked constants, and referenced types.

| | |
|---|---|
| ![functions list](media/functions-list.png) | ![function detail](media/function-detail-createfilew.png) |
| *function list with filters* | *CreateFileW — abi layout, metadata, known values* |

#### kernel-mode extras

switching the navbar to **kernel** mode (see [datasets, architectures, modes](#datasets-architectures-modes)) unlocks driver-docs metadata and exposes new filters:

- **IRQL filter** with the same range semantics bb-funcs uses — `PASSIVE_LEVEL`, `<= DISPATCH_LEVEL`, `> APC_LEVEL`, etc. A function whose constraint is `<= DISPATCH_LEVEL` (callable `[0, 2]`) is excluded from `> PASSIVE_LEVEL` because its range can reach 0.
- **KMDF / UMDF version** dropdowns (only populated if the dataset has functions tagged with those versions).
- **MSDN source** filter (`sdk` vs `driver`).
- Sort by stack-passed byte total or largest single stack parameter.
- IRQL chips on function rows + detail are color-coded by severity (green PASSIVE → red HIGH).
- Function detail pages gain a **Driver Metadata** section: tech root (`wdf`, `kernel`, `netadapter`, …), include header, target/construct type, KMDF/UMDF version, parsed IRQL.

### types

explore struct **and union** layouts with field tables, memory visualizations (union members render stacked at offset 0), inline nested type expansion, and cross-references to functions that use each type.

| | |
|---|---|
| ![types list](media/types-list.png) | ![type detail](media/type-detail-peb.png) |
| *type list with memory bars (kind filter: struct / union / both)* | *_PEB — c definition, memory layout, fields* |

c definitions are generated recursively: anonymous nested records emit unnamed `struct {…};` / `union {…};` with size+align on the closing brace. Inside an anonymous wrapper, field offset comments switch from `/* 0xN */` to `/* 0xN | 0xM */` showing absolute and parent-relative offsets side-by-side.

anonymous fields in the field-table view are collapsed by default — clicking the `▶ anon (anonymous union, N fields)` row expands their children inline. anonymous records are intentionally **not** searchable (they have no global identity); they only surface inside their parent record.

### typedefs

typedefs are first-class navigable entries. `/types/OVERLAPPED`, `/types/HANDLE`, `/types/LPCWSTR`, `/types/FILE_INFORMATION_CLASS` all resolve. The typedef detail page shows:

- typedef chain (`OVERLAPPED → _OVERLAPPED`, `LPCWSTR → const unsigned short *`, …)
- terminal primitive (e.g. `void`) or underlying record / enum (linked, and inline-rendered when it's a record with fields)
- xrefs of functions that take this typedef and types containing it

The typedef name *and* the underlying decl name both resolve and link — searching for `HANDLE` and `void *` both work; struct aliases like `OVERLAPPED` and `_OVERLAPPED` are distinct pages but reach each other.

### type graph

interactive force-directed graph of type relationships (precomputed with d3-force, rendered with cytoscape.js). resolution uses bb's typedef index instead of the previous `_prefix` / `LP*` / `P*` heuristics. anonymous records are excluded (no global identity). click a node to highlight its neighborhood, search and sort by connection count.

![type graph](media/type-graph.png)

### constants

browse macro constants and enums with values, hex, c expressions (syntax-highlighted), and composition breakdowns. the full `STATUS_*` set from `ntstatus.h` (~2.8k codes) ships in both user and kernel modes.

| | |
|---|---|
| ![constants list](media/constants-list.png) | ![constant detail](media/constant-detail-context-full.png) |
| *constants table with expressions* | *CONTEXT_FULL — expression, binary, composition* |

### search

centered modal search (press `/`) across functions, types, typedefs, constants, and enums with keyboard navigation (arrow keys, ctrl+j/k, enter, escape) and a live preview pane. anonymous records are excluded.

![search modal](media/search-modal.png)

### theming

dark/light mode with 5 accent colors (amber, green, cyan, red, white). terminal aesthetic — courier new, no rounded corners, scanline overlay, text shadows.

| | |
|---|---|
| ![dark amber](media/home.png) | ![light mode](media/home-light-mode.png) |
| *dark mode (amber accent)* | *light mode* |

![green accent](media/function-detail-green-accent.png)
*NtCreateFile with green accent — phnt dataset*

### datasets, architectures, modes

switch between **windows sdk** / **phnt** headers, **user** / **kernel** mode, and **amd64** / **x86** / **arm** / **arm64** architectures from the navbar. The three together (`ds`, `arch`, `mode`) are global URL params always present in the hash.

## routes

all routes use the hash-based router (`#/path?params`). three global query params — `ds`, `arch`, `mode` — are injected into every URL automatically.

| route | description |
|---|---|
| `#/` | home dashboard with stat cards and bar charts (kernel-mode shows extra KMDF/UMDF/IRQL charts) |
| `#/functions` | function list with search, filters, and sorting |
| `#/functions/:name` | function detail — c prototype, abi layout, msdn + driver metadata, known param values |
| `#/types` | type list (struct + union) with kind filter |
| `#/types/graph` | interactive type relationship graph |
| `#/types/:name` | type detail — dispatches between **record** (struct/union) and **typedef** rendering based on the name |
| `#/constants` | constants/enums list with search, filters, and tab switching |
| `#/constants/:name` | constant detail — value, hex, c expression, binary breakdown, composition |
| `#/constants/enum/:name` | enum detail — member table with values |
| `#/q/:name` | universal lookup — searches all entity types, auto-redirects on single match, shows disambiguation for multiple |

### list view query params

**functions** (`#/functions`): `q`, `regex`, `header`, `dll`, `returnType`, `minParams`, `maxParams`, `ptrDepth`, `minClient`, `minServer`, `exported`, `source` (`sdk`/`driver`), `sort` (`name`/`params`/`stack`/`maxStack`), `sortDir`, `page`. **Kernel mode adds**: `irql` (e.g. `<= DISPATCH_LEVEL`), `tech`, `kmdf`, `umdf`.

**types** (`#/types`): `q`, `regex`, `header`, `minSize`, `maxSize`, `hasFields`, `kind` (`struct`/`union`), `sort`, `sortDir`, `page`

**constants** (`#/constants`): `q`, `regex`, `header`, `tab` (`macros`/`enums`), `sort`, `sortDir`, `page`

multi-value filters (`header`, `dll`, `returnType`, `tech`, `kmdf`, `umdf`) are comma-separated. params at default values are omitted from the URL.

## getting started

```powershell
bun install
bun run build

# generate data (requires bb built + windows sdk)
.\generate-data.ps1

# precompute type graphs
bun run build:graph

# start dev server
bun run dev
# → http://localhost:3000

# run tests
bun test
```

## data generation

requires [bb](https://github.com/cristeigabriela/bb) v0.3.2+ binaries and windows sdk installed. kernel mode additionally needs the wdk:

```powershell
winget install --exact --id Microsoft.WindowsWDK.10.0.26100
```

then:

```powershell
.\generate-data.ps1                    # all datasets, all archs, all modes
.\generate-data.ps1 -Dataset phnt      # only phnt
.\generate-data.ps1 -Arch amd64        # only amd64
.\generate-data.ps1 -Mode kernel       # only kernel mode

# use locally-built bb binaries (skips github release download
# when -BbBinDir already contains bb-funcs.exe / bb-types.exe / bb-consts.exe):
.\generate-data.ps1 -BbBinDir 'D:\dev\rust\bb\bb\target\debug'
```

the script auto-detects the windows sdk path. after generating data, run `bun run build:graph` to update the type relationship graphs.

**Note on `--struct '*'`**: the script passes this to `bb-types` so that the `typedefs[]` array in the JSON includes every kind — pointer (HANDLE), primitive (DWORD), enum (FILE_INFORMATION_CLASS), function-pointer, array — not just the record-targeting ones bb's default dump emits.

## stack

- **runtime**: vanilla typescript, no framework — plain dom manipulation with a hash router
- **build**: bun bundler
- **tests**: bun test (`bun test`)
- **syntax highlighting**: [arborium](https://github.com/bearcove/arborium) (c language)
- **type graph**: [cytoscape.js](https://js.cytoscape.org/) with [d3-force](https://d3js.org/d3-force) precomputed layouts
- **data source**: [bb](https://github.com/cristeigabriela/bb) v0.3.2+ — windows sdk/phnt header analysis via libclang
