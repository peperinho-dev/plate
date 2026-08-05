// Same id shape the vanilla app generates, so ids stay consistent across
// data written by either version.
export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
