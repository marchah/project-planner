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
  title: string;
  body: string;
  status: IdeaStatus;
  source: IdeaSource;
  sourceUrl: Maybe<string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewIdea {
  title: string;
  body: string;
  source: IdeaSource;
  sourceUrl: Maybe<string>;
}

/** Raw capture: the title is derived from the text when not given. */
export interface CaptureIdeaInput {
  text: string;
  title: Maybe<string>;
  source: IdeaSource;
  sourceUrl: Maybe<string>;
}

export type IdeaPatch = Partial<Pick<Idea, 'title' | 'body' | 'status'>>;

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
}
