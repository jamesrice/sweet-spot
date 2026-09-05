// Wiring: screens, HUD, the stage scenery and the meta layer around js/loop.js.

import { Loop } from "./js/loop.js";
import { Meta } from "./js/meta.js";
import { Sfx } from "./js/audio.js";
import { Share } from "./js/share.js";
import { STR } from "./strings.js";
import { STAGES, PROPS, SEASON, MILESTONES } from "./js/style.js";

const $ = (id) => document.getElementById(id);
const screens = { home: $("home"), tut: $("tut"), results: $("results"), board: $("board") };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let screen = "home";
let lastRun = null;
let lastResult = null;
let posted = false;
let tutIndex = 0;
let tutMode = "onboard";   // "onboard" runs into a game; "review" returns home

function show(name) {
  screen = name;
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  $("hud").hidden = name !== "play";
  document.body.dataset.screen = name;
}

/* ---------------- strings ---------------- */
$("titleText").textContent = STR.title;
$("tagText").textContent = STR.tagline;
$("statsTitle").textContent = STR.statsTitle;
$("kBest").textContent = STR.statBest;
$("kBites").textContent = STR.statBites;
$("kPerfects").textContent = STR.statPerfects;
$("playBtn").textContent = STR.play;
$("howBtn").textContent = "❓ " + STR.howToPlay;
$("boardBtn").textContent = "🏆 " + STR.lbTitle.toUpperCase();
$("tasteBtn").href = STR.tasteUrl;
$("tasteBtn").querySelector("span").textContent = STR.taste;
$("kScore").textContent = STR.score;
$("kCombo").textContent = STR.combo;
$("kBitesRun").textContent = STR.bites;
$("kPerf").textContent = STR.perfects;
$("runOverText").textContent = STR.runOver;
$("newBestText").textContent = STR.newBest;
$("againBtn").textContent = STR.again;
$("backBtn").textContent = STR.home.toUpperCase();
$("shareBtn").querySelector("span").textContent = STR.share;
$("cravingText").textContent = STR.craving;
$("tasteLink").href = STR.tasteUrl;
$("tasteLink").textContent = STR.taste;
$("findBtn").href = STR.findUrl;
$("findBtn").querySelector("span").textContent = STR.findNearYou;
$("boardTitle").textContent = STR.lbTitle;
$("boardClose").textContent = STR.close;
$("tutSkip").textContent = STR.skip;
$("tapBar").firstChild.textContent = STR.tapToBite;
$("tapBar").querySelector(".hint").textContent = STR.tapHint;
$("productOf").textContent = STR.productOf;
$("trademark").textContent = STR.trademark;
$("toastFx").textContent = STR.perfect;

/* ---------------- haptics ----------------
   A short buzz on every bite where the device supports it — longer pattern
   for perfects, a triple for the miss. Independent of the mute toggle. */
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
}

/* ---------------- scenery: gradient + floating props ----------------
   Two stacked gradient layers crossfade; two prop slots fade out, swap
   their image, and fade back in. Every prop is preloaded at boot so the
   swap never flashes an empty slot. */
const gradA = $("gradA"), gradB = $("gradB");
const slots = [$("propA"), $("propB")];
let gradTimer = null;

for (const name of PROPS) { const im = new Image(); im.src = `./assets/img/${name}.webp`; }

function setGradient(pair, instant) {
  const css = `linear-gradient(160deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
  clearTimeout(gradTimer);
  if (instant || reduced) {
    gradA.style.background = css;
    gradB.style.transition = "none"; gradB.style.opacity = 0;
    return;
  }
  gradB.style.transition = "none";
  gradB.style.background = css;
  gradB.style.opacity = 0;
  void gradB.offsetWidth;
  gradB.style.transition = "opacity 1.1s ease";
  gradB.style.opacity = 1;
  gradTimer = setTimeout(() => {
    gradA.style.background = css;
    gradB.style.transition = "none";
    gradB.style.opacity = 0;
  }, 1150);
}

function setProps(names, instant) {
  names.forEach((name, i) => {
    const img = slots[i];
    if (img.dataset.name === name) return;
    const src = `./assets/img/${name}.webp`;
    if (instant || reduced) { img.src = src; img.dataset.name = name; img.classList.remove("out"); return; }
    img.classList.add("out");
    clearTimeout(img._swap);
    img._swap = setTimeout(() => { img.src = src; img.dataset.name = name; img.classList.remove("out"); }, 420);
  });
}

function applyStage(stage, instant) {
  setGradient(stage.grad, instant);
  setProps(stage.props, instant);
}

function paintPace(pace, stageName, pop) {
  const el = $("pacePill");
  el.textContent = `${pace} · ${stageName}`;
  if (pop) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
}

// Milestone line: a beat of SweeTango's tasting copy under the pill when a
// stage turns over. Holds a couple of seconds, then fades.
let lineTimer = null;
function paintMilestone(stageIndex) {
  const el = $("stageLine");
  const line = MILESTONES[stageIndex % MILESTONES.length];
  if (!line) return;
  el.textContent = line;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ---------------- season countdown ----------------
   SEASON.start / SEASON.end live in js/style.js — update them each year. */
function paintSeason() {
  const el = $("season");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(SEASON.start + "T00:00:00");
  const end = new Date(SEASON.end + "T23:59:59");
  let text, state;
  if (today < start) {
    const n = Math.ceil((start - today) / 86400000);
    text = n === 1 ? STR.seasonTomorrow : STR.seasonSoon.replace("{n}", n);
    state = "soon";
  } else if (now <= end) {
    text = STR.seasonNow; state = "now";
  } else {
    text = STR.seasonOver; state = "over";
  }
  el.textContent = text;
  el.dataset.state = state;
}

/* ---------------- home ---------------- */
function paintHome() {
  const d = Meta.data;
  $("statBest").textContent = d.best;
  $("statBites").textContent = d.bestBites;
  $("statPerfects").textContent = d.bestPerfects;
  paintSeason();
  applyStage(STAGES[0]);
}

/* ---------------- tutorial ---------------- */
function paintTut() {
  const host = $("tutDots");
  if (host.children.length !== STR.tutorial.length) {
    host.innerHTML = STR.tutorial.map(() => "<i></i>").join("");
  }
  const t = STR.tutorial[tutIndex];
  $("tutStep").textContent = `${tutIndex + 1} / ${STR.tutorial.length}`;
  $("tutTitle").textContent = t.title;
  $("tutBody").textContent = t.body;
  const last = tutIndex === STR.tutorial.length - 1;
  $("tutNext").textContent = last ? (tutMode === "review" ? STR.gotIt : STR.play) : STR.next;
  $("tutSkip").hidden = tutMode === "review";
  const dots = $("tutDots").children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === tutIndex);
}
$("tutNext").addEventListener("click", () => {
  if (tutIndex < STR.tutorial.length - 1) { tutIndex++; paintTut(); }
  else if (tutMode === "review") { paintHome(); show("home"); }
  else { Meta.markTutorial(); beginRun(); }
});
$("tutSkip").addEventListener("click", () => { Meta.markTutorial(); beginRun(); });

function openTutorial(mode) {
  tutMode = mode; tutIndex = 0; paintTut(); show("tut");
}
$("howBtn").addEventListener("click", () => openTutorial("review"));

/* ---------------- run lifecycle ---------------- */
function beginRun() {
  posted = false;
  show("play");
  $("scoreVal").textContent = "0";
  $("comboVal").textContent = "x0";
  $("hudBest").textContent = `${STR.best} ${Meta.data.best}`;
  $("tapBar").style.display = "";
  $("toast").classList.remove("pop");
  $("stageLine").classList.remove("show");
  Loop.start();
  paintPace(Loop.paceLabel(), Loop.stage.name, false);
}

$("playBtn").addEventListener("click", () => {
  if (!Meta.data.seenTutorial) openTutorial("onboard");
  else beginRun();
});
$("againBtn").addEventListener("click", beginRun);
$("backBtn").addEventListener("click", () => { paintHome(); show("home"); });
$("homeBtn").addEventListener("click", () => { Loop.state = "idle"; paintHome(); show("home"); });
$("boardBtn").addEventListener("click", () => { paintBoard(); show("board"); });
$("boardClose").addEventListener("click", () => { paintHome(); show("home"); });

$("muteBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  Loop.muted = !Loop.muted;
  Meta.setMuted(Loop.muted);
  $("muteBtn").textContent = Loop.muted ? "🔇" : "🔊";
});

// Every button gets a tick, and any gesture unlocks audio for iOS.
addEventListener("pointerdown", () => Sfx.unlock(), { passive: true });
addEventListener("click", (e) => {
  if (e.target.closest && e.target.closest(".btn, .iconBtn, .link")) Sfx.tick();
});

/* ---------------- share card ---------------- */
$("shareBtn").addEventListener("click", async () => {
  if (!lastRun) return;
  const btn = $("shareBtn");
  const label = btn.querySelector("span");
  const text = STR.shareText.replace("{s}", lastRun.score).replace("{b}", lastRun.locks);
  const how = await Share.share({ title: STR.shareTitle, text });
  if (how === "none") return;
  label.textContent = how === "shared" ? STR.shared : STR.saved;
  setTimeout(() => { label.textContent = STR.share; }, 1800);
});

function prepareShare(run) {
  $("shareBtn").disabled = true;
  Share.render(run, {
    host: location.host.replace(/^www\./, ""),
    tagline: STR.tagline, title: STR.title, siteLabel: STR.siteLabel,
    stats: { score: STR.score, bites: STR.bites, perfects: STR.perfects },
  }).then((blob) => { if (blob && lastRun === run) $("shareBtn").disabled = false; })
    .catch(() => { /* no card — button stays disabled */ });
}

/* ---------------- leaderboard ---------------- */
async function fetchBoard() {
  try {
    const r = await fetch("/api/scores", { cache: "no-store" });
    if (!r.ok) throw new Error("no api");
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) return rows;
  } catch (e) { /* local fallback below */ }
  return Meta.data.board;
}

async function paintBoard(highlight) {
  const rows = await fetchBoard();
  const host = $("boardRows");
  host.innerHTML = "";
  if (!rows.length) {
    const p = document.createElement("div");
    p.className = "empty"; p.textContent = STR.lbEmpty;
    host.appendChild(p);
    return;
  }
  rows.forEach((r, i) => {
    const el = document.createElement("div");
    el.className = "row" + (highlight && r.n === highlight.n && r.s === highlight.s ? " hl" : "");
    const bites = Number.isFinite(Number(r.b)) && r.b != null ? `${r.b} ${STR.lbBites}` : "";
    el.innerHTML = `<span>${i + 1}</span><b>${String(r.n).replace(/[^A-Z0-9]/gi, "")}</b>` +
      `<span class="m">${bites}</span><span>${Number(r.s) || 0}</span>`;
    host.appendChild(el);
  });
}

$("postBtn").addEventListener("click", async () => {
  if (posted || !lastRun) return;
  posted = true;
  const name = ($("initials").value || "YOU").slice(0, 3).toUpperCase();
  const row = { n: name, s: lastRun.score, b: lastRun.locks };
  Meta.submit(name, lastRun);
  try {
    await fetch("/api/scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });
  } catch (e) { /* offline: the local board already has it */ }
  await paintBoard(row);
  show("board");
});

/* ---------------- loop events ---------------- */
Loop.on("score", (s) => {
  $("scoreVal").textContent = s.score;
  $("comboVal").textContent = "x" + s.combo;
});

Loop.on("stage", ({ stage, index, announce }) => {
  applyStage(stage, !announce && screen !== "play");
  if (announce) paintMilestone(index);
});

Loop.on("lock", (info) => {
  $("tapBar").style.display = "none";
  const t = $("toast");
  $("toastName").textContent = info.word;
  $("toastPts").textContent = `+${info.gained}${info.mult > 1 ? `  ×${info.mult}` : ""}`;
  t.classList.toggle("perf", info.perfect);
  t.classList.remove("pop");
  void t.offsetWidth; // restart the animation
  t.classList.add("pop");
  paintPace(info.pace, Loop.stage.name, info.stageUp);
  buzz(info.perfect ? [14, 40, 22] : 12);
});

Loop.on("over", (run) => {
  lastRun = run;
  lastResult = Meta.record(run);
  buzz([45, 60, 45]);
  $("finalScore").textContent = run.score;
  $("tBites").textContent = run.locks;
  $("tPerf").textContent = run.perfects;
  $("newBestText").hidden = !lastResult.isBest;
  // Reward a new best with the action that sells apples: the store locator
  // takes over from the plain "taste" link.
  const best = lastResult.isBest && run.score > 0;
  $("findBtn").hidden = !best;
  $("cravingRow").hidden = best;
  $("initials").value = "";
  $("postBtn").disabled = false;
  prepareShare(run);
  setTimeout(() => {
    show("results");
    if (best) Sfx.fanfare();
  }, 750); // let the confetti land first
});

/* ---------------- input ---------------- */
function onTap(e) {
  if (screen !== "play") return;
  if (e.target.closest(".iconBtn")) return;
  e.preventDefault();
  Loop.tap();
}
addEventListener("pointerdown", onTap, { passive: false });
addEventListener("keydown", (e) => {
  // While typing initials, game shortcuts must stay out of the way. In a text
  // field, Enter submits the score. `closest` guarded: a keydown can target a
  // non-Element (document itself).
  const el = e.target;
  if (el && typeof el.closest === "function" && el.closest("input, textarea")) {
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      $("postBtn").click();
    }
    return;
  }
  if (e.code === "Space" || e.code === "Enter") {
    if (screen === "play") { e.preventDefault(); Loop.tap(); }
    else if (screen === "results") { e.preventDefault(); beginRun(); }
  }
  if (e.key === "m" || e.key === "M") $("muteBtn").click();
});

/* ---------------- boot ---------------- */
Loop.on("layout", ({ cy, R }) => {
  document.documentElement.style.setProperty("--ring-bottom", `${Math.round(cy + R)}px`);
});
Loop.init($("stage"));
Loop.muted = Meta.data.muted;
$("muteBtn").textContent = Loop.muted ? "🔇" : "🔊";
applyStage(STAGES[0], true);
paintHome();
show("home");

/* ---------------- QA harness ----------------
     ?dev          exposes the engine as window.__loop (and the card as __share)
     ?smoke        autoplay bot — bites near the centre of every sweet spot
     ?smoke&sloppy bot aims off-centre, so misses (and the run-over path) fire
   Results land in window.__SMOKE and the document title.               */
const qs = new URLSearchParams(location.search);
if (qs.has("dev") || qs.has("smoke")) { window.__loop = Loop; window.__share = Share; window.__sfx = Sfx; }

if (qs.has("smoke")) {
  const sloppy = qs.has("sloppy");
  Meta.markTutorial();
  window.__SMOKE = { started: false, locks: 0, perfects: 0, score: 0, over: false, stages: 0 };
  Loop.on("lock", (i) => {
    window.__SMOKE.locks++;
    if (i.perfect) window.__SMOKE.perfects++;
    if (i.stageUp) window.__SMOKE.stages++;
    window.__SMOKE.score = i.score;
  });
  Loop.on("over", (r) => {
    Object.assign(window.__SMOKE, { over: true, score: r.score, maxCombo: r.maxCombo, reason: r.reason });
    document.title = `SMOKE score=${r.score} locks=${r.locks} perfect=${r.perfects} reason=${r.reason}`;
  });
  setTimeout(() => { beginRun(); window.__SMOKE.started = true; }, 300);
  // The bot watches the same signed offset the player eyeballs.
  setInterval(() => {
    if (Loop.state !== "live") return;
    let d = (Loop.ang - Loop.zoneC) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d <= -Math.PI) d += Math.PI * 2;
    const aim = sloppy ? Loop.zoneW * 0.62 : 0;   // sloppy aims outside the spot
    if (Math.abs(d - Loop.dir * aim) < Math.max(0.02, Loop.spin * 0.006)) Loop.tap();
  }, 4);
}
