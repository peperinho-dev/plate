// The share of your bodyweight a movement moves, as a chip.
//
// This was a line of faint grey text under the exercise name and it was
// missed completely — "no me sale ningún desplegable o confirmación para
// saber que va a contar como bodyweight". MacroFactor puts the figure in
// a coloured oval beside the exercise for the same reason: whether a
// movement counts is a property of the movement, not a footnote about it.
//
// Zero is stated rather than hidden. An exercise contributing nothing to
// volume is exactly the case worth seeing before you add it.
interface BodyweightChipProps {
  share: number;
}

export function BodyweightChip({ share }: BodyweightChipProps) {
  const known = share > 0;
  return (
    <span
      className={"bw-chip" + (known ? "" : " is-none")}
      title={known ? "Parte del peso corporal que cuenta como carga" : "No cuenta peso corporal"}
    >
      {known ? `${Math.round(share * 100)}%` : "—"}
    </span>
  );
}
