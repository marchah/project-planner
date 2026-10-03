import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import {
  ANSWER_MAX_LENGTH,
  MAX_OPEN_QUESTIONS,
  QuestionStatus,
  type AskedIn,
  type NewQuestion,
  type Question,
  type QuestionRepository,
  type QuestionResolution,
  type QuestionService,
} from './types';

export function questionServiceFactory({
  questionRepository,
}: {
  questionRepository: QuestionRepository;
}): QuestionService {
  async function getQuestionById(id: string): Promise<Question> {
    const question = await questionRepository.findQuestionById(id);
    if (!question) throw new NotFoundError(`No question with id ${id}`);
    return question;
  }

  async function getQuestionByNumber(ideaId: string, number: number): Promise<Question> {
    const question = await questionRepository.findQuestionByNumber(ideaId, number);
    if (!question || question.status === QuestionStatus.SUPERSEDED) {
      throw new NotFoundError(`This idea has no question Q${String(number)}`);
    }
    return question;
  }

  function listQuestionsForIdea(ideaId: string): Promise<Question[]> {
    return questionRepository.listQuestionsByIdeaId(ideaId);
  }

  function countOpenQuestionsForIdea(ideaId: string): Promise<number> {
    return questionRepository.countOpenQuestionsByIdeaId(ideaId);
  }

  async function answerQuestion(id: string, answer: string, at: Date): Promise<Question> {
    const trimmed = answer.trim();
    if (!trimmed) throw new ValidationError('An answer needs some text');
    if (trimmed.length > ANSWER_MAX_LENGTH) {
      throw new ValidationError(`An answer is at most ${String(ANSWER_MAX_LENGTH)} characters`);
    }
    const question = await getQuestionById(id);
    const answered = await questionRepository.answerQuestion(id, trimmed, at);
    if (!answered) {
      throw new ConflictError(
        question.status === QuestionStatus.RESOLVED
          ? `Q${String(question.number)} is already applied to the plan; record a decision to change course`
          : `Q${String(question.number)} can no longer be answered`,
      );
    }
    return answered;
  }

  function appendQuestions(
    ideaId: string,
    items: NewQuestion[],
    askedIn: AskedIn,
  ): Promise<Question[]> {
    return questionRepository.appendQuestions(ideaId, items, askedIn, MAX_OPEN_QUESTIONS);
  }

  function resolveQuestions(
    resolutions: QuestionResolution[],
    planId: string,
    at: Date,
  ): Promise<void> {
    return questionRepository.resolveQuestions(resolutions, planId, at);
  }

  return {
    getQuestionById,
    getQuestionByNumber,
    listQuestionsForIdea,
    countOpenQuestionsForIdea,
    answerQuestion,
    appendQuestions,
    resolveQuestions,
  };
}
