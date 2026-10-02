import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Maybe } from '../../common/types';
import type { Db } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { ideaRepositoryFactory } from '../../entities/idea/repository';
import { ideaServiceFactory } from '../../entities/idea/service';
import { IdeaSource, IdeaStatus, type IdeaService } from '../../entities/idea/types';
import { planRepositoryFactory } from '../../entities/plan/repository';
import { planServiceFactory } from '../../entities/plan/service';
import { PlanSuggestion, type PlanService } from '../../entities/plan/types';
import { questionRepositoryFactory } from '../../entities/question/repository';
import { questionServiceFactory } from '../../entities/question/service';
import type { QuestionService } from '../../entities/question/types';
import { researchJobRepositoryFactory } from '../../entities/research-job/repository';
import { researchJobServiceFactory } from '../../entities/research-job/service';
import { ResearchJobStatus, type ResearchJobService } from '../../entities/research-job/types';
import {
  MAX_ATTEMPTS,
  MAX_DISPATCH_FAILURES,
  buildIntakePrompt,
  parseResearchReply,
  researchServiceFactory,
} from './service';
import { ResearchRunState, type ResearchRun, type ResearchRunner } from './types';

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
let ideas: IdeaService;
let plans: PlanService;
let questions: QuestionService;
let jobs: ResearchJobService;

beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
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
  over: { researchOnCapture?: boolean; questionService?: QuestionService } = {},
) {
  return researchServiceFactory({
    ideaService: ideas,
    planService: plans,
    questionService: over.questionService ?? questions,
    researchJobService: jobs,
    researchRunner: runner,
    settings: {
      researchOnCapture: over.researchOnCapture ?? false,
      runTimeoutMs: 15 * 60_000,
      context: 'Self-hosts everything.',
    },
    now: () => T0,
  });
}

const capture = (text = 'a board for my ideas') =>
  ideas.captureIdea({ text, title: null, source: IdeaSource.WEB, sourceUrl: null });

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

  it('a new plan version replaces unanswered open questions and keeps at most five', async () => {
    const fake = fakeRunner();
    const service = makeService(fake.runner);
    const idea = await capture();
    const many = Array.from({ length: 7 }, (_, i) => ({
      topic: 't',
      text: `Q${String(i)}?`,
      why: 'w',
      default: 'd',
    }));
    for (const [index, output] of [reply(), reply({ questions: many })].entries()) {
      await service.startResearch(idea.id);
      await service.tickResearch(at(index * 10));
      fake.finish(`run-${String(index + 1)}`, { output });
      await service.tickResearch(at(index * 10 + 1));
    }
    expect((await plans.getLatestPlanForIdea(idea.id))?.version).toBe(2);
    const asked = await questions.listQuestionsForIdea(idea.id);
    expect(asked).toHaveLength(5);
    expect(asked[0]?.number).toBe(2);
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
      replaceOpenQuestions: (...args) => {
        if (failOnce) {
          failOnce = false;
          return Promise.reject(new Error('SQLITE_BUSY'));
        }
        return questions.replaceOpenQuestions(...args);
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

describe('parseResearchReply', () => {
  it('accepts a bare object and tolerates fences and prose around it', () => {
    expect(parseResearchReply(reply()).ok).toBe(true);
    expect(parseResearchReply(`Sure!\n\`\`\`json\n${reply()}\n\`\`\`\nHope it helps`).ok).toBe(
      true,
    );
  });

  it('normalises the suggestion and defaults optional fields', () => {
    const parsed = parseResearchReply(
      JSON.stringify({ summary: 's', plan_md: 'p', suggest_status: 'shelved' }),
    );
    expect(parsed).toMatchObject({
      ok: true,
      reply: { suggest_status: 'SHELVED', stack: [], questions: [] },
    });
  });

  it('explains what is wrong', () => {
    expect(parseResearchReply('no json here')).toEqual({
      ok: false,
      error: 'the reply contains no JSON object',
    });
    const bad = parseResearchReply(reply({ sources: [{ url: 'not a url' }] }));
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain('sources.0.url');
  });
});

describe('buildIntakePrompt', () => {
  it('quotes the idea verbatim and leaves out the context when there is none', () => {
    const prompt = buildIntakePrompt(
      {
        id: 'i',
        title: null,
        body: 'raw "text"',
        status: IdeaStatus.CAPTURED,
        source: IdeaSource.SLACK,
        sourceUrl: null,
        createdAt: T0,
        updatedAt: T0,
      },
      T0,
      null,
    );
    expect(prompt).toContain('<<<\nraw "text"\n>>>');
    expect(prompt).toContain('Today is 2026-10-02');
    expect(prompt).not.toContain('ABOUT THE AUTHOR');
  });
});
