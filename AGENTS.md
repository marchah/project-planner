# AGENTS.md — architecture & working rules

Read this before writing any code. These rules are **mechanically enforced** by `pnpm check`
(typecheck + ESLint layer boundaries + Prettier + tests + schema/codegen drift). Code that breaks
them cannot pass. Keep changes focused and idiomatic to the surrounding code.

## What this is

**Project Planner** — a sticky-note board for project ideas. Ideas arrive from the board or over REST
(Slack capture via Hermes); research, plans and clarifying questions are added in later steps (see
[docs/SPEC.md](./docs/SPEC.md)).

Built as a **decoupled GraphQL API** (Yoga + Pothos, code-first) with a factory-DI composition root
over Drizzle/SQLite, plus a **Vite/React/Tailwind SPA** that consumes it with typed operations
(gql.tada + urql). It ships as **one self-hostable container**: the API serves the built SPA,
`/graphql` for the SPA, `/api/*` REST for machine callers, and `/healthz`.

## Architecture (decoupled backend + SPA, one container)

```
packages/web  (React SPA, urql + gql.tada)
      │  GraphQL over /graphql  (typed by the committed SDL)
      ▼
packages/api  (GraphQL Yoga)
   resolver (schema.pothos.ts)  →  service.ts  →  repository.ts  →  db (Drizzle + libsql/SQLite)

packages/contract   the shared SDL (schema.graphql) — the ONLY artifact web + api both touch

machine callers (Hermes)
      │  JSON over /api/*
      ▼
   route (routes.ts)  →  service.ts  →  …   (same services as the resolvers)
```

## Vocabulary (one word, one meaning)

- **package** — a pnpm workspace: `api`, `web`, `contract`.
- **module** — a top-level folder under `packages/api/src/` that owns an `index.ts`: `entities/`,
  `features/`, `third-party/`, `common/`.
- **slice** — a folder inside a module: `entities/idea`.
- **entity** — a slice under `entities/`: a low-level data slice, owns a table and a repository.
- **feature** — a slice under `features/`: a higher-level composer (read model, use case,
  orchestration). Owns **no table and no repository**; it composes entity services through their
  ports.
- **adapter** — a slice under `third-party/<provider>/`: the ONLY place an external provider's
  client, URLs and response shape may appear. It implements a **port declared by the slice that
  needs it**, and is wired in only at the composition root.

**The dependency runs one way: `third-party → entities → features`.** Features may import entities; entities must
never import features (ESLint enforces it). A low-level slice reaching up is misplaced logic — lift
the behaviour into a feature instead of inverting the arrow so it compiles.

Each module's `index.ts` builds its own slices, so adding one does not touch `services.ts`:
`getThirdPartyServices()`, `getEntitiesServices({ db, thirdParty })` and
`getFeaturesServices({ entities })`, with the last two unioned into `Services`.

## Folder = slice, file = role

Each backend slice is a folder under `packages/api/src/{entities,features}/<slice>/`:

| File                   | Role                                                                     | May import                                                      | May NOT import                          |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| `<e>/types.ts`         | domain types + repository/service **port interfaces**                    | `common`                                                        | anything with side effects              |
| `<e>/repository.ts`    | data access — the **only** layer that touches the db (**entities only**) | `db/`, `drizzle-orm`, own `types`                               | a service or resolver                   |
| `<e>/service.ts`       | business logic                                                           | repository **port types**, other services' port types, `common` | `db/` / `db/schema`, a resolver, Pothos |
| `<e>/schema.pothos.ts` | GraphQL types + resolvers                                                | `builder`, own `service`/`types`, `common`, other modules' refs | `db/`, a repository                     |
| `<e>/routes.ts`        | REST handlers for machine callers (`RestRoute[]` from `common/rest.ts`)  | own `types`, `common`, `zod`                                    | `db/`, a repository, `node:http`        |
| `<e>/mcp.ts`           | MCP tools registered on a server passed in by `src/mcp.ts`               | own `types`, `common`, `zod`, the MCP SDK                       | `db/`, a repository, `node:http`        |
| `<e>/*.spec.ts`        | Vitest unit tests                                                        | anything                                                        | —                                       |

Backbone: `builder.ts` (the one Pothos builder), `entities/index.ts` + `features/index.ts` (each
module wires its own slices), `services.ts` (composition root — unions the modules), `context.ts`
(request services + DataLoaders), `schema.ts` (assembles slices), `server.ts` (entrypoint),
`rest.ts` (adapts `RestRoute`s to `node:http` and wires each slice's routes), `mcp.ts` (the stateless
`/mcp` endpoint), `worker.ts` (advances the research queue on an interval), `db/{schema,client,migrate}.ts`,
`common/{errors,logger,rest,settings,types}.ts`.

REST routes are transport-agnostic on purpose: a slice's `routes.ts` receives `{ params, body, origin }`
and returns `{ status, body }`, so it never imports `node:http`. Validate the body with Zod inside the
handler; `common/rest.ts` maps a `ZodError` to 400 and a typed error to its `status`.

## The hard dependency rule (enforced by ESLint `boundaries/dependencies`)

**resolver → service → repository → db.** Never skip or invert a layer:

- A **resolver never imports `db/` or a repository** — it reaches data only via `ctx.services`.
- A **REST route or MCP tool never imports `db/` or a repository** — it receives the services it uses.
- A **service never imports `db/schema` or a resolver** — it depends on repository **port types**.
- A **repository never imports a service or resolver** — it is the bottom data layer.
- The **web package never imports the api package** (it depends only on `@app/contract`).
- An **entity never imports a feature** — the module direction is one-way
  (`third-party → entities → features`).
- A **slice never imports an adapter** — it depends on the port it declared; adapters are wired in
  only at the composition root. Nor may a slice import an HTTP client (`axios`, `undici`, `got`,
  `node:http[s]`): transport belongs in `third-party/`.
- An **adapter never imports a service, repository, resolver or the db** — it is the outer edge.
- **Every file under `packages/api/src` must match a known role** (`boundaries/no-unknown-files`),
  so a slice cannot be dropped at `src/<name>/`.

If a resolver needs data, add a method to the service; if a service needs data, add a method to the
repository port + its implementation. Violations fail `pnpm lint` with a "Layer violation" message.

## Dependency injection (no library, no decorators)

Every unit is a **factory** taking its dependencies as one object and returning an object typed by an
explicit **port interface** (`xxxServiceFactory({ deps }) => Service`). The graph is wired **once** in
`getServices()` (`services.ts`), memoized, and reached through the request `ctx`. Unit tests build a
service with hand-mocked ports — see `entities/idea/service.spec.ts`, and `entities/idea/routes.spec.ts`
for a partial mock of a collaborator service.

## How to add a slice

**Which one?** If it owns a table and its own data, it is an **entity**. If it composes other slices
and owns no table — a read model, a use case, an orchestration — it is a **feature**.

### Entity — copy `idea`

`entities/idea/` is the canonical entity.

1. `cp -r packages/api/src/entities/idea packages/api/src/entities/<entity>` and rename the
   types/factories. Delete `routes.ts` unless machine callers need it.
2. Adjust `types.ts` (domain type + ports), `repository.ts` (Drizzle queries), `service.ts` (logic),
   `schema.pothos.ts` (GraphQL type + query/mutation fields via `ctx.services`).
3. Build it in **`entities/index.ts`** and import its `schema.pothos` in **`schema.ts`**. If it has
   REST routes, add them in **`rest.ts`**.

### Feature — no template in this repo yet

Same file roles **minus `repository.ts`**, built in **`features/index.ts`** from the
already-constructed entity services. A feature never touches another slice's repository or the db.
Destructure only the entity operations it uses, and test it with partial mocks of exactly those.

### Calling an external service — add an adapter, never a client in a slice

1. **Declare the port in the slice that needs it**, in its `types.ts` — the contract belongs to the
   consumer, not the provider.
2. Implement it under `third-party/<provider>/` — `third-party/title-model/` is the worked example.
   Validate the response with Zod, give every call a timeout, and put the real cause in the error
   message (`fetch` reports every network failure as just "fetch failed").
3. Build it in **`third-party/index.ts`** and inject it where it is consumed, in that module's
   `index.ts`. The slice sees only the port.
4. Any credentials/URLs go through `common/settings.ts` like every other env var.
5. Add a `*.spec.ts` stubbing the transport (`vi.stubGlobal('fetch', …)`) — assert that a bad or
   unexpected provider response cannot escape the adapter.

Derive-once-and-store where you can, so reads never depend on the provider being up.

### Then, for any slice

1. Run `pnpm build-schema` (updates `packages/contract/schema.graphql`) and, for web changes,
   `pnpm gen` (updates `graphql-env.d.ts`). **Commit both generated files.**
2. Add a `*.spec.ts` for the new service.

DB change: edit `db/schema.ts`, run `pnpm db:generate --name <what_changed>` (commits a migration),
update the affected repository + port + service together.

## GraphQL / codegen workflow

- Schema is **code-first (Pothos)**; `pnpm build-schema` prints the SDL to `packages/contract/schema.graphql`
  headlessly (no running server). The web gets typed operations from it via **gql.tada** (`pnpm gen`).
- Both generated files are **committed and drift-checked** (`pnpm check:drift`).
- New GraphQL fields default **non-null** (`defaultFieldNullability: false`); mark optional fields
  `nullable: true`. Surface expected failures as typed **result unions** via `errors: { types: [...] }`
  (see the `idea` query → `NotFoundError`), backed by the status-coded classes in `common/errors.ts`.

## Commands that must pass

```bash
pnpm check         # typecheck + lint (+ boundaries) + prettier + tests + drift — the gate
pnpm dev           # api (:4000) + web (Vite dev) together
pnpm build         # SDL → web build → api bundle
pnpm db:generate   # generate a Drizzle migration from db/schema.ts
```

## Definition of Done

- [ ] `pnpm check` green (types, lint+boundaries, prettier, tests, drift).
- [ ] A unit test added for any new service (factory-DI mock style).
- [ ] All inputs validated with **Zod** at the boundary (GraphQL args, external data).
- [ ] No secrets/PII in code (config comes from env only).
- [ ] `packages/contract/schema.graphql` + `packages/web/src/graphql-env.d.ts` regenerated + committed.
- [ ] Follows the `idea` entity shape (or the feature/adapter rules above): correct files/roles, factory-DI,
      data reached only via `ctx.services`.
- [ ] Web changes are accessibility-clean (no `jsx-a11y` errors).

## Conventions

- **Name every operation uniquely and entity-qualified** — `listIdeas` / `listQuestions`, never two
  bare `list`s; likewise `findIdeaById`, `captureIdea`. Bare `get` / `list` / `count` /
  `create` collide the moment two collaborators are destructured together, and hide behaviour behind
  generic names. Applies to services, repositories, and adapters alike.
- **Declare port members as function-typed properties** (`fn: (a) => R`), not method shorthand
  (`fn(a): R`), so a consumer can destructure them without tripping `@typescript-eslint/unbound-method`.
- **Every method lives in the factory BODY; the `return { … }` only lists them.** Splitting a unit
  between body functions and inline definitions in the returned object means reading it in two places.
- **Order members simple-first**: `get` / `find` → `list` → `count` → `create` / `add` → `update` →
  `delete`, then composed / derived operations at the bottom. Same order in the port and in the
  implementation.
- **Inject data/IO ports whole, destructure collaborator services** down to the operations used —
  `ideaService: { getIdeaById, listIdeas, captureIdea }`. The factory header becomes a manifest of
  what the unit touches, and a test mocks only those operations (a partial mock with `@ts-expect-error`;
  reaching an un-mocked one then fails loudly). `entities/idea/routes.ts` is the worked example.
- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, …). Prefix intentionally
  unused params with `_`; use `import type` for type-only imports.
- **Config:** every environment variable is read + validated (Zod) in `common/settings.ts`, the single
  source of truth. Import `settings`; **never read `process.env` elsewhere** (ESLint enforces this).
- **Comments:** default to none. Add one only for a _why_ that cannot be read off the code — a
  third-party quirk, a non-obvious framework behavior. One short line with `//`, matching the density
  already in the file; never a JSDoc block that restates a signature. History belongs in git:
  rationale, before/after notes and ticket references go in the commit message or PR, never in the
  source. Migrations are where this slips — annotating a v2→v3 rewrite (`// v2 returned an array
here`) reads as helpful context and is still history.
- **Logging:** use `common/logger.ts` (`logInfo` / `logWarning` / `logError` / `logException`);
  **never `console.*`** (ESLint enforces this). Holding a thrown value (any `catch`, any rejected
  promise) → `logException(err, …)`, which keeps name/message/stack; `logError` is only for a bad state
  you detect yourself with no Error object — unknown enum value, missing record, failed invariant.
  Never pass an error through `logError`'s `extra`. If the project wires up Sentry, the rule matters
  more, not less — `logException` maps to `captureException` (stack, grouped by exception type) while
  `logError` maps to a message event grouped by its string, so an interpolated id spawns a fresh issue
  per occurrence.
- **Absence (every package):** a union of exactly `T` and `null` **is** `Maybe<T>` — write it that
  way, and prefer `null` over `undefined`. A richer union stays as it is, because `Maybe<T>` cannot
  express it: `string | false | undefined` mirroring a library's own shape is correct as written.
  Each package defines the alias once — `api/src/common/types.ts`, `web/src/lib/types.ts` — since it
  is one line with nothing to drift, and a shared package would be more coupling than it buys.
  ESLint enforces exactly this in both packages, so there is no judgement call.
- **Enums:** a fixed value set is a TS `enum` (**SCREAMING_SNAKE_CASE** key **and** value, e.g.
  `PUBLISHED = 'PUBLISHED'`) in the slice's `types.ts`, reused by the Drizzle column
  (`.$type<Enum>()`) and the GraphQL enum (`builder.enumType(Enum, { name })`) — one source of
  truth, not a string union plus a duplicate Pothos value list. `IdeaStatus` is the worked example.
- **Errors:** throw the typed classes in `common/errors.ts` (each carries an HTTP-style `status`); list
  them in a field's `errors` to expose as union members.
- **Latest stable versions** of dependencies; commit the lockfile; no new runtime dep without a reason.

## Files to read first

`entities/idea/{types,repository,service,schema.pothos,routes,service.spec,routes.spec}.ts` (the entity
template) · `third-party/title-model/{adapter,adapter.spec}.ts` (the adapter template) ·
`entities/index.ts` · `services.ts` (composition root) · `context.ts` · `rest.ts` +
`common/rest.ts` (REST) · `builder.ts` · `eslint.config.js` (the enforced boundaries).
