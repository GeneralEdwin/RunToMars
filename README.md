# Run to Mars

Dogelon Mars endless tunnel runner, running on Cloudflare Workers with a D1 leaderboard.

- `index.html` – the game
- `dogelon-model.part1.txt` + `part2.txt` – Dogelon's 3D model (split in two to stay under upload limits)
- `worker.js` – serves the game and the leaderboard API (`/api/scores`)
- `wrangler.jsonc` – Cloudflare settings (Worker `run-to-mars`, D1 database `run-to-mars`)
- `schema.sql` – leaderboard table

Every push to `main` deploys automatically via Cloudflare Workers Builds.

Play: https://run-to-mars.dogelonmars69420.workers.dev
