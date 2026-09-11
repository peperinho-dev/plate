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
export type ChainId =
  | "push"      // empuje horizontal
  | "vpush"     // empuje vertical
  | "pull"      // tracción vertical, en barra
  | "row"       // tracción horizontal
  | "dip"       // fondos
  | "squat"     // sentadilla
  | "hinge"     // cadena posterior
  | "legraise"  // elevación de piernas
  | "core"      // core isométrico
  | "lever";    // palancas

/** What you need to be able to do before the next step is worth trying. */
export interface Gate {
  sets: number;
  /** Reps, or seconds for a hold. */
  value: number;
}

export interface KnownMovement {
  /** Canonical name, shown in suggestions. */
  name: string;
  share: number;
  match: RegExp;
  /** Whether the movement is counted in reps or in seconds held. */
  unit?: "reps" | "hold";
  /** What you need: nothing at all, or a pull-up bar. */
  equipment?: "none" | "bar";
  /** The progression it belongs to, and where in it. */
  chain?: ChainId;
  level?: number;
  /** Clearing this on the current step is what unlocks the next one. */
  gate?: Gate;
  /** One line on what the step is for, shown with the suggestion. */
  note?: string;
}

export const MOVEMENTS: KnownMovement[] = [
  // === Empuje horizontal — nada de equipo ==============================
  { name: "Flexiones en pared", share: 0.2, match: /flexion.*pared|wall push/, unit: "reps", equipment: "none", chain: "push", level: 1, gate: { sets: 3, value: 15 },
    note: "De pie contra la pared. Cuanto más atrás los pies, más peso." },
  { name: "Flexiones inclinadas", share: 0.45, match: /flexion.*inclinad|incline push/, unit: "reps", equipment: "none", chain: "push", level: 2, gate: { sets: 3, value: 12 },
    note: "Manos en alto. Si no tienes dónde apoyarte, salta a las de rodillas." },
  { name: "Flexiones de rodillas", share: 0.49, match: /flexion.*rodilla|knee push/, unit: "reps", equipment: "none", chain: "push", level: 3, gate: { sets: 3, value: 12 },
    note: "Mismo torso, menos palanca. El paso previo a la flexión completa." },
  { name: "Flexiones", share: 0.64, match: /flexion|push ?-?up|lagartija/, unit: "reps", equipment: "none", chain: "push", level: 4, gate: { sets: 3, value: 15 },
    note: "Cuerpo en línea, codos a unos 45°." },
  { name: "Flexiones diamante", share: 0.68, match: /flexion.*diamante|diamond push/, unit: "reps", equipment: "none", chain: "push", level: 5, gate: { sets: 3, value: 12 },
    note: "Manos juntas: carga el tríceps antes de pasar a una mano." },
  { name: "Flexiones arquero", share: 0.75, match: /flexion.*arquero|archer push/, unit: "reps", equipment: "none", chain: "push", level: 6, gate: { sets: 3, value: 8 },
    note: "Un brazo trabaja, el otro solo acompaña. Cuenta reps por lado." },
  { name: "Flexiones a una mano", share: 0.8, match: /flexion.*(una mano|un brazo)|one ?-?arm push/, unit: "reps", equipment: "none", chain: "push", level: 7, gate: { sets: 3, value: 5 },
    note: "Pies separados para no rotar." },

  // === Empuje vertical — pared =========================================
  { name: "Flexiones en pica", share: 0.7, match: /pica|pike push/, unit: "reps", equipment: "none", chain: "vpush", level: 1, gate: { sets: 3, value: 12 },
    note: "Cadera alta: el peso pasa del pecho a los hombros." },
  { name: "Pino contra pared", share: 1, match: /pino|handstand|vertical contra/, unit: "hold", equipment: "none", chain: "vpush", level: 2, gate: { sets: 3, value: 45 },
    note: "Aguanta. Es la base de todo el empuje vertical." },
  { name: "Flexiones en pino", share: 0.9, match: /flexion.*pino|handstand push/, unit: "reps", equipment: "none", chain: "vpush", level: 3, gate: { sets: 3, value: 8 },
    note: "Contra la pared, bajando hasta que la cabeza roce el suelo." },

  // === Tracción vertical — barra =======================================
  { name: "Dominadas negativas", share: 1, match: /negativ/, unit: "reps", equipment: "bar", chain: "pull", level: 2, gate: { sets: 3, value: 5 },
    note: "Súbete como puedas y baja en 5 segundos. Lo que más construye la primera dominada." },
  { name: "Dominada asistida", share: 0.55, match: /dominadas? asistid|pull ?-?ups? asistid/, unit: "reps", equipment: "bar", chain: "pull", level: 3, gate: { sets: 3, value: 8 },
    note: "Con goma o con los pies apoyados." },
  { name: "Dominadas supinas", share: 1, match: /supina|chin ?-?up/, unit: "reps", equipment: "bar", chain: "pull", level: 4, gate: { sets: 3, value: 6 },
    note: "Palmas hacia ti: más bíceps y algo más fácil que la prona." },
  { name: "Dominadas arqueras", share: 1, match: /dominadas? arquer|archer pull/, unit: "reps", equipment: "bar", chain: "pull", level: 6, gate: { sets: 3, value: 5 },
    note: "Camino hacia la dominada a un brazo." },
  { name: "Muscle-up", share: 1, match: /muscle ?-?up/, unit: "reps", equipment: "bar", chain: "pull", level: 7 },
  { name: "Dominadas", share: 1, match: /dominada|pull ?-?up|jalon en barra/, unit: "reps", equipment: "bar", chain: "pull", level: 5, gate: { sets: 3, value: 12 },
    note: "Prona, desde muerto y barbilla por encima." },

  // === Tracción horizontal — bajo la barra ==============================
  { name: "Remo invertido inclinado", share: 0.4, match: /remo invertido inclinad/, unit: "reps", equipment: "bar", chain: "row", level: 1, gate: { sets: 3, value: 12 },
    note: "Barra alta, cuerpo más vertical: el escalón suave." },
  { name: "Remo invertido", share: 0.6, match: /remo invertido|remo en anillas|australian row|remo horizontal en barra baja/, unit: "reps", equipment: "bar", chain: "row", level: 2, gate: { sets: 3, value: 12 },
    note: "Cuerpo recto bajo la barra, pecho a la barra." },
  { name: "Remo invertido a una mano", share: 0.75, match: /remo.*(una mano|un brazo)/, unit: "reps", equipment: "bar", chain: "row", level: 3, gate: { sets: 3, value: 6 } },

  // === Fondos ===========================================================
  { name: "Fondos en banco", share: 0.35, match: /fondos? (en |de )?(banco|silla|triceps)|bench dip/, unit: "reps", equipment: "none", chain: "dip", level: 1, gate: { sets: 3, value: 15 },
    note: "Manos detrás, pies en el suelo." },
  { name: "Fondos asistidos", share: 0.55, match: /fondos? asistid|dips? asistid/, unit: "reps", equipment: "bar", chain: "dip", level: 2, gate: { sets: 3, value: 8 } },
  { name: "Fondos en paralelas", share: 1, match: /fondo|dip\b|paralelas/, unit: "reps", equipment: "bar", chain: "dip", level: 3, gate: { sets: 3, value: 10 } },

  // === Pierna — nada de equipo =========================================
  { name: "Sentadilla isométrica", share: 0.65, match: /sentadilla isometrica|wall sit|silla contra/, unit: "hold", equipment: "none",
    note: "Espalda en la pared, muslos paralelos al suelo." },
  { name: "Sentadilla a una pierna asistida", share: 0.75, match: /sentadilla.*(asistid|apoyad)/, unit: "reps", equipment: "none", chain: "squat", level: 4, gate: { sets: 3, value: 8 } },
  { name: "Pistol squat", share: 0.85, match: /pistol|sentadilla a una pierna/, unit: "reps", equipment: "none", chain: "squat", level: 6, gate: { sets: 3, value: 5 },
    note: "Una pierna hasta abajo, la otra estirada al frente." },
  { name: "Shrimp squat", share: 0.8, match: /shrimp/, unit: "reps", equipment: "none", chain: "squat", level: 5, gate: { sets: 3, value: 5 } },
  { name: "Sentadilla búlgara", share: 0.65, match: /bulgara/, unit: "reps", equipment: "none", chain: "squat", level: 3, gate: { sets: 3, value: 10 },
    note: "Pie de atrás elevado. Necesitas algo donde apoyarlo." },
  { name: "Zancada", share: 0.65, match: /zancada|lunge|desplante/, unit: "reps", equipment: "none", chain: "squat", level: 2, gate: { sets: 3, value: 12 },
    note: "Cuenta las reps por pierna." },
  { name: "Sentadilla", share: 0.65, match: /sentadilla|squat/, unit: "reps", equipment: "none", chain: "squat", level: 1, gate: { sets: 3, value: 20 },
    note: "Hasta abajo, talones en el suelo." },
  { name: "Subida a cajón", share: 0.65, match: /subida a caj|step ?-?up/, unit: "reps", equipment: "none" },

  // === Cadena posterior =================================================
  { name: "Puente de glúteo a una pierna", share: 0.55, match: /puente.*(una pierna|unilateral)/, unit: "reps", equipment: "none", chain: "hinge", level: 2, gate: { sets: 3, value: 12 } },
  { name: "Puente de glúteo", share: 0.45, match: /puente de gluteo|hip thrust|glute bridge/, unit: "reps", equipment: "none", chain: "hinge", level: 1, gate: { sets: 3, value: 20 } },
  { name: "Curl nórdico", share: 0.85, match: /nordic|nordico/, unit: "reps", equipment: "none", chain: "hinge", level: 3,
    note: "Necesitas que alguien o algo te sujete los tobillos." },

  // === Core — elevaciones de pierna ====================================
  { name: "Elevación de rodillas colgado", share: 0.35, match: /elevacion de rodillas colgad|hanging knee raise/, unit: "reps", equipment: "bar", chain: "legraise", level: 3, gate: { sets: 3, value: 12 },
    note: "Mueve menos peso que tumbado, pero además tienes que sostenerte." },
  { name: "Elevación de piernas colgado", share: 0.55, match: /elevacion de piernas colgad|hanging leg raise/, unit: "reps", equipment: "bar", chain: "legraise", level: 4, gate: { sets: 3, value: 10 },
    note: "Piernas rectas hasta la horizontal, sin balanceo." },
  { name: "Toes to bar", share: 0.65, match: /toes ?to ?bar|punteras a la barra/, unit: "reps", equipment: "bar", chain: "legraise", level: 5 },
  { name: "Elevación de rodillas", share: 0.25, match: /elevacion de rodillas|knee raise/, unit: "reps", equipment: "none", chain: "legraise", level: 1, gate: { sets: 3, value: 15 } },
  { name: "Elevación de piernas", share: 0.5, match: /elevacion de piernas|leg raise/, unit: "reps", equipment: "none", chain: "legraise", level: 2, gate: { sets: 3, value: 15 },
    note: "Tumbado, lumbar pegada al suelo." },

  // === Core — isométricos ==============================================
  { name: "L-sit en barra", share: 1, match: /l ?-?sit.*barra/, unit: "hold", equipment: "bar", chain: "core", level: 4 },
  { name: "L-sit", share: 1, match: /l ?-?sit/, unit: "hold", equipment: "none", chain: "core", level: 3, gate: { sets: 3, value: 20 },
    note: "Sentado, manos en el suelo, piernas rectas al frente." },
  { name: "Hollow hold", share: 0.35, match: /hollow/, unit: "hold", equipment: "none", chain: "core", level: 2, gate: { sets: 3, value: 40 } },
  { name: "Plancha lateral", share: 0.3, match: /plancha lateral|side plank/, unit: "hold", equipment: "none" },
  { name: "Plancha", share: 0.35, match: /abdominal|crunch|plancha/, unit: "hold", equipment: "none", chain: "core", level: 1, gate: { sets: 3, value: 45 },
    note: "Cadera ni alta ni hundida." },

  // === Palancas — barra ================================================
  { name: "Colgarse de la barra", share: 1, match: /dead ?hang|colgarse/, unit: "hold", equipment: "bar", chain: "pull", level: 1, gate: { sets: 3, value: 30 },
    note: "Lo primero de todo: agarre y hombros antes que dominadas." },
  { name: "Front lever agrupado", share: 1, match: /front lever agrupad|tuck front lever/, unit: "hold", equipment: "bar", chain: "lever", level: 1, gate: { sets: 3, value: 20 },
    note: "Rodillas al pecho, espalda paralela al suelo." },
  { name: "Front lever a una pierna", share: 1, match: /front lever.*(una pierna|abierto)|straddle front/, unit: "hold", equipment: "bar", chain: "lever", level: 2, gate: { sets: 3, value: 15 } },
  { name: "Front lever", share: 1, match: /front lever|plancha frontal/, unit: "hold", equipment: "bar", chain: "lever", level: 3 },
  { name: "Back lever", share: 1, match: /back lever/, unit: "hold", equipment: "bar" },
  { name: "Planche lean", share: 0.7, match: /planche lean|inclinacion planche/, unit: "hold", equipment: "none" },
  { name: "Flexiones pseudo planche", share: 0.75, match: /pseudo planche/, unit: "reps", equipment: "none" },
  { name: "Planche", share: 1, match: /planche/, unit: "hold", equipment: "none" },

  // === Otros ============================================================
  { name: "Burpee", share: 0.6, match: /burpee/, unit: "reps", equipment: "none" },
  { name: "Escalador", share: 0.35, match: /escalador|mountain climber/, unit: "reps", equipment: "none" },
  { name: "Superman", share: 0.3, match: /superman/, unit: "reps", equipment: "none" }
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

/**
 * Match order, derived rather than hand-maintained.
 *
 * The table above is grouped by progression because that is how it is read
 * and edited, but matching needs the opposite order: the generic
 * /flexion/ also matches "flexiones arquero", so whichever comes first in
 * the array wins. Hand-ordering one table for both jobs is what produced
 * the bench-dips bug, and it broke again the moment the table grew —
 * archer, diamond, one-arm and handstand push-ups all silently fell back
 * to the plain push-up's share.
 *
 * So genericity is measured instead: a pattern that matches other
 * movements' names is more general than they are, and is tried after
 * them. Counting the matches gives a total order, which a pairwise
 * comparator would not, and it is computed from the data — adding a
 * variant can no longer put it in the wrong place.
 */
const MATCH_ORDER: KnownMovement[] = (() => {
  const genericity = new Map<KnownMovement, number>(
    MOVEMENTS.map((m) => [
      m,
      MOVEMENTS.filter((other) => other !== m && m.match.test(foldText(other.name))).length
    ])
  );
  return [...MOVEMENTS].sort((a, b) => genericity.get(a)! - genericity.get(b)!);
})();

/** 0 when the movement isn't recognised as bodyweight-loaded. */
export function shareFromName(exerciseName: string): number {
  return movementFromName(exerciseName)?.share ?? 0;
}

/** The table entry a freely typed name resolves to, or null. */
export function movementFromName(exerciseName: string): KnownMovement | null {
  const folded = foldText(exerciseName || "");
  for (const m of MATCH_ORDER) {
    if (m.match.test(folded)) return m;
  }
  return null;
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

// === Progresiones =====================================================
//
// The chains above are what makes this more than a scoring table. A
// calisthenics log has no weight to add, so progress is made by moving to
// a harder variant — and the hard part is knowing when. MacroFactor's
// "smart progression" does not answer this: it adjusts load and reps
// inside a program, which is the barbell version of the question. So each
// step carries its own gate (`sets` clean sets of `value` reps, or of
// `value` seconds for a hold), and clearing it is what unlocks the next.
//
// The gates are the conventional thresholds used in calisthenics practice
// — enough volume at one step that the next is a stretch rather than a
// wall — not measurements. They are a nudge, not a rule: the next step is
// offered, never forced.

/** Every step of a chain, easiest first. */
export function chainSteps(chain: ChainId): KnownMovement[] {
  return MOVEMENTS.filter((m) => m.chain === chain && m.level != null).sort(
    (a, b) => a.level! - b.level!
  );
}

/** The step after this one, if the chain has one. */
export function nextInChain(movement: KnownMovement): KnownMovement | null {
  if (!movement.chain || movement.level == null) return null;
  return chainSteps(movement.chain).find((m) => m.level! > movement.level!) ?? null;
}

export interface GateSet {
  reps?: number | null;
  holdSeconds?: number | null;
}

/**
 * Whether a session clears a movement's gate.
 *
 * Counted per set, not as a total: three sets of eight is the point, and
 * twenty-four reps in one long set is a different thing.
 */
export function clearsGate(movement: KnownMovement, sets: GateSet[]): boolean {
  const gate = movement.gate;
  if (!gate) return false;
  const reached = sets.filter((s) => {
    const value = movement.unit === "hold" ? s.holdSeconds ?? 0 : s.reps ?? 0;
    return value >= gate.value;
  }).length;
  return reached >= gate.sets;
}

export interface ProgressionHint {
  /** The step just cleared. */
  from: KnownMovement;
  /** What to try next. */
  next: KnownMovement;
}

/**
 * "You're ready for the next one" — or null, which is the normal answer.
 *
 * Takes the best session rather than the latest, so one bad day doesn't
 * retract a step you have already earned.
 */
export function progressionHint(exerciseName: string, bestSession: GateSet[]): ProgressionHint | null {
  const movement = movementFromName(exerciseName);
  if (!movement || !clearsGate(movement, bestSession)) return null;
  const next = nextInChain(movement);
  return next ? { from: movement, next } : null;
}

/** Human-readable gate, for showing what is still missing. */
export function gateLabel(movement: KnownMovement): string | null {
  if (!movement.gate) return null;
  const { sets, value } = movement.gate;
  return movement.unit === "hold" ? `${sets}×${value}s` : `${sets}×${value}`;
}
