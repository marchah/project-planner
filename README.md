# Project Planner

A sticky-note board for project ideas. Drop an idea on the board or in Slack; later steps
have Hermes research it, write a plan and ask a few clarifying questions you can answer whenever
you're ready, and re-check the plan weekly. See [docs/SPEC.md](./docs/SPEC.md) for the design and
build order.

**Today:** the board, capture from the board, Slack or REST, edit, status, delete, and research: a
button on each note has Hermes research the idea and write a plan with clarifying questions. Each new
idea gets a short title written by a model. Answer the questions and record decisions on the board,
or have an agent do it over MCP; a few minutes after the last one, Hermes refreshes the plan with
them. Set `REFRESH_SCHEDULE` and every planned idea is also re-checked on that schedule for newer
tools and versions; untick "Re-check this plan on schedule" on an idea to leave it out.

Meant for a private network: there is no authentication. The repo holds no environment-specific
values — every endpoint and name is configured through environment variables (see below).

## Develop

```bash
pnpm install
pnpm dev      # API on :4000 + the Vite dev server (proxies /graphql)
pnpm check    # typecheck + lint (layer boundaries) + prettier + tests + schema drift — keep it green
```

Architecture and working rules: **[AGENTS.md](./AGENTS.md)**.

## REST API

For machine callers such as Hermes. The board itself uses GraphQL at `/graphql`.

```bash
curl -X POST http://localhost:4000/api/ideas -H 'content-type: application/json' \
  -d '{"text": "ping me when a tracked grocery item gets cheaper", "source": "SLACK"}'
# → 201 {"id": "…", "title": "Grocery Price Drop Notification", …, "url": "http://localhost:4000/?idea=…"}

curl http://localhost:4000/api/ideas        # newest first
curl http://localhost:4000/api/ideas/<id>
curl http://localhost:4000/healthz
```

## MCP

`/mcp` is a stateless MCP server (streamable HTTP) for an agent discussing an idea. It reads with
`list_ideas` and `get_idea` (the idea, its current plan, questions and answers, decisions and
research state), and writes back what the idea's author said with `answer_question` and
`record_decision`, which schedule a plan refresh.

The title model names the idea from `text` unless `title` is given; if the model is unreachable the
idea is still saved, with `"title": null`, and can be titled later from the board. `source` is
`SLACK` or `API` (default); `sourceUrl` can carry the Slack permalink. Errors are JSON with a 4xx
status.

`url` is built from `PUBLIC_URL` when set, otherwise from the `Host` the caller used — so set
`PUBLIC_URL` to the address you browse to if callers use a name your devices can't resolve.

## Configuration

| Variable                  | Default              | Purpose                                                                                                                             |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TITLE_MODEL_BASE_URL`    | unset                | OpenAI-compatible endpoint (`…/v1`) that titles new ideas: llama.cpp, LM Studio, Ollama or a hosted API. Unset: ideas stay untitled |
| `TITLE_MODEL`             | unset                | Model name, for servers that need one (llama.cpp ignores it)                                                                        |
| `TITLE_MODEL_API_KEY`     | unset                | Sent as a bearer token, for servers that need one                                                                                   |
| `TITLE_MODEL_TIMEOUT_MS`  | `10000`              | How long capture waits for a title before saving the idea untitled                                                                  |
| `HERMES_API_URL`          | unset                | Hermes Agent's API (`…:8642`), which runs research. Unset: research is off                                                          |
| `HERMES_API_KEY`          | unset                | Hermes' `API_SERVER_KEY`                                                                                                            |
| `HERMES_PROVIDER`         | unset                | Model provider for research runs, e.g. `openai-codex`; unset uses Hermes' default                                                   |
| `RESEARCH_ON_CAPTURE`     | `false`              | `true` researches new ideas automatically instead of waiting for the button                                                         |
| `RESEARCH_CONTEXT`        | unset                | Free text about you, added to every research prompt                                                                                 |
| `RESEARCH_RUN_TIMEOUT_MS` | `900000`             | A research run is stopped and retried after this long                                                                               |
| `REFRESH_DEBOUNCE_MS`     | `600000`             | After an answer or decision, how long to wait for more before refreshing the plan                                                   |
| `REFRESH_SCHEDULE`        | unset                | Cron pattern for re-checking every planned idea, e.g. `0 10 * * 0` (Sundays 10:00). Unset: never on a schedule                      |
| `REFRESH_TIMEZONE`        | `UTC`                | IANA time zone `REFRESH_SCHEDULE` is read in, e.g. `Europe/Paris`                                                                   |
| `PUBLIC_URL`              | unset                | Base of the links the REST API returns; unset uses the caller's `Host`                                                              |
| `DATABASE_URL`            | `file:./data/app.db` | SQLite (libsql) location                                                                                                            |

A local model titles an idea in well under a second, so capture waits for it. In Docker, use full
hostnames or IPs: the embedded resolver may not resolve single-label names.

## Deploy

Portainer git stack from this repo: reference **`refs/heads/deploy`**, compose path
`deploy/compose.yaml`, with automatic updates on. On every push to `main`, the `Publish image`
workflow pushes `ghcr.io/marchah/project-planner:main` (plus `sha-<short>`) and then moves the
`deploy` branch to that commit, so the stack redeploys only once the image exists. Tracking `main`
directly races the publish: a poll that lands in the ~2 minutes before the image is pushed
redeploys the previous image and never retries. A commit whose image fails to build is not
deployed at all. The `project-planner-data` volume is the only copy of your ideas — back it
up.

## License

MIT
