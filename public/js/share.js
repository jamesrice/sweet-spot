// Share card — a 1080×1920 Story-sized PNG of a finished run, drawn on an
// offscreen canvas. Same branding on every share regardless of which stage
// the run ended in: the SweeTango logo, "Hit the Sweet Spot!", the hero apple
// behind the score, bites and perfects, the leaf in the bottom-left, the
// "No Ordinary Apple." line and the site URL. Only the gradient follows the
// stage the run ended in.
//
// Rendered as soon as the results sheet appears so the SHARE button can hand
// the file to the Web Share sheet synchronously inside the tap (Safari drops
// the share if it has to wait on an async render). Falls back to a download
// where files can't be shared.

import { PAL, STAGES } from "./style.js";

const W = 1080, H = 1920;
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
function fit(c, im, cx, cy, maxW, maxH, { rot = 0, alpha = 1, shadow = true } = {}) {
  if (!im) return;
  const s = Math.min(maxW / im.naturalWidth, maxH / im.naturalHeight);
  const w = im.naturalWidth * s, h = im.naturalHeight * s;
  c.save();
  c.globalAlpha = alpha;
  c.translate(cx, cy); c.rotate(rot);
  if (shadow) { c.shadowColor = "rgba(0,85,68,0.25)"; c.shadowBlur = 70; c.shadowOffsetY = 34; }
  c.drawImage(im, -w / 2, -h / 2, w, h);
  c.restore();
}

export const Share = {
  blob: null, url: null, run: null,

  // Build the PNG for `run`. Resolves to a Blob (cached on this.blob).
  async render(run, { title, siteLabel, stats, headline, closer }) {
    const stage = STAGES.find((s) => s.name === run.stage) || STAGES[0];
    try {
      await Promise.all([document.fonts.load('900 200px "Recoleta"'), document.fonts.load('900 40px "Gilroy"')]);
    } catch (e) { /* fallback stacks */ }
    const [logo, apple, leaf] = await Promise.all([
      loadImg("./assets/img/sweetango-logo.svg"),
      loadImg("./assets/img/apple-top.webp"),
      loadImg("./assets/img/leaf.png"),
    ]);

    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    const display = '"Recoleta", "Fraunces", Georgia, serif';
    const ui = '"Gilroy", -apple-system, "Segoe UI", Roboto, sans-serif';
    const cx = W / 2;

    // Background — the stage gradient, lifted in the middle.
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, stage.grad[0]); g.addColorStop(1, stage.grad[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const veil = c.createRadialGradient(cx, H * 0.48, 80, cx, H * 0.48, 950);
    veil.addColorStop(0, "rgba(255,255,255,0.40)"); veil.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = veil; c.fillRect(0, 0, W, H);

    // Leaf — bottom-left, bleeding off the edge, behind everything. The PNG
    // is a pale tint, so it's multiplied in to read on the lighter gradients.
    c.save();
    c.globalCompositeOperation = "multiply";
    fit(c, leaf, 230, H - 290, 980, 820, { rot: -0.1, alpha: 1, shadow: false });
    c.restore();

    // Logo
    if (logo) {
      const lw = 470, lh = lw * (logo.naturalHeight / logo.naturalWidth || 0.27);
      c.drawImage(logo, (W - lw) / 2, 130, lw, lh);
    }

    // "Hit the Sweet Spot!"
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = PAL.green;
    c.font = `900 78px ${display}`;
    c.shadowColor = "rgba(255,255,255,0.8)"; c.shadowBlur = 24;
    c.fillText(headline, cx, 370);
    c.shadowBlur = 0;

    // Hero apple — behind the score.
    fit(c, apple, cx, 790, 760, 700, { rot: 0.06 });

    // Score — over the lower half of the apple, lifted off it with a white halo.
    const scoreStr = String(run.score);
    const size = scoreStr.length > 5 ? 200 : scoreStr.length > 4 ? 240 : 290;
    const sy = 1090;
    c.font = `900 ${size}px ${display}`;
    c.save();
    c.lineJoin = "round";
    c.strokeStyle = "rgba(255,255,255,0.92)";
    c.lineWidth = 26;
    c.shadowColor = "rgba(255,255,255,0.95)"; c.shadowBlur = 60;
    c.strokeText(scoreStr, cx, sy);
    c.restore();
    c.fillStyle = PAL.green;
    c.fillText(scoreStr, cx, sy);
    c.font = `900 30px ${ui}`;
    c.fillStyle = "#fff";
    c.save();
    c.shadowColor = "rgba(0,85,68,0.5)"; c.shadowBlur = 18;
    this.tracked(c, stats.score.toUpperCase(), cx, sy - size * 0.78, 10);
    c.restore();

    // Tallies
    const ty = 1230, tw = 380, th = 160, gap = 40;
    [[run.locks, stats.bites], [run.perfects, stats.perfects]].forEach(([v, k], i) => {
      const x = cx - tw - gap / 2 + i * (tw + gap);
      c.fillStyle = "rgba(255,255,255,0.62)";
      roundRect(c, x, ty, tw, th, 36); c.fill();
      c.fillStyle = PAL.green;
      c.font = `900 84px ${display}`;
      c.fillText(String(v), x + tw / 2, ty + 94);
      c.font = `700 24px ${ui}`;
      this.tracked(c, k.toUpperCase(), x + tw / 2, ty + 136, 5);
    });

    // "No Ordinary Apple."
    c.fillStyle = PAL.green;
    c.font = `900 84px ${display}`;
    c.shadowColor = "rgba(255,255,255,0.8)"; c.shadowBlur = 24;
    c.fillText(closer, cx, 1650);
    c.shadowBlur = 0;

    // Site URL, centred at the bottom.
    c.font = `900 34px ${ui}`;
    this.tracked(c, siteLabel.toUpperCase(), cx, 1770, 8);

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
    const file = new File([this.blob], "sweet-spot-score.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title, text }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "shared"; /* fall through */ }
    }
    const a = document.createElement("a");
    a.href = this.url; a.download = "sweet-spot-score.png";
    document.body.appendChild(a); a.click(); a.remove();
    return "downloaded";
  },
};
