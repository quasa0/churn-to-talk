# Tensorlake Agent

`churn_recovery_agent.py` contains two Tensorlake applications:

- `hello_world`: minimal deployment smoke test.
- `churn_recovery_agent`: full run that generates users, drafts recovery emails, saves rows to Turso, and logs run metadata in `app_cache`.

The full agent uses only Python standard library HTTP calls at runtime, so Tensorlake does not need a database client package. Turso is accessed through the libSQL HTTP pipeline API.

Local smoke tests:

```bash
RUN_HELLO=1 python3 agent/churn_recovery_agent.py
python3 agent/churn_recovery_agent.py
```

The second command calls OpenAI and Turso when the required env vars exist.
