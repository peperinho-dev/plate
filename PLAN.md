# Tique — Roadmap for Claude Code

## What this is

"Tique" is a receipt-styled calorie tracker PWA (progressive web app), built as
plain HTML/CSS/JS with no framework. The starting codebase is in this same
folder structure: `index.html`, `styles.css`, `app.js`, `manifest.json`,
`service-worker.js`, `icons/`.

**Current features:**
- Manual food entry (name + kcal, or kcal/100g × grams)
- Barcode scanning via the device camera (`html5-qrcode`), looked up against
  the free Open Food Facts API (good coverage for products sold in Spain)
- A single daily calorie goal with a progress bar
- Day-by-day navigation (‹ Hoy ›)
- Data stored locally in `localStorage`, no backend
- Installable as a home-screen app via the PWA manifest + service worker

**Design language:** the whole UI is styled like a Spanish supermarket
receipt (tique de compra) — perforated edges, dashed dividers, monospace
numbers, a barcode graphic, paper-on-countertop drop shadow. Keep this
identity. Don't chase the generic "clean SaaS dashboard" look — the
receipt metaphor should keep extending into the new screens (e.g. a weight
log could look like a doctor's scale ticket, a weekly summary could look
like a receipt subtotal).

## Why we're changing it

The user loves MacroFactor's approach (a well-regarded macro/calorie
coaching app) and wants Tique to adopt some of its *behavior*, not its
literal visuals (which are MacroFactor's own IP — don't copy their screens
directly). The traits worth carrying over:

- **Timeline logging** — meals are logged at the time they're actually
  eaten, not forced into breakfast/lunch/dinner slots
- **Range-based targets, not hard limits** — a target like "1900–2100 kcal"
  or "150–170g protein" instead of a single number with a red "over" state.
  No red warning colors, no scolding copy — the tone stays judgment-free
- **An analytics view** — trends over time, not just today's total
- **Adaptive targets** — the calorie/macro target adjusts over time based on
  logged weight trend vs. the user's goal rate, instead of staying static
- **A weight-tracking log**, since the user's own goal is to *gain* weight
  at a specific, adjustable rate (this app is being personalized for that
  goal specifically — not just generic tracking)

## Staged build plan

Build and ship each stage as something usable on its own — don't hold
everything for one big release.

### Stage 1 — Profile & weight log (foundation)
This unlocks everything downstream, so it goes first even though it wasn't
in the original scope.
- A settings/profile screen: height, starting weight, and a goal —
  "gain weight" (this user's case) or "lose weight" / "maintain", at a
  **rate the user sets themselves** (e.g. grams/week or kg/month) — don't
  hardcode a rate, make it an editable field
- A simple weight log: date + weight, entered manually (a scale-ticket
  style entry, fits the receipt theme)
- Store weight entries in the same `localStorage` data structure, e.g.
  `state.weightLog = [{date, weightKg}]`
- No analytics yet — just capture the data reliably

### Stage 2 — Timeline logging
- Replace the flat "today's items" list with entries plotted by the time
  they were logged (still receipt-styled — think a till receipt printed
  throughout the day rather than all at once)
- "Copy from yesterday" and quick re-add of recent/frequent items — this is
  the single biggest speed win for daily use

### Stage 3 — Range-based targets
- Calculate an initial calorie range from: current weight, goal (gain), and
  the user's chosen rate (e.g. weight-gain rate → surplus estimate). Use an
  established, defensible formula (e.g. Mifflin-St Jeor for baseline TDEE,
  then add a surplus derived from the target rate) — this doesn't need to
  be exact, it needs to be a reasonable starting point the user can see and
  override
- Let the user override the calculated range manually at any time
- Same range treatment for macros if/when the user wants them tracked
- Replace the current single-number progress bar with a "band" —
  within-range / above-range / below-range, no red, calm neutral labeling

### Stage 4 — Analytics dashboard
- Weekly/monthly calorie trend chart
- Weight trend chart (raw entries + a smoothed trend line — daily weight
  fluctuates a lot, the trend is what matters)
- "Top contributors" — which logged items made up most of the week's
  calories
- This stage benefits from having real logged data first, so it's fine for
  it to come after the user's been using Stages 1–3 for a bit

### Stage 5 — Adaptive targets (stretch goal)
- On a weekly cadence, compare the logged weight trend against the user's
  goal rate
- If actual trend is behind or ahead of the goal rate, suggest a target
  adjustment (a suggestion the user confirms, not a silent auto-change —
  keep the user in control)
- This is the hardest part algorithmically; treat Stages 1–4 as the
  priority and this as a true stretch goal

## Constraints to carry through every stage

- Keep it a framework-free PWA (or propose a change and explain why, but
  the current app has no build step and that's a deliberate simplicity
  choice worth preserving unless there's a real reason to add one)
- No ads, no account/login requirement, no cloud sync — local-first, like
  today
- No red "you failed" states anywhere — this app's whole tone is
  judgment-free tracking, not scolding
- Keep the receipt/paper visual identity; extend it, don't replace it
- Data model changes should stay additive to `localStorage` (bump a schema
  version if a structural change is needed, and migrate old data forward)
