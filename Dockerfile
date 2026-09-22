# syntax=docker/dockerfile:1
# One image: builds the SPA + the API, ships a single Node process that serves both
# the static SPA and /graphql.

FROM node:26-slim AS build
# Node 26 no longer bundles corepack; install the pinned pnpm directly.
RUN npm install -g pnpm@11.13.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Build web (needs SDL + gql.tada types) then bundle the api.
RUN pnpm --filter @app/api build-schema \
  && pnpm --filter @app/web gen \
  && pnpm --filter @app/web build \
  && pnpm --filter @app/api build
# Produce a pruned, production-only deployment of the api (dist + prod node_modules).
RUN pnpm --filter @app/api deploy --prod --legacy /app/prod

FROM node:26-slim AS runtime
ENV NODE_ENV=production \
    WEB_DIR=/app/web \
    DATABASE_URL=file:/data/app.db \
    PORT=4000
WORKDIR /app
COPY --from=build /app/prod/package.json ./package.json
COPY --from=build /app/prod/node_modules ./node_modules
COPY --from=build /app/prod/dist ./dist
COPY --from=build /app/prod/drizzle ./drizzle
COPY --from=build /app/packages/web/dist ./web
VOLUME ["/data"]
EXPOSE 4000
CMD ["node", "dist/server.js"]
