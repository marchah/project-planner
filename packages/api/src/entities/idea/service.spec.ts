import { describe, expect, it } from 'vitest';
import { deriveIdeaTitle, ideaServiceFactory } from './service';
import { IdeaSource, IdeaStatus, type Idea, type IdeaRepository } from './types';

const makeIdea = (over: Partial<Idea> = {}): Idea => ({
  id: 'i1',
  title: 'Price-drop notifier',
  body: 'Price-drop notifier\nPing me when groceries get cheaper.',
  status: IdeaStatus.CAPTURED,
  source: IdeaSource.WEB,
  sourceUrl: null,
  createdAt: new Date('2026-09-22T00:00:00Z'),
  updatedAt: new Date('2026-09-22T00:00:00Z'),
  ...over,
});

function makeService(over: { ideas?: Idea[] } = {}) {
  const rows = over.ideas ?? [makeIdea()];
  const created: Idea[] = [];

  const ideaRepository: IdeaRepository = {
    findIdeaById: (id) => Promise.resolve(rows.find((idea) => idea.id === id) ?? null),
    listIdeas: () => Promise.resolve(rows),
    createIdea: (idea) => {
      const row = makeIdea({ id: 'new', ...idea });
      created.push(row);
      return Promise.resolve(row);
    },
    updateIdea: (id, patch) => {
      const found = rows.find((idea) => idea.id === id);
      return Promise.resolve(found ? { ...found, ...patch } : null);
    },
    deleteIdea: (id) => Promise.resolve(rows.find((idea) => idea.id === id) ?? null),
  };

  return { service: ideaServiceFactory({ ideaRepository }), created };
}

describe('deriveIdeaTitle', () => {
  it('uses the first non-empty line', () => {
    expect(deriveIdeaTitle('\n\n  Grocery watcher  \nmore detail')).toBe('Grocery watcher');
  });

  it('truncates a long line at a word boundary', () => {
    const text =
      "left for dead 2 style game online multiplayer using Vercel and Supabase with different 'room' you can enter";
    expect(deriveIdeaTitle(text)).toBe(
      'left for dead 2 style game online multiplayer using Vercel and Supabase with…',
    );
  });

  it('cuts a single huge word where it falls', () => {
    const title = deriveIdeaTitle('x'.repeat(200));
    expect(title).toHaveLength(80);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('ideaService', () => {
  it('derives a title from the text when none is given', async () => {
    const { service } = makeService();
    const idea = await service.captureIdea({
      text: '  A board for ideas\nwith sticky notes  ',
      title: null,
      source: IdeaSource.SLACK,
      sourceUrl: 'https://example.slack.com/archives/C1/p1',
    });
    expect(idea.title).toBe('A board for ideas');
    expect(idea.body).toBe('A board for ideas\nwith sticky notes');
    expect(idea.source).toBe(IdeaSource.SLACK);
  });

  it('prefers an explicit title', async () => {
    const { service } = makeService();
    const idea = await service.captureIdea({
      text: 'body',
      title: '  Named  ',
      source: IdeaSource.WEB,
      sourceUrl: null,
    });
    expect(idea.title).toBe('Named');
  });

  it('rejects blank text without persisting', async () => {
    const { service, created } = makeService();
    await expect(
      service.captureIdea({ text: '   ', title: null, source: IdeaSource.WEB, sourceUrl: null }),
    ).rejects.toThrow('An idea needs some text');
    expect(created).toHaveLength(0);
  });

  it('throws NotFoundError for a missing id', async () => {
    const { service } = makeService({ ideas: [] });
    await expect(service.getIdeaById('nope')).rejects.toThrow('No idea with id nope');
    await expect(service.updateIdea('nope', { status: IdeaStatus.DONE })).rejects.toThrow(
      'No idea with id nope',
    );
    await expect(service.deleteIdea('nope')).rejects.toThrow('No idea with id nope');
  });

  it('trims edits and refuses to blank a title', async () => {
    const { service } = makeService();
    const idea = await service.updateIdea('i1', {
      title: '  Renamed ',
      status: IdeaStatus.SHELVED,
    });
    expect(idea.title).toBe('Renamed');
    expect(idea.status).toBe(IdeaStatus.SHELVED);
    await expect(service.updateIdea('i1', { title: '  ' })).rejects.toThrow(
      'A title cannot be empty',
    );
  });
});
