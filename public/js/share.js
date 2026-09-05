// Share card — a 1080×1920 Story-sized PNG of a finished run, drawn on an
// offscreen canvas: the stage gradient, two of the stage's props, the
// SweeTango logo, the score, tallies, and the tagline. Rendered as soon as the
// results sheet appears so the SHARE button can hand the file to the Web Share
// sheet synchronously inside the tap (Safari drops the share if it has to wait
// on an async render). Falls back to a download where files can't be shared.

import { PAL, STAGES } from "./style.js";
import { Loop } from "./loop.js";

const W = 1080, H = 1920;
const TAU = Math.PI * 2;
const imgCache = {};

function loadImg(src) {
  if (imgCache[src]) return imgCache[src];
  return (imgCache[src] = new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  }));
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}

// Draw an image inside a box, preserving aspect, anchored to the box centre.
function fit(c, im, cx, cy, maxW, maxH, rot = 0, alpha = 1) {
  if (!im) return;
  const s = Math.min(maxW / im.naturalWidth, maxH / im.naturalHeight);
  const w = im.naturalWidth * s, h = im.naturalHeight * s;
  c.save();
  c.globalAlpha = alpha;
  c.translate(cx, cy); c.rotate(rot);
  c.shadowColor = "rgba(0,85,68,0.22)"; c.shadowBlur = 60; c.shadowOffsetY = 30;
  c.drawImage(im, -w / 2, -h / 2, w, h);
  c.restore();
}

export const Share = {
  blob: null, url: null, run: null,

  // Build the PNG for `run`. Resolves to a Blob (cached on this.blob).
  async render(run, { host, tagline, title, stats, siteLabel }) {
    const stage = STAGES.find((s) => s.name === run.stage) || STAGES[0];
    try { await document.fonts.load('900 200px "Recoleta"'); await document.fonts.load('900 40px "Gilroy"'); } catch (e) { /* fallback stacks */ }
    const [logo, propA, propB] = await Promise.all([
      loadImg("./assets/img/sweetango-logo.svg"),
      loadImg(`./assets/img/${stage.props[0]}.webp`),
      loadImg(`./assets/img/${stage.props[1]}.webp`),
    ]);

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    const display = '"Recoleta", "Fraunces", Georgia, serif';
    const ui = '"Gilroy", -apple-system, "Segoe UI", Roboto, sans-serif';

    // Background
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, stage.grad[0]); g.addColorStop(1, stage.grad[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const veil = c.createRadialGradient(W / 2, H * 0.5, 100, W / 2, H * 0.5, 900);
    veil.addColorStop(0, "rgba(255,255,255,0.42)"); veil.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = veil; c.fillRect(0, 0, W, H);

    // Props — one bleeding off the top-right, one off the bottom-left.
    fit(c, propA, W - 120, 300, 640, 640, -0.18);
    fit(c, propB, 120, H - 360, 620, 620, 0.22);

    // Logo
    if (logo) {
      const lw = 440, lh = lw * (logo.naturalHeight / logo.naturalWidth || 0.27);
      c.drawImage(logo, (W - lw) / 2, 150, lw, lh);
    }

    // Eyebrow
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = PAL.green;
    c.font = `900 30px ${ui}`;
    this.tracked(c, title.toUpperCase(), W / 2, 330, 9);

    // Ring with an apple, hub holds the score
    const cx = W / 2, cy = 880, R = 330, lw2 = 40;
    c.save();
    c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = lw2 + 22;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    c.strokeStyle = PAL.green; c.lineWidth = lw2;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    c.lineCap = "round";
    c.shadowColor = stage.zone; c.shadowBlur = 50;
    c.strokeStyle = stage.zone; c.lineWidth = lw2 * 0.9;
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); c.stroke();
    c.shadowColor = "#fff"; c.shadowBlur = 40;
    c.strokeStyle = "rgba(255,255,255,0.95)"; c.lineWidth = lw2 * 0.34;
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2 - 0.12, -Math.PI / 2 + 0.12); c.stroke();
    c.restore();
    Loop.drawApple(c, cx + Math.cos(0.75) * R, cy + Math.sin(0.75) * R, 34, null);

    c.fillStyle = PAL.green;
    c.font = `900 60px ${ui}`;
    // Score
    const scoreStr = String(run.score);
    const size = scoreStr.length > 5 ? 190 : scoreStr.length > 4 ? 230 : 270;
    c.font = `900 ${size}px ${display}`;
    c.shadowColor = "rgba(255,255,255,0.9)"; c.shadowBlur = 40;
    c.fillText(scoreStr, cx, cy + size * 0.36);
    c.shadowBlur = 0;
    c.font = `900 28px ${ui}`;
    this.tracked(c, stats.score.toUpperCase(), cx, cy - size * 0.42, 9);

    // Tallies
    const ty = 1330, tw = 380, th = 150, gap = 40;
    [[run.locks, stats.bites], [run.perfects, stats.perfects]].forEach(([v, k], i) => {
      const x = cx - tw - gap / 2 + i * (tw + gap);
      c.fillStyle = "rgba(255,255,255,0.55)";
      roundRect(c, x, ty, tw, th, 34); c.fill();
      c.fillStyle = PAL.green;
      c.font = `900 78px ${display}`;
      c.fillText(String(v), x + tw / 2, ty + 88);
      c.font = `700 24px ${ui}`;
      this.tracked(c, k.toUpperCase(), x + tw / 2, ty + 128, 5);
    });

    // Pace · stage pill
    const pill = `${run.pace} · ${run.stage}`.toUpperCase();
    c.font = `900 26px ${ui}`;
    const pw = this.trackedWidth(c, pill, 6) + 80;
    c.fillStyle = PAL.green;
    roundRect(c, cx - pw / 2, 1520, pw, 66, 33); c.fill();
    c.fillStyle = PAL.lime;
    this.tracked(c, pill, cx, 1564, 6);

    // Tagline + site
    c.fillStyle = PAL.green;
    c.font = `900 44px ${display}`;
    c.fillText(tagline, cx, 1700);
    c.font = `700 26px ${ui}`;
    c.globalAlpha = 0.75;
    this.tracked(c, `${siteLabel}  ·  ${host}`.toUpperCase(), cx, 1760, 6);
    c.globalAlpha = 1;

    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    if (this.url) URL.revokeObjectURL(this.url);
    this.blob = blob; this.run = run;
    this.url = blob ? URL.createObjectURL(blob) : null;
    return blob;
  },

  // Letter-spaced text, centred.
  tracked(c, text, x, y, spacing) {
    const w = this.trackedWidth(c, text, spacing);
    let cur = x - w / 2;
    const prev = c.textAlign; c.textAlign = "left";
    for (const ch of text) { c.fillText(ch, cur, y); cur += c.measureText(ch).width + spacing; }
    c.textAlign = prev;
  },
  trackedWidth(c, text, spacing) {
    let w = 0;
    for (const ch of text) w += c.measureText(ch).width + spacing;
    return w - spacing;
  },

  // Hand the cached card to the share sheet, or download it. Must be called
  // from inside a user gesture. Returns "shared" | "downloaded" | "none".
  async share({ title, text }) {
    if (!this.blob) return "none";
    const file = new File([this.blob], "crunch-time-score.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "shared"; /* fall through */ }
    }
    const a = document.createElement("a");
    a.href = this.url; a.download = "crunch-time-score.png";
    document.body.appendChild(a); a.click(); a.remove();
    return "downloaded";
  },
};
