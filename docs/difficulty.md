# How difficulty is measured

Difficulty is **measured, not guessed**. Every puzzle in the app is solved by a
human-technique solver (`lib/sudoku/solver`) that always applies the *cheapest*
technique that makes progress. The trace of steps it produces is the evidence
behind the tier, the rating, the par time and, later, hints and walkthroughs.

## The five measures

| Measure | Meaning |
|---|---|
| **Ceiling** | Weight of the hardest technique the puzzle forces. This decides the tier. |
| **Scan load** | Empty cells to fill. Raises singles-only puzzles that have few clues (see below). |
| **Workload** | Σ max(0, weight − 1) over all steps: total effort. |
| **Stalls** | Steps that needed more than a single, i.e. how often the easy flow runs dry. |
| **Openness** | Singles available on the untouched grid (how welcoming the start is). |

**Difficulty Rating (DR), 1.0–10.0** = `max(ceiling, tier floor)` + a workload
fraction (saturating to +0.9), clamped inside the tier's band. DR orders puzzles
inside a tier and drives the points they are worth.

## Technique weights

Weights follow the spirit of the Sudoku Explainer scale (hidden singles ≈ 1.2–1.5,
naked single 2.3, locked candidates 2.6–2.8, pairs/triples/fish 3–5.4, wings and
single-digit patterns 4–5, chains from 5.5, forcing chains 7+). They live in
`lib/sudoku/solver/techniques-info.ts`.

| Weight | Techniques |
|---|---|
| 1.0–1.5 | Full House, Hidden Single (box 1.2, row/column 1.5) |
| 2.3 | Naked Single |
| 2.6 / 2.8 | Pointing, Box/Line Reduction |
| 3.0–4.0 | Naked Pair 3.0, X-Wing 3.2, Hidden Pair 3.4, Naked Triple 3.6, Swordfish 3.8, Hidden Triple 4.0 |
| 4.1–4.8 | Skyscraper, 2-String Kite, XY-Wing, Turbot Fish, XYZ-Wing, W-Wing, Unique Rectangles 1/2/4, Simple Coloring |
| 5.0–5.4 | Naked Quad, Jellyfish, Hidden Quad |
| 5.5–6.9 | X-Chain, XY-Chain, Alternating Inference Chain (weight grows with length) |
| 7.0+ | Nishio forcing chain, Cell/Region forcing, Trial and error |

## Tiers

| Tier | Ceiling band | What the player needs |
|---|---|---|
| Beginner | < 2.0 | Hidden singles only, and plenty of clues |
| Easy | 2.0–2.9 | Naked singles, pointing, box/line reduction |
| Medium | 3.0–3.9 | Pairs, naked triples, X-Wing, Swordfish |
| Hard | 4.0–5.4 | Hidden triples, Skyscraper, Kite, XY/XYZ/W-Wing, Unique Rectangles, coloring, quads, Jellyfish |
| Expert | 5.5–6.9 | X-chains, XY-chains, alternating inference chains |
| Master | ≥ 7.0 | Forcing chains: assume a candidate and follow the consequences |

**Scan load.** A puzzle that needs only singles can still be a lot of work. It is
raised to Easy above 41 empty cells and to Medium above 49, so a 24-clue
"singles-only" grid never counts as Beginner. The tier is the harder of what the
techniques and the scan load demand.

## Acceptance criteria (enforced by tests and `npm run calibrate`)

1. Every puzzle has exactly one solution.
2. Re-rating a puzzle reproduces the stored DR and tier exactly.
3. A puzzle is only in a tier if its ceiling is inside the tier's band and it is solvable by logic alone.
4. No step the solver takes ever contradicts the real solution (soundness fuzz test).
5. Tier DR bands are disjoint.
6. Median workload rises by **at least ×1.5** from each tier to the next, and median par time rises tier to tier.

The current numbers are in [`difficulty-calibration.md`](./difficulty-calibration.md).

## Where puzzles come from

Puzzles are drawn from a pre-rated bank (`lib/sudoku/bank/*.json`, 300 per tier,
200 for Master) and disguised with a seeded transform (digit relabelling, row and
column permutations inside bands and stacks, band/stack swaps, transpose), all of
which preserve the rating. The same `(difficulty, seed)` always gives the same grid.

```bash
# Rebuild: parts in parallel, then merge (re-validates every puzzle).
npx tsx scripts/build-bank.ts --tier=master --count=200 --seed=1 --out=/tmp/parts/master.json
npm run bank:merge -- /tmp/parts
npm run calibrate        # rewrites docs/difficulty-calibration.md
```

## Limits worth knowing

- The rating is **relative to the implemented technique ladder**. No universal Sudoku
  difficulty measure exists; this one is reproducible and benchmarked against the Sudoku Explainer scale, not identical to it.
- Not implemented: Almost Locked Set techniques, Sue de Coq, grouped chains, Empty Rectangle, finned fish. A puzzle that needs one is rated by the next-cheapest
  technique that does solve it (usually a longer chain or a forcing chain), so it can only rate *higher*, never lower.
- Unique Rectangles rely on the single-solution guarantee, which every puzzle here has.
