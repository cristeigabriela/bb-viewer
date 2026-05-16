import { $ } from "./dom";
import {
  getCurrentDataset, getCurrentArch, getCurrentMode,
  getFunctions, getTypes, getTypedefs, getConstants, getEnums,
} from "./data";

/**
 * VS Code-style footer that always shows the active dataset/arch/mode,
 * a short "current entity" path, and the loaded entity counts. Updated by
 * `updateStatusBar({ path })` on each route and by `refreshStatusCounts()`
 * after `loadData` completes.
 */

interface StatusBarState {
  path?: string;          // e.g. "/functions/CreateFileW"
}

const state: StatusBarState = {};

export function setupStatusBar(): void {
  refreshStatusCounts();
  renderContext();
}

export function refreshStatusCounts(): void {
  const counts = $(".sb-counts");
  if (!counts) return;
  try {
    const f = getFunctions().length;
    const t = getTypes().length;
    const td = getTypedefs().length;
    const c = getConstants().length;
    const e = getEnums().length;
    counts.textContent =
      `${f.toLocaleString()} fn · ${t.toLocaleString()} types · ${td.toLocaleString()} typedefs · ${c.toLocaleString()} consts · ${e.toLocaleString()} enums`;
  } catch {
    counts.textContent = "—";
  }
  renderContext();
}

export function updateStatusBar(opts: { path?: string }): void {
  if (opts.path !== undefined) state.path = opts.path;
  renderContext();
}

function renderContext(): void {
  const ds = $(".sb-ds");
  const arch = $(".sb-arch");
  const mode = $(".sb-mode");
  const path = $(".sb-path");
  if (ds) ds.textContent = getCurrentDataset();
  if (arch) arch.textContent = getCurrentArch();
  if (mode) {
    mode.textContent = getCurrentMode();
    mode.className = `sb-cell sb-mode sb-mode-${getCurrentMode()}`;
  }
  if (path) path.textContent = state.path ?? "";
}
