import type { Metadata } from "next";
import { ScoreDetailScreen } from "@/components/sudoku/ScoreDetailScreen";

export const metadata: Metadata = { title: "Score" };

export default async function ScorePage(props: PageProps<"/sudoku/leaderboard/[id]">) {
  const { id } = await props.params;
  return <ScoreDetailScreen id={id} />;
}
