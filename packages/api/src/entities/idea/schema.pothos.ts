import { builder } from '../../builder';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '../../common/errors';
import { IdeaSource, IdeaStatus, type Idea } from './types';

const IdeaStatusRef = builder.enumType(IdeaStatus, { name: 'IdeaStatus' });
const IdeaSourceRef = builder.enumType(IdeaSource, { name: 'IdeaSource' });

export const IdeaRef = builder.objectRef<Idea>('Idea');
IdeaRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title', { nullable: true }),
    body: t.exposeString('body'),
    status: t.expose('status', { type: IdeaStatusRef }),
    source: t.expose('source', { type: IdeaSourceRef }),
    sourceUrl: t.exposeString('sourceUrl', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

builder.queryFields((t) => ({
  ideas: t.field({
    type: [IdeaRef],
    resolve: (_root, _args, ctx) => ctx.services.ideaService.listIdeas(),
  }),
  idea: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.ideaService.getIdeaById(args.id),
  }),
}));

builder.mutationFields((t) => ({
  captureIdea: t.field({
    type: IdeaRef,
    errors: { types: [ValidationError] },
    args: {
      text: t.arg.string({ required: true, validate: { minLength: 1, maxLength: 20_000 } }),
      title: t.arg.string({ required: false, validate: { maxLength: 200 } }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.ideaService.captureIdea({
        text: args.text,
        title: args.title ?? null,
        source: IdeaSource.WEB,
        sourceUrl: null,
      }),
  }),
  updateIdea: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ValidationError] },
    args: {
      id: t.arg.id({ required: true }),
      title: t.arg.string({ required: false, validate: { maxLength: 200 } }),
      body: t.arg.string({ required: false, validate: { maxLength: 20_000 } }),
      status: t.arg({ type: IdeaStatusRef, required: false }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.ideaService.updateIdea(args.id, {
        ...(args.title != null && { title: args.title }),
        ...(args.body != null && { body: args.body }),
        ...(args.status != null && { status: args.status }),
      }),
  }),
  generateIdeaTitle: t.field({
    type: IdeaRef,
    errors: { types: [NotFoundError, ServiceUnavailableError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.ideaService.generateTitleForIdea(args.id),
  }),
}));
