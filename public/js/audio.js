// Sweet Spot sound — everything is synthesized in WebAudio, no samples.
//
// The signature is the *crunch*. A bite isn't one noise burst: it's a sharp
// snap as the skin breaks, then a fast run of bright grains as the flesh
// fractures, with a crisp tail — and deliberately no low end, which is what
// turns a crunch into a thud. Every good bite plays just that;
// PERFECT bites add a two-note bell that climbs a pentatonic ladder with the
// combo and then holds, so it stays a reward and never turns into an alarm.
// Stage changes get a four-note riser, a new best a bell fanfare, and the
// run-over is a bonk-and-wah — a wince, not a punishment.
//
// Mobile unlock. Two things have to be true before a phone makes a sound:
//
// 1. The AudioContext must be created *and resumed* inside a user-activation
//    event. On touch devices pointerdown does NOT count as activation (only
//    pointerup / touchend / click do), so unlock() is wired to all of them —
//    see app.js. It's idempotent, so calling it on every gesture is fine.
// 2. On iPhone, Web Audio obeys the hardware ringer switch: silent mode means
//    silence, even with the volume up. HTML <audio> playback does not. So on
//    iOS we start a looping, silent <audio> element on the first gesture,
//    which moves the page's audio session to "playback" and lets Web Audio
//    through with the switch on. (The same trick unmute-ios-audio uses.)

const PENT = [0, 2, 4, 7, 9, 12, 14, 16];

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// 0.5 s of 8 kHz 16-bit mono silence as a WAV blob URL — built at runtime
// so there's nothing to host or license.
function silentWav() {
  const rate = 8000, n = rate / 2, bytes = 44 + n * 2;
  const b = new ArrayBuffer(bytes), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, bytes - 8, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

export const Sfx = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,
  silent: null,          // the iOS silent-loop <audio>
  silentState: "off",
  unlockedBy: "",
  isIOS,

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

  // Call from any user gesture. Creates + resumes the context and, on iOS,
  // starts the silent loop. Safe to call on every gesture.
  unlock(via) {
    try {
      const ctx = this.ctxGet();
      if (ctx && ctx.state === "running" && !this.unlockedBy) this.unlockedBy = via || "gesture";
      if (ctx && ctx.state !== "running") {
        ctx.resume().then(() => { if (!this.unlockedBy) this.unlockedBy = via || "gesture"; }).catch(() => {});
      }
    } catch (e) { /* no audio */ }
    if (isIOS) this.startSilentLoop();
  },

  startSilentLoop() {
    try {
      if (!this.silent) {
        const a = document.createElement("audio");
        a.setAttribute("playsinline", ""); a.setAttribute("webkit-playsinline", "");
        a.loop = true; a.preload = "auto"; a.src = silentWav();
        a.addEventListener("playing", () => { this.silentState = "playing"; });
        a.addEventListener("pause", () => { this.silentState = "paused"; });
        this.silent = a;
      }
      if (this.silent.paused) {
        const p = this.silent.play();
        if (p && p.catch) p.catch((e) => { this.silentState = "blocked: " + (e && e.name); });
      }
    } catch (e) { this.silentState = "error"; }
  },

  // After a phone call / Siri / backgrounding, iOS leaves the context
  // "interrupted" or suspended; the next gesture (or return to the tab) resumes it.
  resume() {
    try {
      if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      if (isIOS && this.silent && this.silent.paused) this.startSilentLoop();
    } catch (e) { /* silent */ }
  },

  diag() { return { isIOS, silentState: this.silentState, unlockedBy: this.unlockedBy, state: this.ctx ? this.ctx.state : "none" }; },

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

  // The bite. Apples are bright and dry: the energy sits between 2 and 8 kHz
  // as dozens of tiny fractures, with almost nothing below 500 Hz. Anything
  // low and sweeping reads as a thud (or worse), so there is no sub thump —
  // just a snap, a fast irregular run of crackle grains, and a crisp tail.
  // `tone` is the centre of the crackle (~3 kHz); `lp` muffles it for the
  // game-over bonk; `knock` adds a short mid-range transient for weight.
  crunch(ctx, t, { gain = 0.7, tone = 3000, dur = 0.14, lp = 0, knock = 1 } = {}) {
    // 1. Snap — the skin giving way. Two very short bright bursts.
    this.grain(ctx, t, tone * 1.3, 0.8, gain * 1.1, 0.024, lp);
    this.grain(ctx, t + 0.003, tone * 2.3, 1.1, gain * 0.7, 0.018, lp);
    // 2. Fracture — 14 grains over ~130 ms, each a different pitch, fading
    //    and irregularly spaced. This is the crackle that says "apple".
    let at = t + 0.009;
    for (let i = 0; i < 14; i++) {
      const fall = Math.pow(0.86, i);
      this.grain(ctx, at, tone * (0.75 + Math.random() * 1.6), 2.2 + Math.random() * 2.2,
        gain * 0.9 * fall, 0.007 + Math.random() * 0.013, lp);
      at += 0.005 + Math.random() * 0.011;
    }
    // 3. Crisp tail — a quiet, wide, high wash that decays with the bite.
    this.grain(ctx, t + 0.015, tone * 1.5, 0.5, gain * 0.28, dur, lp);
    // 4. Knock — a 30 ms mid-range transient (no bass) so it has some body.
    if (knock) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(1100, t);
      o.frequency.exponentialRampToValueAtTime(640, t + 0.03);
      this.env(ctx, g, t, gain * 0.22 * knock, 0.04, 0.002);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 0.06);
    }
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
        this.crunch(ctx, t, { gain: 0.78, tone: 3300 });
        const step = PENT[Math.min(Math.max(combo - 1, 0), PENT.length - 1)];
        const root = 659.25 * Math.pow(2, step / 12); // E5 upward
        this.bell(ctx, t + 0.03, root, 0.09, 0.85);
        this.bell(ctx, t + 0.095, root * 1.25, 0.06, 0.6); // major third on top
      } else {
        // A good bite is just the crunch — no note under it. A little pitch
        // variation keeps twenty in a row from sounding like a sample.
        this.crunch(ctx, t, { gain: 1.0, tone: 2700 + Math.random() * 900 });
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
      this.crunch(ctx, t + 0.03, { gain: 0.55, tone: 1400, dur: 0.22, lp: 900, knock: 0 });
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
