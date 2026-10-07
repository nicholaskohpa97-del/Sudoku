"use client";

import { Swords } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiRequestError, usePlayer } from "@/lib/sudoku/client";
import { challengePuzzle, fetchDetail, startChallenge } from "@/lib/sudoku/leaderboard";
import type { ScoreDetail } from "@/lib/sudoku/types";
import { NameForm } from "./NameGate";
import { SoloGame } from "./SoloGame";
import { BackLink, buttonStyles, Panel } from "./ui";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; detail: ScoreDetail }
  | { kind: "playing"; detail: ScoreDetail; baseId: string; seed: number }
  | { kind: "blocked"; detail: ScoreDetail | null; reason: string };

/**
 * Opens a challenge. If you've already started it (and not finished) you pick up
 * where you were; otherwise you confirm, which locks in your one scored attempt.
 */
export function ChallengeLoader({ id }: { id: string }) {
  const { player, ready } = usePlayer();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const playerId = player?.id;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchDetail(id);
        if (cancelled) return;
        if (playerId) {
          // Already started and not finished? Resume it.
          try {
            const p = await challengePuzzle(id);
            if (!cancelled) setPhase({ kind: "playing", detail, baseId: p.baseId, seed: p.seed });
            return;
          } catch {
            // Not started yet: fall through.
          }
        }
        if (!cancelled) setPhase(detail.challenge.ok ? { kind: "ready", detail } : { kind: "blocked", detail, reason: detail.challenge.reason });
      } catch (err) {
        if (!cancelled) setPhase({ kind: "blocked", detail: null, reason: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, ready, playerId]);

  if (phase.kind === "loading") return <p className="text-center text-sm font-semibold text-stone-500">Loading…</p>;

  if (phase.kind === "playing") {
    const { entry } = phase.detail;
    return (
      <SoloGame
        mode={{ kind: "challenge", scoreId: id, baseId: phase.baseId, seed: phase.seed, target: { score: entry.score, playerName: entry.playerName } }}
      />
    );
  }

  const back = <BackLink href={`/sudoku/leaderboard/${id}`} label="Score" />;
  if (phase.kind === "blocked") {
    return (
      <div className="space-y-4">
        {back}
        <Panel className="space-y-3 text-center">
          <p className="font-display text-xl font-bold text-stone-100">Can&apos;t take this challenge</p>
          <p className="text-sm font-semibold text-stone-300">{phase.reason}</p>
          {!player ? <NameForm submitLabel="Save name" /> : null}
          <Link href="/sudoku/leaderboard" className={buttonStyles.secondary}>
            Back to the leaderboard
          </Link>
        </Panel>
      </div>
    );
  }

  const { entry } = phase.detail;
  return (
    <div className="space-y-4">
      {back}
      <Panel className="space-y-4">
        <div>
          <p className="font-display text-xs font-semibold tracking-widest text-yellow-200 uppercase">Challenge</p>
          <h1 className="font-display text-3xl font-bold">Beat {entry.playerName}</h1>
          <p className="text-sm font-semibold text-stone-300">
            Same puzzle, their score {entry.score.toLocaleString("en-US")}. Top the board for this puzzle and they&apos;re told they lost their crown.
          </p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs font-semibold text-stone-300">
          <li>You get one scored attempt. Leaving before you finish uses it up.</li>
          <li>Choose your own lives. Fewer lives pay more, and hints cost points.</li>
          <li>Your moves are replayed on the server to check the score.</li>
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const p = await startChallenge(id);
              setPhase({ kind: "playing", detail: phase.detail, baseId: p.baseId, seed: p.seed });
            } catch (err) {
              setPhase({ kind: "blocked", detail: phase.detail, reason: err instanceof ApiRequestError ? err.message : "Couldn't start the challenge" });
            } finally {
              setBusy(false);
            }
          }}
          className={`${buttonStyles.primary} w-full`}
        >
          <Swords className="size-5" /> {busy ? "Starting…" : "Accept the challenge"}
        </button>
      </Panel>
    </div>
  );
}
