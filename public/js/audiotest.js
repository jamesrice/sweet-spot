// Audio diagnostic overlay — loaded only with ?audiotest. Shows whether the
// AudioContext is actually running, whether the iOS silent-switch bypass is
// live, and a live output meter so "no sound" can be split into "the graph
// is silent" (a code problem) versus "the graph is loud but the phone isn't
// letting it out" (ringer switch, volume, Bluetooth route).

import { Sfx } from "./audio.js";

export function mountAudioTest() {
  const el = document.createElement("div");
  el.id = "audiotest";
  el.className = "collapsed";
  el.innerHTML = `
    <b id="atHead">AUDIO CHECK <span id="atState"></span> <i>▾</i></b>
    <div id="atRows"></div>
    <div class="atBtns">
      <button data-do="crunch">Crunch</button>
      <button data-do="bell">Bell</button>
      <button data-do="resume">Resume</button>
    </div>
    <div class="atNote">Meter moving but silent? On iPhone check the ringer switch and volume. Bluetooth/CarPlay routes can also swallow it.</div>`;
  document.body.appendChild(el);

  let analyser = null, buf = null, peak = 0;
  function meter() {
    const ctx = Sfx.ctx;
    if (!ctx || !Sfx.master) return "—";
    if (!analyser) {
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      Sfx.master.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    peak = Math.max(peak * 0.9, rms);
    const bars = Math.min(20, Math.round(peak * 60));
    return "▮".repeat(bars) + "▯".repeat(20 - bars) + ` ${rms.toFixed(3)}`;
  }

  const row = (k, v) => `<div><span>${k}</span><em>${v}</em></div>`;
  function paint() {
    const ctx = Sfx.ctx, d = Sfx.diag();
    $state.textContent = (ctx ? ctx.state : "no context") + (d.isIOS ? " · loop " + d.silentState : "");
    if (el.classList.contains("collapsed")) return;
    $rows.innerHTML = [
      row("context", ctx ? ctx.state : "not created (tap anything)"),
      row("sample rate", ctx ? ctx.sampleRate : "—"),
      row("muted (game)", Sfx.muted ? "YES — tap 🔊" : "no"),
      row("unlocked by", d.unlockedBy || "—"),
      row("iOS device", d.isIOS ? "yes" : "no"),
      row("silent loop", d.isIOS ? (d.silentState) : "n/a"),
      row("output meter", meter()),
      row("browser", navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 60)),
    ].join("");
  }
  const $rows = el.querySelector("#atRows"), $state = el.querySelector("#atState");
  el.querySelector("#atHead").addEventListener("click", (e) => { e.stopPropagation(); el.classList.toggle("collapsed"); paint(); });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    e.stopPropagation();
    Sfx.unlock("audiotest");
    if (b.dataset.do === "crunch") Sfx.bite(0, false);
    if (b.dataset.do === "bell") Sfx.bite(3, true);
    if (b.dataset.do === "resume") Sfx.resume();
  });
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  setInterval(paint, 200);
  paint();
}
