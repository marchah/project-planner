import type { Maybe } from '../../common/types';
import {
  MAX_OPEN_QUESTIONS,
  type NewQuestion,
  type Question,
  type QuestionRepository,
  type QuestionService,
} from './types';

export function questionServiceFactory({
  questionRepository,
}: {
  questionRepository: QuestionRepository;
}): QuestionService {
  function listQuestionsForIdea(ideaId: string): Promise<Question[]> {
    return questionRepository.listQuestionsByIdeaId(ideaId);
  }

  function countOpenQuestionsForIdea(ideaId: string): Promise<number> {
    return questionRepository.countOpenQuestionsByIdeaId(ideaId);
  }

  async function replaceOpenQuestions(
    ideaId: string,
    items: NewQuestion[],
    askedInPlanId: Maybe<string>,
  ): Promise<Question[]> {
    await questionRepository.supersedeUnansweredOpenQuestions(ideaId);
    const stillOpen = await questionRepository.countOpenQuestionsByIdeaId(ideaId);
    const room = Math.max(0, MAX_OPEN_QUESTIONS - stillOpen);
    return questionRepository.createQuestions(ideaId, items.slice(0, room), askedInPlanId);
  }

  return { listQuestionsForIdea, countOpenQuestionsForIdea, replaceOpenQuestions };
}
