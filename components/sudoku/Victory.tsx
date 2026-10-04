"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { Award } from "@/lib/sudoku/profile";
import { ACHIEVEMENTS, levelInfo } from "@/lib/sudoku/progress";
import { Stars } from "./ui";

/** XP bar that fills from the old total to the new one. */
export function XpBar({ from, to, className = "" }: { from: number; to: number; className?: string }) {
  const [xp, setXp] = useState(from);
  useEffect(() => {
    const id = setTimeout(() => setXp(to), 500);
    return () => clearTimeout(id);
  }, [to]);
  const info = levelInfo(xp);
  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex justify-between font-display text-xs font-semibold text-stone-300">
        <span>
          Lv {info.level} · {info.title}
        </span>
        <span className="font-num tabular-nums">
          {info.into}/{info.span} XP
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 shadow-[0_0_10px_rgb(244_114_182/0.6)] transition-[width] duration-1000 ease-out"
          style={{ width: `${Math.max(3, info.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function VictoryCard({
  title,
  subtitle,
  stars,
  award,
  children,
}: {
  title: string;
  subtitle: string;
  stars?: number;
  award: Award | null;
  children?: React.ReactNode;
}) {
  const levelAfter = award ? levelInfo(award.xpAfter).level : 0;
  const leveledUp = award ? levelAfter > award.levelBefore : false;
  return (
    <div className="w-full max-w-xs space-y-2 px-4 text-center">
      {stars ? <Stars count={stars} animate className="size-7" /> : null}
      <h2 className="animate-zoom-in font-display text-3xl font-bold text-lime-200 [text-shadow:0_0_22px_rgb(163_230_53/0.7)]">
        {title}
      </h2>
      <p className="text-sm font-semibold text-stone-300">{subtitle}</p>
      {award ? (
        <div className="animate-rise space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left [animation-delay:600ms]">
          <ul className="space-y-0.5 text-xs font-semibold text-stone-300">
            {award.lines.map((l) => (
              <li key={l.label} className="flex justify-between">
                <span>{l.label}</span>
                <span className="font-num text-cyan-200">+{l.xp}</span>
              </li>
            ))}
          </ul>
          <XpBar from={award.xpBefore} to={award.xpAfter} />
          {leveledUp ? (
            <p className="animate-zoom-in flex items-center justify-center gap-1 rounded-full bg-pink-400 py-0.5 font-display text-sm font-bold text-night [animation-delay:1500ms]">
              <ArrowUp className="size-4" /> Level up! Lv {levelAfter}
            </p>
          ) : null}
          {award.streak > 1 && award.lines.some((l) => l.label === "Daily puzzle") ? (
            <p className="text-center font-display text-sm font-semibold text-orange-300">🔥 {award.streak}-day streak!</p>
          ) : null}
          {award.unlocked.length ? (
            <p className="flex flex-wrap justify-center gap-1">
              {award.unlocked.map((id) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id);
                return a ? (
                  <span key={id} className="rounded-full bg-yellow-300/15 px-2 py-0.5 text-[0.7rem] font-bold text-yellow-200">
                    {a.emoji} {a.name}
                  </span>
                ) : null;
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}
