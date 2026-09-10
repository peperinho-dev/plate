# Plate — working notes

Personal calorie + workout tracker PWA, in Spanish, used on a phone as an
installed PWA.

## Two apps, one repo

- **`main`** — the original vanilla JS app (`app.js`, `index.html`,
  `styles.css`). Kept working and deployable.
- **`framework-migration`** — the React + Vite + TypeScript rewrite in
  `web/`. All current work happens here.

Both share `schemaVersion 9` and the same `defaultState` shape, so a vanilla
export imports into the React app intact — verified with populated workouts:
set types, holds, progression groups, timer logs and multi-interval timer
presets all survive, and migration fills in fields the old app never wrote
(`barcodeCache`, `profile.targetWeightKg`).

## Pushing deploys

`.github/workflows/deploy.yml` triggers on push to `framework-migration`, so
**every commit ships** to `peperinho-dev.github.io/plate/`. There is no
separate release step.

## Running it

Start the dev server with the preview tool using the name `plate-web` from
`.claude/launch.json` — not with a shell command.

Typecheck with **`npx tsc -b --noEmit`** from `web/`. Plain `tsc --noEmit` is
a silent no-op here: the root `tsconfig.json` is solution-style (`"files": []`
plus `references`), so it checks nothing and reports success. `npm run build`
does typecheck. Lint is `npx oxlint src`; the two `Toast.tsx`
`only-export-components` warnings are expected.

## What can't be verified from a dev browser

The browser pane reports `document.visibilityState: "hidden"`, so rAF-driven
gestures never run, and `getUserMedia` is blocked. These need a real device:

- swipe-to-delete, drag-to-reorder (dnd-kit)
- camera barcode scanning
- whether the rest-timer beep is audible with the ringer off

## Test data

Realistic seeded data is worth having in the dev server. Write a generator
producing ~3 weeks of varied food, calisthenics progression and a weight
trend, then: copy it to `web/public/__seed3w.js`, run
`eval(await (await fetch('/__seed3w.js')).text())` in the page, and **delete
the file** so it is never committed. The seed is date-relative — re-run it
after midnight or "today" reads empty.

## Invariants worth knowing

- `web/src/styles/styles.css` and the vanilla `styles.css` at the repo root
  on `main` are **separate files**; editing one never affects the other.
  New React-only *rules* still go below the marked banner, but the file is
  no longer byte-identical above it — the type scale and the selection
  colours are cross-cutting and had to change declarations in place. To see
  the divergence, diff against `git show main:styles.css`; don't trust the
  banner to mean byte-identity.
- Spacing uses a 4px scale with three rails: screen (18px), card (+16),
  tile (+12). Sheets own their own vertical rhythm — direct children of
  `.modal-sheet` carry no vertical margin.
- A block that draws a divider and sits against a card's bottom needs
  `padding-top: var(--card-pad)`, or it rides high in its strip.
- Type uses eight `--fs-*` steps, one per role. Add a step only for a role
  that genuinely doesn't exist yet, never to nudge one label — the app got
  to 13 sizes that way. Two documented exceptions: `--fs-display-xl` (the
  full-screen rest timer only) and `--fs-input: 16px`, which is functional
  — iOS zooms the viewport when a focused input is smaller.
- `--ink`, `--ink-soft`, `--ink-faint` and `--ink-pressed` are text and
  interaction-state colours. Never fill a shape with them: they invert
  between themes, so a "dark" fill becomes near-white in dark mode. Both
  the streak grid and the selected day had this bug. Selection anywhere is
  `--accent-soft` + `--accent-ink`, the tab bar's language.
- Entry cloning goes through `cloneEntry`, whose field list is exhaustive at
  compile time. Three separate bugs came from hand-copying entries and
  dropping `basis`.
- Volume counts bodyweight as resistance (`shared/lib/bodyweight.ts`), because
  plain weight × reps reads zero for calisthenics. Unrecognised exercise names
  contribute 0 rather than a guess; the share is overridable per exercise.
- Progress photos live in IndexedDB (`plate-photos` → `photos`), never
  localStorage, and ride inside the backup JSON as data URLs — updating the
  app means reinstalling it, so an export without them would lose them.

## Design reference

The UI follows MacroFactor's, read from its help centre. Those articles are
JS-rendered: `curl` returns an empty shell and `innerText` is empty in-page.
Read the inline `<script>` tags' `textContent`, unescape the Next.js RSC
payload and extract the article HTML from it. Articles resolve by numeric id
(the slug is ignored); collections are `18-macrofactor-nutrition` and
`20-macrofactor-workouts`. Images are on `staticfiles.gleap.io` — for GIFs,
extract frames with `ffmpeg` to read them as stills.
