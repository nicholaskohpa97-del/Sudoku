"use client";

import Link from "next/link";
import { useHistory } from "@/lib/sudoku/history";
import { SoloGame } from "./SoloGame";
import { BackLink, buttonStyles } from "./ui";

/** Finds a past game by id and replays its exact puzzle, unless it was revealed. */
export function ReplayLoader({ id }: { id: string }) {
  const history = useHistory();
  if (!history) return <div className="mx-auto aspect-square w-full max-w-[min(92vw,30rem)]" />;
  const record = history.records.find((r) => r.id === id);
  if (!record || record.result === "revealed") {
    return (
      <div className="space-y-4">
        <BackLink href="/sudoku/history" />
        <div className="mx-auto w-full max-w-[min(92vw,30rem)] space-y-3 rounded-3xl border border-rose-300/30 bg-rose-400/[0.07] p-5 text-center">
          <p className="font-display text-xl font-bold text-rose-200">{record ? "This puzzle is locked" : "Game not found"}</p>
          <p className="text-sm font-semibold text-stone-300">
            {record
              ? "You revealed the solution to this puzzle, so it can't be played again."
              : "It may have been cleared from this device's history."}
          </p>
          <Link href="/sudoku/history" className={buttonStyles.primary}>
            Back to history
          </Link>
        </div>
      </div>
    );
  }
  return <SoloGame mode={{ kind: "replay", record }} />;
}
