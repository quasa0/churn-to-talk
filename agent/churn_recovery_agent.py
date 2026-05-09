import json
import os
import random
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

try:
    from tensorlake.applications import Image, Request, application, function, run_local_application
except Exception:
    Image = None
    Request = None

    def application(*_args, **_kwargs):
        def decorator(fn):
            return fn

        return decorator

    def function(*_args, **_kwargs):
        def decorator(fn):
            return fn

        return decorator

    def run_local_application(fn, payload):
        class LocalRequest:
            def output(self):
                return fn(payload)

        return LocalRequest()


DEFAULT_CONTEXT = """
fastclip.it is a B2C web app for creators, podcasters, coaches, and small teams who turn long-form
video or podcast content into short-form clips for TikTok, Instagram Reels, YouTube Shorts, and
LinkedIn. The main workflow is: upload or import a long-form video, wait for transcription and AI
analysis, review suggested highlight clips, open a clip editor, adjust the hook/start/end points,
edit captions, choose a social aspect ratio, preview the result, export the clip, then download or
reuse it for posting.

Important product actions and likely churn signals:
- upload_started, upload_completed, transcript_generated, ai_clips_generated
- clip_previewed, clip_editor_opened, hook_adjusted, caption_style_changed, aspect_ratio_changed
- export_started, export_failed, export_completed, download_clicked
- returned_after_first_session, invited_teammate, viewed_pricing, hit_free_limit

Common user friction:
- A user gets useful AI clip suggestions but never exports, suggesting uncertainty about clip quality
  or how to polish captions/hooks.
- A user edits captions or aspect ratios repeatedly, then abandons before export, suggesting the editor
  feels hard or the output is not yet social-ready.
- A user uploads multiple assets but never downloads, suggesting they are evaluating fit or hit a
  processing/export issue.
- A user returns a few days later, previews generated clips, and leaves again, suggesting intent but an
  unresolved blocker.
""".strip()

SECRETS = ["OPENAI_API_KEY", "NIA_API_KEY", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]

if Image:
    agent_image = Image(name="python:3.11-slim").run("pip install requests")
else:
    agent_image = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_local_env() -> None:
    if not os.path.exists(".env"):
        return
    with open(".env", "r", encoding="utf-8") as file:
        for line in file:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key, value.strip().strip("\"'"))


def _json_request(
    url: str,
    payload: Optional[dict[str, Any]],
    headers: dict[str, str],
    timeout: int = 60,
    method: str = "POST",
) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        if not body:
            return {}
        return json.loads(body)


def _turso_request(statements: list[dict[str, Any]]) -> dict[str, Any]:
    url = os.environ["TURSO_DATABASE_URL"]
    token = os.environ["TURSO_AUTH_TOKEN"]
    if url.startswith("libsql://"):
        url = "https://" + url.removeprefix("libsql://")
    endpoint = url.rstrip("/") + "/v2/pipeline"
    baton = None
    requests: list[dict[str, Any]] = []
    for statement in statements:
        request: dict[str, Any] = {"type": "execute", "stmt": statement}
        if baton:
            request["baton"] = baton
        requests.append(request)

    return _json_request(
        endpoint,
        {"requests": requests},
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )


def _sql_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    return {"type": "text", "value": str(value)}


def _stmt(sql: str, args: Optional[list[Any]] = None) -> dict[str, Any]:
    return {
        "sql": sql,
        "args": [_sql_value(arg) for arg in (args or [])],
    }


def setup_tables() -> None:
    _turso_request(
        [
            _stmt(
                """
                CREATE TABLE IF NOT EXISTS detected_users (
                  id TEXT PRIMARY KEY,
                  email TEXT,
                  name TEXT,
                  detection_reason TEXT,
                  event_timeline TEXT,
                  activity_summary TEXT,
                  draft_message TEXT,
                  status TEXT DEFAULT 'pending',
                  detected_at TEXT DEFAULT (datetime('now')),
                  run_id TEXT
                )
                """
            ),
            _stmt(
                """
                CREATE TABLE IF NOT EXISTS app_cache (
                  key TEXT PRIMARY KEY,
                  value TEXT,
                  updated_at TEXT DEFAULT (datetime('now'))
                )
                """
            ),
        ]
    )


def query_nia_context() -> str:
    if os.environ.get("SKIP_NIA") == "1":
        return DEFAULT_CONTEXT

    api_key = os.environ.get("NIA_API_KEY")
    context_query = os.environ.get("NIA_CONTEXT_QUERY", "fastclip.it-copy context churn recovery")
    repository = os.environ.get("NIA_REPOSITORY") or os.environ.get("FASTCLIP_REPO_URL")
    local_folder = os.environ.get("NIA_LOCAL_FOLDER") or os.environ.get("NIA_LOCAL_FOLDER_ID")
    if not api_key:
        return DEFAULT_CONTEXT

    try:
        context_data = _json_request(
            "https://apigcp.trynia.ai/v2/contexts/search"
            f"?q={urllib.parse.quote(context_query)}&limit=3&tags=fastclip.it,churn-to-talk",
            None,
            {"Authorization": f"Bearer {api_key}"},
            method="GET",
        )
        contexts = context_data.get("contexts", []) if isinstance(context_data, dict) else []
        if contexts:
            return json.dumps(contexts, ensure_ascii=True)[:8000]
    except Exception:
        pass

    if not repository and not local_folder:
        return DEFAULT_CONTEXT

    try:
        sources: dict[str, Any] = {}
        if repository:
            sources["repositories"] = [{"repository": repository}]
        if local_folder:
            sources["local_folders"] = [local_folder]

        payload = {
            "mode": "query",
            "messages": [
                {
                    "role": "user",
                    "content": "What are the main features, user actions, product workflows, and churn-relevant activation moments in fastclip.it?",
                }
            ],
            "search_mode": "unified",
            "include_sources": True,
            "fast_mode": False,
            **sources,
        }
        data = _json_request(
            "https://apigcp.trynia.ai/v2/search",
            payload,
            {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
    except Exception:
        return DEFAULT_CONTEXT

    return json.dumps(data, ensure_ascii=True)[:8000] if data else DEFAULT_CONTEXT


def _openai_structured(prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for generation")

    payload = {
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "messages": [
            {
                "role": "system",
                "content": "You generate realistic B2C SaaS churn-recovery data. Return only valid JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "churn_recovery_payload",
                "schema": schema,
                "strict": True,
            },
        },
        "temperature": 0.9,
    }
    data = _json_request(
        "https://api.openai.com/v1/chat/completions",
        payload,
        {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=90,
    )
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


def generate_mock_users(app_context: str) -> list[dict[str, Any]]:
    count = random.randint(1, 3)
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["users"],
        "properties": {
            "users": {
                "type": "array",
                "minItems": count,
                "maxItems": count,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "email", "detection_reason", "event_timeline"],
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string"},
                        "detection_reason": {"type": "string"},
                        "event_timeline": {"type": "string"},
                    },
                },
            }
        },
    }
    prompt = f"""
Generate {count} realistic fake churned fastclip.it users.

App context from Nia:
{app_context}

Each user must be made up, B2C creator/prosumer, and include a specific sequence of app actions over 1-7 days.
Detection reasons should be behavioral, such as returned but never exported, edited captions then abandoned, or uploaded multiple times but never reached download.
"""
    return _openai_structured(prompt, schema)["users"]


def draft_messages(users: list[dict[str, Any]], app_context: str) -> list[dict[str, Any]]:
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["drafts"],
        "properties": {
            "drafts": {
                "type": "array",
                "minItems": len(users),
                "maxItems": len(users),
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["email", "activity_summary", "draft_message"],
                    "properties": {
                        "email": {"type": "string"},
                        "activity_summary": {"type": "string"},
                        "draft_message": {"type": "string"},
                    },
                },
            }
        },
    }
    prompt = f"""
Write founder-voice recovery material for these fake churned fastclip.it users.

App context:
{app_context}

Users:
{json.dumps(users, ensure_ascii=True)}

For each user, return:
- email: same email as input
- activity_summary: one compact paragraph describing what they tried and where they likely got stuck
- draft_message: 1-2 very short sentences only. Write like a real busy founder texting a user, all lowercase, casual, slightly imperfect, no subject line, no greeting block, no signoff, no marketing language, no em dash. Mention one specific thing they did and ask one simple question. Example style: "hey, saw you got clips generated but never exported. did the editor feel annoying or was the clip quality just not there?"
"""
    drafts = _openai_structured(prompt, schema)["drafts"]
    by_email = {draft["email"].lower(): draft for draft in drafts}
    enriched = []
    for user in users:
        draft = by_email.get(user["email"].lower(), {})
        enriched.append({**user, **draft})
    return enriched


def save_to_db(run_id: str, users: list[dict[str, Any]], app_context: str, source: str) -> dict[str, Any]:
    ran_at = _now_iso()
    statements = [
        _stmt(
            """
            INSERT INTO app_cache (key, value, updated_at)
            VALUES ('fastclip:context:latest', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
            """,
            [app_context],
        )
    ]
    for user in users:
        statements.append(
            _stmt(
                """
                INSERT INTO detected_users (
                  id, email, name, detection_reason, event_timeline,
                  activity_summary, draft_message, status, detected_at, run_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?)
                """,
                [
                    f"du_{uuid.uuid4().hex}",
                    user.get("email"),
                    user.get("name"),
                    user.get("detection_reason"),
                    user.get("event_timeline"),
                    user.get("activity_summary"),
                    user.get("draft_message"),
                    run_id,
                ],
            )
        )

    metadata = {
        "run_id": run_id,
        "ran_at": ran_at,
        "users_found": len(users),
        "status": "complete",
        "source": source,
    }
    statements.append(
        _stmt(
            """
            INSERT INTO app_cache (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
            """,
            [f"run:{ran_at}", json.dumps(metadata)],
        )
    )
    _turso_request(statements)
    return metadata


@application()
@function(image=agent_image, secrets=SECRETS)
def hello_world(name: str = "judges") -> str:
    return f"hello {name}"


@application()
@function(image=agent_image, secrets=SECRETS)
def churn_recovery_agent(payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    payload = payload or {}
    source = str(payload.get("source", "manual"))
    run_id = f"run_{int(time.time())}_{uuid.uuid4().hex[:8]}"

    setup_tables()
    app_context = query_nia_context()
    users = generate_mock_users(app_context)
    drafted_users = draft_messages(users, app_context)
    metadata = save_to_db(run_id, drafted_users, app_context, source)

    return {
        **metadata,
        "users": [
            {
                "name": user.get("name"),
                "email": user.get("email"),
                "detection_reason": user.get("detection_reason"),
            }
            for user in drafted_users
        ],
    }


def _local_sqlite_smoke_test() -> dict[str, Any]:
    connection = sqlite3.connect(":memory:")
    connection.execute("CREATE TABLE app_cache (key TEXT PRIMARY KEY, value TEXT)")
    connection.execute("INSERT INTO app_cache VALUES (?, ?)", ("setup:connection", "ok"))
    row = connection.execute("SELECT value FROM app_cache WHERE key = ?", ("setup:connection",)).fetchone()
    return {"sqlite": row[0]}


if __name__ == "__main__":
    _load_local_env()
    if os.environ.get("RUN_HELLO") == "1":
        request = run_local_application(hello_world, "local")
        print(request.output())
    elif all(os.environ.get(key) for key in ["OPENAI_API_KEY", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"]):
        request = run_local_application(churn_recovery_agent, {"source": "local"})
        print(json.dumps(request.output(), indent=2))
    else:
        print(json.dumps(_local_sqlite_smoke_test()))
