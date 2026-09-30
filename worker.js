// Run to Mars — Cloudflare Worker: serves the game and a small leaderboard API backed by D1.
//
//   GET  /api/scores?limit=10      top runs (best distance first)
//   GET  /api/scores/:id           one player's row (404 if unknown)
//   PUT  /api/scores/:id           create/update your own row (needs header x-player-secret)
//   GET  /api/owner                200 if header x-owner-key matches the OWNER_KEY secret
//
// Every player gets a random id + secret in their browser. The secret is stored hashed,
// so nobody else can overwrite someone's score, and a score can only go up, never down.

const ID_RE = /^[a-f0-9]{32}$/;
const NAME_RE = /^[A-Za-z0-9 _.\-]{2,16}$/;
const LEVELS = 30;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const intIn = (v, min, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

async function api(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/scores" && request.method === "GET") {
    const limit = intIn(url.searchParams.get("limit") ?? 10, 1, 50) ?? 10;
    const { results } = await env.DB.prepare(
      "SELECT id, name, best, coins, lvl, at FROM scores ORDER BY best DESC, at ASC LIMIT ?"
    ).bind(limit).all();
    return json(results);
  }

  if (path === "/api/owner" && request.method === "GET") {
    const key = request.headers.get("x-owner-key") || "";
    return env.OWNER_KEY && key === env.OWNER_KEY ? json({ owner: true }) : json({ owner: false }, 403);
  }

  const m = path.match(/^\/api\/scores\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);

    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT id, name, best, coins, lvl, at FROM scores WHERE id = ?").bind(id).first();
      return row ? json(row) : json({ error: "not found" }, 404);
    }

    if (request.method === "PUT") {
      if (!ID_RE.test(id)) return json({ error: "bad id" }, 400);
      const secret = request.headers.get("x-player-secret") || "";
      if (secret.length < 20 || secret.length > 200) return json({ error: "bad secret" }, 400);

      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
      const name = String(body.name || "").replace(/\s+/g, " ").trim();
      const best = intIn(body.best, 0, 1_000_000);
      const coins = intIn(body.coins ?? 0, 0, 100_000_000);
      const lvl = intIn(body.lvl ?? -1, -1, LEVELS - 1);
      if (!NAME_RE.test(name) || best === null || coins === null || lvl === null) return json({ error: "bad data" }, 400);

      const hash = await sha256(secret);
      const existing = await env.DB.prepare("SELECT secret_hash FROM scores WHERE id = ?").bind(id).first();
      if (existing && existing.secret_hash !== hash) return json({ error: "not your score" }, 403);

      await env.DB.prepare(
        `INSERT INTO scores (id, secret_hash, name, best, coins, lvl, at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           best = MAX(scores.best, excluded.best),
           coins = MAX(scores.coins, excluded.coins),
           lvl = MAX(scores.lvl, excluded.lvl),
           at = excluded.at
         WHERE scores.secret_hash = excluded.secret_hash`
      ).bind(id, hash, name, best, coins, lvl, Date.now()).run();
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url); }
      catch (e) { return json({ error: "server error" }, 500); }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    // game files live on the Pages upload; this Worker passes them through so game + API share one address
    if (!env.GAME_URL) return new Response("Set the GAME_URL variable on this Worker (Settings > Variables).", { status: 500 });
    const target = new URL(url.pathname + url.search, env.GAME_URL);
    const res = await fetch(target.toString(), { method: "GET", cf: { cacheTtl: 300, cacheEverything: true } });
    return new Response(res.body, res);
  },
};
