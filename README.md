# Project Planner

A sticky-note board for project ideas. Drop an idea on the board (or, soon, in Slack); later steps
have Hermes research it, write a plan and ask a few clarifying questions you can answer whenever
you're ready, and re-check the plan weekly. See [docs/SPEC.md](./docs/SPEC.md) for the design and
build order.

**Today (step 1):** the board, capture from the board or over REST, edit, status, delete. No AI yet.

Runs on the homelab's Docker VM (VM 300) at `:4200`, LAN-only and unauthenticated by design.

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
curl -X POST http://docker-host:4200/api/ideas -H 'content-type: application/json' \
  -d '{"text": "Grocery price-drop notifier\nPing me when a tracked item gets cheaper.", "source": "SLACK"}'
# → 201 {"id": "…", "title": "Grocery price-drop notifier", …, "url": "http://docker-host:4200/?idea=…"}

curl http://docker-host:4200/api/ideas        # newest first
curl http://docker-host:4200/api/ideas/<id>
curl http://docker-host:4200/healthz
```

The first line of `text` becomes the title unless `title` is given. `source` is `SLACK` or `API`
(default); `sourceUrl` can carry the Slack permalink. Errors are JSON with a 4xx status.

`url` is built from `PUBLIC_URL` when set, otherwise from the `Host` the caller used. Set
`PUBLIC_URL` to the address you browse to if callers use a name your devices can't resolve.

## Deploy

Portainer git stack from this repo, compose path `deploy/compose.yaml`. The `Publish image` workflow
pushes `ghcr.io/marchah/project-planner:main` (plus `sha-<short>`) on every push to `main`; redeploy
the stack to pick it up. The `project-planner-data` volume is the only copy of your ideas — back it
up.

## License

MIT
