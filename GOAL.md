# Churn Recovery Agent — Hackathon Build

## What it is

An always-on background agent that runs every 5 minutes on Tensorlake. Each run, it uses an LLM to generate 1-3 realistic fake churned users of fastclip.it (a B2C web app that converts long-form video/podcasts into short-form clips), enriches the output with real app context from Nia (which has the fastclip.it codebase indexed), drafts personalized founder-voice recovery emails, and saves everything to Turso. A Next.js app on Vercel shows all detected users as cards with draft emails the founder can edit and send.

There's also a manual trigger endpoint so I can fire the agent on-demand during the demo for judges.

## Architecture

```text
Tensorlake Orchestrate (Python)
  ├── Cron: every 5 min AND manual HTTP trigger for demo
  └── churn_recovery_agent()
        ├── get_app_context()          — Nia API: search indexed fastclip.it codebase for feature descriptions
        ├── generate_mock_users()      — OpenAI GPT-5.5 low reasoning: generate 1-3 realistic churned user profiles with event timelines
        ├── draft_messages()           — OpenAI GPT-5.5 low reasoning: for each user, generate activity summary + founder-voice email
        └── save_to_db()              — write users + drafts to Turso

Next.js on Vercel
  └── Review UI: list of user cards from Turso
      Each card = user info, why detected, activity summary, draft email (editable), Send button
      Also shows run history (when agent ran, how many users generated)
```

## Stack

- **Tensorlake Orchestrate** — Python only (no TS for Orchestrate). Cron + HTTP trigger.
- **Turso (libSQL)** — Durable state. Already have an account.
- **Nia API** — Index fastclip.it codebase, query it for feature context during runs.
- **OpenAI API** — GPT-5.5 with low reasoning. Mock user generation + email drafting.
- **Next.js on Vercel** — Review UI. Deploy with `vercel` CLI.

## InsForge Postgres DB schema

Create these tables from a local setup script (not from the agent). The agent just reads/writes.

```sql
CREATE TABLE IF NOT EXISTS detected_users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  detection_reason TEXT,
  event_timeline TEXT,
  activity_summary TEXT,
  draft_message TEXT,
  status TEXT DEFAULT 'pending',
  detected_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  run_id TEXT
);

CREATE TABLE IF NOT EXISTS app_cache (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);
```

The setup script should create these tables and insert a couple test rows into `app_cache` to verify the connection works.

`detected_users`: one row per churned user the agent finds. Stores everything about them — who they are, why they churned, what they did, the draft email, and whether the founder has acted on it.

`app_cache`: generic key-value store for anything we need (e.g. caching Nia context, storing last run metadata, run history).

Store run history in `app_cache` with key pattern like `run:{timestamp}` and value as JSON with stats (users_found, ran_at, etc). The Next.js app can query these to show run history.

## Nia setup (do this BEFORE coding)

fastclip.it is a B2C web app. Index the codebase into Nia so the agent can query what features exist, what events mean, etc.

```bash
curl -X POST https://apigcp.trynia.ai/v2/sources \
  -H "Authorization: Bearer $NIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/<fastclip-repo>"}'
```

Do this early — indexing takes time.

During each agent run, query Nia:

```text
POST https://apigcp.trynia.ai/v2/universal-search
{"query": "what are the main features and user actions in fastclip.it", "repositories": ["<repo>"]}
```

This gives the LLM real context about what the app does, so generated mock users and draft emails reference actual features.

## Mock user generation

On every run, call OpenAI to generate 1-3 new fake churned users. Prompt should include the Nia-provided app context so the fake users reference real fastclip.it features. Each generated user should have:

- A made-up name and email
- A realistic event timeline (what they did in the app, when)
- A detection reason (why the agent flagged them — e.g. "returned on day 3 but never exported")
- Enough detail for the drafting step to write a specific email

Use a JSON-mode or structured output prompt so parsing is reliable.

## Build order (step by step, verify each works before next)

### Step 1: Tensorlake hello world

Deploy a minimal Python function on Tensorlake Orchestrate. Just returns "hello". Verify `tl deploy` works. Verify you can call the HTTP endpoint manually. Don't move on until this works.

### Step 2: Local DB setup script

Write a small script (can be TS or Python, run from localhost) that connects to InsForge Postgres, creates the two tables, inserts test rows into `app_cache`. Verify reads work.

### Step 3: InsForge Postgres from Tensorlake

Make the deployed Tensorlake function connect to InsForge Postgres, read from `app_cache`, return the test data. Verify the connection works from inside Tensorlake's environment.

### Step 4: Nia context

Add a Nia API call to the agent. Query the indexed fastclip.it repo for feature context. Return it as a string. Verify it returns meaningful info about the app.

### Step 5: Generate mock users + drafts

Add OpenAI calls. Use the Nia context in the prompt. Generate 1-3 fake churned users with event timelines. For each, generate an activity summary and a founder-voice draft email. Save all of it to `detected_users` table in Turso. Save run metadata to `app_cache`. Verify by querying Turso after a run.

### Step 6: Cron + manual trigger

Set up Tensorlake cron (every 5 min). Verify it fires. Also verify the HTTP endpoint still works for manual triggering during demo.

### Step 7: Next.js review UI

Simple app:

- Main page: list of cards from `detected_users` table, ordered by `detected_at` desc
- Each card shows: name, email, detection reason, activity summary, draft message (in an editable textarea), status badge, a "Send" button (just sets status to "sent" in Turso for now)
- Somewhere on the page (sidebar, top section, or separate tab): run history from `app_cache` showing when the agent last ran and how many users it found
- Deploy with `vercel` CLI

### Step 8: Demo polish

- Make sure manual trigger works reliably for live demo
- Add a "Trigger Agent Now" button in the Next.js UI that calls the Tensorlake HTTP endpoint
- Verify: click trigger → wait a few seconds → refresh → new user cards appear

## Demo flow for judges

1. Open the Next.js app — show it's empty or has previous runs
2. Click "Trigger Agent" button (or call endpoint) — agent runs on Tensorlake
3. Refresh — 1-3 new user cards appear with personalized draft emails
4. Show that each email references specific things the user did (powered by Nia context about real fastclip.it features)
5. Edit a draft slightly, click Send
6. Show the cron schedule — "this runs every 5 minutes on its own, I just triggered it manually for the demo"
7. Show run history — previous runs logged with timestamps
8. Explain: "In production, this queries PostHog instead of generating mock users. The rest is identical."

**Pitch:** "Users try my app and disappear. This agent wakes up every 5 minutes, figures out what they did and where they got stuck, and drafts me a personal email. I review it, tweak if needed, hit send. The replies teach me what to fix. Right now it generates mock users — in production it reads real PostHog analytics."

## Env vars

Tensorlake secrets:

```text
OPENAI_API_KEY
NIA_API_KEY
INSFORGE_DATABASE_URL
```

Vercel env vars (for Next.js):

```text
INSFORGE_DATABASE_URL
TENSORLAKE_AGENT_URL    # endpoint URL to trigger agent manually
TENSORLAKE_API_KEY      # to auth the manual trigger call
```

## Important notes

- Python is ONLY for Tensorlake agent. Everything else is TypeScript/Next.js.
- No real PostHog. Mock users generated by LLM on every run.
- No real email sending. "Send" button just updates status in Turso.
- fastclip.it is a B2C web app (not iOS).
- Nia needs the fastclip.it repo indexed BEFORE you start coding.
- All code examples above are direction, not copy-paste. Build step by step, verify each step.
- Deploy Next.js with `vercel` CLI from the project directory.
