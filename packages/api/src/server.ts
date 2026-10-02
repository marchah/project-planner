import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import sirv from 'sirv';
import { logException, logInfo, logWarning } from './common/logger';
import { settings } from './common/settings';
import { createContext } from './context';
import { runMigrations } from './db/migrate';
import { handleRestRequest } from './rest';
import { schema } from './schema';

// The built SPA. In Docker this is overridden to the copied build dir via WEB_DIR.
const WEB_DIR = settings.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname;

const yoga = createYoga({ schema, context: createContext, graphqlEndpoint: '/graphql' });
// In `pnpm dev` Vite serves the SPA and nothing may be built yet; sirv would crash scanning a
// missing directory, so serve it only when it exists.
const serveStatic = existsSync(WEB_DIR) ? sirv(WEB_DIR, { single: true, dev: false }) : null;

async function main(): Promise<void> {
  await runMigrations();

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/graphql' || url.startsWith('/graphql?')) {
      void yoga(req, res);
      return;
    }
    if (url === '/api' || url.startsWith('/api/')) {
      void handleRestRequest(req, res);
      return;
    }
    // Only reachable once migrations have run, so a 200 means the app can serve requests.
    if (url === '/healthz') {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end('{"ok":true}');
      return;
    }
    const notFound = () => {
      res.statusCode = 404;
      res.end('Not found');
    };
    if (serveStatic) serveStatic(req, res, notFound);
    else notFound();
  });

  if (!serveStatic) {
    logWarning(`no built SPA at ${WEB_DIR}; serving the API only (use the Vite dev server)`, {
      tag: 'SERVER',
    });
  }

  server.listen(settings.PORT, () => {
    logInfo(
      `listening on http://localhost:${String(settings.PORT)} (GraphQL at /graphql, REST at /api)`,
      {
        tag: 'SERVER',
      },
    );
  });
}

void main().catch((error: unknown) => {
  logException(error, { tag: 'SERVER' });
  process.exit(1);
});
