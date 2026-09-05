// Crunch Time — the game itself.
//
// One apple sweeps a circular track. A glowing sweet spot opens somewhere
// ahead of it. Tap to bite while the apple is inside the spot: the loop
// reverses, speeds up, and the spot narrows. Land in the bright core for a
// PERFECT BITE. Let one slip past and the run is over.
//
// There is one pace. It starts slow and every bite tightens the curve until
// it is running flat out — see CURVE in style.js. Every STAGE_LEN bites the
// scene turns over (gradient, floating props, sweet-spot colour) — see STAGES.
//
// Rendering is a single transparent 2D canvas layered over a DOM background;
// all chrome lives in the DOM overlay. The module owns no UI — it emits events
// and app.js decides what to show.

import { PAL, STAGES, STAGE_LEN, LINGO, CURVE, PACE, SCORE, BITE_BITS } from "./style.js";
import { Sfx } from "./audio.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

// signed shortest angular distance from b to a, in (-PI, PI]
function angDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

function shuffled(n) {
  const bag = Array.from({ length: n }, (_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export const Loop = {
  canvas: null, ctx: null,
  w: 0, h: 0, cx: 0, cy: 0, R: 0,
  state: "idle",          // idle | live | over
  handlers: {},

  // run state
  ang: 0, dir: 1, spin: CURVE.spin, zoneC: 0, zoneW: CURVE.zone,
  score: 0, combo: 0, maxCombo: 0, locks: 0, perfects: 0, runTaps: 0,
  wasInside: false,
  stageIdx: 0, stage: STAGES[0],
  lingoBag: [],

  // fx
  parts: [], trail: [], shake: 0, flash: 0, pulse: 0, ringPop: 0, bite: 0,
  last: 0, t: 0,

  get muted() { return Sfx.muted; },
  set muted(v) { Sfx.muted = !!v; },

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
    addEventListener("resize", () => this.resize());
    this.last = performance.now();
    this.schedule();
    return this;
  },

  // Drive the loop from rAF, with a timer backstop for hosts that starve
  // animation frames (background tabs, some embedded webviews). Whichever
  // fires first wins; the other is cancelled on entry to frame().
  schedule() {
    this.rafId = requestAnimationFrame((t) => this.frame(t));
    this.timerId = setTimeout(() => this.frame(performance.now()), 60);
  },

  // Several listeners per event — the UI and the QA harness both subscribe.
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; },
  emit(name, payload) { for (const f of this.handlers[name] || []) f(payload); },

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h * (this.w < 620 ? 0.42 : 0.46);
    this.R = Math.min(this.w * 0.34, this.h * 0.30, 210);
    // Let the DOM overlay place chrome relative to the ring (the lingo toast
    // sits just under it).
    this.emit("layout", { cx: this.cx, cy: this.cy, R: this.R });
  },

  paceLabel() {
    let label = PACE[0].label;
    for (const p of PACE) if (this.spin >= p.at) label = p.label;
    return label;
  },

  stageFor(locks) { return Math.floor(locks / STAGE_LEN) % STAGES.length; },

  setStage(i, announce) {
    this.stageIdx = i;
    this.stage = STAGES[i];
    this.emit("stage", { stage: this.stage, index: i, announce });
  },

  nextLingo() {
    if (!this.lingoBag.length) this.lingoBag = shuffled(LINGO.length);
    return LINGO[this.lingoBag.pop()];
  },

  // Drop a fresh sweet spot ahead of the apple, far enough to be reactable at
  // the current spin speed but never so far it stalls the run.
  placeZone() {
    const lead = clamp(this.spin * 0.46, 1.05, 2.55) + rand(0, 0.75);
    this.zoneC = this.ang + this.dir * (lead + this.zoneW / 2);
    this.wasInside = false;
  },

  start() {
    this.state = "live";
    this.ang = -Math.PI / 2;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.spin = CURVE.spin;
    this.zoneW = CURVE.zone;
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.locks = 0; this.perfects = 0;
    this.runTaps = 0;
    this.parts.length = 0; this.trail.length = 0;
    this.shake = 0; this.flash = 0; this.pulse = 0; this.ringPop = 0; this.bite = 0;
    this.lingoBag = shuffled(LINGO.length);
    this.setStage(0, false);
    this.placeZone();
    this.emit("score", this);
  },

  // The single verb: bite the apple where it stands.
  tap() {
    if (this.state !== "live") return;
    this.runTaps++;
    this.emit("tap");
    const d = Math.abs(angDelta(this.ang, this.zoneC));
    const half = this.zoneW / 2;
    if (d > half) { this.miss("early"); return; }

    const perfect = d <= half * SCORE.perfectBand;

    // The combo is a streak of perfects — a bite anywhere else in the spot
    // keeps the run alive but drops the multiplier back to 1.
    if (perfect) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.perfects++;
    } else {
      this.combo = 0;
    }

    const mult = Math.max(1, Math.min(this.combo, SCORE.comboCap));
    const gained = SCORE.base * mult + (perfect ? SCORE.perfectBonus * mult : 0);

    this.score += gained;
    this.locks++;

    this.burst(perfect ? 38 : 18, perfect);
    Sfx.bite(this.combo, perfect);
    this.pulse = 1; this.ringPop = 1; this.bite = 1;
    if (perfect) this.flash = 0.55;

    // Escalate: reverse, quicken, narrow.
    this.dir *= -1;
    this.spin = Math.min(this.spin * CURVE.spinStep, CURVE.spinMax);
    this.zoneW = Math.max(this.zoneW * CURVE.zoneStep, CURVE.zoneMin);
    this.placeZone();

    const word = this.nextLingo();
    const si = this.stageFor(this.locks);
    const stageUp = si !== this.stageIdx;
    if (stageUp) { this.setStage(si, true); Sfx.stageUp(); }

    this.emit("lock", {
      perfect, gained, mult, word, stageUp,
      combo: this.combo, score: this.score, locks: this.locks, pace: this.paceLabel(),
    });
    this.emit("score", this);
  },

  miss(reason) {
    if (this.state !== "live") return;
    this.state = "over";
    this.shake = 1;
    this.burst(46, true, PAL.red);
    Sfx.over();
    this.emit("over", {
      reason, score: this.score, maxCombo: this.maxCombo, taps: this.runTaps,
      locks: this.locks, perfects: this.perfects, stage: this.stage.name, pace: this.paceLabel(),
    });
  },

  // Bite confetti: apple flesh, skin flecks, a leaf bit, and the stage colour.
  burst(n, big, force) {
    const x = this.cx + Math.cos(this.ang) * this.R;
    const y = this.cy + Math.sin(this.ang) * this.R;
    const cols = [...BITE_BITS, this.stage.zone];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = rand(big ? 90 : 55, big ? 320 : 190);
      const flesh = Math.random() < 0.4;
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: rand(0.5, 1.15), age: 0, rot: Math.random() * TAU, vr: rand(-9, 9),
        w: rand(3.5, 8), h: rand(6, 13), round: flesh,
        c: force && Math.random() < 0.5 ? force : cols[(Math.random() * cols.length) | 0],
      });
    }
  },

  frame(now) {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timerId);
    // Clamped both ways: a host handing back an earlier timestamp must never
    // run the fx backwards (a negative dt would inflate flash/shake instead of
    // decaying them).
    const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.05));
    this.last = now;
    this.t += dt;

    if (this.state === "live") {
      this.ang += this.dir * this.spin * dt;
      this.trail.push({ a: this.ang, age: 0 });

      // Pass-through miss: once the apple has been inside the spot and leaves
      // it un-bitten, the run is over.
      const inside = Math.abs(angDelta(this.ang, this.zoneC)) <= this.zoneW / 2;
      if (inside) this.wasInside = true;
      else if (this.wasInside) this.miss("late");
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].age += dt;
      if (this.trail[i].age > 0.32) this.trail.splice(i, 1);
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 620 * dt;
      p.vx *= 0.99; p.rot += p.vr * dt;
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 2.0);
    this.pulse = Math.max(0, this.pulse - dt * 2.6);
    this.ringPop = Math.max(0, this.ringPop - dt * 3.2);
    this.bite = Math.max(0, this.bite - dt * 2.2);

    this.draw();
    this.schedule();
  },

  // A chunky flat apple, stem up, that always reads at ~24px.
  drawApple(c, x, y, r, glow) {
    c.save();
    c.translate(x, y);
    c.shadowColor = glow || "rgba(0,85,68,0.28)";
    c.shadowBlur = glow ? 20 : 10;
    c.shadowOffsetY = glow ? 0 : 3;
    const g = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
    g.addColorStop(0, PAL.redBright);
    g.addColorStop(1, PAL.red);
    c.fillStyle = g;
    // Body: a circle with a soft dimple at the top and a gentle taper below.
    c.beginPath();
    c.moveTo(0, -r * 0.72);
    c.bezierCurveTo(-r * 0.25, -r * 1.05, -r * 1.1, -r * 0.7, -r * 0.98, -r * 0.05);
    c.bezierCurveTo(-r * 0.9, r * 0.6, -r * 0.45, r * 1.02, 0, r * 0.98);
    c.bezierCurveTo(r * 0.45, r * 1.02, r * 0.9, r * 0.6, r * 0.98, -r * 0.05);
    c.bezierCurveTo(r * 1.1, -r * 0.7, r * 0.25, -r * 1.05, 0, -r * 0.72);
    c.closePath();
    c.fill();
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    // stem
    c.strokeStyle = PAL.stem;
    c.lineWidth = Math.max(1.5, r * 0.17);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(0, -r * 0.7);
    c.quadraticCurveTo(r * 0.04, -r * 1.05, r * 0.16, -r * 1.28);
    c.stroke();
    // leaf
    c.fillStyle = PAL.leaf;
    c.save();
    c.translate(r * 0.46, -r * 1.02);
    c.rotate(-0.55);
    c.beginPath(); c.ellipse(0, 0, r * 0.42, r * 0.17, 0, 0, TAU); c.fill();
    c.restore();
    // highlight
    c.fillStyle = "rgba(255,255,255,0.42)";
    c.beginPath(); c.ellipse(-r * 0.36, -r * 0.3, r * 0.2, r * 0.32, -0.45, 0, TAU); c.fill();
    c.restore();
  },

  draw() {
    const c = this.ctx, w = this.w, h = this.h;
    c.clearRect(0, 0, w, h);

    c.save();
    if (this.shake > 0) {
      const s = this.shake * 13;
      c.translate(rand(-s, s), rand(-s, s));
    }

    const R = this.R * (1 + this.ringPop * 0.02);
    const lw = Math.max(13, R * 0.115);
    // A zero-height host (a pane still initialising) yields a tiny R; drawing
    // arcs with negative radii throws, so wait for a real viewport.
    if (R < lw) { c.restore(); return; }

    // Track: a soft white halo so the green ring floats off the gradient,
    // then the ring itself.
    c.lineCap = "butt";
    c.strokeStyle = "rgba(255,255,255,0.42)";
    c.lineWidth = lw + 12;
    c.beginPath(); c.arc(this.cx, this.cy, R, 0, TAU); c.stroke();
    c.strokeStyle = PAL.green;
    c.lineWidth = lw;
    c.beginPath(); c.arc(this.cx, this.cy, R, 0, TAU); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.10)";
    c.lineWidth = lw * 0.28;
    c.beginPath(); c.arc(this.cx, this.cy, R - lw * 0.28, 0, TAU); c.stroke();

    // Dashed guide rim
    c.save();
    c.setLineDash([4, 9]);
    c.strokeStyle = "rgba(0,85,68,0.30)";
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(this.cx, this.cy, R + lw * 0.95, 0, TAU); c.stroke();
    c.restore();

    if (this.state !== "idle") {
      const half = this.zoneW / 2;
      const col = this.stage.zone;

      // Sweet spot — glowing in the stage colour, with a brighter perfect core.
      c.save();
      c.lineCap = "round";
      c.shadowColor = col; c.shadowBlur = 22 + this.pulse * 26;
      c.strokeStyle = col; c.lineWidth = lw * 0.9;
      c.beginPath(); c.arc(this.cx, this.cy, R, this.zoneC - half, this.zoneC + half); c.stroke();
      const pHalf = half * SCORE.perfectBand;
      c.shadowColor = "#fff"; c.shadowBlur = 30;
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = lw * 0.34;
      c.beginPath(); c.arc(this.cx, this.cy, R, this.zoneC - pHalf, this.zoneC + pHalf); c.stroke();
      c.restore();

      // Apple trail
      for (const tr of this.trail) {
        const a = 1 - tr.age / 0.32;
        c.globalAlpha = a * 0.38;
        c.fillStyle = PAL.flesh;
        const x = this.cx + Math.cos(tr.a) * R, y = this.cy + Math.sin(tr.a) * R;
        c.beginPath(); c.arc(x, y, lw * 0.30 * a, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;

      // The apple, riding the track upright.
      const gx = this.cx + Math.cos(this.ang) * R;
      const gy = this.cy + Math.sin(this.ang) * R;
      const gr = lw * 0.64 * (1 + this.pulse * 0.26);
      this.drawApple(c, gx, gy, gr, this.bite > 0 ? `rgba(255,255,255,${this.bite * 0.9})` : null);

      // Combo readout at the bottom of the circle — the hub is where the
      // lingo toast lands, so the multiplier sits low inside the ring.
      if (this.combo > 1) {
        c.save();
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = PAL.green;
        c.font = `900 ${Math.round(R * 0.2)}px Recoleta, Fraunces, Georgia, serif`;
        c.shadowColor = "rgba(255,255,255,0.85)"; c.shadowBlur = 14;
        c.fillText(`x${this.combo}`, this.cx, this.cy + R * 0.78);
        c.restore();
      }
    } else {
      // Attract mode: a slow demo apple drifting the track.
      const a = this.t * 0.7;
      const x = this.cx + Math.cos(a) * R, y = this.cy + Math.sin(a) * R;
      c.save();
      c.lineCap = "round";
      c.shadowColor = PAL.lime; c.shadowBlur = 22;
      c.strokeStyle = PAL.lime; c.lineWidth = lw * 0.9;
      c.beginPath(); c.arc(this.cx, this.cy, R, a + 1.5, a + 2.5); c.stroke();
      c.restore();
      this.drawApple(c, x, y, lw * 0.6, null);
    }

    // Confetti
    for (const p of this.parts) {
      const a = 1 - p.age / p.life;
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = p.c;
      if (p.round) { c.beginPath(); c.arc(0, 0, p.w * 0.6, 0, TAU); c.fill(); }
      else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    c.globalAlpha = 1;

    if (this.flash > 0) {
      c.fillStyle = `rgba(255,255,255,${this.flash * 0.36})`;
      c.fillRect(0, 0, w, h);
    }
    c.restore();
  },
};
