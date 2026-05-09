import { ReviewBoard } from "@/components/ReviewBoard";
import type { DetectedUser, RunHistoryItem } from "./lib/types";
import { listDetectedUsers, listRunHistory } from "./lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Home() {
  noStore();

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
