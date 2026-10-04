import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoloGame } from "@/components/sudoku/SoloGame";
import { DIFFICULTIES, DIFFICULTY_CONFIG, isDifficulty } from "@/lib/sudoku/engine";

export const dynamicParams = false;

export function generateStaticParams() {
  return DIFFICULTIES.map((difficulty) => ({ difficulty }));
}

export async function generateMetadata(props: PageProps<"/sudoku/play/[difficulty]">): Promise<Metadata> {
  const { difficulty } = await props.params;
  return { title: isDifficulty(difficulty) ? `${DIFFICULTY_CONFIG[difficulty].label} puzzle` : "Puzzle" };
}

export default async function PlayPage(props: PageProps<"/sudoku/play/[difficulty]">) {
  const { difficulty } = await props.params;
  if (!isDifficulty(difficulty)) notFound();
  return <SoloGame difficulty={difficulty} />;
}
