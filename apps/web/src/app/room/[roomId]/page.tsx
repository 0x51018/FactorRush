import { sanitizeRoomId } from "@factorrush/shared";
import { GameShell } from "../../../components/game-shell";

interface RoomPageProps {
  params: Promise<{
    roomId: string;
  }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  return <GameShell initialRoomId={sanitizeRoomId(roomId)} />;
}
