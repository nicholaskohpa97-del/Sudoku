# Scoring, combos, chains and hints

All of this lives in `lib/sudoku/scoring.ts` (pure, unit-tested) and `lib/sudoku/game.ts`.

## Lives

Choose **1, 2, 3, 5, 7 or 10** lives before a game, or **∞ (practice)**, which scores nothing.
Every wrong digit costs exactly one life and breaks the in-puzzle combo. Fewer lives chosen pays more.

| Lives chosen | 1 | 2 | 3 | 5 | 7 | 10 | ∞ |
|---|---|---|---|---|---|---|---|
| Points factor | ×1.5 | ×1.25 | ×1.0 | ×0.8 | ×0.65 | ×0.5 | none |

## Puzzle score

```
score = round( Σ cell shares × time × lives lost × lives chosen × hints ) + flawless bonus
```

| Part | Rule |
|---|---|
| Puzzle value | `100 × 2^((DR − 1) / 1.5)` where DR is the Difficulty Rating (doubles every +1.5 DR, about 100 → 4,000) |
| Cell share | value ÷ empty cells, times the combo multiplier when that cell was placed |
| Combo multiplier | ×1 (0–4 in a row), ×1.5 (5–9), ×2 (10–19), ×3 (20–34), ×4 (35+). **Not time-based** |
| Speed | `clamp(par ÷ your time, 0.5, 1.5)`; par comes from the puzzle's own technique trace; only active time counts |
| Lives lost | `max(0.4, 1 − 0.15 × lost)` |
| Hints | `1 − 0.15 × hints used` |
| Flawless bonus | +10% of the puzzle value for no lives lost and no hints |

## What breaks the combo

A wrong entry, a hint, or leaving the app. A page refresh does **not** (the saved game restores it).
Entries made through a pencil trial count one by one when committed.

## Clear chain

Consecutive puzzles solved in one session. Each clear is worth `score × chain multiplier`:
×1, ×1.1, ×1.25, ×1.5, ×1.75, ×2, ×2.25, then ×2.5 (cap). The multiplier boosts your session and lifetime
points; challenges between players compare the plain puzzle score so they stay fair.

| Event | Chain |
|---|---|
| Solve a puzzle | +1 |
| Show Solution | **kept**; you get a brand-new puzzle (the revealed one is locked and scores 0) |
| Wrong entry but still winning | kept (it only costs a life) |
| Run out of lives | ends |
| Use a hint | ends |
| Switch to another app or tab and come back | ends |
| Close and reopen the app | ends (new session) |
| Refresh the page | kept |
| Practice game (∞ lives) | neither counts nor breaks |

## Hints (solo only, 3 per game)

Each press spends one hint and escalates the current step. Once you act on the step, the next press starts the next one.

1. **Where to look**: a box, row or column.
2. **What to look for**: the technique and, for a hidden single, the digit.
3. **The pattern**: the cells that matter are highlighted, with the reasoning, but never the digit to enter.

Hints come from the same technique solver that rates puzzles, applied to your correct entries.

## Show Solution

A step-by-step walkthrough from where you are: the technique, where it applies and why, with the pencil marks it
reasons about. The puzzle is then locked: it scores 0, can't be retried, and the same underlying puzzle is never dealt
again. A revealed daily stays locked for the day.

## Pencil trial

A third input mode next to Pen and Notes. Each cell holds **one** tentative digit that is never checked and gives no
feedback. **Commit** (all, with Enter) checks them in reading order: right ones lock in, each wrong one costs a life.
The clock keeps running, so trial and error costs time.

## Strategy detection

After a win, the move log is replayed against the solver. Each placement is attributed to the cheapest technique that
justifies it, and pencil-mark removals that no peer placement explains count as direct evidence of a technique.
Conclusions carry a confidence label (clearly used / probably / maybe); wrong entries and unexplained placements count as
guesses. It is inference, and the report says so.

## Leaderboard, challenges and the throne

Everything on the boards is **recomputed by the server** (`lib/sudoku/verify.ts`, `lib/server/scores.ts`): you post the move log, never a score.

- **What's checked.** The puzzle is rebuilt from `(baseId, seed)`, so custom grids and borrowed ids don't work. The log is replayed through the real game rules (every move must match, the game must end in a win, hints can't exceed three, away moments break the combo exactly as they did for you) and the score is computed from that.
- **Pace.** Under 0.25 s per tap is refused as superhuman; under 0.6 s is saved but kept off the public boards ("flagged"). Posting is rate-limited.
- **One entry per player per puzzle.** A better run replaces the old one in place; a worse one is refused.
- **What's posted.** The puzzle score, without the clear-chain multiplier, so everyone is compared like for like. Practice games, replays and Ascent runs can't be posted.
- **Boards.** Top scores (by level), this week, the daily puzzle, and players by total.
- **Challenge.** Tap a score and accept: you play the *same* puzzle with the lives you choose. You get **one scored attempt**: accepting locks it in, and leaving or running out of lives uses it up. Your result lands on the puzzle's ladder either way.
- **The throne.** Whoever tops a puzzle's ladder holds its crown; whoever tops a level's all-time board holds that one. When you take a crown, the previous holder is told in their inbox ("took your throne", "lost #1 on the Hard board"). A challenged player whose score is beaten without losing the crown gets a "beat your score" note. Nobody is told about their own results, and flagged scores never trigger alerts.
- **Inbox.** Polled every 45 seconds while the app is open, announced as a banner on opening the app, with a badge on the menu. No push service or email is needed.

## Names

Names are unique, ignoring case, accents and punctuation (`Sneaky Quokka` = `sneaky-quokka!`). A clash returns free alternatives. You can stay anonymous (`Anonymous Otter 417`) or roll a random troll name (`Grumpy Capybara 52`). Your **recovery code** (Profile) moves your name, scores and inbox to a new device.
