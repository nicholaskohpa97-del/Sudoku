import type { Metadata } from "next";
import { ReplayLoader } from "@/components/sudoku/ReplayLoader";

export const metadata: Metadata = { title: "Replay" };

export default async function ReplayPage(props: PageProps<"/sudoku/replay/[id]">) {
  const { id } = await props.params;
  return <ReplayLoader id={id} />;
}
