import { ValidationError } from '../../common/errors';
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

  return { listDecisionsForIdea, recordDecision, markDecisionsApplied };
}
