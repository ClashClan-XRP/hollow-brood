import { createFileRoute } from "@tanstack/react-router";
import { HollowBrood } from "../components/hollow-brood";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HollowBrood />;
}
