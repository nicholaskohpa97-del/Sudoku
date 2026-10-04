import type { Metadata } from "next";
import { LeagueScreen } from "@/components/sudoku/LeagueScreen";

export const metadata: Metadata = { title: "Tournament" };

export default async function LeaguePage(props: PageProps<"/sudoku/league/[code]">) {
  const { code } = await props.params;
  return <LeagueScreen code={code.toUpperCase()} />;
}
