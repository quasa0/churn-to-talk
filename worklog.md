# Worklog

## 2026-05-09 - FastClip copy and Nia handoff

- Created a clean-history copy of FastClip from `/Users/personal/f` at `/Users/personal/Hackathon/fastclip.it`.
- Removed original `.git`, obvious sensitive/generated files, and bulky local artifacts before committing:
  - removed `.env*`, cookies, session files, local DBs, `.DS_Store`
  - removed `node_modules`, `dist`, `.venv`, generated Remotion input videos
  - removed local private keys `nginx/ssl/localhost.key` and `old-backend/certs/key.pem`
  - replaced hardcoded `STORYTELLER_SECRET_KEY` in `docker-compose.yml` with `${STORYTELLER_SECRET_KEY}`
- Initialized a new Git repo in `/Users/personal/Hackathon/fastclip.it`, committed `196e5bf Initial clean import`, and pushed to `git@github.com:quasa0/fastclip.it-copy.git`.
- GitHub push succeeded. GitHub warned that `old-frontend/gif.gif` is `52.27 MB`, above the recommended `50 MB`, but below the hard limit.

### Nia setup

- Tried indexing `https://github.com/quasa0/fastclip.it-copy` with Nia `/v2/sources`.
- Initial local script payload failed because Nia now requires `type: "repository"` and `repository`; updated `scripts/index-nia.ts` accordingly.
- Nia then rejected GitHub repo indexing with: `GitHub App installation required for private repositories. Please install the GitHub App or provide a valid token.`
- Workaround used for the hackathon: uploaded the cleaned local FastClip copy as a Nia `local_folder` source.
- Nia local folder source:
  - display name: `fastclip.it-copy`
  - source id: `0f198f5d-8ae0-4232-943b-d0815249afb1`
  - identifier: `/Users/personal/Hackathon/fastclip.it`
- Nia accepted the local folder and its tree endpoint can see files, but semantic search/read was not reliable yet:
  - source stayed in `processing`
  - `chunk_count` was `0`
  - `/v2/search` returned no relevant local-folder content
  - `/sources/{id}/content` returned a Nia server-side local-folder error
- To give the agent usable context immediately, saved a permanent Nia shared context containing FastClip product/workflow/churn details.
- Nia shared context:
  - title: `fastclip.it-copy context for churn recovery agent`
  - context id: `2520ff43-af84-411c-9c54-4c83c25c6414`
  - tags: `fastclip.it`, `fastclip.it-copy`, `churn-to-talk`, `nia-context`, `hackathon`
  - query used by agent: `fastclip.it-copy context churn recovery`

### Agent changes

- Updated `agent/churn_recovery_agent.py`:
  - imports `urllib.parse`
  - `_json_request` now supports `GET` requests and optional payloads
  - `query_nia_context()` now:
    - respects `SKIP_NIA=1` fallback
    - searches Nia shared contexts first via `/v2/contexts/search`
    - uses `NIA_CONTEXT_QUERY`, defaulting to `fastclip.it-copy context churn recovery`
    - falls back to current `/v2/search` source search if no shared context is found
    - supports `NIA_LOCAL_FOLDER` / `NIA_LOCAL_FOLDER_ID`
  - changed a few type hints from `dict[str, Any] | None` to `Optional[...]` so local Python 3.9 can compile it.
- Updated `.env`:
  - `NIA_API_KEY` set to the latest key supplied by Garry
  - `FASTCLIP_REPO_URL=https://github.com/quasa0/fastclip.it-copy`
  - `NIA_REPOSITORY=quasa0/fastclip.it-copy`
  - `NIA_CONTEXT_QUERY=fastclip.it-copy context churn recovery`
  - `NIA_LOCAL_FOLDER=fastclip.it-copy`
  - `NIA_LOCAL_FOLDER_ID=0f198f5d-8ae0-4232-943b-d0815249afb1`
  - `SKIP_NIA=0`
- Updated `.env.example` and `README.md` to reflect Nia enabled flow and the context query/local folder settings.

### Verification

- `python3 -m py_compile agent/churn_recovery_agent.py` passes.
- Local Nia lookup verification:
  - `query_nia_context()` returns `used_default=False`
  - returned content includes the saved FastClip context
  - verified after replacing `NIA_API_KEY` with the latest key.

### Remaining handoff items

- Other agent should carry these env vars into Tensorlake secrets/deployment:
  - `NIA_API_KEY`
  - `NIA_CONTEXT_QUERY=fastclip.it-copy context churn recovery`
  - `NIA_LOCAL_FOLDER=fastclip.it-copy`
  - `NIA_LOCAL_FOLDER_ID=0f198f5d-8ae0-4232-943b-d0815249afb1`
  - `SKIP_NIA=0`
- Do not rely on direct GitHub repo indexing unless Nia’s GitHub App is installed for `quasa0/fastclip.it-copy` or the repo is made public.
- For demo reliability, use the saved Nia shared context path. It already contains the FastClip product facts and churn-relevant activation moments.

## 2026-05-09 - Tensorlake cron interval

- Changed active Tensorlake cron from `*/15 * * * *` to `*/3 * * * *`.
- Updated `package.json`, `README.md`, `GOAL.md`, and UI references to the 3-minute cron cadence.
- Verified the active Tensorlake schedule is `*/3 * * * *`.
