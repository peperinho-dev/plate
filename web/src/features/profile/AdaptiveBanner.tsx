// Surfaces a weekly calorie-target suggestion when the weight trend has
// drifted from the goal rate. Always a suggestion the user confirms —
// never a silent change to their targets.
import { useEffect } from "react";
import { useAppStore } from "../../shared/store";
import { showToast } from "../../shared/components/Toast";
import { acceptAdaptiveSuggestion, dismissAdaptiveSuggestion, maybeCheckAdaptive } from "./adaptive";

export function AdaptiveBanner() {
  const suggestion = useAppStore((s) => s.adaptive.suggestion);

  // Weekly check, run once on mount rather than on every render.
  useEffect(() => {
    maybeCheckAdaptive();
  }, []);

  if (!suggestion || suggestion.dismissed) return null;

  const up = suggestion.deltaKcal > 0;
  const amount = Math.abs(suggestion.deltaKcal);

  return (
    <div className="adaptive-banner">
      <p>
        Tu peso va a {suggestion.actualRate > 0 ? "+" : ""}
        {suggestion.actualRate} kg/semana. Para acercarte a tu objetivo, prueba a{" "}
        {up ? "subir" : "bajar"} el rango {amount} kcal.
      </p>
      <div className="adaptive-banner-actions">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            acceptAdaptiveSuggestion();
            showToast("Rango ajustado");
          }}
        >
          Ajustar
        </button>
        <button type="button" className="link-btn link-btn--muted" onClick={dismissAdaptiveSuggestion}>
          Ahora no
        </button>
      </div>
    </div>
  );
}
