// Folds bank parts into lib/sudoku/bank/<tier>.json, re-validating each puzzle
// (unique solution, rating reproduces, sits inside its tier's band).
// Usage: npx tsx scripts/merge-bank.ts <parts-dir>
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { countSolutions, DIFFICULTIES, DIFFICULTY_CONFIG } from "../lib/sudoku/engine";
import { ratePuzzle } from "../lib/sudoku/solver";

const dir = process.argv[2];
if (!dir) throw new Error("usage: merge-bank.ts <parts-dir>");

for (const tier of DIFFICULTIES) {
  const seen = new Set<string>();
  const entries: [string, number, number][] = [];
  for (const file of readdirSync(dir).filter((f) => f.startsWith(`${tier}`) && f.endsWith(".json"))) {
    const parts = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { p: string; dr: number }[];
    for (const { p } of parts) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (countSolutions(p, 2) !== 1) throw new Error(`${tier}: not unique: ${p}`);
      const r = ratePuzzle(p);
      const band = DIFFICULTY_CONFIG[tier];
      if (!r || r.tier !== tier || r.ceiling < band.minRating || r.ceiling >= band.maxRating || !r.logical) {
        throw new Error(`${tier}: rating mismatch for ${p}: ${JSON.stringify(r)}`);
      }
      entries.push([p, r.dr, r.parMs]);
    }
  }
  entries.sort((a, b) => a[1] - b[1]);
  const out = path.join("lib/sudoku/bank", `${tier}.json`);
  writeFileSync(out, JSON.stringify({ tier, puzzles: entries }) + "\n");
  console.log(`${tier}: ${entries.length} puzzles, DR ${entries[0]?.[1]}–${entries.at(-1)?.[1]} -> ${out}`);
}
void existsSync;
