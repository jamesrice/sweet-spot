// Between-run persistence: best score, longest run, the perfects from your
// best run, and a local Sweet Legends board. All localStorage — the Cloudflare
// KV board in worker/scores.js takes over when deployed.

const KEY = "sweetspot.v1";
const DEFAULTS = {
  best: 0,             // best score
  bestBites: 0,        // longest run, in bites
  bestPerfects: 0,     // perfects landed during the best-scoring run
  board: [],           // [{n, s, b, t}]
  seenTutorial: false,
  muted: false,
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export const Meta = {
  data: load(),

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  },

  // Fold a finished run into the profile. Returns what changed, for the UI.
  // A run abandoned with the home button never lands here, so it doesn't count.
  record(run) {
    const d = this.data;
    const prevBest = d.best;
    const isBest = run.score > prevBest;
    if (isBest) { d.best = run.score; d.bestPerfects = run.perfects; }
    if (run.locks > d.bestBites) d.bestBites = run.locks;
    this.save();
    return { isBest, prevBest };
  },

  submit(name, run) {
    const row = { n: (name || "YOU").slice(0, 3).toUpperCase(), s: run.score, b: run.locks, t: Date.now() };
    this.data.board = [...this.data.board, row].sort((a, b) => b.s - a.s).slice(0, 10);
    this.save();
    return this.data.board;
  },

  setMuted(v) { this.data.muted = v; this.save(); },
  markTutorial() { this.data.seenTutorial = true; this.save(); },
};
