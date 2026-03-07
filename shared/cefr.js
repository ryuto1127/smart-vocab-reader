export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const CEFR_RANK = Object.freeze(
  CEFR_LEVELS.reduce((accumulator, level, index) => {
    accumulator[level] = index;
    return accumulator;
  }, {})
);

export function compareCefr(left, right) {
  return (CEFR_RANK[left] ?? -1) - (CEFR_RANK[right] ?? -1);
}

export function meetsThreshold(level, threshold) {
  if (!level || !threshold) {
    return false;
  }

  return compareCefr(level, threshold) >= 0;
}

export function sortCefr(levels) {
  return [...levels].sort(compareCefr);
}

export function highestCefr(levels) {
  return sortCefr(levels).at(-1) ?? null;
}

export function lowestCefr(levels) {
  return sortCefr(levels).at(0) ?? null;
}
