---
name: add-feature
description: How to add or change a slice — copy the canonical entity or feature, wire it in its module index, regenerate the SDL, and pass pnpm check.
---

# Adding a slice

Read `AGENTS.md` first. The architecture is layered and **machine-enforced** by `pnpm check`.

## Entity or feature?

- Owns a table and its own data → an **entity**, under `packages/api/src/entities/`.
- Composes other slices and owns **no table** (a read model, use case, orchestration) → a
  **feature**, under `packages/api/src/features/`. A feature has **no `repository.ts`**.

The dependency runs one way: features may import entities, **entities must never import features**
(ESLint enforces it). If an entity seems to need a feature, the logic is misplaced — lift it into a
feature that composes the entity.

## Add an entity (copy the canonical slice)

1. `cp -r packages/api/src/entities/idea packages/api/src/entities/<entity>` (drop `routes.ts` if no
   machine caller needs it)
2. Rename the types + factories; adjust `types.ts` (domain type + ports), `repository.ts` (Drizzle
   queries), `service.ts` (logic), `schema.pothos.ts` (GraphQL type + fields via `ctx.services`).
3. Build it in `packages/api/src/entities/index.ts` (its repo + service, added to `EntitiesServices`)
   and import its `schema.pothos` in `packages/api/src/schema.ts`; REST routes go in
   `packages/api/src/rest.ts`. `services.ts` should not change.
4. `pnpm build-schema` (and `pnpm gen` for web changes); **commit** `packages/contract/schema.graphql`
   and `packages/web/src/graphql-env.d.ts`.
5. Add a `*.spec.ts` mocking the ports (see `entities/idea/service.spec.ts`).

## Add a feature (no template in this repo yet)

1. Create `packages/api/src/features/<feature>/` with `types.ts`, `service.ts`, `schema.pothos.ts` and a
   spec — there is no `repository.ts`.
2. Adjust `types.ts` (the read model + service port) and `service.ts`, which composes **entity
   services through their ports** — never another slice's repository or the db.
3. Build it in `packages/api/src/features/index.ts` from the already-constructed `entities`, and
   import its `schema.pothos` in `packages/api/src/schema.ts`.
4. Regenerate + commit the SDL as above; add a `*.spec.ts` with **partial mocks** of just the entity
   operations it reads (see the partial mock in `entities/idea/routes.spec.ts`).

## Add an external integration (copy the canonical adapter)

1. Declare the **port in the slice that needs it** (`types.ts`) — the contract belongs to the
   consumer, not the provider.
2. Create `packages/api/src/third-party/<provider>/` and implement the port: Zod-validate the response, give the call a timeout, keep URLs/credentials in
   `common/settings.ts`.
3. Build it in `third-party/index.ts`; inject it where consumed. **The slice sees only the port.**
4. Add a `*.spec.ts` stubbing the transport (`vi.stubGlobal('fetch', …)`).

## Rules that fail the build if broken

- **Layer rule:** resolver → service → repository → db. Resolvers reach data only via `ctx.services`;
  services depend on repository port types, never the db.
- **Module rule:** `third-party → entities → features`, one way only.
- **Transport rule:** no HTTP client (`axios`, `undici`, `got`, `node:http[s]`) inside a slice, and
  never import an adapter — depend on the port. Every file must match a known role
  (`boundaries/no-unknown-files`), so a slice cannot be dropped at `src/<name>/`.
- **Naming:** every operation is entity-qualified and globally unique — `listIdeas` / `listQuestions`,
  never two bare `list`s. Declare port members as function-typed properties (`fn: (a) => R`).
- **Unit shape:** every method in the factory **body**; the `return { … }` only lists them; members
  ordered simple-first (get/find → list → count → create → composed).
- **Injection:** data/IO ports injected whole; collaborator services destructured to the operations
  used, and mocked partially in tests.
- **Absence:** a union of exactly `T` and `null` is `Maybe<T>` — write it that way in **both**
  packages (lint-enforced). Each defines the alias itself: `api/src/common/types.ts`,
  `web/src/lib/types.ts`. Richer unions are left as they are.
- **Enums:** a fixed value set is a TS `enum` (SCREAMING_SNAKE_CASE key and value) in the slice's
  `types.ts`, reused by the Drizzle column (`.$type<Enum>()`) and the GraphQL enum
  (`builder.enumType(Enum, { name })`) — never a string union plus a duplicate value list.
- GraphQL fields are **non-null by default**; validate inputs with **Zod**; env only in
  `common/settings.ts`; never `console.*` (use `common/logger.ts`); no secrets.

## Finish

`pnpm check` must be green: typecheck + ESLint boundaries + Prettier + tests + schema/codegen drift.
