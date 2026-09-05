// Crunch Legends — backed by Workers KV (binding SCORES).
//
// GET  /api/scores            -> [{n, s, b, t}, ...]  all-time global top 10
// POST /api/scores {n, s, b}  -> updated top 10     (initials, score, bites)
//
// The client falls back to a localStorage board whenever this is unreachable.

const BOARD = "board.v1";
const MAX = 10;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function read(env, key) {
  if (!env.SCORES) return [];
  try {
    return JSON.parse((await env.SCORES.get(key)) || "[]");
  } catch (e) {
    return [];
  }
}

export async function onRequestGet({ env }) {
  return json(await read(env, BOARD));
}

export async function onRequestPost({ request, env }) {
  if (!env.SCORES) return json({ error: "no store" }, 503);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "bad json" }, 400);
  }

  const n = String(body.n || "YOU").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "YOU";
  const s = Math.max(0, Math.min(1e6, Math.floor(Number(body.s) || 0)));
  const b = Math.max(0, Math.min(1e5, Math.floor(Number(body.b) || 0)));
  if (!s) return json(await read(env, BOARD));

  const board = [...(await read(env, BOARD)), { n, s, b, t: Date.now() }]
    .sort((a, b) => b.s - a.s || a.t - b.t)
    .slice(0, MAX);

  await env.SCORES.put(BOARD, JSON.stringify(board));
  return json(board);
}
