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

export function navigate(hash: string): void {
  if (!hash.startsWith("#")) hash = "#" + hash;
  window.location.hash = hash;
}

function parseQuery(qs: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!qs) return params;
  for (const part of qs.split("&")) {
    const [k, v] = part.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return params;
}

export function startRouter(): void {
  const dispatch = () => {
    const raw = window.location.hash.slice(1) || "/";
    const [path, qs] = raw.split("?");
    const query = parseQuery(qs ?? "");

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
