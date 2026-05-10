# Churn to Talk

Hackathon build for a founder-reviewed churn recovery agent.

The system has two pieces:

- `agent/churn_recovery_agent.py`: Tensorlake Orchestrate Python app. It can be triggered manually over HTTP or scheduled every 3 minutes. Each run generates 1-3 realistic fake churned fastclip.it users, drafts founder-voice recovery emails, and writes everything to InsForge Postgres.
- `src/app`: Next.js review UI. It lists detected users, lets the founder edit drafts, marks drafts as sent, shows run history, and includes a "Trigger Agent Now" button for demos.

Nia is enabled with `SKIP_NIA=0`. The agent first searches Nia shared context for `fastclip.it-copy context churn recovery`, then falls back to indexed source search if available.

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
OPENAI_API_KEY=
NIA_API_KEY=
FASTCLIP_REPO_URL=https://github.com/quasa0/fastclip.it-copy
NIA_REPOSITORY=quasa0/fastclip.it-copy
NIA_CONTEXT_QUERY=fastclip.it-copy context churn recovery
NIA_LOCAL_FOLDER=fastclip.it-copy
NIA_LOCAL_FOLDER_ID=
SKIP_NIA=0
INSFORGE_DATABASE_URL=
TENSORLAKE_API_KEY=
TENSORLAKE_AGENT_URL=https://api.tensorlake.ai/applications/churn_recovery_agent
TENSORLAKE_APPLICATION_NAME=churn_recovery_agent
```

## Local Setup

```bash
npm install
npm run setup:db
npm run dev
```

Open `http://localhost:3000`.

## Tensorlake

Set secrets:

```bash
tl secrets set OPENAI_API_KEY=$OPENAI_API_KEY \
  NIA_API_KEY=$NIA_API_KEY \
  INSFORGE_DATABASE_URL=$INSFORGE_DATABASE_URL
```

Deploy and trigger:

```bash
npm run deploy:tensorlake
npm run trigger:agent
```

Create the 3-minute cron:

```bash
npm run deploy:tensorlake:cron
```

Tensorlake exposes the manual trigger endpoint at:

```text
https://api.tensorlake.ai/applications/churn_recovery_agent
```

## Nia

Index or refresh the fastclip repo/source context:

```bash
npm run index:nia
```

For this hackathon setup, a permanent Nia shared context exists under the title `fastclip.it-copy context for churn recovery agent`. Set `SKIP_NIA=0` and deploy with `NIA_CONTEXT_QUERY=fastclip.it-copy context churn recovery`.

## Vercel

Set these Vercel environment variables:

```bash
INSFORGE_DATABASE_URL
TENSORLAKE_AGENT_URL
TENSORLAKE_API_KEY
```

Deploy:

```bash
npm run deploy:vercel
```
