import { builder } from '../../builder';
import { NotFoundError, ServiceUnavailableError } from '../../common/errors';
import { IdeaRef } from '../../entities/idea/schema.pothos';

builder.queryFields((t) => ({
  researchEnabled: t.boolean({
    resolve: (_root, _args, ctx) => ctx.services.researchService.isResearchEnabled(),
  }),
}));

builder.mutationFields((t) => ({
  startResearch: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ServiceUnavailableError] },
    args: { ideaId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await ctx.services.researchService.startResearch(args.ideaId);
      return ctx.services.ideaService.getIdeaById(args.ideaId);
    },
  }),
}));
