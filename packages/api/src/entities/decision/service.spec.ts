import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { ideaRepositoryFactory } from '../idea/repository';
import { IdeaSource } from '../idea/types';
import { decisionRepositoryFactory } from './repository';
import { decisionServiceFactory } from './service';
import { DECISION_MAX_LENGTH, DecisionSource, type DecisionService } from './types';

const T0 = new Date('2026-10-02T12:00:00Z');

let db: Db;
let cleanup: () => void;
let service: DecisionService;
let ideaId: string;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  service = decisionServiceFactory({ decisionRepository: decisionRepositoryFactory({ db }) });
  const idea = await ideaRepositoryFactory({ db }).createIdea({
    title: null,
    body: 'an idea',
    source: IdeaSource.WEB,
    sourceUrl: null,
  });
  ideaId = idea.id;
});
afterEach(() => cleanup());

describe('decisionService', () => {
  it('records trimmed decisions, oldest first', async () => {
    await service.recordDecision(ideaId, '  Use Postgres ', DecisionSource.BOARD, T0);
    const later = new Date(T0.getTime() + 1_000);
    await service.recordDecision(ideaId, 'No mobile app', DecisionSource.ASSISTANT, later);
    expect(await service.listDecisionsForIdea(ideaId)).toMatchObject([
      { text: 'Use Postgres', source: DecisionSource.BOARD, appliedAt: null, createdAt: T0 },
      { text: 'No mobile app', source: DecisionSource.ASSISTANT },
    ]);
  });

  it('refuses an empty or overlong decision', async () => {
    await expect(service.recordDecision(ideaId, '  ', DecisionSource.BOARD, T0)).rejects.toThrow(
      'needs some text',
    );
    const long = 'x'.repeat(DECISION_MAX_LENGTH + 1);
    await expect(service.recordDecision(ideaId, long, DecisionSource.BOARD, T0)).rejects.toThrow(
      'at most',
    );
  });

  it('marks a decision applied once, to the first plan that applied it', async () => {
    const { id } = await service.recordDecision(ideaId, 'Go', DecisionSource.BOARD, T0);
    await service.markDecisionsApplied([id], 'plan-2', T0);
    await service.markDecisionsApplied([id], 'plan-3', T0);
    expect(await service.listDecisionsForIdea(ideaId)).toMatchObject([
      { appliedInPlanId: 'plan-2', appliedAt: T0 },
    ]);
  });

  it('deletes a decision until a plan applies it', async () => {
    const draft = await service.recordDecision(ideaId, 'Typo', DecisionSource.BOARD, T0);
    const kept = await service.recordDecision(ideaId, 'Use Postgres', DecisionSource.BOARD, T0);
    expect(await service.deleteDecision(draft.id)).toMatchObject({ text: 'Typo' });
    await service.markDecisionsApplied([kept.id], 'plan-2', T0);
    await expect(service.deleteDecision(kept.id)).rejects.toThrow('already in the plan');
    await expect(service.deleteDecision(draft.id)).rejects.toThrow('No decision');
    expect((await service.listDecisionsForIdea(ideaId)).map((d) => d.text)).toEqual([
      'Use Postgres',
    ]);
  });
});
