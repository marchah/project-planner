import { builder } from '../../builder';
import { IdeaRef } from '../idea/schema.pothos';
import { DecisionSource, type Decision } from './types';

const DecisionSourceRef = builder.enumType(DecisionSource, { name: 'DecisionSource' });

const DecisionRef = builder.objectRef<Decision>('Decision');
DecisionRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    text: t.exposeString('text'),
    source: t.expose('source', { type: DecisionSourceRef }),
    appliedAt: t.expose('appliedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.objectField(IdeaRef, 'decisions', (t) =>
  t.field({
    type: [DecisionRef],
    description: 'What the author decided outside the questions, oldest first.',
    resolve: (idea, _args, ctx) => ctx.services.decisionService.listDecisionsForIdea(idea.id),
  }),
);
