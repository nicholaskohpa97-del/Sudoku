"use client";

import { Gamepad2, Trophy, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/sudoku#play", match: "/sudoku", label: "Play", icon: Gamepad2 },
  { href: "/sudoku#rooms", match: null, label: "Rooms", icon: Users },
  { href: "/sudoku#tournaments", match: null, label: "Tournaments", icon: Trophy },
  { href: "/sudoku/profile", match: "/sudoku/profile", label: "Profile", icon: User },
];

/** Mobile bottom navigation, shown on the hub and profile only (games need the space). */
export function TabBar() {
  const pathname = usePathname();
  if (pathname !== "/sudoku" && pathname !== "/sudoku/profile") return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map(({ href, match, label, icon: Icon }) => {
          const active = match === pathname;
          return (
            <li key={label}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2.5 font-display text-[0.7rem] font-semibold transition ${
                  active ? "text-cyan-300" : "text-stone-400 hover:text-stone-100"
                }`}
              >
                <Icon className={`size-5 ${active ? "drop-shadow-[0_0_8px_rgb(34_211_238/0.8)]" : ""}`} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
