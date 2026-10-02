import type { Maybe } from '../../common/types';

export enum IdeaStatus {
  CAPTURED = 'CAPTURED',
  RESEARCHING = 'RESEARCHING',
  PLANNED = 'PLANNED',
  BUILDING = 'BUILDING',
  SHELVED = 'SHELVED',
  DONE = 'DONE',
}

export enum IdeaSource {
  WEB = 'WEB',
  SLACK = 'SLACK',
  API = 'API',
}

export interface Idea {
  id: string;
  /** Written by the title model, or by you; absent until one of them has. */
  title: Maybe<string>;
  body: string;
  status: IdeaStatus;
  source: IdeaSource;
  sourceUrl: Maybe<string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewIdea {
  title: Maybe<string>;
  body: string;
  source: IdeaSource;
  sourceUrl: Maybe<string>;
}

/** Raw capture: without an explicit title, the title model names it. */
export interface CaptureIdeaInput {
  text: string;
  title: Maybe<string>;
  source: IdeaSource;
  sourceUrl: Maybe<string>;
}

export type IdeaPatch = Partial<Pick<Idea, 'title' | 'body' | 'status'>>;

/** Names an idea from its text. Resolves `null` when no model is configured; rejects when one is
 * configured but fails. */
export interface IdeaTitleGenerator {
  generateIdeaTitle: (text: string) => Promise<Maybe<string>>;
}

export interface IdeaRepository {
  findIdeaById: (id: string) => Promise<Maybe<Idea>>;
  listIdeas: () => Promise<Idea[]>;
  createIdea: (idea: NewIdea) => Promise<Idea>;
  updateIdea: (id: string, patch: IdeaPatch) => Promise<Maybe<Idea>>;
  deleteIdea: (id: string) => Promise<Maybe<Idea>>;
}

export interface IdeaService {
  getIdeaById: (id: string) => Promise<Idea>;
  listIdeas: () => Promise<Idea[]>;
  captureIdea: (input: CaptureIdeaInput) => Promise<Idea>;
  updateIdea: (id: string, patch: IdeaPatch) => Promise<Idea>;
  deleteIdea: (id: string) => Promise<Idea>;
  generateTitleForIdea: (id: string) => Promise<Idea>;
}
