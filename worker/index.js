/**
 * Crunch Time Worker — serves the static game (assets binding) and the Crunch
 * Legends board. The board logic lives in ./scores.js; this file only routes.
 */
import { onRequestGet, onRequestPost } from "./scores.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/scores") {
      if (request.method === "GET") return onRequestGet({ env });
      if (request.method === "POST") return onRequestPost({ request, env });
      return new Response("Method not allowed", { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
