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
  // Auto-wrap only when ? is used without any explicit * anchoring
  if (!query.includes("*") && query.includes("?")) {
    query = "*" + query + "*";
  }
  return globToRegex(query).test(value);
}

/** Levenshtein edit distance (single-row DP) */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
