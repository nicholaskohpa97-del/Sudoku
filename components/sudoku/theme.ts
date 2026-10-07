import type { Difficulty } from "@/lib/sudoku/engine";

/** Colour identity per difficulty, used on level cards, tabs and badges. */
export const DIFFICULTY_STYLE: Record<
  Difficulty,
  { stars: number; text: string; border: string; glow: string; chip: string; gradient: string }
> = {
  beginner: {
    stars: 1,
    text: "text-sky-300",
    border: "border-sky-300/40 hover:border-sky-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(125_211_252/0.6)]",
    chip: "bg-sky-300 text-night",
    gradient: "from-sky-400/20 via-sky-400/[0.04] to-transparent",
  },
  easy: {
    stars: 2,
    text: "text-lime-300",
    border: "border-lime-300/40 hover:border-lime-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(163_230_53/0.6)]",
    chip: "bg-lime-300 text-night",
    gradient: "from-lime-400/20 via-lime-400/[0.04] to-transparent",
  },
  medium: {
    stars: 3,
    text: "text-cyan-300",
    border: "border-cyan-300/40 hover:border-cyan-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(34_211_238/0.6)]",
    chip: "bg-cyan-300 text-night",
    gradient: "from-cyan-400/20 via-cyan-400/[0.04] to-transparent",
  },
  hard: {
    stars: 4,
    text: "text-pink-300",
    border: "border-pink-300/40 hover:border-pink-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(244_114_182/0.6)]",
    chip: "bg-pink-300 text-night",
    gradient: "from-pink-400/20 via-pink-400/[0.04] to-transparent",
  },
  expert: {
    stars: 5,
    text: "text-yellow-300",
    border: "border-yellow-300/40 hover:border-yellow-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(250_204_21/0.6)]",
    chip: "bg-yellow-300 text-night",
    gradient: "from-yellow-400/20 via-yellow-400/[0.04] to-transparent",
  },
  master: {
    stars: 6,
    text: "text-violet-300",
    border: "border-violet-300/40 hover:border-violet-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(196_181_253/0.6)]",
    chip: "bg-violet-300 text-night",
    gradient: "from-violet-400/20 via-violet-400/[0.04] to-transparent",
  },
};
