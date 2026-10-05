import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { settings } from './settings';

// The image sets these; every other setting reaches the container only if compose passes it.
const SET_BY_IMAGE = new Set(['NODE_ENV', 'PORT', 'WEB_DIR', 'DATABASE_URL', 'MIGRATIONS_DIR']);

describe('deploy/compose.yaml', () => {
  it('passes every setting through to the container', () => {
    const compose = readFileSync(
      new URL('../../../../deploy/compose.yaml', import.meta.url),
      'utf8',
    );
    const missing = Object.keys(settings).filter(
      (name) => !SET_BY_IMAGE.has(name) && !compose.includes(`      ${name}: \${${name}:-`),
    );
    expect(missing).toEqual([]);
  });
});
