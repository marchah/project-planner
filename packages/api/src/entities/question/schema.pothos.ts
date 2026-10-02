import { builder } from '../../builder';
import { IdeaRef } from '../idea/schema.pothos';
import { QuestionStatus, type Question } from './types';

const QuestionStatusRef = builder.enumType(QuestionStatus, { name: 'QuestionStatus' });

const QuestionRef = builder.objectRef<Question>('Question');
QuestionRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    number: t.exposeInt('number'),
    topic: t.exposeString('topic'),
    text: t.exposeString('text'),
    why: t.exposeString('why'),
    defaultAnswer: t.exposeString('defaultAnswer'),
    answer: t.exposeString('answer', { nullable: true }),
    status: t.expose('status', { type: QuestionStatusRef }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.objectFields(IdeaRef, (t) => ({
  questions: t.field({
    type: [QuestionRef],
    resolve: (idea, _args, ctx) => ctx.services.questionService.listQuestionsForIdea(idea.id),
  }),
  openQuestionCount: t.int({
    resolve: (idea, _args, ctx) => ctx.services.questionService.countOpenQuestionsForIdea(idea.id),
  }),
}));
