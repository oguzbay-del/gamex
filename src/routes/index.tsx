import { createFileRoute } from "@tanstack/react-router";
import { PlatformGame } from "@/components/platform-game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <PlatformGame />;
}
