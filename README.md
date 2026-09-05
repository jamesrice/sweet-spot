# Sweet Spot

**No Ordinary Apple. One Bite. Timing Matters.**

A one-thumb timing arcade game for [SweeTango](https://sweetango.com/): an
apple sweeps a circular track, a glowing sweet spot opens ahead of it, and you
tap to bite while the apple is inside the spot. Every bite flips the loop's
direction, speeds it up and narrows the spot. One miss ends the run.

Gameplay is the same engine as [Loop De Drop](https://github.com/jamesrice/drops-loop);
everything you see and hear is SweeTango's —
the 2026 site's logo, Gilroy + Recoleta, the hero gradients from
`/where-to-buy/` and `/our-growers/`, the six floating fruit props from the
home page, and the site's own flavour vocabulary.

**Stack:** static site, no build step, plain ES modules. One transparent 2D
canvas for the game over a DOM background (gradient + props), DOM for all
chrome, served by a Cloudflare **Worker** with an assets binding (not Pages)
that also hosts the leaderboard API.

```
public/    the entire served site — nothing outside it is public
worker/    index.js routes /api/*, everything else falls through to assets
scripts/   local dev server (never deployed)
```

## Play

```bash
npm run dev            # http://localhost:8799
```

- **Tap / click / Space** — bite
- **M** — mute · **⌂** — bail out to the home screen
- **How to Play** on the home screen replays the three-slide tutorial any time
- **TASTE SWEETANGO** on the home screen (and a small link on the results
  sheet) opens sweetango.com in a new tab. Beat your best and the results
  sheet swaps that link for **FIND SWEETANGO NEAR YOU** → the store locator
- **SHARE** on the results sheet hands a 1080×1920 Story card (score, stage
  gradient, props, logo) to the OS share sheet; where files can't be shared
  it downloads the PNG. See `js/share.js`
- The home screen counts down to the season (`SEASON` in `js/style.js` —
  update the dates each year) and celebrates while it's on
- Phones that support it get a short buzz per bite, a longer one on perfects

### One pace that turns into two

There is no mode picker. A run starts at Loop De Drop's easy setting
(1.75 rad/s, a 1.05 rad spot) and every bite multiplies the spin by 1.042 and
the spot by 0.962, until it is running at the old expert ceiling (8.5 rad/s,
0.22 rad). Roughly: bite 10 feels like the old expert start, bite 26 is
5 rad/s, bite 38 is flat out. The HUD pill under the score names the pace —
**Warm-up → Big Crunch → Full Zing** — and the current stage.

### Stages

Every **7 bites** the scene turns over: the background gradient crossfades,
the two floating props swap (only two ever show at once), the sweet spot takes
the stage's colour, a short riser plays, and a line of SweeTango's own
tasting copy appears under the pace pill (`MILESTONES` in `js/style.js`).

| Stage | Gradient | Props |
|---|---|---|
| Crisp | peach → lemon (where-to-buy hero) | apple, apple slices |
| Zesty | lemon → lime | lemon, orange half |
| Honey Sweet | honey → blush | honey stick, cinnamon |
| Zingy | lime → mint (our-growers hero) | apple slices, lemon |
| Brown Sugary | blush → pink | cinnamon, apple |
| One-of-a-kind | mint → lemon | orange half, honey stick |

The list cycles, so a monster run keeps changing rather than freezing on the
last look. All of it is data in `js/style.js` (`STAGES`, `STAGE_LEN`).

### Scoring

The number in the middle of the loop is your **combo** — consecutive
**perfects**. It doubles as your score multiplier, capped at **×10** (the combo
itself keeps climbing past that; only the multiplier stops).

| | |
|---|---|
| Bite anywhere in the spot | `10 × multiplier`, and the combo resets to 0 |
| PERFECT BITE (bright core of the spot) | `10 × multiplier` plus `15 × multiplier`, and the combo goes up 1 |

Every good bite pops a word from the SweeTango lingo — *Crisp! Sweet! Zesty!
Zingy! Honey Sweet! Brown Sugary! Big Crunch!* … — drawn from a shuffled bag so
nothing repeats until the bag empties. A perfect adds a red **PERFECT BITE**
tag above the word.

## Meta layer

`js/meta.js` keeps three numbers in localStorage, shown on the home screen:
best score, longest run (bites), and the perfects from your best-scoring run.
A run abandoned with the home button never reaches `record()`, so it doesn't
count toward any of them.

## Live board

`worker/scores.js` backs the **Crunch Legends** board with Workers KV (binding
`SCORES`, namespace `SWEETSPOT_SCORES`). `GET /api/scores` returns the
all-time global top 10; `POST` takes `{n, s, b}` (3-char initials, score, bites).

The client falls back to a localStorage board whenever the API is unreachable,
which includes `npm run dev` — the python dev server is static-only, so
`/api/scores` 404s there. Use `npm run dev:worker` (`wrangler dev`) to exercise
the real API and KV locally.

## Deploy

```bash
npm run deploy      # wrangler deploy
```

To get push-to-deploy, connect `jamesrice/sweet-spot` to **Cloudflare Workers
Builds** in the dashboard (same recipe as drops-loop): no build command, deploy
`npx wrangler deploy`, version `npx wrangler versions upload`, root `/`. The KV
binding in `wrangler.jsonc` is authoritative for Worker deploys. Never set
`"remote": true` on it — local dev must not touch production data.

## Debug / QA query params

The game is pure timing, so the harness drives it deterministically rather
than by wall clock.

- `?dev` — exposes the engine as `window.__loop`
- `?smoke` — autoplay bot that bites near the centre of every spot; results in
  `window.__SMOKE` and the document title
- `?smoke&sloppy` — bot aims *outside* the spot, so the miss / run-over path
  fires

For a headless check that doesn't depend on animation frames at all, step the
loop by hand:

```js
const L = window.__loop; L.start();
let n = performance.now(); L.last = n;
for (let i = 0; i < 20000 && L.state === 'live'; i++) { n += 16; L.last = n - 16; L.frame(n); /* tap here */ }
```

## Notes

- **Audio** is 100% synthesized in `js/audio.js` — no samples. Every bite is a
  *crunch*: a bright snap, a run of eight irregular noise grains as the flesh
  fractures, a lowpassed chew and a low thump. Normal bites add a quiet marimba
  pluck, perfects add a two-note bell that climbs a pentatonic ladder
  with the combo and then holds. Stage changes get a four-note riser, a new
  best gets a bell fanfare, and run-over is a bonk-and-wah. The AudioContext is
  created inside the first gesture so iOS lets it through.
- The loop is driven by `requestAnimationFrame` with a `setTimeout` backstop,
  so it keeps running in hosts that starve animation frames.
- `js/style.js` holds every colour, stage, lingo word and difficulty constant —
  tuning the game is a data change. `strings.js` holds every visible string.
- **Fonts:** Gilroy (400/500/700/900) and Recoleta (700/900) are the same
  licensed webfonts sweetango.com serves. Use here is approved by the client
  (Fiction Tribe is SweeTango's brand and digital agency). If the files are
  ever pulled, Fraunces (Google Fonts) stands in through the font stack.
- **Props** are the six `home/*.webp` renders from sweetango.com's 2026 theme.
  The favicon is the site's own.
- **Trademark:** the footer carries "SweeTango® is a registered trademark of
  Regents of the University of Minnesota", as the site does.
