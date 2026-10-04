import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

const sans = Nunito({
  variable: "--font-sans-body",
  subsets: ["latin"],
});

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sudoku",
  description: "Neon Sudoku: daily puzzles, combos, multiplayer races with friends and monthly tournaments.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0820",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${grotesk.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden overscroll-none">{children}</body>
    </html>
  );
}
