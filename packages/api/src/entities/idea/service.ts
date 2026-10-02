import { NotFoundError, ServiceUnavailableError, ValidationError } from '../../common/errors';
import { logException } from '../../common/logger';
import type { Maybe } from '../../common/types';
import type {
  CaptureIdeaInput,
  Idea,
  IdeaPatch,
  IdeaRepository,
  IdeaService,
  IdeaTitleGenerator,
} from './types';

export function ideaServiceFactory({
  ideaRepository,
  titleGenerator,
}: {
  ideaRepository: IdeaRepository;
  titleGenerator: IdeaTitleGenerator;
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
    const title = normalizeTitle(input.title) ?? (await generateTitleOrNull(body));
    return ideaRepository.createIdea({
      title,
      body,
      source: input.source,
      sourceUrl: input.sourceUrl,
    });
  }

  async function updateIdea(id: string, patch: IdeaPatch): Promise<Idea> {
    const clean: IdeaPatch = { ...patch };
    if (patch.title !== undefined) clean.title = normalizeTitle(patch.title);
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

  async function generateTitleForIdea(id: string): Promise<Idea> {
    const idea = await getIdeaById(id);
    let title: Maybe<string>;
    try {
      title = await titleGenerator.generateIdeaTitle(idea.body);
    } catch (error: unknown) {
      logException(error, { tag: 'TITLE', extra: { ideaId: id } });
      throw new ServiceUnavailableError('The title model could not be reached. Try again later.');
    }
    if (!title) throw new ServiceUnavailableError('No title model is configured.');
    return updateIdea(id, { title });
  }

  // A capture must never be lost to the title model: on failure the idea is saved untitled.
  async function generateTitleOrNull(body: string): Promise<Maybe<string>> {
    try {
      return await titleGenerator.generateIdeaTitle(body);
    } catch (error: unknown) {
      logException(error, { tag: 'TITLE' });
      return null;
    }
  }

  return { getIdeaById, listIdeas, captureIdea, updateIdea, deleteIdea, generateTitleForIdea };
}

function normalizeTitle(title: Maybe<string>): Maybe<string> {
  const trimmed = title?.trim();
  return trimmed ? trimmed : null;
}
