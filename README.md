# Churn to Talk

Churn to Talk is an agent that continuously finds churned users who were interested in your product and helps founders talk to them with personalized recovery emails.

<img src="docs/churn-to-talk-command-center.png" alt="Churn to Talk command center">

## Why

> "Half the advice I give to startups is some form of 'talk to your customers.'" — Paul Graham

Founders know they should follow up with churned users, but doing it every day means digging through event logs, reconstructing what each person tried, understanding where they got stuck, and writing a non-generic message. Churn to Talk does that work automatically so the founder only has to review and send.

## Hackathon

Churn to Talk was built as part of the [Nozomio Hackathon](https://luma.com/rshibq6i?tk=KPGwGN), held on May 9, 2026 at the Entrepreneur First office in San Francisco. We finished in the top 6 out of roughly 51 teams and 200+ participants. Watch our [finals presentation](https://x.com/quasa0/status/2053321344851554438?s=20).

## How It Works

- **Tensorlake** runs the churn recovery agent on a 5-minute cron, with a manual trigger for demos.
- **PostHog-style event timelines** identify users who showed intent and then dropped off.
- **Nia** adds codebase and product workflow context so raw events become a likely churn reason.
- **OpenAI** drafts short, founder-style recovery emails for each user.
- **InsForge Postgres** stores detected users, run history, drafts, and state.
- **Hyperspell** stores recurring churn patterns and product issues as memory.
- **Next.js on Vercel** gives the founder a command center to review, edit, save, and send.
