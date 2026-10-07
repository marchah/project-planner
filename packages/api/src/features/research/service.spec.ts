import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Maybe } from '../../common/types';
import type { Db } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { decisionRepositoryFactory } from '../../entities/decision/repository';
import { decisionServiceFactory } from '../../entities/decision/service';
import { DecisionSource, type DecisionService } from '../../entities/decision/types';
import { ideaRepositoryFactory } from '../../entities/idea/repository';
import { ideaServiceFactory } from '../../entities/idea/service';
import { IdeaSource, IdeaStatus, type IdeaService } from '../../entities/idea/types';
import { planRepositoryFactory } from '../../entities/plan/repository';
import { planServiceFactory } from '../../entities/plan/service';
import { PlanSuggestion, type PlanService } from '../../entities/plan/types';
import { questionRepositoryFactory } from '../../entities/question/repository';
import { questionServiceFactory } from '../../entities/question/service';
import { QuestionStatus, type QuestionService } from '../../entities/question/types';
import { researchJobRepositoryFactory } from '../../entities/research-job/repository';
import { researchJobServiceFactory } from '../../entities/research-job/service';
import {
  ResearchJobKind,
  ResearchJobStatus,
  type ResearchJobService,
} from '../../entities/research-job/types';
import { MAX_ATTEMPTS, MAX_DISPATCH_FAILURES, researchServiceFactory } from './service';
import {
  ResearchNewsKind,
  ResearchRunState,
  type ResearchNews,
  type ResearchNotifier,
  type ResearchRun,
  type ResearchRunner,
  type ResearchService,
} from './types';

const T0 = new Date('2026-10-02T12:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    summary: 'Build it on SQLite.',
    plan_md: '## Plan\n1. Do the thing',
    stack: [{ name: 'SQLite', version: '3.50', role: 'storage' }],
    research_md: 'Looked at prior art.',
    sources: [{ url: 'https://sqlite.org', title: 'SQLite', first_party: true }],
    questions: [{ topic: 'scope', text: 'Multi-user?', why: 'Adds auth', default: 'Single user' }],
    suggest_status: 'PLANNED',
    shelve_reason: null,
    ...over,
  });

const refreshReply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    changed: true,
    summary: 'Switch to Postgres.',
    plan_md: '## Plan v2',
    resolved: [],
    questions: [],
    suggest_status: 'PLANNED',
    ...over,
  });

const askMany = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    topic: 't',
    text: `Question ${String(i)}?`,
    why: 'w',
    default: 'd',
  }));

/** A scripted stand-in for Hermes: each new run follows the next queued script, and like Hermes the
 * same idempotency key returns the same run instead of starting another. */
function fakeRunner() {
  const runs = new Map<string, ResearchRun>();
  const byKey = new Map<string, string>();
  const started: { runId: string; prompt: string; sessionId: Maybe<string>; key: string }[] = [];
  const scripts: (ResearchRun | 'throw' | 'accept-then-throw')[] = [];
  const stopped: string[] = [];
  const runner: ResearchRunner = {
    isConfigured: () => true,
    startRun: ({ prompt, sessionId, idempotencyKey }) => {
      const known = byKey.get(idempotencyKey);
      if (known) return Promise.resolve({ runId: known });
      const script = scripts.shift() ?? {
        state: ResearchRunState.ACTIVE,
        output: null,
        sessionId: 's1',
        detail: 'running',
      };
      if (script === 'throw') return Promise.reject(new Error('Hermes unreachable'));
      const runId = `run-${String(started.length + 1)}`;
      started.push({ runId, prompt, sessionId, key: idempotencyKey });
      byKey.set(idempotencyKey, runId);
      runs.set(
        runId,
        script === 'accept-then-throw'
          ? { state: ResearchRunState.ACTIVE, output: null, sessionId: 's1', detail: 'running' }
          : script,
      );
      if (script === 'accept-then-throw') {
        return Promise.reject(
          new Error('Hermes unreachable: The operation was aborted due to timeout'),
        );
      }
      return Promise.resolve({ runId });
    },
    getRun: (runId) => Promise.resolve(runs.get(runId) ?? null),
    stopRun: (runId) => {
      stopped.push(runId);
      return Promise.resolve();
    },
  };
  const finish = (runId: string, run: Partial<ResearchRun>) =>
    runs.set(runId, {
      state: ResearchRunState.COMPLETED,
      output: null,
      sessionId: 's1',
      detail: 'completed',
      ...run,
    });
  return { runner, started, scripts, stopped, runs, finish };
}

let db: Db;
let cleanup: () => void;
let clock: Date;
let decisions: DecisionService;
let ideas: IdeaService;
let plans: PlanService;
let questions: QuestionService;
let jobs: ResearchJobService;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  clock = T0;
  decisions = decisionServiceFactory({ decisionRepository: decisionRepositoryFactory({ db }) });
  ideas = ideaServiceFactory({
    ideaRepository: ideaRepositoryFactory({ db }),
    titleGenerator: { generateIdeaTitle: () => Promise.resolve('An Idea') },
  });
  plans = planServiceFactory({ planRepository: planRepositoryFactory({ db }) });
  questions = questionServiceFactory({ questionRepository: questionRepositoryFactory({ db }) });
  jobs = researchJobServiceFactory({ researchJobRepository: researchJobRepositoryFactory({ db }) });
});
afterEach(() => cleanup());

function makeService(
  runner: ResearchRunner,
  over: {
    researchOnCapture?: boolean;
    questionService?: QuestionService;
    refreshSchedule?: string;
    notifier?: ResearchNotifier;
  } = {},
) {
  return researchServiceFactory({
    decisionService: decisions,
    ideaService: ideas,
    planService: plans,
    questionService: over.questionService ?? questions,
    researchJobService: jobs,
    researchRunner: runner,
    researchNotifier: over.notifier ?? { announceResearch: () => Promise.resolve() },
    settings: {
      researchOnCapture: over.researchOnCapture ?? false,
      runTimeoutMs: 15 * 60_000,
      refreshDebounceMs: 10 * 60_000,
      refreshSchedule: over.refreshSchedule
        ? { pattern: over.refreshSchedule, timezone: 'UTC' }
        : null,
      context: 'Self-hosts everything.',
      ideaUrl: (id) => `http://board/?idea=${id}`,
    },
    now: () => clock,
  });
}

const capture = (text = 'a board for my ideas') =>
  ideas.captureIdea({ text, title: null, source: IdeaSource.WEB, sourceUrl: null });

/** Moves the clock and ticks the worker at that time. */
function tickAt(service: ResearchService, minutes: number) {
  clock = at(minutes);
  return service.tickResearch(clock);
}

/** An idea with plan v1 and its open question Q1, researched at T0. */
async function researched(
  fake: ReturnType<typeof fakeRunner>,
  service: ResearchService,
  text?: string,
) {
  const idea = await capture(text);
  await service.startResearch(idea.id);
  await tickAt(service, 0);
  fake.finish(lastRunId(fake), { output: reply() });
  await tickAt(service, 0);
  return idea;
}

const lastRunId = (fake: ReturnType<typeof fakeRunner>) => fake.started.at(-1)?.runId ?? '';

describe('research', () => {
  it('queues one job per idea and marks the idea as researching', async () => {
    const { runner } = fakeRunner();
    const service = makeService(runner);
    const idea = await capture();
    const first = await service.startResearch(idea.id);
    const again = await service.startResearch(idea.id);
    expect(again.id).toBe(first.id);
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.RESEARCHING);
  });

  it('runs the job, saves the plan and questions, and marks the idea planned', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);

    await service.tickResearch(at(0));
    expect(fake.started).toHaveLength(1);
    expect(fake.started[0]?.prompt).toContain('a board for my ideas');
    expect(fake.started[0]?.prompt).toContain('Self-hosts everything.');

    await service.tickResearch(at(1));
    expect(await plans.getLatestPlanForIdea(idea.id)).toBeNull();

    fake.finish('run-1', { output: `Here you go:\n\`\`\`json\n${reply()}\n\`\`\`` });
    await service.tickResearch(at(2));

    const plan = await plans.getLatestPlanForIdea(idea.id);
    expect(plan).toMatchObject({
      version: 1,
      summary: 'Build it on SQLite.',
      suggestion: PlanSuggestion.PLANNED,
    });
    expect(plan?.stack).toEqual([{ name: 'SQLite', version: '3.50', role: 'storage' }]);
    expect(plan?.sources).toEqual([
      { url: 'https://sqlite.org', title: 'SQLite', firstParty: true },
    ]);
    const asked = await questions.listQuestionsForIdea(idea.id);
    expect(asked.map((q) => [q.number, q.text, q.defaultAnswer])).toEqual([
      [1, 'Multi-user?', 'Single user'],
    ]);
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.PLANNED);
    expect((await jobs.getLatestJobForIdea(idea.id))?.status).toBe(ResearchJobStatus.SUCCEEDED);
  });

  it('asks once for a corrected reply in the same session, then gives up on that attempt', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    await service.tickResearch(at(0));

    fake.finish('run-1', { output: 'I could not find anything useful.', sessionId: 'sess-9' });
    await service.tickResearch(at(1));
    expect(fake.started[1]).toMatchObject({ sessionId: 'sess-9' });
    expect(fake.started[1]?.prompt).toContain('could not be used');

    fake.finish('run-2', { output: reply({ plan_md: '' }) });
    await service.tickResearch(at(2));
    const job = await jobs.getLatestJobForIdea(idea.id);
    expect(job).toMatchObject({ status: ResearchJobStatus.QUEUED, attempt: 2 });
    expect(job?.error).toContain('plan_md');
    expect(job?.notBefore).toEqual(at(2 + 5));
  });

  it('stops a run past its deadline and retries with backoff, then fails for good', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);

    await service.tickResearch(at(0));
    await service.tickResearch(at(16));
    expect(fake.stopped).toEqual(['run-1']);
    let job = await jobs.getLatestJobForIdea(idea.id);
    expect(job).toMatchObject({ status: ResearchJobStatus.QUEUED, attempt: 2 });
    expect(job?.error).toContain('timed out');

    await service.tickResearch(at(17));
    expect(fake.started).toHaveLength(1);
    await service.tickResearch(at(21));
    expect(fake.started).toHaveLength(2);
    expect(fake.started[1]?.key).not.toBe(fake.started[0]?.key);

    fake.runs.set('run-2', {
      state: ResearchRunState.FAILED,
      output: null,
      sessionId: null,
      detail: 'interrupted',
    });
    await service.tickResearch(at(22));
    job = await jobs.getLatestJobForIdea(idea.id);
    expect(job).toMatchObject({ status: ResearchJobStatus.QUEUED, attempt: 3, notBefore: at(52) });

    await service.tickResearch(at(52));
    fake.runs.set('run-3', {
      state: ResearchRunState.FAILED,
      output: null,
      sessionId: null,
      detail: 'cancelled',
    });
    await service.tickResearch(at(53));
    job = await jobs.getLatestJobForIdea(idea.id);
    expect(job?.status).toBe(ResearchJobStatus.FAILED);
    expect(job?.attempt).toBe(MAX_ATTEMPTS);
    expect(job?.error).toContain('cancelled');
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.CAPTURED);
  });

  it('treats a run Hermes no longer knows as a failed attempt', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    await service.tickResearch(at(0));
    fake.runs.delete('run-1');
    await service.tickResearch(at(1));
    expect((await jobs.getLatestJobForIdea(idea.id))?.error).toContain('no longer knows');
  });

  it('runs one job at a time, oldest first', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const first = await capture('first');
    const second = await capture('second');
    await service.startResearch(first.id);
    await service.startResearch(second.id);
    await service.tickResearch(at(0));
    await service.tickResearch(at(1));
    expect(fake.started).toHaveLength(1);
    fake.finish('run-1', { output: reply() });
    await service.tickResearch(at(2));
    await service.tickResearch(at(3));
    expect(fake.started).toHaveLength(2);
    expect(fake.started[1]?.prompt).toContain('second');
  });

  it('with research on capture, picks up captured ideas that were never researched', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner, { researchOnCapture: true });
    const idea = await capture();
    const shelved = await capture('old one');
    await ideas.updateIdea(shelved.id, { status: IdeaStatus.SHELVED });
    await service.tickResearch(at(0));
    expect(fake.started).toHaveLength(1);
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.RESEARCHING);
    expect(await jobs.getLatestJobForIdea(shelved.id)).toBeNull();
  });

  it('an intake asks at most five questions', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    await tickAt(service, 0);
    fake.finish('run-1', { output: reply({ questions: askMany(7) }) });
    await tickAt(service, 1);
    const asked = await questions.listQuestionsForIdea(idea.id);
    expect(asked.map((q) => q.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('deleting an idea removes its plans, questions and jobs', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    await service.tickResearch(at(0));
    fake.finish('run-1', { output: reply() });
    await service.tickResearch(at(1));
    await ideas.deleteIdea(idea.id);
    expect(await plans.listPlansForIdea(idea.id)).toEqual([]);
    expect(await questions.listQuestionsForIdea(idea.id)).toEqual([]);
    expect(await jobs.getLatestJobForIdea(idea.id)).toBeNull();
  });

  it('retries a dispatch that timed out with the same key, so an accepted run is not started twice', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    fake.scripts.push('accept-then-throw');
    await service.tickResearch(at(0));
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      status: ResearchJobStatus.QUEUED,
      attempt: 1,
      dispatchFailures: 1,
    });

    await service.tickResearch(at(1));
    expect(fake.started.map((run) => run.runId)).toEqual(['run-1']);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      status: ResearchJobStatus.RUNNING,
      runId: 'run-1',
      dispatchFailures: 0,
    });
  });

  it('sends the same prompt on a retried dispatch, even on a later day', async () => {
    const prompts: string[] = [];
    const fake = fakeRunner();
    const runner: ResearchRunner = {
      ...fake.runner,
      startRun: (input) => {
        prompts.push(input.prompt);
        return prompts.length === 1
          ? Promise.reject(new Error('timeout'))
          : fake.runner.startRun(input);
      },
    };
    const service = makeService(runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    await service.tickResearch(at(0));
    await service.tickResearch(at(24 * 60));
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toBe(prompts[0]);
  });

  it('gives up after repeated dispatch failures', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    for (let i = 0; i < MAX_DISPATCH_FAILURES; i += 1) {
      fake.scripts.push('throw');
      await service.tickResearch(at(i * 60));
    }
    const job = await jobs.getLatestJobForIdea(idea.id);
    expect(job?.status).toBe(ResearchJobStatus.FAILED);
    expect(job?.error).toContain(`after ${String(MAX_DISPATCH_FAILURES)} tries`);
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.CAPTURED);
  });

  it('retries a repair whose dispatch failed with the same key on the next tick', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    await service.startResearch(idea.id);
    await service.tickResearch(at(0));
    fake.finish('run-1', { output: 'not json', sessionId: 'sess-1' });
    fake.scripts.push('accept-then-throw');
    await service.tickResearch(at(1));
    await service.tickResearch(at(2));
    expect(fake.started.map((run) => run.runId)).toEqual(['run-1', 'run-2']);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      runId: 'run-2',
      repairUsed: true,
    });
  });

  it('finishing a job after a failed write, or twice, leaves one plan and one set of questions', async () => {
    const fake = fakeRunner();
    let failOnce = true;
    const flaky: QuestionService = {
      ...questions,
      appendQuestions: (...args) => {
        if (failOnce) {
          failOnce = false;
          return Promise.reject(new Error('SQLITE_BUSY'));
        }
        return questions.appendQuestions(...args);
      },
    };
    const service = makeService(fake.runner, { questionService: flaky });
    const idea = await capture();
    await service.startResearch(idea.id);
    await service.tickResearch(at(0));
    fake.finish('run-1', { output: reply() });

    await service.tickResearch(at(1));
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      status: ResearchJobStatus.RUNNING,
      attempt: 1,
    });
    await service.tickResearch(at(2));
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      status: ResearchJobStatus.SUCCEEDED,
    });
    expect(fake.started).toHaveLength(1);
    expect(await plans.listPlansForIdea(idea.id)).toHaveLength(1);
    expect(await questions.listQuestionsForIdea(idea.id)).toHaveLength(1);

    // A restart between the last two writes replays finishing the same job.
    const job = await jobs.getLatestJobForIdea(idea.id);
    await jobs.updateJob(job?.id ?? '', { status: ResearchJobStatus.RUNNING }, at(3));
    await service.tickResearch(at(3));
    expect(await plans.listPlansForIdea(idea.id)).toHaveLength(1);
    expect((await questions.listQuestionsForIdea(idea.id)).map((q) => q.number)).toEqual([1]);
  });

  it('queues one job when two requests race to start research', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    const [first, second] = await Promise.all([
      service.startResearch(idea.id),
      service.startResearch(idea.id),
    ]);
    expect(second.id).toBe(first.id);
    expect(await jobs.listIdeaIdsWithJobs()).toEqual([idea.id]);
  });

  it('deleting an idea stops its running research run, and only a running one', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const running = await capture('running');
    const queued = await capture('queued');
    await service.startResearch(running.id);
    await service.tickResearch(at(0));
    await service.startResearch(queued.id);

    await service.deleteIdea(running.id);
    expect(fake.stopped).toEqual(['run-1']);
    await service.deleteIdea(queued.id);
    expect(fake.stopped).toEqual(['run-1']);
    await expect(ideas.getIdeaById(running.id)).rejects.toThrow('No idea');
  });

  it('refuses to start when research is not configured', async () => {
    const fake = fakeRunner();
    const service = makeService({ ...fake.runner, isConfigured: () => false });
    const idea = await capture();
    await expect(service.startResearch(idea.id)).rejects.toThrow('not set up');
  });
});

describe('answers, decisions and refreshes', () => {
  it('folds a run of answers and decisions into the plan as one refresh, after a pause', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    const v1 = await plans.getLatestPlanForIdea(idea.id);

    clock = at(1);
    const q1 = await questions.getQuestionByNumber(idea.id, 1);
    const { refresh } = await service.answerQuestion(q1.id, '  Just me  ');
    expect(refresh).toMatchObject({
      kind: ResearchJobKind.REFRESH,
      status: ResearchJobStatus.QUEUED,
      notBefore: at(11),
    });
    clock = at(5);
    const recorded = await service.recordDecision(idea.id, 'Use Postgres', DecisionSource.BOARD);
    expect(recorded.refresh).toMatchObject({ id: refresh?.id, notBefore: at(15) });

    await tickAt(service, 14);
    expect(fake.started).toHaveLength(1);
    await tickAt(service, 15);
    expect(fake.started).toHaveLength(2);
    const prompt = fake.started[1]?.prompt ?? '';
    expect(prompt).toContain('Q1 [scope] Multi-user?\n  Answer: Just me');
    expect(prompt).toContain('- Decision: Use Postgres');
    expect(prompt).toContain('## Plan\n1. Do the thing');
    expect(prompt).toContain('Looked at prior art.');

    fake.finish('run-2', {
      output: refreshReply({
        resolved: [{ number: 1, applied: 'Dropped accounts' }],
        sources: [{ url: 'https://postgresql.org', title: 'PostgreSQL', first_party: true }],
      }),
    });
    await tickAt(service, 16);

    const v2 = await plans.getLatestPlanForIdea(idea.id);
    expect(v2).toMatchObject({ version: 2, summary: 'Switch to Postgres.', planMd: '## Plan v2' });
    expect(v2?.stack).toEqual(v1?.stack);
    expect(v2?.researchMd).toBe(v1?.researchMd);
    expect(v2?.sources.map((source) => source.url)).toEqual([
      'https://postgresql.org',
      'https://sqlite.org',
    ]);
    expect(await questions.getQuestionByNumber(idea.id, 1)).toMatchObject({
      status: QuestionStatus.RESOLVED,
      answer: 'Just me',
      resolvedInPlanId: v2?.id,
      appliedNote: 'Dropped accounts',
    });
    expect(await decisions.listDecisionsForIdea(idea.id)).toMatchObject([
      { text: 'Use Postgres', source: DecisionSource.BOARD, appliedInPlanId: v2?.id },
    ]);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      status: ResearchJobStatus.SUCCEEDED,
      outcome: 'Plan v2: Switch to Postgres.',
    });
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.PLANNED);
  });

  it('a refresh that changes nothing keeps the plan and still applies the answers', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    const v1 = await plans.getLatestPlanForIdea(idea.id);

    clock = at(1);
    const q1 = await questions.getQuestionByNumber(idea.id, 1);
    await service.answerQuestion(q1.id, 'Just me');
    clock = at(2);
    const job = await service.startResearch(idea.id);
    expect(job).toMatchObject({ kind: ResearchJobKind.REFRESH, notBefore: at(2) });
    await tickAt(service, 2);
    fake.finish('run-2', {
      output: refreshReply({ changed: false, plan_md: null, summary: 'Single user already fits.' }),
    });
    await tickAt(service, 3);

    expect(await plans.listPlansForIdea(idea.id)).toHaveLength(1);
    expect(await questions.getQuestionByNumber(idea.id, 1)).toMatchObject({
      status: QuestionStatus.RESOLVED,
      resolvedInPlanId: v1?.id,
      appliedNote: null,
    });
    expect((await jobs.getLatestJobForIdea(idea.id))?.outcome).toBe(
      'No change to plan v1: Single user already fits.',
    );
  });

  it('an answer changed while a refresh runs stays answered and gets a refresh of its own', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    const q1 = await questions.getQuestionByNumber(idea.id, 1);
    clock = at(1);
    await service.answerQuestion(q1.id, 'Just me');
    await tickAt(service, 11);

    clock = at(12);
    const { refresh } = await service.answerQuestion(q1.id, 'Me and my partner');
    expect(refresh).toMatchObject({ status: ResearchJobStatus.RUNNING });
    fake.finish('run-2', { output: refreshReply({ resolved: [{ number: 1, applied: 'x' }] }) });
    await tickAt(service, 13);

    expect(await questions.getQuestionByNumber(idea.id, 1)).toMatchObject({
      status: QuestionStatus.ANSWERED,
      answer: 'Me and my partner',
    });
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      kind: ResearchJobKind.REFRESH,
      status: ResearchJobStatus.QUEUED,
      notBefore: at(22),
    });
  });

  it('decisions before the first research are in its prompt; one made during it gets a refresh', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    const early = await service.recordDecision(idea.id, 'Must run on a Pi', DecisionSource.BOARD);
    expect(early.refresh).toBeNull();
    expect(await jobs.getLatestJobForIdea(idea.id)).toBeNull();

    await service.startResearch(idea.id);
    await tickAt(service, 0);
    expect(fake.started[0]?.prompt).toContain("THE AUTHOR'S DECISIONS");
    expect(fake.started[0]?.prompt).toContain('- Must run on a Pi');

    clock = at(1);
    const late = await service.recordDecision(idea.id, 'Budget is zero', DecisionSource.ASSISTANT);
    expect(late.refresh).toMatchObject({ kind: ResearchJobKind.INTAKE });
    fake.finish('run-1', { output: reply() });
    await tickAt(service, 2);

    const v1 = await plans.getLatestPlanForIdea(idea.id);
    expect(
      (await decisions.listDecisionsForIdea(idea.id)).map((d) => [d.text, d.appliedInPlanId]),
    ).toEqual([
      ['Must run on a Pi', v1?.id],
      ['Budget is zero', null],
    ]);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      kind: ResearchJobKind.REFRESH,
      status: ResearchJobStatus.QUEUED,
      notBefore: at(11),
    });
  });

  it('a new attempt reads the answers given since the failed one', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    clock = at(1);
    await service.startResearch(idea.id);
    await tickAt(service, 1);
    expect(fake.started[1]?.prompt).toContain('NEW FROM THE AUTHOR');
    expect(fake.started[1]?.prompt).not.toContain('Answer: Just me');

    clock = at(2);
    await service.answerQuestion((await questions.getQuestionByNumber(idea.id, 1)).id, 'Just me');
    fake.runs.set('run-2', {
      state: ResearchRunState.FAILED,
      output: null,
      sessionId: null,
      detail: 'interrupted',
    });
    await tickAt(service, 3);
    await tickAt(service, 8);
    expect(fake.started).toHaveLength(3);
    expect(fake.started[2]?.prompt).toContain('Answer: Just me');
  });

  it('a refresh asks new questions only up to five open, numbering on', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    clock = at(1);
    await service.answerQuestion((await questions.getQuestionByNumber(idea.id, 1)).id, 'Just me');
    await service.startResearch(idea.id);
    await tickAt(service, 1);
    expect(fake.started[1]?.prompt).toContain('at most 5, never one already asked');
    fake.finish('run-2', { output: refreshReply({ questions: askMany(7) }) });
    await tickAt(service, 2);
    const asked = await questions.listQuestionsForIdea(idea.id);
    expect(asked.map((q) => [q.number, q.status])).toEqual([
      [1, QuestionStatus.RESOLVED],
      [2, QuestionStatus.OPEN],
      [3, QuestionStatus.OPEN],
      [4, QuestionStatus.OPEN],
      [5, QuestionStatus.OPEN],
      [6, QuestionStatus.OPEN],
    ]);
  });

  it('finishing a refresh again after a restart applies it once', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    clock = at(1);
    await service.answerQuestion((await questions.getQuestionByNumber(idea.id, 1)).id, 'Just me');
    await service.startResearch(idea.id);
    await tickAt(service, 1);
    fake.finish('run-2', { output: refreshReply({ questions: askMany(1) }) });
    await tickAt(service, 2);
    const job = await jobs.getLatestJobForIdea(idea.id);
    await jobs.updateJob(job?.id ?? '', { status: ResearchJobStatus.RUNNING }, at(3));
    await tickAt(service, 3);

    expect(await plans.listPlansForIdea(idea.id)).toHaveLength(2);
    expect((await questions.listQuestionsForIdea(idea.id)).map((q) => q.number)).toEqual([1, 2]);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      id: job?.id,
      status: ResearchJobStatus.SUCCEEDED,
      outcome: 'Plan v2: Switch to Postgres.',
    });
  });

  it('answers by number, and refuses an answer once a refresh applied it', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    clock = at(1);
    const { question } = await service.answerQuestionByNumber(idea.id, 1, 'Just me');
    expect(question).toMatchObject({
      number: 1,
      status: QuestionStatus.ANSWERED,
      answeredAt: at(1),
    });
    await expect(service.answerQuestionByNumber(idea.id, 9, 'x')).rejects.toThrow('no question Q9');
    await expect(service.answerQuestionByNumber(idea.id, 1, '   ')).rejects.toThrow('some text');

    await service.startResearch(idea.id);
    await tickAt(service, 1);
    fake.finish('run-2', { output: refreshReply() });
    await tickAt(service, 2);
    await expect(service.answerQuestionByNumber(idea.id, 1, 'Changed my mind')).rejects.toThrow(
      'already applied to the plan',
    );
  });

  it('removes a decision until research is given it', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await researched(fake, service);
    clock = at(1);
    const typo = await service.recordDecision(idea.id, 'Use Postgress', DecisionSource.BOARD);
    clock = at(2);
    await service.deleteDecision(typo.decision.id);
    clock = at(3);
    const meant = await service.recordDecision(idea.id, 'Use Postgres', DecisionSource.BOARD);
    await tickAt(service, 13);
    expect(fake.started[1]?.prompt).toContain('- Decision: Use Postgres');
    expect(fake.started[1]?.prompt).not.toContain('Postgress');

    clock = at(14);
    await expect(service.deleteDecision(meant.decision.id)).rejects.toThrow('running now');
    const later = await service.recordDecision(idea.id, 'No mobile app', DecisionSource.BOARD);
    await service.deleteDecision(later.decision.id);

    fake.finish('run-2', { output: refreshReply() });
    await tickAt(service, 15);
    await expect(service.deleteDecision(meant.decision.id)).rejects.toThrow('already in the plan');
    expect((await decisions.listDecisionsForIdea(idea.id)).map((d) => d.text)).toEqual([
      'Use Postgres',
    ]);
  });

  it('with research off, saves answers and decisions without queuing anything', async () => {
    const fake = fakeRunner();
    const idea = await researched(fake, makeService(fake.runner));
    const off = makeService({ ...fake.runner, isConfigured: () => false });
    const q1 = await questions.getQuestionByNumber(idea.id, 1);
    expect((await off.answerQuestion(q1.id, 'Just me')).refresh).toBeNull();
    expect((await off.recordDecision(idea.id, 'Go', DecisionSource.BOARD)).refresh).toBeNull();
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      kind: ResearchJobKind.INTAKE,
      status: ResearchJobStatus.SUCCEEDED,
    });
  });
});

describe('scheduled refresh', () => {
  // T0 is Friday 2026-10-02 12:00 UTC; the slots are Sundays 10:00 UTC.
  const SUNDAYS = '0 10 * * 0';
  const SLOT = new Date('2026-10-04T10:00:00Z');
  const minutesFromT0 = (date: Date) => (date.getTime() - T0.getTime()) / 60_000;

  it('re-checks planned ideas when the slot comes round, except shelved, done, muted or unplanned', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner, { refreshSchedule: SUNDAYS });
    const planned = await researched(fake, service, 'planned');
    const shelved = await researched(fake, service, 'shelved');
    await ideas.updateIdea(shelved.id, { status: IdeaStatus.SHELVED });
    const done = await researched(fake, service, 'done');
    await ideas.updateIdea(done.id, { status: IdeaStatus.DONE });
    const muted = await researched(fake, service, 'muted');
    await ideas.updateIdea(muted.id, { autoRefresh: false });
    const unplanned = await capture('never researched');
    const failed = await capture('research failed');
    const { job: failedJob } = await jobs.queueJob(failed.id, ResearchJobKind.INTAKE, T0);
    await jobs.updateJob(failedJob.id, { status: ResearchJobStatus.FAILED }, T0);

    await tickAt(service, 60);
    expect(fake.started).toHaveLength(4);
    await tickAt(service, minutesFromT0(SLOT));
    expect(fake.started).toHaveLength(5);
    expect(fake.started[4]?.prompt).toContain('updating the plan');
    expect(fake.started[4]?.prompt).toContain('planned');
    for (const idea of [shelved, done, muted]) {
      expect((await jobs.getLatestJobForIdea(idea.id))?.kind).toBe(ResearchJobKind.INTAKE);
    }
    expect(await jobs.getLatestJobForIdea(unplanned.id)).toBeNull();
    expect((await jobs.getLatestJobForIdea(failed.id))?.id).toBe(failedJob.id);
    expect(await jobs.getLatestJobForIdea(planned.id)).toMatchObject({
      kind: ResearchJobKind.REFRESH,
      status: ResearchJobStatus.RUNNING,
    });
  });

  it('catches up a slot missed while the board was down, once', async () => {
    const fake = fakeRunner();
    const idea = await researched(fake, makeService(fake.runner, { refreshSchedule: SUNDAYS }));

    // Restarted on Tuesday: Sunday's slot was missed.
    const restarted = makeService(fake.runner, { refreshSchedule: SUNDAYS });
    const tuesday = minutesFromT0(new Date('2026-10-06T08:00:00Z'));
    await tickAt(restarted, tuesday);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      kind: ResearchJobKind.REFRESH,
      status: ResearchJobStatus.RUNNING,
    });
    fake.finish(lastRunId(fake), { output: refreshReply({ changed: false, plan_md: null }) });
    await tickAt(restarted, tuesday + 1);
    await tickAt(restarted, tuesday + 2);
    await tickAt(makeService(fake.runner, { refreshSchedule: SUNDAYS }), tuesday + 3);
    expect(fake.started).toHaveLength(2);
  });

  it('says when an idea is next re-checked, and not for one it will skip', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner, { refreshSchedule: SUNDAYS });
    const idea = await researched(fake, service);
    expect(service.isScheduledRefreshEnabled()).toBe(true);
    expect(await service.getNextScheduledRefresh(idea.id)).toEqual(SLOT);
    await ideas.updateIdea(idea.id, { autoRefresh: false });
    expect(await service.getNextScheduledRefresh(idea.id)).toBeNull();

    const unscheduled = makeService(fake.runner);
    await ideas.updateIdea(idea.id, { autoRefresh: true });
    expect(unscheduled.isScheduledRefreshEnabled()).toBe(false);
    expect(await unscheduled.getNextScheduledRefresh(idea.id)).toBeNull();
  });
});

describe('research news', () => {
  const PERMALINK = 'https://example.slack.com/archives/C0123/p1790965715402789';

  function recordingNotifier() {
    const told: ResearchNews[] = [];
    const notifier: ResearchNotifier = {
      announceResearch: (news) => {
        told.push(news);
        return Promise.resolve();
      },
    };
    return { told, notifier };
  }

  const captureFromSlack = () =>
    ideas.captureIdea({
      text: 'a board for my ideas',
      title: null,
      source: IdeaSource.SLACK,
      sourceUrl: PERMALINK,
    });

  it('tells the author about a first plan and a changed one, not a re-check that changed nothing', async () => {
    const fake = fakeRunner();
    const { told, notifier } = recordingNotifier();
    const service = makeService(fake.runner, { notifier });
    const idea = await captureFromSlack();
    await service.startResearch(idea.id);
    await tickAt(service, 0);
    fake.finish('run-1', { output: reply() });
    await tickAt(service, 1);
    expect(told).toEqual([
      {
        kind: ResearchNewsKind.PLAN_READY,
        sourceUrl: PERMALINK,
        ideaUrl: `http://board/?idea=${idea.id}`,
        planVersion: 1,
        summary: 'Build it on SQLite.',
        questions: [{ number: 1, text: 'Multi-user?' }],
        shelveReason: null,
        error: null,
      },
    ]);

    clock = at(2);
    await service.startResearch(idea.id);
    await tickAt(service, 2);
    fake.finish('run-2', { output: refreshReply({ changed: false, plan_md: null }) });
    await tickAt(service, 3);
    expect(told).toHaveLength(1);

    clock = at(4);
    await service.startResearch(idea.id);
    await tickAt(service, 4);
    fake.finish('run-3', {
      output: refreshReply({
        questions: askMany(1),
        suggest_status: 'SHELVED',
        shelve_reason: 'Use Trello',
      }),
    });
    await tickAt(service, 5);
    expect(told[1]).toMatchObject({
      kind: ResearchNewsKind.PLAN_CHANGED,
      planVersion: 2,
      summary: 'Switch to Postgres.',
      questions: [{ number: 2, text: 'Question 0?' }],
      shelveReason: 'Use Trello',
    });
  });

  it('tells the author when research fails for good', async () => {
    const fake = fakeRunner();
    const { told, notifier } = recordingNotifier();
    const service = makeService(fake.runner, { notifier });
    const idea = await captureFromSlack();
    await service.startResearch(idea.id);
    for (let i = 0; i < MAX_DISPATCH_FAILURES; i += 1) {
      fake.scripts.push('throw');
      await tickAt(service, i * 60);
    }
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ kind: ResearchNewsKind.FAILED, sourceUrl: PERMALINK });
    expect(told[0]?.error).toContain('could not start the run');
  });

  it('a message that does not get through never fails the research', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner, {
      notifier: { announceResearch: () => Promise.reject(new Error('Slack refused')) },
    });
    const idea = await captureFromSlack();
    await service.startResearch(idea.id);
    await tickAt(service, 0);
    fake.finish('run-1', { output: reply() });
    await tickAt(service, 1);
    expect(await jobs.getLatestJobForIdea(idea.id)).toMatchObject({
      status: ResearchJobStatus.SUCCEEDED,
    });
    expect((await ideas.getIdeaById(idea.id)).status).toBe(IdeaStatus.PLANNED);
  });
});
