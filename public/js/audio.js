// Crunch Time sound — everything is synthesized in WebAudio, no samples.
//
// The signature is the *crunch*. A bite isn't one noise burst: it's a sharp
// snap as the skin breaks, then a fast run of grains as the flesh fractures,
// over a low thump and a short lowpassed "chew". Every good bite plays it,
// loud and up front. Normal bites add a quiet marimba pluck underneath;
// PERFECT bites add a two-note bell that climbs a pentatonic ladder with the
// combo and then holds, so it stays a reward and never turns into an alarm.
// Stage changes get a four-note riser, a new best a bell fanfare, and the
// run-over is a bonk-and-wah — a wince, not a punishment.
//
// The AudioContext is created lazily inside a user gesture (the first tap or
// button press) so iOS lets it through.

const PENT = [0, 2, 4, 7, 9, 12, 14, 16];

export const Sfx = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,

  ctxGet() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) {
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 16; comp.ratio.value = 5;
      comp.attack.value = 0.002; comp.release.value = 0.14;
      const out = this.ctx.createGain();
      out.gain.value = 1.0;
      comp.connect(out).connect(this.ctx.destination);
      this.master = comp;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  // Call from any user gesture so the context exists before the first bite.
  unlock() { try { this.ctxGet(); } catch (e) { /* no audio */ } },

  // Scheduling origin: if the context is still resuming, push the cue a hair
  // into the future so nothing lands before the clock starts.
  t0(ctx) { return ctx.currentTime + (ctx.state === "running" ? 0 : 0.03); },

  noise(ctx) {
    if (!this.noiseBuf) {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  },

  env(ctx, node, t, peak, dur, attack = 0.004) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },

  // --- building blocks -----------------------------------------------------

  // One filtered noise grain.
  grain(ctx, start, freq, q, peak, len, lp = 0) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    this.env(ctx, g, start, peak, len, 0.0015);
    let tail = bp;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = lp;
      bp.connect(f); tail = f;
    }
    src.connect(bp); tail.connect(g).connect(this.master);
    src.start(start); src.stop(start + len + 0.03);
  },

  // The bite. `gain` ~0.5–0.8. `tone` sets how bright the snap is.
  crunch(ctx, t, { gain = 0.7, tone = 1500, dur = 0.19, lp = 0 } = {}) {
    // 1. Snap — the skin breaking. Bright, wide, short.
    this.grain(ctx, t, tone * 1.6, 0.55, gain, 0.06, lp);
    this.grain(ctx, t, tone * 4.2, 0.9, gain * 0.5, 0.035, lp);
    // 2. Fracture — a run of 8 grains, each darker and quieter, irregularly
    //    spaced. This is what reads as "crunch" rather than "click".
    let at = t + 0.014;
    for (let i = 0; i < 8; i++) {
      const fall = Math.pow(0.8, i);
      this.grain(ctx, at, tone * (0.7 + Math.random() * 1.9), 1.6 + Math.random(), gain * 0.62 * fall, 0.03 + Math.random() * 0.025, lp);
      at += 0.011 + Math.random() * 0.012;
    }
    // 3. Chew — a lowpassed body under the grains.
    this.grain(ctx, t + 0.008, 420, 0.6, gain * 0.5, dur, lp || 1100);
    // 4. Thump — the jaw.
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    this.env(ctx, g, t, gain * 0.9, 0.13, 0.003);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.16);
  },

  // Bell with inharmonic partials so it rings like metal, not a sine beep.
  bell(ctx, t, freq, peak = 0.11, dur = 0.8) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 5200;
    lp.connect(this.master);
    [[1, 1, 1], [2.0, 0.34, 0.6], [2.76, 0.16, 0.42], [4.07, 0.06, 0.28]].forEach(([m, pk, dr]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq * m;
      this.env(ctx, g, t, peak * pk, dur * dr, 0.006);
      o.connect(g).connect(lp);
      o.start(t); o.stop(t + dur * dr + 0.05);
    });
  },

  // Short warm pluck — a marimba bar.
  pluck(ctx, t, freq, peak = 0.07, dur = 0.18) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2400;
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.985, t + dur);
    this.env(ctx, g, t, peak, dur, 0.003);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.04);
  },

  // --- game cues -----------------------------------------------------------

  // A good bite. `combo` drives the perfect bell up the ladder.
  bite(combo, perfect) {
    if (this.muted) return;
    try {
      const ctx = this.ctxGet(); if (!ctx) return;
      const t = this.t0(ctx);
      if (perfect) {
        this.crunch(ctx, t, { gain: 0.66, tone: 1700 });
        const step = PENT[Math.min(Math.max(combo - 1, 0), PENT.length - 1)];
        const root = 659.25 * Math.pow(2, step / 12); // E5 upward
        this.bell(ctx, t + 0.03, root, 0.09, 0.85);
        this.bell(ctx, t + 0.095, root * 1.25, 0.06, 0.6); // major third on top
      } else {
        this.crunch(ctx, t, { gain: 0.74, tone: 1400 + Math.random() * 300 });
        this.pluck(ctx, t + 0.02, 392 * (0.98 + Math.random() * 0.04), 0.04, 0.16);
      }
    } catch (e) { /* the run carries on without sound */ }
  },

  // New stage: a quick four-note riser with a bell on top.
  stageUp() {
    if (this.muted) return;
    try {
      const ctx = this.ctxGet(); if (!ctx) return;
      const t = this.t0(ctx) + 0.16; // let the bite land first
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.pluck(ctx, t + i * 0.085, f, 0.075, 0.3));
      this.bell(ctx, t + 0.34, 1318.5, 0.06, 0.7);
    } catch (e) { /* silent */ }
  },

  // Run over: bonk, a muffled crunch, then a little wah.
  over() {
    if (this.muted) return;
    try {
      const ctx = this.ctxGet(); if (!ctx) return;
      const t = this.t0(ctx);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.42);
      this.env(ctx, g, t, 0.14, 0.45, 0.004);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.5);
      this.crunch(ctx, t + 0.03, { gain: 0.5, tone: 700, dur: 0.22, lp: 900 });
      // wah-wah: sawtooth through a sweeping lowpass
      const w = ctx.createOscillator();
      const wf = ctx.createBiquadFilter();
      const wg = ctx.createGain();
      w.type = "sawtooth";
      w.frequency.setValueAtTime(196, t + 0.5);
      w.frequency.linearRampToValueAtTime(174, t + 1.0);
      wf.type = "lowpass"; wf.Q.value = 6;
      wf.frequency.setValueAtTime(1200, t + 0.5);
      wf.frequency.exponentialRampToValueAtTime(260, t + 0.75);
      wf.frequency.exponentialRampToValueAtTime(900, t + 0.85);
      wf.frequency.exponentialRampToValueAtTime(220, t + 1.05);
      this.env(ctx, wg, t + 0.5, 0.045, 0.6, 0.02);
      w.connect(wf).connect(wg).connect(this.master);
      w.start(t + 0.5); w.stop(t + 1.15);
    } catch (e) { /* silent */ }
  },

  // New personal best on the results screen.
  fanfare() {
    if (this.muted) return;
    try {
      const ctx = this.ctxGet(); if (!ctx) return;
      const t = this.t0(ctx) + 0.05;
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.bell(ctx, t + i * 0.11, f, 0.085, i === 3 ? 1.3 : 0.5));
      this.bell(ctx, t + 0.33, 1318.5 * 1.5, 0.05, 1.1);
    } catch (e) { /* silent */ }
  },

  // UI tick for buttons.
  tick() {
    if (this.muted) return;
    try {
      const ctx = this.ctxGet(); if (!ctx) return;
      this.pluck(ctx, this.t0(ctx), 1046.5, 0.035, 0.06);
    } catch (e) { /* silent */ }
  },
};
