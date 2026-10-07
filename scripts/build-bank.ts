// Builds part of the puzzle bank. Usage:
//   npx tsx scripts/build-bank.ts --tier=master --count=40 --seed=7 --out=/path/part.json [--minutes=20]
// Several runs (different seeds) can go in parallel; scripts/merge-bank.ts
// folds the parts into lib/sudoku/bank/<tier>.json.
import { writeFileSync } from "node:fs";
import { createRng, isDifficulty } from "../lib/sudoku/engine";
import { attempt } from "../lib/sudoku/generate";

const arg = (name: string, fallback?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const tier = arg("tier");
if (!tier || !isDifficulty(tier)) throw new Error("--tier=<beginner|easy|medium|hard|expert|master> is required");
const count = Number(arg("count", "50"));
const seed = Number(arg("seed", "1"));
const out = arg("out")!;
const deadline = Date.now() + Number(arg("minutes", "30")) * 60_000;

const rng = createRng(seed);
const found: { p: string; dr: number }[] = [];
const seen = new Set<string>();
let tries = 0;
const started = Date.now();
while (found.length < count && Date.now() < deadline) {
  tries++;
  const g = attempt(tier, rng);
  if (!g || seen.has(g.puzzle)) continue;
  seen.add(g.puzzle);
  found.push({ p: g.puzzle, dr: g.rating.dr });
  if (found.length % 10 === 0) {
    console.log(`${tier}: ${found.length}/${count} after ${tries} tries, ${Math.round((Date.now() - started) / 1000)}s`);
    writeFileSync(out, JSON.stringify(found));
  }
}
writeFileSync(out, JSON.stringify(found));
console.log(`${tier}: done ${found.length}/${count} in ${tries} tries, ${Math.round((Date.now() - started) / 1000)}s`);
