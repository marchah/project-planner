import { builder } from '../../builder';
import { IdeaRef } from '../idea/schema.pothos';
import { ResearchJobKind, ResearchJobStatus, type ResearchJob } from './types';

const ResearchJobKindRef = builder.enumType(ResearchJobKind, { name: 'ResearchJobKind' });
const ResearchJobStatusRef = builder.enumType(ResearchJobStatus, { name: 'ResearchJobStatus' });

export const ResearchJobRef = builder.objectRef<ResearchJob>('ResearchJob');
ResearchJobRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.expose('kind', { type: ResearchJobKindRef }),
    status: t.expose('status', { type: ResearchJobStatusRef }),
    attempt: t.exposeInt('attempt'),
    error: t.exposeString('error', { nullable: true }),
    outcome: t.exposeString('outcome', {
      nullable: true,
      description: 'What the finished job did, e.g. what a refresh changed.',
    }),
    notBefore: t.expose('notBefore', { type: 'DateTime' }),
    startedAt: t.expose('startedAt', { type: 'DateTime', nullable: true }),
    finishedAt: t.expose('finishedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.objectField(IdeaRef, 'research', (t) =>
  t.field({
    type: ResearchJobRef,
    nullable: true,
    description: 'The most recent research job for this idea.',
    resolve: (idea, _args, ctx) => ctx.services.researchJobService.getLatestJobForIdea(idea.id),
  }),
);
