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
 * The movements this app knows how to weigh, each with the share of
 * bodyweight it moves.
 *
 * One table, two jobs: it scores an exercise typed by any name, and it
 * supplies the suggestions offered while typing — so picking from the list
 * is how you guarantee a movement will actually count. Before, the search
 * only knew exercises you had already logged, so a new "Sentadillas"
 * silently scored zero and you found out weeks later from a flat volume
 * chart.
 *
 * Order matters: `match` is tried top-down and the first hit wins, so a
 * specific variant must come before the generic movement whose name it
 * contains. Bench dips before dips is the case that was actually wrong —
 * `/fondo|dip|paralelas/` scored feet-on-the-floor tricep dips as a full
 * bodyweight hang, tripling their load.
 *
 * The shares are the conventional rough figures for this kind of
 * estimate, not measurements. Anything unmatched scores 0 rather than a
 * guess: a share invented for a barbell squat is worse than a missing one
 * on a movement nobody recognises.
 */
export interface KnownMovement {
  /** Canonical name, shown in suggestions. */
  name: string;
  share: number;
  match: RegExp;
}

export const MOVEMENTS: KnownMovement[] = [
  // --- Specific variants first -----------------------------------------
  { name: "Fondos en banco", share: 0.35, match: /fondos? (en |de )?(banco|silla|triceps)|bench dip/ },
  { name: "Fondos asistidos", share: 0.55, match: /fondos? asistid|dips? asistid/ },
  { name: "Dominada asistida", share: 0.55, match: /dominadas? asistid|pull ?-?ups? asistid/ },
  { name: "Flexiones arquero", share: 0.75, match: /flexion.*(arquero|diamante|una mano)/ },

  // --- Full bodyweight, hanging or supported ----------------------------
  { name: "Muscle-up", share: 1, match: /muscle ?-?up/ },
  { name: "Dominadas", share: 1, match: /dominada|pull ?-?up|chin ?-?up|jalon en barra/ },
  { name: "Fondos en paralelas", share: 1, match: /fondo|dip\b|paralelas/ },
  { name: "Pino contra pared", share: 1, match: /pino|handstand|vertical/ },
  { name: "L-sit", share: 1, match: /l ?-?sit/ },
  { name: "Front lever", share: 1, match: /front lever|planche|plancha frontal/ },
  { name: "Back lever", share: 1, match: /back lever/ },

  // --- Legs -------------------------------------------------------------
  { name: "Pistol squat", share: 0.85, match: /pistol|sentadilla a una pierna/ },
  { name: "Sentadilla búlgara", share: 0.65, match: /bulgara|zancada|lunge/ },
  { name: "Sentadilla", share: 0.65, match: /sentadilla|squat/ },
  { name: "Subida a cajón", share: 0.65, match: /subida a caj|step ?-?up/ },
  { name: "Puente de glúteo", share: 0.45, match: /puente de gluteo|hip thrust|glute bridge/ },

  // --- Push / pull ------------------------------------------------------
  { name: "Flexiones", share: 0.64, match: /flexion|push ?-?up|lagartija/ },
  { name: "Remo invertido", share: 0.6, match: /remo invertido|remo en anillas|australian row|remo horizontal en barra baja/ },
  { name: "Burpee", share: 0.6, match: /burpee/ },

  // --- Core -------------------------------------------------------------
  { name: "Elevación de piernas", share: 0.5, match: /elevacion de piernas|leg raise|toes to bar/ },
  { name: "Escalador", share: 0.35, match: /escalador|mountain climber/ },
  { name: "Hollow hold", share: 0.35, match: /hollow/ },
  { name: "Plancha", share: 0.35, match: /abdominal|crunch|plancha/ },
  { name: "Superman", share: 0.3, match: /superman/ }
];

/**
 * Known movements whose canonical name matches what is being typed.
 * Matched on the name rather than on `match`, since this answers "what
 * could you mean?" rather than "what did you log?".
 */
export function suggestMovements(query: string, limit = 5): KnownMovement[] {
  const q = foldText(query.trim());
  if (q.length < 2) return [];
  const starts: KnownMovement[] = [];
  const contains: KnownMovement[] = [];
  for (const m of MOVEMENTS) {
    const name = foldText(m.name);
    if (name.startsWith(q)) starts.push(m);
    else if (name.includes(q) || m.match.test(q)) contains.push(m);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** 0 when the movement isn't recognised as bodyweight-loaded. */
export function shareFromName(exerciseName: string): number {
  const folded = foldText(exerciseName || "");
  for (const m of MOVEMENTS) {
    if (m.match.test(folded)) return m.share;
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
