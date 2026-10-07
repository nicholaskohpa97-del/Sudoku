import type { Metadata } from "next";
import { ChallengeLoader } from "@/components/sudoku/ChallengeLoader";

export const metadata: Metadata = { title: "Challenge" };

export default async function ChallengePage(props: PageProps<"/sudoku/challenge/[id]">) {
  const { id } = await props.params;
  return <ChallengeLoader id={id} />;
}
