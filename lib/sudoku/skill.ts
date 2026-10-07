"use client";

// The player's long-run technique profile, built from strategy reports.
import { createStore } from "./store";
import { addToProfile, type SkillProfile, type StrategyReport } from "./strategy";

interface SkillState {
  profile: SkillProfile;
  games: number;
}

const store = createStore<SkillState>("sudoku.skill.v1", () => ({ profile: {}, games: 0 }), "sudoku-skill");

export const useSkill = store.use;
export const loadSkill = store.load;

export function recordSkill(report: StrategyReport): void {
  const s = store.load();
  store.save({ profile: addToProfile(s.profile, report), games: s.games + 1 });
}
