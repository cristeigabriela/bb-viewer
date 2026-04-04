import { getCurrentDataset, getCurrentArch, loadData } from "./data";

type RouteHandler = (params: Record<string, string>, query: Record<string, string>) => void;

interface Route {
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

export function route(pattern: string, handler: RouteHandler): void {
  const keys: string[] = [];
  const regexStr = pattern.replace(/:([a-zA-Z_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  routes.push({ pattern: new RegExp("^" + regexStr + "$"), keys, handler });
}

/** Inject current ds/arch into a hash-query string. Always present. */
function injectContext(raw: string): string {
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs ?? "");
  if (!params.has("ds")) params.set("ds", getCurrentDataset());
  if (!params.has("arch")) params.set("arch", getCurrentArch());
  return `${path}?${params}`;
}

/** Build a hash URL with current ds/arch params (always present) */
export function buildHash(pathWithQuery: string): string {
  return "#" + injectContext(pathWithQuery);
}

export function navigate(hash: string): void {
  if (hash.startsWith("#")) hash = hash.slice(1);
  window.location.hash = injectContext(hash);
}

function parseQuery(qs: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!qs) return params;
  for (const [k, v] of new URLSearchParams(qs)) params[k] = v;
  return params;
}

let onDatasetChange: (() => void | Promise<void>) | null = null;

export function setOnDatasetChange(cb: () => void | Promise<void>): void {
  onDatasetChange = cb;
}

export function startRouter(): void {
  // Global click interceptor: any <a href="#/..."> gets ds/arch injected
  // before the browser follows it. This means plain links just work.
  document.addEventListener("click", (e) => {
    const anchor = (e.target as Element).closest?.("a[href^='#/']") as HTMLAnchorElement | null;
    if (!anchor) return;
    const raw = anchor.getAttribute("href")!;
    const injected = "#" + injectContext(raw.slice(1));
    if (raw !== injected) {
      e.preventDefault();
      window.location.hash = injected.slice(1);
    }
  });

  let dispatchId = 0;

  const dispatch = async () => {
    const myId = ++dispatchId;
    const raw = window.location.hash.slice(1) || "/";
    const [path, qs] = raw.split("?");
    const query = parseQuery(qs ?? "");

    // URL is the single source of truth for dataset/arch.
    const effectiveDs = (query.ds ?? "winsdk") as "winsdk" | "phnt";
    const effectiveArch = query.arch ?? "amd64";
    delete query.ds;
    delete query.arch;

    if (effectiveDs !== getCurrentDataset() || effectiveArch !== getCurrentArch()) {
      await loadData(effectiveDs, effectiveArch);
      // If another dispatch started while we were loading, bail — it wins
      if (myId !== dispatchId) return;
      if (onDatasetChange) await onDatasetChange();
    }

    // Ensure ds/arch are always in the URL (after loadData so state is current)
    if (!qs || !qs.includes("ds=") || !qs.includes("arch=")) {
      history.replaceState(null, "", "#" + injectContext(raw));
    }

    // If another dispatch started while we were loading, bail
    if (myId !== dispatchId) return;

    for (const r of routes) {
      const m = path.match(r.pattern);
      if (m) {
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
        r.handler(params, query);
        return;
      }
    }
    routes[0]?.handler({}, query);
  };
  window.addEventListener("hashchange", dispatch);
  dispatch();
}
