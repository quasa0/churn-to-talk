import json
import os
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg

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

SECRETS = [
    "OPENAI_API_KEY",
    "NIA_API_KEY",
    "INSFORGE_DATABASE_URL",
    "LOOPS_API_KEY",
    "LOOPS_TRANSACTIONAL_ID",
]

SPONSOR_DOMAINS = [
    "nozomio.com",
    "ainexus.com",
    "vercel.com",
    "insforge.dev",
    "reacher.ai",
    "hyperspell.com",
    "tensorlake.ai",
    "convex.dev",
    "aside.com",
    "cognition.ai",
    "openai.com",
]

FIRST_NAMES = [
    "Aaliyah", "Aaron", "Abigail", "Adam", "Adrian", "Aiden", "Alex", "Alexa", "Alexis", "Alice",
    "Amara", "Amanda", "Amelia", "Andre", "Andrew", "Angel", "Angela", "Anika", "Anna", "Anthony",
    "Ari", "Aria", "Arthur", "Ashley", "Ashton", "Aubrey", "Austin", "Ava", "Avery", "Bailey",
    "Beatrice", "Ben", "Bianca", "Blake", "Brandon", "Brianna", "Brooke", "Caleb", "Camila", "Cameron",
    "Carla", "Carlos", "Carmen", "Caroline", "Casey", "Celeste", "Charlie", "Charlotte", "Chloe", "Chris",
    "Christian", "Christopher", "Claire", "Clara", "Cody", "Cole", "Colin", "Connor", "Courtney", "Daisy",
    "Daniel", "Daniela", "Dante", "David", "Dean", "Delaney", "Derek", "Destiny", "Devin", "Diana",
    "Diego", "Dylan", "Eden", "Edgar", "Elena", "Eli", "Eliana", "Elijah", "Ella", "Elliot",
    "Emily", "Emma", "Eric", "Erica", "Ethan", "Eva", "Evan", "Evelyn", "Faith", "Felix",
    "Finn", "Fiona", "Frances", "Gabriel", "Gabriela", "Gavin", "Gia", "Giselle", "Grace", "Grant",
    "Hailey", "Hannah", "Harper", "Hayden", "Henry", "Hudson", "Ian", "Iris", "Isaac", "Isabel",
    "Isabella", "Isaiah", "Jack", "Jackson", "Jacob", "Jade", "Jalen", "James", "Jasmine", "Jason",
    "Jayden", "Jenna", "Jeremy", "Jessica", "Joanna", "Joel", "John", "Jordan", "Joseph", "Julia",
    "Julian", "Kai", "Kara", "Karen", "Katherine", "Kayla", "Keira", "Kelsey", "Kevin", "Kiara",
    "Kimberly", "Kyle", "Laila", "Landon", "Laura", "Lauren", "Leah", "Leo", "Leon", "Liam",
    "Lila", "Lily", "Logan", "Lucas", "Lucia", "Luis", "Luna", "Mackenzie", "Maddox", "Madeline",
    "Madison", "Maya", "Mia", "Micah", "Michael", "Mila", "Miles", "Molly", "Morgan", "Naomi",
    "Natalie", "Nathan", "Nia", "Nicholas", "Nico", "Noah", "Nolan", "Nora", "Olivia", "Omar",
    "Owen", "Paige", "Parker", "Penelope", "Peter", "Piper", "Quinn", "Rachel", "Rebecca", "Reese",
    "Riley", "River", "Roman", "Ruby", "Ryan", "Sabrina", "Sadie", "Sam", "Samantha", "Samuel",
    "Sarah", "Savannah", "Sebastian", "Sienna", "Sofia", "Sophie", "Spencer", "Stella", "Sydney", "Taylor",
    "Theo", "Thomas", "Tori", "Tristan", "Tyler", "Valeria", "Vanessa", "Victoria", "Violet", "Willow",
    "Wyatt", "Xavier", "Yara", "Zachary", "Zoe", "Adriana", "Alana", "Alina", "Anya", "April",
]

LAST_NAMES = [
    "Adams", "Ahmed", "Alexander", "Allen", "Alvarez", "Anderson", "Archer", "Armstrong", "Arnold", "Atkins",
    "Austin", "Bailey", "Baker", "Barnes", "Bennett", "Bishop", "Black", "Blair", "Boone", "Bowen",
    "Boyd", "Bradley", "Brooks", "Brown", "Bryant", "Burke", "Burns", "Butler", "Caldwell", "Campbell",
    "Cannon", "Carpenter", "Carr", "Carter", "Castillo", "Chen", "Clark", "Cole", "Coleman", "Collins",
    "Cook", "Cooper", "Cox", "Cruz", "Daniels", "Davis", "Dawson", "Diaz", "Dixon", "Douglas",
    "Duncan", "Edwards", "Ellis", "Evans", "Ferguson", "Fisher", "Flores", "Ford", "Foster", "Fox",
    "Franklin", "Freeman", "Garcia", "Gardner", "George", "Gibson", "Gomez", "Gonzalez", "Gordon", "Graham",
    "Grant", "Gray", "Green", "Griffin", "Gupta", "Gutierrez", "Hamilton", "Hansen", "Harper", "Harris",
    "Hart", "Harvey", "Hayes", "Henderson", "Hernandez", "Herrera", "Hill", "Holland", "Holmes", "Howard",
    "Hughes", "Hunter", "Jackson", "James", "Jenkins", "Johnson", "Jones", "Jordan", "Keller", "Kelly",
    "Kennedy", "Kim", "King", "Knight", "Kumar", "Lambert", "Lane", "Larson", "Lawson", "Lee",
    "Lewis", "Li", "Lloyd", "Long", "Lopez", "Luna", "Mack", "Marshall", "Martin", "Martinez",
    "Mason", "Matthews", "May", "Mendoza", "Meyer", "Miles", "Miller", "Mitchell", "Morales", "Morgan",
    "Morris", "Murphy", "Murray", "Myers", "Nguyen", "Nichols", "Nolan", "Ortiz", "Owens", "Palmer",
    "Park", "Parker", "Patel", "Patterson", "Payne", "Perez", "Perry", "Peterson", "Phillips", "Porter",
    "Powell", "Price", "Ramirez", "Reed", "Reeves", "Reid", "Reyes", "Reynolds", "Rhodes", "Rice",
    "Richardson", "Rivera", "Roberts", "Robertson", "Robinson", "Rodriguez", "Rogers", "Ross", "Russell", "Sanchez",
    "Sanders", "Scott", "Shah", "Shaw", "Simmons", "Singh", "Smith", "Soto", "Spencer", "Stewart",
    "Stone", "Sullivan", "Taylor", "Thomas", "Thompson", "Torres", "Tran", "Turner", "Vargas", "Vasquez",
    "Wagner", "Walker", "Wallace", "Walsh", "Ward", "Watson", "Weaver", "Webb", "Wells", "West",
    "White", "Williams", "Wilson", "Wong", "Wood", "Wright", "Yang", "Young", "Zimmerman", "Arias",
]

if Image:
    agent_image = Image(name="python:3.11-slim").run("pip install 'psycopg[binary]>=3.2.0'")
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


def _display_timeline(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(parsed, dict) and isinstance(parsed.get("events"), str):
        return parsed["events"]
    return text


def _first_name(name: Any) -> str:
    value = str(name or "there").strip()
    return value.split()[0] if value else "there"


def _subject_name(user: dict[str, Any]) -> str:
    name = str(user.get("name") or "").strip()
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1]}"
    if parts:
        return parts[0]

    email = str(user.get("email") or "").strip()
    local_part = email.split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ")
    email_parts = [part for part in local_part.split() if part]
    if len(email_parts) >= 2:
        return f"{email_parts[0].title()} {email_parts[-1].title()}"
    if email_parts:
        return email_parts[0].title()
    return "Someone"


def _subject_detail(user: dict[str, Any]) -> str:
    candidates = [
        user.get("detection_reason"),
        user.get("activity_summary"),
        _display_timeline(user.get("event_timeline")),
    ]
    for candidate in candidates:
        detail = " ".join(str(candidate or "").replace("\n", " ").split())
        if not detail or detail.lower() == "no events":
            continue

        first_sentence = detail.split(". ", 1)[0].strip(" .")
        if first_sentence:
            return _trim_subject_detail(first_sentence)
    return "needs a recovery note"


def _trim_subject_detail(detail: str, limit: int = 92) -> str:
    cleaned = detail
    for prefix in (
        "why churned:",
        "why detected:",
        "detected because",
        "the user",
        "user",
        "customer",
    ):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):].lstrip(" :-")
            break

    if len(cleaned) <= limit:
        return cleaned

    clipped = cleaned[:limit].rsplit(" ", 1)[0].rstrip(" ,;:")
    return clipped or cleaned[:limit].rstrip(" ,;:")


def _email_local_part(name: str) -> str:
    local = ".".join(name.lower().split())
    return "".join(char if char.isalnum() or char == "." else "" for char in local).strip(".")


def _sample_identities(count: int) -> list[dict[str, str]]:
    identities: list[dict[str, str]] = []
    seen: set[str] = set()
    while len(identities) < count:
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        if name in seen:
            continue
        seen.add(name)
        domain = random.choice(SPONSOR_DOMAINS)
        identities.append({"name": name, "email": f"{_email_local_part(name)}@{domain}"})
    return identities


def _notification_subject(user: dict[str, Any]) -> str:
    subject_name = _subject_name(user)
    detail = _subject_detail(user)
    return f"{subject_name}: {detail}"


def _db_execute_many(statements: list[dict[str, Any]]) -> None:
    connection_url = os.environ["INSFORGE_DATABASE_URL"]
    with psycopg.connect(connection_url) as connection:
        with connection.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement["sql"], statement.get("args") or [])
        connection.commit()


def _stmt(sql: str, args: Optional[list[Any]] = None) -> dict[str, Any]:
    return {
        "sql": sql,
        "args": args or [],
    }


def setup_tables() -> None:
    _db_execute_many(
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
                  detected_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
                  run_id TEXT
                )
                """
            ),
            _stmt(
                """
                CREATE TABLE IF NOT EXISTS app_cache (
                  key TEXT PRIMARY KEY,
                  value TEXT,
                  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
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
    identities = _sample_identities(count)
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
                    "required": [
                        "name",
                        "email",
                        "event_timeline",
                        "engagement",
                    ],
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string"},
                        "event_timeline": {"type": "string"},
                        "engagement": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "onboardedDaysAgo",
                                "dormantDays",
                                "sessions",
                                "minutes",
                                "pageVisits",
                                "activeDates",
                                "days",
                            ],
                            "properties": {
                                "onboardedDaysAgo": {"type": "integer"},
                                "dormantDays": {"type": "integer"},
                                "sessions": {"type": "integer"},
                                "minutes": {"type": "integer"},
                                "pageVisits": {"type": "integer"},
                                "activeDates": {"type": "integer"},
                                "days": {
                                    "type": "array",
                                    "minItems": 2,
                                    "maxItems": 6,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "required": ["day", "sessions", "label"],
                                        "properties": {
                                            "day": {"type": "integer"},
                                            "sessions": {"type": "integer"},
                                            "label": {"type": "string"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }
        },
    }
    prompt = f"""
Generate {count} realistic fake churned fastclip.it users and raw PostHog-style event timelines.

App context from Nia:
{app_context}

Use these exact made-up identities in order, one per generated user. Do not invent different names or emails:
{json.dumps(identities, indent=2)}

Each user must be made up, B2C creator/prosumer, and include a specific sequence of raw app actions over multiple visits.
Each email must use one of these hackathon sponsor domains exactly: {", ".join(SPONSOR_DOMAINS)}.
Use realistic personal-looking work emails, for example first.last@vercel.com or first@tensorlake.ai. Do not use example.com, gmail.com, yahoo.com, outlook.com, or fastclip.it.

Make the behavioral data feel like raw PostHog event data, not a generic CRM note:
- event_timeline must be a compact timestamped action-token string. Every action must end with an explicit "days ago + time" timestamp in this exact format: "action t-13 13:00". Use realistic times and keep them chronological from oldest to newest.
- Example:
  "signup t-13 10:20 • upload(Brave Convos #14, 47m) t-13 10:22 • generate_clip(1/8) t-13 10:24 • generate_clip(2/8) t-13 10:24 • generate_clip(3/8) t-13 10:25 • generate_clip(4/8) t-13 10:25 • generate_clip(5/8) t-13 10:26 • generate_clip(6/8) t-13 10:26 • generate_clip(7/8) t-13 10:27 • generate_clip(8/8) t-13 10:27 • preview_clip(3/8) t-13 10:29 • bounce t-13 10:29 • return t-6 18:45 • generate_clip(9/10) t-6 18:48 • generate_clip(10/10) t-6 18:49 • preview_clip(9/10) t-6 18:51 • preview_clip(1/8) t-6 18:52 • bounce t-6 18:53 • return t-1 09:12 • view_pricing t-1 09:14"
- Do not use aggregate actions like generate_clips(8), preview_clip(x4), timeline_drag(x6), or caption_edit(x4). Every repeated action must be separate with its own timestamp: generate_clip(1/8), generate_clip(2/8), etc.
- Do not use bare return(d3) style. Use "return t-6 18:45" instead.
- Do not imply an event happened unless it appears explicitly with its own timestamp.
- Include concrete media/project details: podcast episode titles, webinar titles, creator niches, source length, batch counts, file sizes, or connected channels.
- Do not generate churn explanations, detection reasons, or activity summaries in this step. This step only creates the fake user identity, raw PostHog-style event timeline, and numeric engagement telemetry.
- Use a wide range of churn patterns. Pick creative, specific reasons from this list and do not repeat the same reason style within one run:
  1. generated useful clips but exported zero
  2. dragged trim handles repeatedly and left
  3. changed caption styles too many times
  4. aspect ratio switching looked wrong for TikTok vs Shorts
  5. upload got stuck on a large 2GB+ file
  6. import failed silently twice
  7. YouTube channel connected but batch generation was abandoned
  8. podcast RSS import started then no episode was selected
  9. transcript quality looked messy and they stopped
  10. spent time editing transcript words but never regenerated clips
  11. AI clips were generated but all looked low-confidence
  12. kept rewriting the first hook and never previewed final
  13. previewed clips but bounced before download
  14. export failed once and they never retried
  15. downloaded one preview but never removed watermark
  16. hit free limit and viewed pricing
  17. opened billing twice but never upgraded
  18. invited a teammate, then neither user returned
  19. got stuck choosing a caption template
  20. abandoned brand kit/logo setup
  21. thumbnail/title editing took several attempts
  22. selected LinkedIn format but never exported
  23. mobile session showed repeated editor opens and bounces
  24. uploaded multiple assets but never chose one to process
  25. returned after a week, opened the same project, bounced again
  26. tried batch export and hit an error
  27. switched language/captions and stopped
  28. opened help/docs/search and then went dormant
  29. copied share link but never downloaded final video
  30. saw processing complete email but did not return for export
Generate engagement metrics for the visual timeline:
- onboardedDaysAgo: 9-21
- dormantDays: 7-14, always less than onboardedDaysAgo
- sessions: 2-8
- minutes: 12-90
- pageVisits: 6-32
- activeDates: 2-5
- days: only active-day dots, not every day. Each item day is zero-based from signup, must be less than onboardedDaysAgo - dormantDays, and labels should be short: signup, upload, import, batch, editor, captions, billing, fail, stuck, retry.
"""
    users = _openai_structured(prompt, schema)["users"]
    for index, user in enumerate(users):
        if index < len(identities):
            user["name"] = identities[index]["name"]
            user["email"] = identities[index]["email"]
    normalized = [normalize_sponsor_email(user, index) for index, user in enumerate(users)]
    return [pack_event_timeline(user) for user in normalized]


def pack_event_timeline(user: dict[str, Any]) -> dict[str, Any]:
    timeline = str(user.get("event_timeline") or "").strip()
    engagement = user.pop("engagement", None)
    if not isinstance(engagement, dict):
        user["event_timeline"] = normalize_event_timeline(timeline)
        return user

    payload = {
        "events": normalize_event_timeline(timeline),
        "engagement": sanitize_engagement(engagement),
    }
    user["event_timeline"] = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    return user


def normalize_event_timeline(timeline: str) -> str:
    raw_parts = [part.strip() for part in re.split(r"\s*•\s*", timeline) if part.strip()]
    if not raw_parts:
        return timeline

    parsed_parts = [parse_timeline_part(part) for part in raw_parts]
    source_days = [item["source_day"] for item in parsed_parts if item.get("source_day")]
    max_source_day = max(source_days) if source_days else 1

    def to_days_ago(source_day: int) -> int:
        if max_source_day > 1:
            return max(1, max_source_day - source_day + 1)
        return 13

    expanded_events: list[dict[str, Any]] = []
    current_source_day = 1
    minute_by_day: dict[int, int] = {}
    generated_clip_count = 0

    for item in parsed_parts:
        action = str(item["action"]).strip()
        if item.get("source_day"):
            current_source_day = int(item["source_day"])
        if item.get("days_ago"):
            days_ago = int(item["days_ago"])
        else:
            days_ago = to_days_ago(current_source_day)

        minute = item.get("minute")
        if minute is None:
            if current_source_day not in minute_by_day:
                minute_by_day[current_source_day] = (10 * 60 + 20) if current_source_day == 1 else (18 * 60 + 45)
            minute = minute_by_day[current_source_day]

        repeated, generated_clip_count = expand_action(action, generated_clip_count)
        for repeat_index, repeated_action in enumerate(repeated):
            event_minute = int(minute) + (repeat_index // 2)
            expanded_events.append(
                {
                    "action": repeated_action,
                    "days_ago": days_ago,
                    "minute": min(23 * 60 + 59, event_minute),
                }
            )

        minute_by_day[current_source_day] = min(
            23 * 60 + 55,
            int(minute) + max(2, len(repeated) // 2 + random.choice([2, 3, 4])),
        )

    return " • ".join(format_timeline_event(event) for event in expanded_events)


def parse_timeline_part(part: str) -> dict[str, Any]:
    value = part.strip()

    trailing_t = re.match(r"^(.+?)\s+t-(\d+)d?\s+(\d{1,2}):(\d{2})$", value, flags=re.IGNORECASE)
    if trailing_t:
        return {
            "action": trailing_t.group(1).strip(),
            "days_ago": max(1, int(trailing_t.group(2))),
            "minute": int(trailing_t.group(3)) * 60 + int(trailing_t.group(4)),
        }

    leading_t = re.match(r"^t-(\d+)d?\s+(\d{1,2}):(\d{2})\s+(.+)$", value, flags=re.IGNORECASE)
    if leading_t:
        return {
            "action": leading_t.group(4).strip(),
            "days_ago": max(1, int(leading_t.group(1))),
            "minute": int(leading_t.group(2)) * 60 + int(leading_t.group(3)),
        }

    leading_d_time = re.match(r"^d(\d+)\s+(\d{1,2}):(\d{2})\s+(.+)$", value, flags=re.IGNORECASE)
    if leading_d_time:
        return {
            "action": leading_d_time.group(4).strip(),
            "source_day": max(1, int(leading_d_time.group(1))),
            "minute": int(leading_d_time.group(2)) * 60 + int(leading_d_time.group(3)),
        }

    leading_d = re.match(r"^d(\d+)\s+(.+)$", value, flags=re.IGNORECASE)
    if leading_d:
        return {"action": leading_d.group(2).strip(), "source_day": max(1, int(leading_d.group(1)))}

    return_d = re.match(r"^return\(d(\d+)\)$", value, flags=re.IGNORECASE)
    if return_d:
        return {"action": "return", "source_day": max(1, int(return_d.group(1)))}

    return {"action": value}


def expand_action(action: str, generated_clip_count: int = 0) -> tuple[list[str], int]:
    named_count = re.match(r"^generate_clips\((\d+)\)$", action, flags=re.IGNORECASE)
    if named_count:
        count = min(12, max(1, int(named_count.group(1))))
        if generated_clip_count:
            total = generated_clip_count + count
            return [f"generate_clip({i}/{total})" for i in range(generated_clip_count + 1, total + 1)], total
        return [f"generate_clip({i}/{count})" for i in range(1, count + 1)], count

    count_match = re.match(r"^([a-z_]+)\((?:x)?(\d+)\)$", action, flags=re.IGNORECASE)
    if count_match and count_match.group(1) in {"preview_clip", "timeline_drag", "caption_edit", "hook_edit", "caption_style_changed"}:
        name = count_match.group(1)
        count = min(12, max(1, int(count_match.group(2))))
        return [f"{name}({i}/{count})" for i in range(1, count + 1)], generated_clip_count

    return [action], generated_clip_count


def format_timeline_event(event: dict[str, Any]) -> str:
    minute = int(event["minute"])
    return f"{event['action']} t-{int(event['days_ago'])} {minute // 60:02d}:{minute % 60:02d}"


def sanitize_engagement(engagement: dict[str, Any]) -> dict[str, Any]:
    onboarded = _clamp_int(engagement.get("onboardedDaysAgo"), 9, 21, 14)
    dormant = _clamp_int(engagement.get("dormantDays"), 7, min(14, onboarded - 1), 9)
    active_limit = max(1, onboarded - dormant)
    raw_days = engagement.get("days") if isinstance(engagement.get("days"), list) else []
    days = []
    seen = set()
    for item in raw_days:
        if not isinstance(item, dict):
            continue
        day = _clamp_int(item.get("day"), 0, active_limit - 1, 0)
        if day in seen:
            continue
        seen.add(day)
        label = str(item.get("label") or "visit").strip().lower()[:12] or "visit"
        sessions = _clamp_int(item.get("sessions"), 1, 4, 1)
        days.append({"day": day, "sessions": sessions, "label": label})

    if not days:
        days = [
            {"day": 0, "sessions": 1, "label": "signup"},
            {"day": min(2, active_limit - 1), "sessions": 2, "label": "upload"},
        ]
    days.sort(key=lambda item: item["day"])

    active_dates = _clamp_int(engagement.get("activeDates"), 2, 5, len(days))
    active_dates = max(active_dates, len(days))
    return {
        "onboardedDaysAgo": onboarded,
        "dormantDays": dormant,
        "sessions": _clamp_int(engagement.get("sessions"), 2, 8, sum(day["sessions"] for day in days)),
        "minutes": _clamp_int(engagement.get("minutes"), 12, 90, 30),
        "pageVisits": _clamp_int(engagement.get("pageVisits"), 6, 32, 12),
        "activeDates": active_dates,
        "days": days[:6],
    }


def _clamp_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = fallback
    return max(minimum, min(maximum, number))


def normalize_sponsor_email(user: dict[str, Any], index: int) -> dict[str, Any]:
    email = str(user.get("email") or "").strip().lower()
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    if domain in SPONSOR_DOMAINS:
        return user

    name = str(user.get("name") or f"user {index + 1}").strip().lower()
    local = _email_local_part(name) or f"user{index + 1}"
    user["email"] = f"{local}@{SPONSOR_DOMAINS[index % len(SPONSOR_DOMAINS)]}"
    return user


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
                    "required": ["email", "detection_reason", "activity_summary", "draft_message"],
                    "properties": {
                        "email": {"type": "string"},
                        "detection_reason": {"type": "string"},
                        "activity_summary": {"type": "string"},
                        "draft_message": {"type": "string"},
                    },
                },
            }
        },
    }
    prompt = f"""
Use the Nia-provided fastclip.it context plus raw PostHog-style events to enrich these fake churned users, then draft founder recovery emails.

Nia-provided fastclip.it context:
{app_context}

Raw mock users and PostHog-style events:
{json.dumps(users, ensure_ascii=True)}

For each user, return:
- email: same email as input
- detection_reason: short "why churned" phrase grounded in the raw events and enriched by Nia context. Example: "export failed after 8 generated clips, then they returned only to check pricing"
- activity_summary: one compact Nia-augmented paragraph describing the raw actions, relevant fastclip workflow/context, and where they likely got stuck. Do not invent events not in the raw timeline.
- draft_message: 1-2 very short sentences only. This is the final OpenAI-written founder email. Write like a real busy founder texting a user, all lowercase, casual, slightly imperfect, no subject line, no greeting block, no signoff, no marketing language, no em dash. Mention one specific thing they did and ask one simple question. Example style: "hey, saw you got clips generated but never exported. did the editor feel annoying or was the clip quality just not there?"
"""
    drafts = _openai_structured(prompt, schema)["drafts"]
    by_email = {draft["email"].lower(): draft for draft in drafts}
    enriched = []
    for user in users:
        draft = by_email.get(user["email"].lower(), {})
        enriched.append({**user, **draft})
    return enriched


def send_loops_notifications(users: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = os.environ.get("LOOPS_API_KEY")
    transactional_id = os.environ.get("LOOPS_TRANSACTIONAL_ID") or os.environ.get("LOOPS_RECOVERY_TEMPLATE_ID")
    recipient = os.environ.get("LOOPS_NOTIFY_EMAIL", "anatolii@fastclip.it")
    app_url = os.environ.get("APP_BASE_URL", "https://churn-to-talk.vercel.app").rstrip("/")

    if not api_key or not transactional_id:
        return {"enabled": False, "sent": 0, "failed": 0}

    sent = 0
    failures: list[dict[str, str]] = []
    for user in users:
        user_id = str(user.get("id") or "")
        send_url = f"{app_url}/?sendTo={urllib.parse.quote(user_id)}"
        first_name = _first_name(user.get("name"))
        subject = _notification_subject(user)
        body = "\n\n".join(
            [
                f"why detected\n{user.get('detection_reason') or ''}",
                f"activity summary\n{user.get('activity_summary') or ''}",
                f"raw event timeline\n{_display_timeline(user.get('event_timeline'))}",
                f"i drafted this email to send them:\n{user.get('draft_message') or ''}",
                f"SEND?\n{send_url}",
            ]
        )
        payload = {
            "email": recipient,
            "transactionalId": transactional_id,
            "addToAudience": True,
            "dataVariables": {
                "topic": subject,
                "body": body,
                "subject": subject,
                "firstName": first_name,
                "detectedUserName": str(user.get("name") or ""),
                "detectedUserEmail": str(user.get("email") or ""),
                "whyDetected": str(user.get("detection_reason") or ""),
                "activitySummary": str(user.get("activity_summary") or ""),
                "rawEventTimeline": _display_timeline(user.get("event_timeline")),
                "draftMessage": str(user.get("draft_message") or ""),
                "sendUrl": send_url,
            },
        }
        try:
            _json_request(
                "https://app.loops.so/api/v1/transactional",
                payload,
                {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"churn-to-talk:{user_id}",
                    "User-Agent": "churn-to-talk/1.0",
                },
                timeout=30,
            )
            sent += 1
        except Exception as exc:
            failures.append({"user_id": user_id, "error": str(exc)[:240]})

    return {
        "enabled": True,
        "sent": sent,
        "failed": len(failures),
        "failures": failures[:3],
    }


def save_to_db(run_id: str, users: list[dict[str, Any]], app_context: str, source: str) -> dict[str, Any]:
    ran_at = _now_iso()
    statements = [
        _stmt(
            """
            INSERT INTO app_cache (key, value, updated_at)
            VALUES ('fastclip:context:latest', %s, CURRENT_TIMESTAMP::text)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
            """,
            [app_context],
        )
    ]
    for user in users:
        user["id"] = user.get("id") or f"du_{uuid.uuid4().hex}"
        statements.append(
            _stmt(
                """
                INSERT INTO detected_users (
                  id, email, name, detection_reason, event_timeline,
                  activity_summary, draft_message, status, detected_at, run_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', CURRENT_TIMESTAMP::text, %s)
                """,
                [
                    user.get("id"),
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
            VALUES (%s, %s, CURRENT_TIMESTAMP::text)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP::text
            """,
            [f"run:{ran_at}", json.dumps(metadata)],
        )
    )
    _db_execute_many(statements)
    metadata["loops"] = send_loops_notifications(users)
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


def _local_smoke_test() -> dict[str, Any]:
    return {"ok": True, "database": "postgres"}


if __name__ == "__main__":
    _load_local_env()
    if os.environ.get("RUN_HELLO") == "1":
        request = run_local_application(hello_world, "local")
        print(request.output())
    elif all(os.environ.get(key) for key in ["OPENAI_API_KEY", "INSFORGE_DATABASE_URL"]):
        request = run_local_application(churn_recovery_agent, {"source": "local"})
        print(json.dumps(request.output(), indent=2))
    else:
        print(json.dumps(_local_smoke_test()))
