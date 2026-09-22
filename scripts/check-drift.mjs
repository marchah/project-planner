// Fails if the committed generated artifacts (GraphQL SDL + gql.tada types) are stale.
// Git-free (works in the loop's rsync'd sandbox): snapshot → regenerate in place → compare.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = ['packages/contract/schema.graphql', 'packages/web/src/graphql-env.d.ts'];
const before = files.map((f) => readFileSync(f, 'utf8'));

execSync('pnpm --filter @app/api build-schema', { stdio: 'inherit' });
execSync('pnpm --filter @app/web gen', { stdio: 'inherit' });

const drifted = files.filter((f, i) => readFileSync(f, 'utf8') !== before[i]);
if (drifted.length > 0) {
  console.error('\n✗ Generated artifacts are stale. Run `pnpm gen` and commit:');
  for (const f of drifted) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ No schema / codegen drift');
