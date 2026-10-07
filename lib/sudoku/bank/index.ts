// The pre-rated puzzle bank, one file per tier. Built offline by
// scripts/build-bank.ts and re-validated by scripts/merge-bank.ts.
import type { Difficulty } from "../engine";
import beginner from "./beginner.json";
import easy from "./easy.json";
import medium from "./medium.json";
import hard from "./hard.json";
import expert from "./expert.json";
import master from "./master.json";

export type BankEntry = [puzzle: string, rating: number];

export const BANK: Record<Difficulty, BankEntry[]> = {
  beginner: beginner.puzzles as BankEntry[],
  easy: easy.puzzles as BankEntry[],
  medium: medium.puzzles as BankEntry[],
  hard: hard.puzzles as BankEntry[],
  expert: expert.puzzles as BankEntry[],
  master: master.puzzles as BankEntry[],
};
