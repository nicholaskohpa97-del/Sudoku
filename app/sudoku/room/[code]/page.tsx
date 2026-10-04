import type { Metadata } from "next";
import { RoomScreen } from "@/components/sudoku/RoomScreen";

export async function generateMetadata(props: PageProps<"/sudoku/room/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  return { title: `Room ${code.toUpperCase()}` };
}

export default async function RoomPage(props: PageProps<"/sudoku/room/[code]">) {
  const { code } = await props.params;
  return <RoomScreen code={code.toUpperCase()} />;
}
