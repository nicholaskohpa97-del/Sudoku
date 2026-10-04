import type { Metadata } from "next";
import Link from "next/link";
import { TabBar } from "@/components/sudoku/TabBar";
import { Logo, MuteToggle } from "@/components/sudoku/ui";

export const metadata: Metadata = {
  title: { default: "Sudoku", template: "%s · Sudoku" },
  description: "Neon Sudoku: daily puzzles, combos, multiplayer races with up to 20 friends and monthly tournaments.",
};

export default function SudokuLayout({ children }: LayoutProps<"/sudoku">) {
  // The root layout locks body scrolling, so this section provides its own
  // scroll container (keeps iOS overscroll inside the page).
  return (
    <div className="arcade-bg fixed inset-0 overflow-y-auto overscroll-contain text-stone-100">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-drift absolute -top-40 -left-32 size-[28rem] rounded-full bg-cyan-500/20 blur-[110px]" />
        <div className="animate-drift absolute -right-32 -bottom-40 size-[30rem] rounded-full bg-pink-500/20 blur-[120px] [animation-delay:-9s]" />
      </div>
      <div className="relative mx-auto w-full max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28 sm:px-6 sm:pb-16">
        <nav className="mb-6 flex items-center justify-between">
          <Link href="/sudoku" className="group flex items-center gap-2.5">
            <Logo className="size-9 transition group-hover:rotate-[-6deg] group-hover:scale-110" />
            <span className="bg-gradient-to-r from-cyan-200 to-pink-300 bg-clip-text font-display text-2xl font-bold tracking-wide text-transparent">
              SUDOKU
            </span>
          </Link>
          <MuteToggle />
        </nav>
        {children}
      </div>
      <TabBar />
    </div>
  );
}
