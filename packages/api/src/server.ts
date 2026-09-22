import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import sirv from 'sirv';
import { logException, logInfo } from './common/logger';
import { settings } from './common/settings';
import { createContext } from './context';
import { runMigrations } from './db/migrate';
import { handleRestRequest } from './rest';
import { schema } from './schema';

// The built SPA. In Docker this is overridden to the copied build dir via WEB_DIR.
const WEB_DIR = settings.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname;

const yoga = createYoga({ schema, context: createContext, graphqlEndpoint: '/graphql' });
const serveStatic = sirv(WEB_DIR, { single: true, dev: false });

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
    serveStatic(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    });
  });

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
