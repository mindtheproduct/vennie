import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Fuzzy match scoring — consistent across command palette and vault search
export function fuzzyScore(query, target) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100 + (q.length / t.length) * 50;
  if (t.includes(q)) return 50 + (q.length / t.length) * 25;
  let qi = 0, score = 0, lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1 + (lastMatch === ti - 1 ? 5 : 0) + (ti === 0 || '-_ '.includes(t[ti - 1]) ? 10 : 0);
      lastMatch = ti;
      qi++;
    }
  }
  return qi < q.length ? -1 : score;
}
