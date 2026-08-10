import { useParams } from "@tanstack/react-router";
import { ErrorState } from "@/components/ui/states";
import { WatchSkeleton } from "@/components/ui/skeletons";
import { useAuth } from "@/hooks/auth";
import { useRoom } from "@/hooks/rooms";
import { RoomView } from "./RoomView";

export function RoomPage() {
  const { code } = useParams({ from: "/xem-chung/$code" });
  const { data: room, isLoading, error } = useRoom(code);
  const { data: user } = useAuth();

  if (isLoading) return <WatchSkeleton />;
  if (error || !room)
    return <ErrorState label="Không tìm thấy phòng hoặc phòng đã đóng" />;

  const displayName = user?.username ?? user?.email?.split("@")[0] ?? "Khách";
  return (
    <RoomView
      code={code}
      movieSlug={room.movieSlug}
      episodeSlug={room.episodeSlug}
      name={displayName}
    />
  );
}
