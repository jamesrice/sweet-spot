// Visual + tuning tokens for Sweet Spot. Everything the renderer, the stage
// system and the difficulty curve read lives here — retuning the game is a
// data change.
//
// Palette comes straight from sweetango.com's 2026 theme: the SweeTango green
// (#005544) that the logo is drawn in, the lime that the site uses as its
// secondary, and the two hero gradients from /where-to-buy/ (peach → lemon)
// and /our-growers/ (lime → mint).

export const PAL = {
  green: "#005544",       // SweeTango green — logo, ink, the track ring
  greenDeep: "#0b2211",
  lime: "#E3FF96",        // site secondary — CTA text, default sweet spot
  limeBright: "#C8FF8D",
  mint: "#B2FFD9",
  peach: "#FFCCA2",
  lemon: "#F7FF96",
  gold: "#FFDE34",
  honey: "#FFB84D",
  blush: "#FFDFEF",
  red: "#AA111B",         // apple skin (site's red)
  redBright: "#E0323F",
  flesh: "#FFF1D6",       // apple flesh — trail, bite confetti
  leaf: "#2F9E5B",
  stem: "#6B4423",
  white: "#FFFFFF",
};

// Each stage lasts STAGE_LEN bites. When a stage turns over the background
// gradient crossfades, the two floating props swap, the sweet spot takes the
// stage's colour and a short riser plays. The stages cycle once the list is
// exhausted, so a monster run keeps changing rather than freezing on the last.
export const STAGE_LEN = 7;

export const STAGES = [
  { name: "Crisp",         grad: ["#FFCCA2", "#F7FF96"], props: ["apple-top",    "apple-slices"], zone: "#E3FF96" },
  { name: "Zesty",         grad: ["#F7FF96", "#C8FF8D"], props: ["lemon",        "orange-half"],  zone: "#FFDE34" },
  { name: "Honey Sweet",   grad: ["#FFE68C", "#FFC9B0"], props: ["honey-stick",  "cinnamon"],     zone: "#FFB84D" },
  { name: "Zingy",         grad: ["#C8FF8D", "#B2FFD9"], props: ["apple-slices", "lemon"],        zone: "#F7FF96" },
  { name: "Brown Sugary",  grad: ["#FFC9B0", "#FFDFEF"], props: ["cinnamon",     "apple-top"],    zone: "#FFCCA2" },
  { name: "One-of-a-kind", grad: ["#B2FFD9", "#F7FF96"], props: ["orange-half",  "honey-stick"],  zone: "#C8FF8D" },
];

// Every image the stages can show — preloaded at boot so a swap never flashes.
export const PROPS = ["apple-top", "apple-slices", "orange-half", "honey-stick", "lemon", "cinnamon"];

// SweeTango lingo — one of these pops on every good bite, drawn from a
// shuffled bag so nothing repeats until the bag empties. Wording is lifted
// from sweetango.com's own flavour vocabulary.
export const LINGO = [
  "Crisp!", "Sweet!", "Zesty!", "Zingy!", "Honey Sweet!", "Brown Sugary!",
  "Big Crunch!", "Sweet Bite!", "Juicy!", "One-of-a-kind!", "Delightful!", "Snappy!",
];

// One pace, one curve. A run starts at Loop De Drop's easy setting and every
// bite multiplies the spin and shrinks the sweet spot until it's running at the
// old expert ceiling — the "slow mode becomes the fast mode" progression.
//   bite 10 ≈ old expert start (2.65 rad/s, 0.71 rad spot)
//   bite 26 ≈ 5 rad/s · bite 38 hits the 8.5 rad/s ceiling · spot floors at 0.22 rad
export const CURVE = {
  spin: 1.75, spinStep: 1.042, spinMax: 8.5,
  zone: 1.05, zoneStep: 0.962, zoneMin: 0.22,
};

// HUD pace label thresholds, in rad/s.
export const PACE = [
  { at: 0,   label: "Warm-up" },
  { at: 3.0, label: "Big Crunch" },
  { at: 5.5, label: "Full Zing" },
];

// Scoring — unchanged from Loop De Drop so the two games feel like siblings.
export const SCORE = {
  base: 10,          // per bite, before combo
  perfectBonus: 15,  // landing in the bright core of the sweet spot
  perfectBand: 0.24, // fraction of the spot half-width that counts as perfect
  comboCap: 10,      // multiplier ceiling
};

// Bite confetti — flesh, skin, leaf, and the current stage colour.
export const BITE_BITS = [PAL.flesh, PAL.flesh, PAL.flesh, PAL.red, PAL.redBright, PAL.leaf, PAL.lime];

// SweeTango is a short-season apple. The home screen counts down to
// SEASON.start, celebrates while it's on, and rests after SEASON.end.
// Update both dates each year (ISO, local time).
export const SEASON = { start: "2026-09-01", end: "2026-11-30" };

// A beat of the site's tasting copy shown under the pace pill each time a
// stage turns over (index = stage index; cycles with the stages).
export const MILESTONES = [
  "Still crunching? Legend.",                            // back to Crisp after a full cycle
  "Big crunch. Sweet bite.",                              // → Zesty (7)
  "Finishes with a zing.",                                // → Honey Sweet (14)
  "Turns a snack into a moment.",                         // → Zingy (21)
  "One bite and you'll get it.",                          // → Brown Sugary (28)
  "No ordinary apple.",                                   // → One-of-a-kind (35)
];
