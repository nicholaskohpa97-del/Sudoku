import type { Metadata } from "next";
import { SoloGame } from "@/components/sudoku/SoloGame";

export const metadata: Metadata = { title: "Ascent" };

export default function AscentPage() {
  return <SoloGame mode={{ kind: "ascent" }} />;
}
