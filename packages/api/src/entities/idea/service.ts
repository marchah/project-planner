import { NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import type { CaptureIdeaInput, Idea, IdeaPatch, IdeaRepository, IdeaService } from './types';

export const TITLE_MAX_LENGTH = 80;

export function deriveIdeaTitle(text: string): string {
  const firstLine =
    text
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;
  const cut = firstLine.slice(0, TITLE_MAX_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Only break at a space that keeps most of the line; one huge word is cut where it falls.
  const atWord = lastSpace >= TITLE_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${atWord.trimEnd()}…`;
}

export function ideaServiceFactory({
  ideaRepository,
}: {
  ideaRepository: IdeaRepository;
}): IdeaService {
  async function getIdeaById(id: string): Promise<Idea> {
    const idea = await ideaRepository.findIdeaById(id);
    if (!idea) throw new NotFoundError(`No idea with id ${id}`);
    return idea;
  }

  function listIdeas(): Promise<Idea[]> {
    return ideaRepository.listIdeas();
  }

  async function captureIdea(input: CaptureIdeaInput): Promise<Idea> {
    const body = input.text.trim();
    if (!body) throw new ValidationError('An idea needs some text');
    const title = normalizeTitle(input.title) ?? deriveIdeaTitle(body);
    return ideaRepository.createIdea({
      title,
      body,
      source: input.source,
      sourceUrl: input.sourceUrl,
    });
  }

  async function updateIdea(id: string, patch: IdeaPatch): Promise<Idea> {
    const clean: IdeaPatch = { ...patch };
    if (patch.title !== undefined) {
      const title = normalizeTitle(patch.title);
      if (!title) throw new ValidationError('A title cannot be empty');
      clean.title = title;
    }
    if (patch.body !== undefined) {
      const body = patch.body.trim();
      if (!body) throw new ValidationError('An idea needs some text');
      clean.body = body;
    }
    const idea = await ideaRepository.updateIdea(id, clean);
    if (!idea) throw new NotFoundError(`No idea with id ${id}`);
    return idea;
  }

  async function deleteIdea(id: string): Promise<Idea> {
    const idea = await ideaRepository.deleteIdea(id);
    if (!idea) throw new NotFoundError(`No idea with id ${id}`);
    return idea;
  }

  return { getIdeaById, listIdeas, captureIdea, updateIdea, deleteIdea };
}

function normalizeTitle(title: Maybe<string>): Maybe<string> {
  const trimmed = title?.trim();
  return trimmed ? trimmed : null;
}
