export type DetectedUser = {
  id: string;
  email: string | null;
  name: string | null;
  detection_reason: string | null;
  event_timeline: string | null;
  activity_summary: string | null;
  draft_message: string | null;
  status: "pending" | "sent" | "archived" | string;
  detected_at: string | null;
  run_id: string | null;
};

export type RunHistoryItem = {
  key: string;
  run_id?: string;
  ran_at?: string;
  users_found?: number;
  status?: string;
  source?: string;
  error?: string;
};
