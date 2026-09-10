// Diacritic- and case-insensitive matching, so "platano" finds "Plátano"
// and "PRESS" finds "Press banca" regardless of how the keyboard behaved.
// Spanish food and exercise names are full of accents nobody types when
// they're searching in a hurry.
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Ranks a match: things that *start* with the query come before things
// that merely contain it, so "pre" puts "Press banca" above "Sentadilla
// con press". Returns null when there's no match at all.
export function matchRank(name: string, foldedQuery: string): number | null {
  if (!foldedQuery) return 0;
  const folded = foldText(name);
  if (folded.startsWith(foldedQuery)) return 0;
  if (folded.includes(foldedQuery)) return 1;
  return null;
}
