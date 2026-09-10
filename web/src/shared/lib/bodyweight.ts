// Bodyweight contribution — what makes volume mean anything for
// calisthenics.
//
// Volume is conventionally weight × reps, which silently values every
// pull-up, dip and push-up at zero. For a calisthenics log that isn't a
// rounding error, it's most of the training. The reference app solves it
// by treating bodyweight as resistance: each exercise carries the share
// of your bodyweight it actually moves, and total load is that share plus
// whatever you hung off a belt.
//
//   load = bodyweight × share + added weight
//
// The share is per-movement and comes from the name, because that's all
// this app stores. Anything unrecognised contributes nothing, which keeps
// the old behaviour for barbell work rather than inflating it: a wrong
// share on a squat is worse than a missing one on an obscure movement.
import type { WeightEntry } from "../store/types";
import { foldText } from "./text";

/**
 * Fraction of bodyweight moved by each movement. Rough by nature — these
 * are the conventional figures used for this kind of estimate, not
 * measurements — so they are deliberately coarse.
 *
 * Ordered: the first match wins, so specific variants come before the
 * generic movement they contain.
 */
const SHARES: [RegExp, number][] = [
  // Full bodyweight hanging or supported.
  [/muscle ?-?up/, 1],
  [/dominada|pull ?-?up|chin ?-?up|jalon en barra/, 1],
  [/fondo|dip\b|paralelas/, 1],
  [/pino|handstand|vertical/, 1],
  [/pistol|sentadilla a una pierna/, 0.85],
  [/zancada|lunge|bulgara/, 0.65],
  [/remo invertido|australian row|remo horizontal en barra baja/, 0.6],
  // Push-ups move roughly two thirds of bodyweight; variants shift it.
  [/flexion.*(diamante|arquero|una mano)/, 0.75],
  [/flexion|push ?-?up|lagartija/, 0.64],
  [/elevacion de piernas|leg raise|toes to bar/, 0.5],
  [/abdominal|crunch|plancha abdominal/, 0.35]
];

/** 0 when the movement isn't recognised as bodyweight-loaded. */
export function shareFromName(exerciseName: string): number {
  const folded = foldText(exerciseName || "");
  for (const [pattern, share] of SHARES) {
    if (pattern.test(folded)) return share;
  }
  return 0;
}

/**
 * The share in force for an exercise: what the user set, else what the
 * name implies. Stored as null/undefined until someone disagrees with
 * the heuristic, so improving the name table still reaches every
 * exercise nobody has corrected.
 */
export function exerciseShare(ex: { name: string; bodyweightShare?: number | null }): number {
  return ex.bodyweightShare ?? shareFromName(ex.name);
}

/**
 * Total resistance for one set, in kg.
 *
 * `bodyweightKg` null means no weigh-in exists yet; the bodyweight part
 * is then dropped rather than guessed, so a fresh install reports the
 * same loaded-only volume it always did.
 */
export function setLoadKg(
  share: number,
  addedKg: number | null | undefined,
  bodyweightKg: number | null
): number {
  const own = bodyweightKg != null ? bodyweightKg * share : 0;
  return own + (addedKg ?? 0);
}

/**
 * What you weighed on a given day — the most recent weigh-in on or before
 * it, carried forward.
 *
 * Historical volume has to use historical bodyweight. Valuing every past
 * session at today's weight would make the whole training history shift
 * every time you step on the scale, which is the opposite of what a trend
 * is for. Days before the first weigh-in fall back to it, since the
 * alternative is discarding training that predates the scale.
 */
export function bodyweightOn(weightLog: WeightEntry[], dayKey: string): number | null {
  if (weightLog.length === 0) return null;
  const sorted = [...weightLog].sort((a, b) => (a.date < b.date ? -1 : 1));
  let found: number | null = null;
  for (const entry of sorted) {
    if (entry.date <= dayKey) found = entry.weightKg;
    else break;
  }
  return found ?? sorted[0].weightKg;
}
