import { useAppStore } from "./shared/store";
import { todayKey } from "./shared/lib/date";

// Phase 0 foundation-proof: a deliberately plain, read-only render of
// today's real entries. No styling polish, no modal, no gestures — this
// exists only to prove Vite -> TS -> Zustand -> migrated localStorage data
// -> DOM works end to end before any real feature gets built on top of it.
function App() {
  const days = useAppStore((s) => s.days);
  const key = todayKey(0);
  const entries = days[key]?.entries ?? [];

  return (
    <div style={{ padding: 16, fontFamily: "monospace" }}>
      <h1>Phase 0 smoke test — {key}</h1>
      <p>{entries.length} entries loaded from the migrated store</p>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            {e.name} — {Math.round(e.calories)} kcal
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
