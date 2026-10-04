import type { Metadata } from "next";
import { SoloGame } from "@/components/sudoku/SoloGame";

export const metadata: Metadata = { title: "Daily puzzle" };

export default function DailyPage() {
  return <SoloGame mode={{ kind: "daily" }} />;
}
