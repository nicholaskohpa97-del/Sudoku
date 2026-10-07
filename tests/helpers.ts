import { breakCombo, enter, newGameState, requestHint, setTrial, toggleNote, type GameState } from "@/lib/sudoku/game";
import { generatePuzzle } from "@/lib/sudoku/puzzles";
import type { State } from "@/lib/sudoku/solver";

export const isSolvedState = (s: State): boolean => s.cells.every((v) => v !== 0);

/** Plays a whole puzzle through the reducer like a person would, `msPerMove` apart, with a few detours. */
export function playGame(
  tier: Parameters<typeof generatePuzzle>[0],
  seed: number,
  opts: { lives?: number; msPerMove?: number; hint?: boolean; away?: boolean; wrong?: boolean } = {},
) {
  const { lives = 3, msPerMove = 2500 } = opts;
  let g: GameState = newGameState(generatePuzzle(tier, seed), { lives });
  const empties = g.puzzle.split("").flatMap((c, i) => (c === "0" ? [i] : []));
  let t = 0;
  const tick = () => (g = { ...g, elapsedMs: (t += msPerMove) });
  let k = 0;
  for (const cell of empties) {
    if (k === 3 && opts.hint) {
      tick();
      const r = requestHint(g);
      if (r.ok) g = r.state;
    }
    if (k === 6 && opts.away) {
      tick();
      g = breakCombo(g);
    }
    if (k === 8) {
      tick();
      g = toggleNote(g, cell, 4);
      tick();
      g = setTrial(g, cell, 9);
      tick();
      g = setTrial(g, cell, 9); // clears
    }
    if (k === 10 && opts.wrong) {
      tick();
      g = enter(g, cell, (Number(g.solution[cell]) % 9) + 1).state;
    }
    tick();
    g = enter(g, cell, Number(g.solution[cell])).state;
    k++;
  }
  return { g, log: g.log, puzzle: g.puzzle, baseId: g.baseId, seed: g.seed, lives };
}
