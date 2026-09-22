import { Client, cacheExchange, fetchExchange } from 'urql';

// Same-origin GraphQL client. In dev, Vite proxies /graphql to the API (see vite.config.ts);
// in production the API server serves both the SPA and /graphql.
export const urqlClient = new Client({
  url: '/graphql',
  exchanges: [cacheExchange, fetchExchange],
});
