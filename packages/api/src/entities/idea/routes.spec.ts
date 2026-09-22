import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../common/errors';
import { matchRoute, restErrorResponse, type RestRoute } from '../../common/rest';
import { ideaRoutesFactory, ideaUrl } from './routes';
import { IdeaSource, IdeaStatus, type CaptureIdeaInput, type Idea } from './types';

const idea: Idea = {
  id: 'abc',
  title: 'T',
  body: 'T',
  status: IdeaStatus.CAPTURED,
  source: IdeaSource.SLACK,
  sourceUrl: null,
  createdAt: new Date('2026-09-22T00:00:00Z'),
  updatedAt: new Date('2026-09-22T00:00:00Z'),
};

function makeRoutes() {
  const captured: CaptureIdeaInput[] = [];
  const ideaService = {
    getIdeaById: (id: string) =>
      id === idea.id ? Promise.resolve(idea) : Promise.reject(new NotFoundError('missing')),
    listIdeas: () => Promise.resolve([idea]),
    captureIdea: (input: CaptureIdeaInput) => {
      captured.push(input);
      return Promise.resolve({ ...idea, source: input.source });
    },
  };
  // @ts-expect-error partial mock: routes use only get/list/capture.
  const routes = ideaRoutesFactory({ ideaService });
  return { routes, captured };
}

async function call(routes: RestRoute[], method: string, path: string, body?: unknown) {
  const match = matchRoute(routes, method, path);
  if (typeof match === 'string') throw new Error(match);
  try {
    return await match.route.handle({ params: match.params, body, origin: 'http://board:4200' });
  } catch (error) {
    return restErrorResponse(error);
  }
}

describe('idea REST routes', () => {
  it('captures an idea and returns a link to it', async () => {
    const { routes, captured } = makeRoutes();
    const response = await call(routes, 'POST', '/api/ideas', {
      text: 'from slack',
      source: 'SLACK',
      sourceUrl: 'https://example.slack.com/archives/C1/p1',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: 'abc', url: 'http://board:4200/?idea=abc' });
    expect(captured[0]).toEqual({
      text: 'from slack',
      title: null,
      source: IdeaSource.SLACK,
      sourceUrl: 'https://example.slack.com/archives/C1/p1',
    });
  });

  it('defaults the source to API and refuses WEB from machine callers', async () => {
    const { routes, captured } = makeRoutes();
    await call(routes, 'POST', '/api/ideas', { text: 'x' });
    expect(captured[0]?.source).toBe(IdeaSource.API);
    const response = await call(routes, 'POST', '/api/ideas', { text: 'x', source: 'WEB' });
    expect(response.status).toBe(400);
  });

  it('rejects a body without text', async () => {
    const { routes, captured } = makeRoutes();
    const response = await call(routes, 'POST', '/api/ideas', { title: 'no text' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid request' });
    expect(captured).toHaveLength(0);
  });

  it('maps a missing idea to 404', async () => {
    const { routes } = makeRoutes();
    const response = await call(routes, 'GET', '/api/ideas/nope');
    expect(response.status).toBe(404);
  });

  it('builds URL-safe links', () => {
    expect(ideaUrl('http://h', 'a b')).toBe('http://h/?idea=a%20b');
  });
});
