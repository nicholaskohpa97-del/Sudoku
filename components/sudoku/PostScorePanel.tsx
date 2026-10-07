"use client";

import { Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ApiRequestError, usePlayer } from "@/lib/sudoku/client";
import { DIFFICULTY_CONFIG } from "@/lib/sudoku/engine";
import { updateRecord } from "@/lib/sudoku/history";
import { postScore, type GameSubmission } from "@/lib/sudoku/leaderboard";
import type { PostResult } from "@/lib/sudoku/types";
import { NameForm } from "./NameGate";
import { buttonStyles } from "./ui";

/**
 * "Post to the leaderboard". The server replays the move log and works out the
 * score itself, so what appears there is its number, not the client's.
 */
export function PostScorePanel({ submission, recordId, posted }: { submission: GameSubmission; recordId?: string; posted?: string }) {
  const { player, ready } = usePlayer();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "done"; result: PostResult | null } | { kind: "error"; message: string }
  >(posted ? { kind: "done", result: null } : { kind: "idle" });

  if (!ready) return null;
  if (state.kind === "done") {
    const r = state.result;
    return (
      <div className="animate-rise space-y-1 rounded-2xl border border-lime-300/30 bg-lime-300/[0.07] px-3 py-2 text-left text-xs font-semibold text-lime-100">
        <p className="flex items-center gap-1.5 font-display text-sm font-bold text-lime-200">
          <Trophy className="size-4" /> {r ? (r.replaced ? "Score improved!" : "Posted!") : "Posted to the leaderboard"}
        </p>
        {r ? (
          <>
            <p>
              {r.entry.flagged
                ? "That run was faster than we can verify, so it's saved but kept off the public boards."
                : `${r.entry.score.toLocaleString("en-US")} points · #${r.puzzleRank} on this puzzle · #${r.boardRank} on the ${DIFFICULTY_CONFIG[r.entry.difficulty].label} board`}
            </p>
            <Link href={`/sudoku/leaderboard/${r.entry.id}`} className="inline-block text-cyan-200 underline">
              See it on the board
            </Link>
          </>
        ) : (
          <Link href="/sudoku/leaderboard" className="inline-block text-cyan-200 underline">
            Open the leaderboard
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left">
      {!player ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-300">Pick a name to post this score. Anonymous is fine.</p>
          <NameForm submitLabel="Save name" />
        </div>
      ) : (
        <button
          type="button"
          disabled={state.kind === "busy"}
          onClick={async () => {
            setState({ kind: "busy" });
            try {
              const result = await postScore(submission);
              if (recordId) updateRecord(recordId, { posted: result.entry.id });
              setState({ kind: "done", result });
            } catch (err) {
              setState({ kind: "error", message: err instanceof ApiRequestError ? err.message : "Couldn't reach the server. Try again" });
            }
          }}
          className={`${buttonStyles.pink} w-full !py-2`}
        >
          <Trophy className="size-4" /> {state.kind === "busy" ? "Posting…" : "Post to leaderboard"}
        </button>
      )}
      {state.kind === "error" ? <p className="text-xs font-semibold text-rose-300">{state.message}</p> : null}
    </div>
  );
}
