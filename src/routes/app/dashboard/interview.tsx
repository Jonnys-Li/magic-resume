import { createFileRoute } from "@tanstack/react-router";
import InterviewPrepPage from "@/app/app/dashboard/interview/page";

export const Route = createFileRoute("/app/dashboard/interview")({
  component: InterviewPrepPage,
});
