# Sudoku

Ad-free Sudoku with four difficulty levels, a three-mistake limit, multiplayer rooms for up to 20 friends and monthly tournaments. Built with Next.js 16, TypeScript and Tailwind CSS v4.

```bash
npm install
npm run dev      # http://localhost:3000 (redirects to /sudoku)
npm test         # engine, scoring and room-rule tests
npm run build && npm start
```

## Features
- **Four difficulty levels.** Easy (38 clues) and Medium (32 clues) are guaranteed solvable with singles only, so no guessing. Hard (27 clues) and Expert (23 clues) need candidate techniques beyond singles. Every puzzle has exactly one solution.
- **Three mistakes, with instant feedback.** A wrong number turns red, shakes, and shows "mistake n of 3". The third mistake ends the game. Correct numbers lock in and clear the matching pencil marks.
- **Play aids.** Pencil notes, a remaining-count on each number button, row/column/box and same-number highlighting, a timer, and full keyboard control (1–9, arrow keys, Backspace, N for notes). Solo games survive a page refresh, and personal bests are kept per difficulty.
- **No ads.** The app contains no ad or analytics code. A strict Content-Security-Policy in `next.config.ts` only allows same-origin scripts, frames, images and network requests, so an ad network or tracker cannot load even if someone adds a tag later.
- **Multiplayer rooms (2–20 players, default 10).** The host creates a room and shares the 6-character code or invite link. Everyone races on the same puzzle after a 3-second countdown, and the live standings show each player's progress, mistakes and online status. Players never see each other's numbers. The server checks every move, so the solution never reaches the browser until the match ends. A match ends when everyone has finished or is out, when time runs out (20/30/45/60 minutes by difficulty), or when the host ends it. The host can then start a rematch.
- **Monthly tournaments.** A tournament ("league") is a private group of up to 50 people with its own invite code. Matches started from a tournament earn points, and the standings page shows each month's rankings (points, wins, solves, best time, average mistakes). You can page back through earlier months.

### Tournament scoring (`lib/sudoku/tournament.ts`)
| Outcome | Points |
|---|---|
| Solved | Easy 10 · Medium 20 · Hard 30 · Expert 40 |
| Podium bonus | +50% / +25% / +10% of base for 1st / 2nd / 3rd fastest |
| Flawless solve (0 mistakes) | +5 |
| Out of mistakes, out of time, or left mid-match | +2 for taking part |

Only matches with at least 2 players count. Months follow `TOURNAMENT_TZ` (default `Asia/Singapore`).

## Architecture
| Piece | File(s) | Notes |
|---|---|---|
| Engine | `lib/sudoku/engine.ts` | Seeded RNG, bitmask backtracking solver (picks the most constrained cell first), symmetric clue removal with a uniqueness check, and a singles-only grader that sets the difficulty. Pure TypeScript, shared by client and server. |
| API | `app/api/sudoku/**/route.ts` | `players` (register/rename), `rooms` (create), `rooms/[code]` (GET to poll; POST for `join` / `leave` / `settings` / `start` / `move` / `end` / `lobby`), `leagues`, `leagues/[code]` (`?month=YYYY-MM`). |
| Game rules | `lib/server/rooms.ts`, `lib/server/leagues.ts` | Room lifecycle, move checking, standings, result recording. |
| Storage | `lib/server/store.ts` | **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set: one private JSON blob, with ETag (`ifMatch`) writes that retry on conflict so concurrent serverless instances never overwrite each other, plus a 1-second in-memory read cache. **Otherwise a local JSON file** at `.data/sudoku.json` (override with `SUDOKU_DATA_DIR`). Online status is held in memory only. |
| Identity | `lib/server/http.ts`, `lib/sudoku/client.ts` | No accounts. Each device registers a display name and gets a random token. The server stores only a SHA-256 hash of the token, and the client sends `Authorization: Bearer <id>:<token>`. |
| UI | `components/sudoku/*`, `app/sudoku/**` | Clients poll the room every 1.5 s, which is plenty for 20 players and needs no WebSocket server. |

## Deployment notes
- **Vercel:** connect a private Blob store to the project. This sets `BLOB_READ_WRITE_TOKEN`, and the app switches to Blob storage automatically. Keep the function region close to your players (e.g. `sin1`).
- **Single server** (VPS, Docker, `npm start`): no setup needed. Data goes to `.data/` on disk.
- **Scale:** the whole database is one JSON document, which is fine for friends and family. For hundreds of concurrent players, move to Redis or Postgres by reimplementing the `Backend` interface in `store.ts`.
- **Identity is tied to the device.** Clearing site data or switching phones creates a new player.
