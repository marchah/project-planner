import { builder } from '../../builder';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../../common/errors';
import { DECISION_MAX_LENGTH, DecisionSource } from '../../entities/decision/types';
import { IdeaRef } from '../../entities/idea/schema.pothos';
import { ANSWER_MAX_LENGTH } from '../../entities/question/types';

builder.queryFields((t) => ({
  researchEnabled: t.boolean({
    resolve: (_root, _args, ctx) => ctx.services.researchService.isResearchEnabled(),
  }),
  scheduledRefreshEnabled: t.boolean({
    description: 'Whether plans are re-checked on a schedule (REFRESH_SCHEDULE).',
    resolve: (_root, _args, ctx) => ctx.services.researchService.isScheduledRefreshEnabled(),
  }),
}));

builder.objectField(IdeaRef, 'nextScheduledRefresh', (t) =>
  t.field({
    type: 'DateTime',
    nullable: true,
    description: 'When the schedule next re-checks this plan; null when it will not.',
    resolve: (idea, _args, ctx) => ctx.services.researchService.getNextScheduledRefresh(idea.id),
  }),
);

builder.mutationFields((t) => ({
  // Here rather than with the idea entity: deleting an idea must stop its research run first.
  deleteIdea: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const idea = await ctx.services.ideaService.getIdeaById(args.id);
      await ctx.services.researchService.deleteIdea(args.id);
      return idea;
    },
  }),
  startResearch: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ServiceUnavailableError] },
    args: { ideaId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await ctx.services.researchService.startResearch(args.ideaId);
      return ctx.services.ideaService.getIdeaById(args.ideaId);
    },
  }),
  // These return the idea so the board and the open dialog both refetch it.
  answerQuestion: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ValidationError, ConflictError] },
    args: {
      id: t.arg.id({ required: true }),
      answer: t.arg.string({
        required: true,
        validate: { minLength: 1, maxLength: ANSWER_MAX_LENGTH },
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { question } = await ctx.services.researchService.answerQuestion(args.id, args.answer);
      return ctx.services.ideaService.getIdeaById(question.ideaId);
    },
  }),
  deleteDecision: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ConflictError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const decision = await ctx.services.researchService.deleteDecision(args.id);
      return ctx.services.ideaService.getIdeaById(decision.ideaId);
    },
  }),
  recordDecision: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ValidationError] },
    args: {
      ideaId: t.arg.id({ required: true }),
      text: t.arg.string({
        required: true,
        validate: { minLength: 1, maxLength: DECISION_MAX_LENGTH },
      }),
    },
    resolve: async (_root, args, ctx) => {
      await ctx.services.researchService.recordDecision(
        args.ideaId,
        args.text,
        DecisionSource.BOARD,
      );
      return ctx.services.ideaService.getIdeaById(args.ideaId);
    },
  }),
}));
