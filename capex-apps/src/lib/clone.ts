/** Deep clone for draft state — structuredClone with JSON fallback. */
export function cloneDeep<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
