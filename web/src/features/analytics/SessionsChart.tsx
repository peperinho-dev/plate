// Sessions per week, ported from buildSessionsChart() in app.js.
//
// No Y axis by design: the number that matters is already spelled out in
// the "Sesiones" row above, so this is here to show the rhythm — whether
// weeks are steady or spiky — not to be read off precisely.
import { formatShortDate } from "../../shared/lib/format";
import type { WeekBucket } from "../../shared/lib/analytics";

const H = 100;
const PAD_BOTTOM = 16;

export function SessionsChart({ weeks }: { weeks: WeekBucket[] }) {
  if (weeks.length < 2) return null;

  const chartH = H - PAD_BOTTOM;
  const w = Math.max(300, weeks.length * 40);
  const barW = w / weeks.length;
  const maxVal = Math.max(...weeks.map((wk) => wk.count), 1);

  return (
    <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id="sessionsBarGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {weeks.map((wk, i) => {
        const barH = (wk.count / maxVal) * chartH;
        return (
          <rect
            key={wk.label}
            x={i * barW + barW * 0.2}
            y={chartH - barH}
            width={barW * 0.6}
            height={Math.max(1.5, barH)}
            rx={3}
            fill={wk.count > 0 ? "url(#sessionsBarGradient)" : "var(--line)"}
          />
        );
      })}

      {weeks.map((wk, i) => (
        <text
          key={wk.label}
          x={i * barW + barW / 2}
          y={H - 4}
          fontSize={9}
          textAnchor="middle"
          fill="var(--ink-faint)"
        >
          {formatShortDate(wk.label)}
        </text>
      ))}
    </svg>
  );
}
