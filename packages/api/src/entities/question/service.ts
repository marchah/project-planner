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

  function replaceOpenQuestions(
    ideaId: string,
    items: NewQuestion[],
    planId: string,
  ): Promise<Question[]> {
    return questionRepository.replaceUnansweredOpenQuestions(
      ideaId,
      items,
      planId,
      MAX_OPEN_QUESTIONS,
    );
  }

  return { listQuestionsForIdea, countOpenQuestionsForIdea, replaceOpenQuestions };
}
