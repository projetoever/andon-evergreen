import { createFileRoute } from "@tanstack/react-router";
import { AndonBiPage } from "@/pages/AndonBiPage";

export const Route = createFileRoute("/bi")({
  component: AndonBiPage,
});
