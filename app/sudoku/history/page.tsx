import type { Metadata } from "next";
import { HistoryScreen } from "@/components/sudoku/HistoryScreen";

export const metadata: Metadata = { title: "Game history" };

export default function HistoryPage() {
  return <HistoryScreen />;
}
