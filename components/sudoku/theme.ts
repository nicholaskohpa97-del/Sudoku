import type { Difficulty } from "@/lib/sudoku/engine";

/** Colour identity per difficulty, used on level cards, tabs and badges. */
export const DIFFICULTY_STYLE: Record<
  Difficulty,
  { stars: number; text: string; border: string; glow: string; chip: string; gradient: string }
> = {
  easy: {
    stars: 1,
    text: "text-lime-300",
    border: "border-lime-300/40 hover:border-lime-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(163_230_53/0.6)]",
    chip: "bg-lime-300 text-night",
    gradient: "from-lime-400/20 via-lime-400/[0.04] to-transparent",
  },
  medium: {
    stars: 2,
    text: "text-cyan-300",
    border: "border-cyan-300/40 hover:border-cyan-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(34_211_238/0.6)]",
    chip: "bg-cyan-300 text-night",
    gradient: "from-cyan-400/20 via-cyan-400/[0.04] to-transparent",
  },
  hard: {
    stars: 3,
    text: "text-pink-300",
    border: "border-pink-300/40 hover:border-pink-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(244_114_182/0.6)]",
    chip: "bg-pink-300 text-night",
    gradient: "from-pink-400/20 via-pink-400/[0.04] to-transparent",
  },
  expert: {
    stars: 4,
    text: "text-yellow-300",
    border: "border-yellow-300/40 hover:border-yellow-300/80",
    glow: "hover:shadow-[0_0_30px_-6px_rgb(250_204_21/0.6)]",
    chip: "bg-yellow-300 text-night",
    gradient: "from-yellow-400/20 via-yellow-400/[0.04] to-transparent",
  },
};
