# Sudoku

Neon-arcade Sudoku with six objectively rated difficulty levels, a daily puzzle, combos, XP and achievements, multiplayer races for up to 20 friends and monthly tournaments. Invite friends by link, code or email. Ad-free. Built with Next.js 16, TypeScript, Tailwind CSS v4 and Supabase.

```bash
npm install
npm run dev      # http://localhost:3000 (redirects to /sudoku)
npm test         # engine, scoring and room-rule tests
npm run build && npm start
```

## Features
- **Six difficulty levels, measured not guessed.** Beginner (hidden singles only), Easy (naked singles, pointing), Medium (pairs, X-Wing), Hard (wings, kites, unique rectangles), Expert (alternating inference chains) and Master (forcing chains). A human-technique solver rates every puzzle by the hardest technique it forces, plus scan load and workload, and puzzles come from a pre-rated bank. Every puzzle has exactly one solution. See [`docs/difficulty.md`](docs/difficulty.md) for the criteria and [`docs/difficulty-calibration.md`](docs/difficulty-calibration.md) for the evidence.
- **Game feel.** Completing a row, column or box sends a light ripple across it from the cell you just filled, with a "ROW CLEAR!" label. Clearing two or three units with one number shows "DOUBLE!" or "TRIPLE!". Correct numbers pop, a digit's pad button bursts when all nine are placed, and consecutive correct entries within 8 s build a combo (×2 at 4, ×3 at 8). Synthesised Web Audio sounds (mute in the header) and phone haptics come with all of it. Everything respects `prefers-reduced-motion`.
- **Progression** (`lib/sudoku/progress.ts`, stored on the device). You earn XP per solve: base by difficulty, +50% for a flawless solve, a combo bonus, and a daily bonus. Levels come with titles (Rookie → Grandmaster). Each solve gets a 1–3 star rating (solve, no mistakes, beat par), and there are nine achievements.
- **Daily puzzle.** Everyone gets the same seeded puzzle each Singapore day. Difficulty follows the week, from Easy on Monday to Expert on Sunday. Clearing it keeps your streak alive.
- **Choose your lives.** 1, 2, 3, 5, 7, 10 or unlimited (practice). A wrong digit costs one life, shows in red and breaks your combo. Fewer lives chosen pays more.
- **Points that reward skill** ([`docs/scoring.md`](docs/scoring.md)): harder puzzles, faster solves, fewer lives lost, fewer lives chosen and no hints all score more. The combo multiplier (×1.5 at 5, ×2 at 10, ×3 at 20, ×4 at 35 in a row) is **not time-based**: only a wrong entry, a hint or leaving the app breaks it, and a refresh doesn't. Consecutive clears in one session build a **clear chain** with a growing multiplier.
- **Hints** (solo, 3 per game): each press escalates the current step from "where to look" to "what to look for" to the highlighted pattern, and never gives the digit.
- **Show Solution** gives a step-by-step walkthrough from where you are (technique, location and reasoning, with the pencil marks it uses). The puzzle is then locked and scores 0, your chain is kept, and you get a brand-new puzzle.
- **Pencil trial.** A third input mode with one tentative digit per cell, never checked until you commit. Wrong commits cost lives and the clock keeps running, so trial and error is fair but slow. Available in multiplayer too.
- **Strategy detection.** After a win, your moves are replayed against the solver to infer which techniques you used (with confidence labels), how many moves were guesses and how you scan the grid. The profile page keeps a running technique tally and suggests what to learn next.
- **Play aids.** Pencil notes, a remaining-count on each number button, row/column/box and same-number highlighting, a timer, and full keyboard control (1–9, arrow keys, Backspace, N for notes). Solo games survive a page refresh, and personal bests are kept per difficulty.
- **No ads.** The app contains no ad or analytics code. A strict Content-Security-Policy in `next.config.ts` only allows same-origin scripts, frames, images and network requests, so an ad network or tracker cannot load even if someone adds a tag later.
- **Multiplayer rooms (2–20 players, default 10).** The host creates a room, picks the lives (1–10), and shares the 6-character code or invite link. Everyone races on the same puzzle after a 3-second countdown, and the live standings show each player's progress, mistakes and online status. Players never see each other's numbers. The server checks every move, so the solution never reaches the browser until the match ends. A match ends when everyone has finished or is out, when time runs out (15/20/30/45/60/90 minutes by difficulty), or when the host ends it. The host can then start a rematch.
- **Monthly tournaments.** A tournament ("league") is a private group of up to 50 people with its own invite code. Matches started from a tournament earn points, and the standings page shows each month's rankings (points, wins, solves, best time, average mistakes). You can page back through earlier months.

### Tournament scoring (`lib/sudoku/tournament.ts`)
| Outcome | Points |
|---|---|
| Solved | Beginner 5 · Easy 10 · Medium 20 · Hard 30 · Expert 40 · Master 60 |
| Podium bonus | +50% / +25% / +10% of base for 1st / 2nd / 3rd fastest |
| Flawless solve (0 mistakes) | +5 |
| Out of mistakes, out of time, or left mid-match | +2 for taking part |

Only matches with at least 2 players count. Months follow `TOURNAMENT_TZ` (default `Asia/Singapore`).

## Architecture
| Piece | File(s) | Notes |
|---|---|---|
| Engine | `lib/sudoku/engine.ts`, `lib/sudoku/solver/*`, `lib/sudoku/puzzles.ts`, `lib/sudoku/bank/*` | Seeded RNG, bitmask backtracking solver for uniqueness, and a cheapest-first **technique solver** (singles to forcing chains) that rates puzzles. `puzzles.ts` draws a pre-rated puzzle from the bank and applies a seeded rating-preserving transform. Pure TypeScript, shared by client and server. |
| Bank tooling | `scripts/build-bank.ts`, `scripts/merge-bank.ts`, `scripts/calibrate.ts` | Offline generation, validation and the calibration report (`npm run bank:merge`, `npm run calibrate`). |
| API | `app/api/sudoku/**/route.ts` | `players` (register/rename), `rooms` (create), `rooms/[code]` (GET to poll; POST for `join` / `leave` / `settings` / `start` / `move` / `end` / `lobby`), `leagues`, `leagues/[code]` (`?month=YYYY-MM`). |
| Game rules | `lib/server/rooms.ts`, `lib/server/leagues.ts` | Room lifecycle, move checking, standings, result recording. |
| Storage | `lib/server/store.ts`, `supabase/schema.sql` | **Supabase Postgres** when `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` are set: the game database is one JSONB row in `sudoku_state`, written with optimistic concurrency on a `version` column (retries on conflict, so concurrent serverless instances never overwrite each other), plus a 1-second in-memory read cache. Only the server touches it (secret key; RLS blocks the browser key). **Otherwise a local JSON file** at `.data/sudoku.json` (override with `SUDOKU_DATA_DIR`). Online status is held in memory only. |
| Identity | `lib/server/http.ts`, `lib/sudoku/client.ts` | No accounts. Each device registers a display name and gets a random token. The server stores only a SHA-256 hash of the token, and the client sends `Authorization: Bearer <id>:<token>`. |
| Invites | `lib/sudoku/invite.ts`, `InviteButtons` in `components/sudoku/ui.tsx` | Copy link, native Share, and **Invite by email**: type or paste up to 20 addresses, and it opens the player's own email app (`mailto:`) with the invite and link already written. No mail server is needed, it's free, and the email comes from someone the friend knows. "Copy message" covers devices without a mail app. |
| Game feel | `components/sudoku/juice.tsx`, `lib/sudoku/sfx.ts`, `app/globals.css` | Unit-completion detection lives in `completedUnits()` in `engine.ts`. Animations are CSS keyframes with a per-cell `--d` delay. Confetti uses a worker-free canvas so it stays within the CSP. |
| UI | `components/sudoku/*`, `app/sudoku/**` | Clients poll the room every 1.5 s, which is plenty for 20 players and needs no WebSocket server. |

## Deployment notes
### Supabase setup (one-off, free plan)
1. **Create a project:** supabase.com → New project. Use region Southeast Asia (Singapore).
2. **Create the table:** SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. **Connect it to Vercel:**
   - **Easiest:** Supabase → Project Settings → Integrations → Vercel → connect the `sudoku-friends` project. This sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - **Manual alternative:** in Vercel → Settings → Environment Variables, add both for Production and Preview. You'll find them in Supabase → Project Settings → API.
4. **Redeploy** in Vercel.

### Notes
- **Without Supabase variables:** on Vercel the API answers 503 "Storage isn't configured" rather than failing on the read-only filesystem. Locally it uses `.data/sudoku.json`.
- **Free plan pause:** a free Supabase project pauses after about a week without traffic. Resume it from the dashboard.
- **Identity is tied to the device.** Clearing site data or switching phones creates a new player.
- **Scale:** one JSONB document is fine for friends and family. For hundreds of concurrent players, split it into per-room rows (the `Backend` interface in `store.ts` is the seam).
