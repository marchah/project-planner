import { builder } from '../../builder';
import { IdeaRef } from '../idea/schema.pothos';
import { PlanSuggestion, type Plan, type PlanSource, type StackItem } from './types';

const PlanSuggestionRef = builder.enumType(PlanSuggestion, { name: 'PlanSuggestion' });

const StackItemRef = builder.objectRef<StackItem>('StackItem');
StackItemRef.implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    version: t.exposeString('version', { nullable: true }),
    role: t.exposeString('role'),
  }),
});

const PlanSourceRef = builder.objectRef<PlanSource>('PlanSource');
PlanSourceRef.implement({
  fields: (t) => ({
    url: t.exposeString('url'),
    title: t.exposeString('title'),
    firstParty: t.exposeBoolean('firstParty'),
  }),
});

const PlanRef = builder.objectRef<Plan>('Plan');
PlanRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    version: t.exposeInt('version'),
    summary: t.exposeString('summary'),
    planMd: t.exposeString('planMd'),
    stack: t.field({ type: [StackItemRef], resolve: (plan) => plan.stack }),
    researchMd: t.exposeString('researchMd'),
    sources: t.field({ type: [PlanSourceRef], resolve: (plan) => plan.sources }),
    suggestion: t.expose('suggestion', { type: PlanSuggestionRef }),
    shelveReason: t.exposeString('shelveReason', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.objectField(IdeaRef, 'latestPlan', (t) =>
  t.field({
    type: PlanRef,
    nullable: true,
    resolve: (idea, _args, ctx) => ctx.services.planService.getLatestPlanForIdea(idea.id),
  }),
);
