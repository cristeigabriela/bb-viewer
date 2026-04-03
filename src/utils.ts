/** Convert a glob pattern to a regex: * = .*, ? = ., rest escaped */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/** Match a string against a query using glob or regex mode */
export function matchQuery(value: string, query: string, useRegex: boolean): boolean {
  if (!query) return true;
  if (useRegex) {
    try { return new RegExp(query, "i").test(value); }
    catch { return false; }
  }
  if (!query.includes("*") && !query.includes("?")) {
    return value.toLowerCase().includes(query.toLowerCase());
  }
  return globToRegex(query).test(value);
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
