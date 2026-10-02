# Project Planner

A sticky-note board for project ideas. Drop an idea on the board (or, soon, in Slack); later steps
have Hermes research it, write a plan and ask a few clarifying questions you can answer whenever
you're ready, and re-check the plan weekly. See [docs/SPEC.md](./docs/SPEC.md) for the design and
build order.

**Today (step 1):** the board, capture from the board or over REST, edit, status, delete. Each new
idea gets a short title written by a model; research and questions come next.

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

The title model names the idea from `text` unless `title` is given; if the model is unreachable the
idea is still saved, with `"title": null`, and can be titled later from the board. `source` is
`SLACK` or `API` (default); `sourceUrl` can carry the Slack permalink. Errors are JSON with a 4xx
status.

`url` is built from `PUBLIC_URL` when set, otherwise from the `Host` the caller used — so set
`PUBLIC_URL` to the address you browse to if callers use a name your devices can't resolve.

## Configuration

| Variable                 | Default              | Purpose                                                                                                                             |
| ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TITLE_MODEL_BASE_URL`   | unset                | OpenAI-compatible endpoint (`…/v1`) that titles new ideas: llama.cpp, LM Studio, Ollama or a hosted API. Unset: ideas stay untitled |
| `TITLE_MODEL`            | unset                | Model name, for servers that need one (llama.cpp ignores it)                                                                        |
| `TITLE_MODEL_API_KEY`    | unset                | Sent as a bearer token, for servers that need one                                                                                   |
| `TITLE_MODEL_TIMEOUT_MS` | `10000`              | How long capture waits for a title before saving the idea untitled                                                                  |
| `PUBLIC_URL`             | unset                | Base of the links the REST API returns; unset uses the caller's `Host`                                                              |
| `DATABASE_URL`           | `file:./data/app.db` | SQLite (libsql) location                                                                                                            |

A local model titles an idea in well under a second, so capture waits for it. In Docker, use full
hostnames or IPs: the embedded resolver may not resolve single-label names.

## Deploy

Portainer git stack from this repo, compose path `deploy/compose.yaml`. The `Publish image` workflow
pushes `ghcr.io/marchah/project-planner:main` (plus `sha-<short>`) on every push to `main`; redeploy
the stack to pick it up. The `project-planner-data` volume is the only copy of your ideas — back it
up.

## License

MIT
