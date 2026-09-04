/**
 * Tiny client-side fuzzy search. No dependencies, runs in O(n*m) per
 * pair (n=query, m=item-field) which is fast enough for a few hundred
 * rows. For larger lists, run on a web worker or move to the server.
 *
 * Algorithm (greedy + score):
 *   1. If the query is empty, return the items as-is (no filter).
 *   2. Normalize: lower-case, strip diacritics, collapse whitespace.
 *   3. For each item, compute a score across the provided `fields`:
 *        * exact substring match in the field → +10
 *        * token match (whole word boundary)   → +6
 *        * prefix match (field starts with q)  → +4
 *        * character-level subsequence match   → +2 per matched char,
 *          bonus if chars are consecutive in the field
 *        * fuzzy Levenshtein (≤ 2 edits for q ≤ 5 chars) → +3
 *   4. Sum across fields with the per-field weight. Items with
 *      score > 0 are returned, sorted score-desc.
 *
 * The scoring is biased toward prefix/substring matches (which is
 * what people type most often) and gives a small bonus for typo
 * tolerance via Levenshtein on short queries.
 */

export interface FuzzyField<T> {
  /** Function to extract the string value for this field from the item. */
  get: (item: T) => string | null | undefined;
  /** Multiplier applied to this field's score (default 1). */
  weight?: number;
}

export interface FuzzyOptions<T> {
  fields: FuzzyField<T>[];
  /** If true, also search joined field values that are objects/arrays
   *  by recursing one level. (E.g. category.name.) */
  recurse?: boolean;
}

/** Normalise a string for comparison: lower-case + strip diacritics. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Levenshtein distance, bounded. Returns ≥ `max` if distance ≥ max. */
function lev(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) >= max) return max;
  const m = a.length, n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin >= max) return max;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Subsequence match: returns the number of `q` chars found in `field`
 *  in order, plus a bonus if they're consecutive. */
function subseqScore(q: string, field: string): number {
  if (!q) return 0;
  let qi = 0, score = 0, run = 0;
  for (let i = 0; i < field.length && qi < q.length; i++) {
    if (field[i] === q[qi]) {
      score += 2 + run; // base + consecutive bonus (resets on mismatch)
      run++;
      qi++;
    } else {
      run = 0;
    }
  }
  // If we matched all chars, add a completion bonus.
  return qi === q.length ? score + 3 : 0;
}

/** Score a single field value against a normalised query.
 *  The query may contain multiple space-separated words. If so, each
 *  word is scored independently and the scores are summed (so a
 *  document that matches ALL words ranks higher than one that
 *  matches just one). */
function scoreField(q: string, rawValue: string): number {
  if (!rawValue) return 0;
  const v = norm(rawValue);
  if (!v) return 0;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1; // empty query → include everything

  let total = 0;
  for (const w of words) {
    total += scoreSingleWord(w, v);
  }
  return total;
}

/** Score one query word (no whitespace) against one normalised field. */
function scoreSingleWord(q: string, v: string): number {
  if (q.length === 0) return 1;

  // 1. Exact substring (highest weight)
  if (v.includes(q)) {
    let s = 10;
    // Bonus if at word boundary (start, or after space/punctuation)
    const idx = v.indexOf(q);
    if (idx === 0 || /[\s\-\/_(]/.test(v[idx - 1])) s += 4;
    // Bonus if the whole field is just the query
    if (v === q) s += 6;
    return s;
  }

  // 2. Whole-token match: any of the field's tokens starts with q
  const tokens = v.split(/[\s\-\/_]+/);
  for (const t of tokens) {
    if (t === q)        return 8; // whole token equals
    if (t.startsWith(q)) return 4; // prefix of a token
  }

  // 3. Subsequence match (handles spaces/typos inside the field)
  const sub = subseqScore(q, v);
  if (sub > 0) return sub;

  // 4. Fuzzy tolerance for short queries (≤ 5 chars)
  if (q.length <= 5) {
    // Try levenshtein against the field and against each token.
    const dField = lev(q, v.slice(0, q.length + 2), 3);
    if (dField < 2) return 3;
    for (const t of tokens) {
      if (t.length <= q.length + 2) {
        const d = lev(q, t, 3);
        if (d < 2) return 3;
      }
    }
  }

  return 0;
}

/** Extract a flat string value from an item field. Handles nested
 *  objects (one level deep) if the field value is `{name: 'X'}`. */
function getString(item: any, getter: (item: any) => any): string {
  const v = getter(item);
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    // Common joined-object shape: { name: 'X' }
    if (typeof v.name === 'string') return v.name;
    if (typeof v.label === 'string') return v.label;
  }
  return '';
}

/** Apply a fuzzy filter to `items`, returning only the ones that
 *  match the query, sorted by score (highest first). */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  options: FuzzyOptions<T>,
): T[] {
  const q = norm(query.trim());
  if (!q) return items.slice();
  if (items.length === 0) return [];

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    let total = 0;
    for (const f of options.fields) {
      const w = f.weight ?? 1;
      const v = getString(item, f.get);
      total += scoreField(q, v) * w;
    }
    if (total > 0) scored.push({ item, score: total });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
