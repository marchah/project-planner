import { z } from 'zod';
import type { RestRoute } from '../../common/rest';
import { IdeaSource, type Idea, type IdeaService } from './types';

const CaptureBody = z.object({
  text: z.string().min(1).max(20_000),
  title: z.string().max(200).optional(),
  source: z.enum([IdeaSource.SLACK, IdeaSource.API]).default(IdeaSource.API),
  sourceUrl: z.url().max(2_000).optional(),
});

// Plain JSON for machine callers (Hermes posting from Slack), mirroring the GraphQL surface.
export function ideaRoutesFactory({
  ideaService: { getIdeaById, listIdeas, captureIdea },
}: {
  ideaService: IdeaService;
}): RestRoute[] {
  const toJson = (idea: Idea, origin: string) => ({ ...idea, url: ideaUrl(origin, idea.id) });

  return [
    {
      method: 'POST',
      path: '/api/ideas',
      handle: async ({ body, origin }) => {
        const input = CaptureBody.parse(body);
        const idea = await captureIdea({
          text: input.text,
          title: input.title ?? null,
          source: input.source,
          sourceUrl: input.sourceUrl ?? null,
        });
        return { status: 201, body: toJson(idea, origin) };
      },
    },
    {
      method: 'GET',
      path: '/api/ideas',
      handle: async ({ origin }) => {
        const ideas = await listIdeas();
        return { status: 200, body: ideas.map((idea) => toJson(idea, origin)) };
      },
    },
    {
      method: 'GET',
      path: '/api/ideas/:id',
      handle: async ({ params, origin }) => {
        const idea = await getIdeaById(params.id ?? '');
        return { status: 200, body: toJson(idea, origin) };
      },
    },
  ];
}

export function ideaUrl(origin: string, id: string): string {
  return `${origin}/?idea=${encodeURIComponent(id)}`;
}
