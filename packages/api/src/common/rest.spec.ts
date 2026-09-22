import { describe, expect, it } from 'vitest';
import { matchRoute, type RestRoute } from './rest';

const handle = () => Promise.resolve({ status: 200, body: null });
const routes: RestRoute[] = [
  { method: 'GET', path: '/api/ideas', handle },
  { method: 'GET', path: '/api/ideas/:id', handle },
];

describe('matchRoute', () => {
  it('extracts and decodes params', () => {
    const match = matchRoute(routes, 'GET', '/api/ideas/a%20b');
    expect(typeof match === 'object' && match.params).toEqual({ id: 'a b' });
  });

  it('distinguishes an unknown path from a wrong method', () => {
    expect(matchRoute(routes, 'GET', '/api/nope')).toBe('NOT_FOUND');
    expect(matchRoute(routes, 'DELETE', '/api/ideas')).toBe('METHOD_NOT_ALLOWED');
  });

  it('ignores trailing slashes', () => {
    expect(typeof matchRoute(routes, 'GET', '/api/ideas/')).toBe('object');
  });
});
