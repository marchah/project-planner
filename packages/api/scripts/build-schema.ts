import { writeFileSync } from 'node:fs';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { schema } from '../src/schema';

// Emit the SDL statically (no running server) so the web package's typed operations
// (gql.tada) and the drift check work headlessly in CI / the loop sandbox.
const out = new URL('../../contract/schema.graphql', import.meta.url);
writeFileSync(out, `${printSchema(lexicographicSortSchema(schema))}\n`);
console.log(`[build-schema] wrote ${out.pathname}`);
