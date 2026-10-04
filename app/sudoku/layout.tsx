import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Sudoku", template: "%s · Sudoku" },
  description: "Ad-free Sudoku with four difficulty levels, multiplayer rooms for up to 20 friends and monthly tournaments.",
};

export default function SudokuLayout({ children }: LayoutProps<"/sudoku">) {
  // The root layout locks body scrolling, so this section provides its own
  // scroll container (keeps iOS overscroll inside the page).
  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-[#0d1420] text-stone-100">
      <div className="mx-auto w-full max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-16 sm:px-6">
        <nav className="mb-6 flex items-center justify-between">
          <Link href="/sudoku" className="font-display text-xl tracking-wide text-stone-200 hover:text-white">
            Sudoku
          </Link>
          <span className="text-[0.7rem] tracking-wider text-stone-500 uppercase">Ad-free</span>
        </nav>
        {children}
      </div>
    </div>
  );
}
