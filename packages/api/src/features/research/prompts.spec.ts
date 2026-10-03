import { describe, expect, it } from 'vitest';
import { DecisionSource, type Decision } from '../../entities/decision/types';
import { IdeaSource, IdeaStatus, type Idea } from '../../entities/idea/types';
import { PlanSuggestion, type Plan } from '../../entities/plan/types';
import { QuestionStatus, type Question } from '../../entities/question/types';
import {
  buildIntakePrompt,
  buildRefreshPrompt,
  parseIntakeReply,
  parseRefreshReply,
} from './prompts';

const T0 = new Date('2026-10-02T12:00:00Z');

const idea: Idea = {
  id: 'i',
  title: null,
  body: 'raw "text"',
  status: IdeaStatus.CAPTURED,
  source: IdeaSource.SLACK,
  sourceUrl: null,
  createdAt: T0,
  updatedAt: T0,
};

const plan: Plan = {
  id: 'p',
  ideaId: 'i',
  version: 3,
  summary: 'Use SQLite.',
  planMd: '## Plan',
  stack: [{ name: 'SQLite', version: '3.50', role: 'storage' }],
  researchMd: 'Notes.',
  sources: [],
  suggestion: PlanSuggestion.PLANNED,
  shelveReason: null,
  jobId: 'j',
  createdAt: T0,
};

const question = (number: number, over: Partial<Question> = {}): Question => ({
  id: `q${String(number)}`,
  ideaId: 'i',
  number,
  topic: 'scope',
  text: `Question ${String(number)}?`,
  why: 'w',
  defaultAnswer: 'the default',
  answer: null,
  status: QuestionStatus.OPEN,
  askedInPlanId: 'p',
  askedInJobId: 'j',
  answeredAt: null,
  resolvedAt: null,
  resolvedInPlanId: null,
  appliedNote: null,
  createdAt: T0,
  ...over,
});

const decision = (text: string): Decision => ({
  id: text,
  ideaId: 'i',
  text,
  source: DecisionSource.BOARD,
  appliedInPlanId: null,
  appliedAt: null,
  createdAt: T0,
});

const intakeReply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ summary: 's', plan_md: 'p', ...over });

describe('parseIntakeReply', () => {
  it('accepts a bare object and tolerates fences and prose around it', () => {
    expect(parseIntakeReply(intakeReply()).ok).toBe(true);
    expect(parseIntakeReply(`Sure!\n\`\`\`json\n${intakeReply()}\n\`\`\`\nHope it helps`).ok).toBe(
      true,
    );
  });

  it('normalises the suggestion and defaults optional fields', () => {
    expect(parseIntakeReply(intakeReply({ suggest_status: 'shelved' }))).toMatchObject({
      ok: true,
      reply: { suggest_status: 'SHELVED', stack: [], questions: [] },
    });
  });

  it('explains what is wrong', () => {
    expect(parseIntakeReply('no json here')).toEqual({
      ok: false,
      error: 'the reply contains no JSON object',
    });
    const bad = parseIntakeReply(intakeReply({ sources: [{ url: 'not a url' }] }));
    expect(!bad.ok && bad.error).toContain('sources.0.url');
  });
});

describe('parseRefreshReply', () => {
  it('needs a plan only when something changed', () => {
    expect(parseRefreshReply(JSON.stringify({ changed: false, summary: 's' })).ok).toBe(true);
    const missing = parseRefreshReply(JSON.stringify({ changed: true, summary: 's' }));
    expect(!missing.ok && missing.error).toContain('plan_md is required');
  });

  it('reads question numbers given as strings', () => {
    const parsed = parseRefreshReply(
      JSON.stringify({ changed: false, summary: 's', resolved: [{ number: '2', applied: 'a' }] }),
    );
    expect(parsed).toMatchObject({ ok: true, reply: { resolved: [{ number: 2, applied: 'a' }] } });
  });
});

describe('buildIntakePrompt', () => {
  it('quotes the idea verbatim and leaves out what it does not have', () => {
    const prompt = buildIntakePrompt(idea, T0, null);
    expect(prompt).toContain('<<<\nraw "text"\n>>>');
    expect(prompt).toContain('Today is 2026-10-02');
    expect(prompt).not.toContain('ABOUT THE AUTHOR');
    expect(prompt).not.toContain('DECISIONS');
  });
});

describe('buildRefreshPrompt', () => {
  it('separates what is new from what the plan already absorbed, and leaves room for questions', () => {
    const prompt = buildRefreshPrompt({
      idea,
      plan,
      answered: [question(2, { status: QuestionStatus.ANSWERED, answer: 'Yes' })],
      decisions: [decision('Use Postgres')],
      open: [question(3), question(4)],
      settled: [question(1, { status: QuestionStatus.RESOLVED, answer: 'Solo' })],
      standing: [decision('No mobile app')],
      today: T0,
      context: null,
    });
    const news = prompt.slice(prompt.indexOf('NEW FROM THE AUTHOR'), prompt.indexOf('ALREADY IN'));
    expect(news).toContain('Q2 [scope] Question 2?\n  Answer: Yes');
    expect(news).toContain('- Decision: Use Postgres');
    const kept = prompt.slice(prompt.indexOf('ALREADY IN'), prompt.indexOf('STILL OPEN'));
    expect(kept).toContain('Q1 [scope] Question 1?\n  Answer: Solo');
    expect(kept).toContain('- Decision: No mobile app');
    expect(prompt).toContain('Q3 [scope] Question 3? (default: the default)');
    expect(prompt).toContain('THE CURRENT PLAN (v3, written 2026-10-02)');
    expect(prompt).toContain('Stack: SQLite 3.50 (storage)');
    expect(prompt).toContain('at most 3, never one already asked');
  });
});
