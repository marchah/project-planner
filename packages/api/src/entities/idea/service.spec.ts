import { describe, expect, it } from 'vitest';
import { ideaServiceFactory } from './service';
import {
  IdeaSource,
  IdeaStatus,
  type Idea,
  type IdeaRepository,
  type IdeaTitleGenerator,
} from './types';

const makeIdea = (over: Partial<Idea> = {}): Idea => ({
  id: 'i1',
  title: 'Price-Drop Notifier',
  body: 'Ping me when groceries get cheaper.',
  status: IdeaStatus.CAPTURED,
  source: IdeaSource.WEB,
  sourceUrl: null,
  createdAt: new Date('2026-09-22T00:00:00Z'),
  updatedAt: new Date('2026-09-22T00:00:00Z'),
  ...over,
});

function makeService(over: { ideas?: Idea[]; titleGenerator?: IdeaTitleGenerator } = {}) {
  const rows = over.ideas ?? [makeIdea()];
  const created: Idea[] = [];
  const titledFrom: string[] = [];

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

  const titleGenerator: IdeaTitleGenerator = over.titleGenerator ?? {
    generateIdeaTitle: (text) => {
      titledFrom.push(text);
      return Promise.resolve('Generated Title');
    },
  };

  return { service: ideaServiceFactory({ ideaRepository, titleGenerator }), created, titledFrom };
}

const failing: IdeaTitleGenerator = {
  generateIdeaTitle: () => Promise.reject(new Error('connect ECONNREFUSED')),
};
const unconfigured: IdeaTitleGenerator = { generateIdeaTitle: () => Promise.resolve(null) };

describe('ideaService', () => {
  it('names a capture with the title model, from the trimmed text', async () => {
    const { service, titledFrom } = makeService();
    const idea = await service.captureIdea({
      text: '  a board for ideas\nwith sticky notes  ',
      title: null,
      source: IdeaSource.SLACK,
      sourceUrl: 'https://example.slack.com/archives/C1/p1',
    });
    expect(idea.title).toBe('Generated Title');
    expect(idea.body).toBe('a board for ideas\nwith sticky notes');
    expect(titledFrom).toEqual(['a board for ideas\nwith sticky notes']);
  });

  it('keeps an explicit title and skips the model', async () => {
    const { service, titledFrom } = makeService();
    const idea = await service.captureIdea({
      text: 'body',
      title: '  Named  ',
      source: IdeaSource.API,
      sourceUrl: null,
    });
    expect(idea.title).toBe('Named');
    expect(titledFrom).toHaveLength(0);
  });

  it('still saves the idea, untitled, when the model fails or is not configured', async () => {
    for (const titleGenerator of [failing, unconfigured]) {
      const { service, created } = makeService({ titleGenerator });
      const idea = await service.captureIdea({
        text: 'keep me',
        title: null,
        source: IdeaSource.WEB,
        sourceUrl: null,
      });
      expect(idea.title).toBeNull();
      expect(created).toHaveLength(1);
    }
  });

  it('rejects blank text without persisting or calling the model', async () => {
    const { service, created, titledFrom } = makeService();
    await expect(
      service.captureIdea({ text: '   ', title: null, source: IdeaSource.WEB, sourceUrl: null }),
    ).rejects.toThrow('An idea needs some text');
    expect(created).toHaveLength(0);
    expect(titledFrom).toHaveLength(0);
  });

  it('throws NotFoundError for a missing id', async () => {
    const { service } = makeService({ ideas: [] });
    await expect(service.getIdeaById('nope')).rejects.toThrow('No idea with id nope');
    await expect(service.updateIdea('nope', { status: IdeaStatus.DONE })).rejects.toThrow(
      'No idea with id nope',
    );
    await expect(service.deleteIdea('nope')).rejects.toThrow('No idea with id nope');
    await expect(service.generateTitleForIdea('nope')).rejects.toThrow('No idea with id nope');
  });

  it('trims a title edit, and an empty title clears it', async () => {
    const { service } = makeService();
    const renamed = await service.updateIdea('i1', {
      title: '  Renamed ',
      status: IdeaStatus.SHELVED,
    });
    expect(renamed.title).toBe('Renamed');
    expect(renamed.status).toBe(IdeaStatus.SHELVED);
    expect((await service.updateIdea('i1', { title: '  ' })).title).toBeNull();
  });

  it('regenerates a title on request, from the idea text', async () => {
    const { service, titledFrom } = makeService({ ideas: [makeIdea({ title: null })] });
    const idea = await service.generateTitleForIdea('i1');
    expect(idea.title).toBe('Generated Title');
    expect(titledFrom).toEqual(['Ping me when groceries get cheaper.']);
  });

  it('reports an unavailable model when regenerating', async () => {
    await expect(
      makeService({ titleGenerator: failing }).service.generateTitleForIdea('i1'),
    ).rejects.toThrow('could not be reached');
    await expect(
      makeService({ titleGenerator: unconfigured }).service.generateTitleForIdea('i1'),
    ).rejects.toThrow('No title model is configured');
  });
});
