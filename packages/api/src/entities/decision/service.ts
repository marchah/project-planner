import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import {
  DECISION_MAX_LENGTH,
  type Decision,
  type DecisionRepository,
  type DecisionService,
  type DecisionSource,
} from './types';

export function decisionServiceFactory({
  decisionRepository,
}: {
  decisionRepository: DecisionRepository;
}): DecisionService {
  async function getDecisionById(id: string): Promise<Decision> {
    const decision = await decisionRepository.findDecisionById(id);
    if (!decision) throw new NotFoundError(`No decision with id ${id}`);
    return decision;
  }

  function listDecisionsForIdea(ideaId: string): Promise<Decision[]> {
    return decisionRepository.listDecisionsByIdeaId(ideaId);
  }

  async function recordDecision(
    ideaId: string,
    text: string,
    source: DecisionSource,
    at: Date,
  ): Promise<Decision> {
    const trimmed = text.trim();
    if (!trimmed) throw new ValidationError('A decision needs some text');
    if (trimmed.length > DECISION_MAX_LENGTH) {
      throw new ValidationError(`A decision is at most ${String(DECISION_MAX_LENGTH)} characters`);
    }
    return decisionRepository.createDecision(ideaId, trimmed, source, at);
  }

  function markDecisionsApplied(ids: string[], planId: string, at: Date): Promise<void> {
    return decisionRepository.markDecisionsApplied(ids, planId, at);
  }

  async function deleteDecision(id: string): Promise<Decision> {
    await getDecisionById(id);
    const deleted = await decisionRepository.deleteUnappliedDecision(id);
    if (!deleted) {
      throw new ConflictError(
        'This decision is already in the plan; record a new decision to change course',
      );
    }
    return deleted;
  }

  return {
    getDecisionById,
    listDecisionsForIdea,
    recordDecision,
    markDecisionsApplied,
    deleteDecision,
  };
}
