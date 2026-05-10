import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { getDetectedUser } from "@/app/lib/db";
import { FocusedUserCard } from "@/components/ReviewBoard";
import { NioDemo } from "@/components/NioDemo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Props = {
  params: { id: string };
};

export default async function UserDetails({ params }: Props) {
  noStore();
  const user = await getDetectedUser(decodeURIComponent(params.id));
  if (!user) notFound();

  return (
    <div className="min-h-screen bg-paper text-ink">
      <TopBar />

      <main className="mx-auto max-w-[1480px] px-8 pb-24 pt-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[12px] font-medium text-ink transition-colors hover:bg-paper2"
          >
            <ArrowLeft size={13} />
            Back to command center
          </Link>
          <div className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-mute sm:block">
            focused user
          </div>
        </div>

        <FocusedUserCard user={user} />
        <NioDemo
          rawActivity={eventTimelineText(user.event_timeline)}
          userName={user.name ?? "This user"}
        />
      </main>
    </div>
  );
}

function eventTimelineText(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as { events?: unknown };
    return typeof parsed.events === "string" ? parsed.events : JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-6 px-8 py-3.5">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[14px] font-semibold tracking-tight sm:text-[15px]">
              Churn → Talk | Command Center
            </span>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="rounded-md border border-line bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
              fastclip.it
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="#111714" strokeWidth="1.4" />
        <path
          d="M3.5 7.5 L6 10 L10.5 4.5"
          stroke="#4F7A5C"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
