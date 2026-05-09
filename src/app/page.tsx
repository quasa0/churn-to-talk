import { ReviewBoard } from "@/components/ReviewBoard";
import type { DetectedUser, RunHistoryItem } from "./lib/types";
import { listDetectedUsers, listRunHistory } from "./lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  let users: DetectedUser[] = [];
  let runs: RunHistoryItem[] = [];

  try {
    [users, runs] = await Promise.all([listDetectedUsers(), listRunHistory()]);
  } catch {
    users = [];
    runs = [];
  }

  return <ReviewBoard initialUsers={users} initialRuns={runs} />;
}
