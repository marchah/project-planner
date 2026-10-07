import { Cron } from 'croner';
import { ConflictError, ServiceUnavailableError } from '../../common/errors';
import { logException, logInfo, logWarning } from '../../common/logger';
import type { Maybe } from '../../common/types';
import type { Decision, DecisionService, DecisionSource } from '../../entities/decision/types';
import { IdeaStatus, type Idea, type IdeaService } from '../../entities/idea/types';
import {
  PlanSuggestion,
  type NewPlan,
  type Plan,
  type PlanService,
  type PlanSource,
} from '../../entities/plan/types';
import {
  QuestionStatus,
  type NewQuestion,
  type Question,
  type QuestionService,
} from '../../entities/question/types';
import {
  ResearchJobKind,
  ResearchJobStatus,
  type ResearchJob,
  type ResearchJobService,
} from '../../entities/research-job/types';
import {
  buildIntakePrompt,
  buildRefreshPrompt,
  buildRepairPrompt,
  parseIntakeReply,
  parseRefreshReply,
  type IntakeReplyData,
  type RefreshReplyData,
} from './prompts';
import {
  ResearchNewsKind,
  ResearchRunState,
  type AnsweredQuestion,
  type RecordedDecision,
  type ResearchNews,
  type ResearchNotifier,
  type ResearchRunner,
  type ResearchService,
  type ResearchSettings,
} from './types';

export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000];
/** Handing a run to the runner is retried with the SAME idempotency key, so a run the runner did
 * accept before the response was lost is replayed rather than started twice. */
export const MAX_DISPATCH_FAILURES = 5;
export const DISPATCH_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
const MAX_SOURCES = 60;
const NEVER = new Date(8.64e15);

/** What a finished job did, and what to tell the author about it, if anything. */
interface Applied {
  outcome: string;
  news: Maybe<Announcement>;
}

type Announcement = Omit<ResearchNews, 'sourceUrl' | 'ideaUrl'>;

/** What the author has said about an idea, split by whether a plan has absorbed it yet. */
interface AuthorInput {
  plan: Maybe<Plan>;
  /** Answered by `asOf` and not yet applied. */
  answered: Question[];
  /** Recorded by `asOf` and not yet applied. */
  decisions: Decision[];
  open: Question[];
  settled: Question[];
  standing: Decision[];
}

export function researchServiceFactory({
  decisionService: {
    getDecisionById,
    listDecisionsForIdea,
    recordDecision: saveDecision,
    markDecisionsApplied,
    deleteDecision: deleteDecisionRecord,
  },
  ideaService: { getIdeaById, listIdeas, updateIdea, deleteIdea: deleteIdeaRecord },
  planService: { getLatestPlanForIdea, findPlanForJob, savePlan },
  questionService: {
    getQuestionByNumber,
    listQuestionsForIdea,
    answerQuestion: saveAnswer,
    appendQuestions,
    resolveQuestions,
  },
  researchJobService: {
    findActiveJobForIdea,
    getLatestJobForIdea,
    findRunningJob,
    findNextDueJob,
    listIdeaIdsWithJobs,
    queueJob,
    updateJob,
  },
  researchRunner,
  researchNotifier,
  settings,
  now = () => new Date(),
}: {
  decisionService: DecisionService;
  ideaService: IdeaService;
  planService: PlanService;
  questionService: QuestionService;
  researchJobService: ResearchJobService;
  researchRunner: ResearchRunner;
  researchNotifier: ResearchNotifier;
  settings: ResearchSettings;
  now?: () => Date;
}): ResearchService {
  const schedule = settings.refreshSchedule
    ? new Cron(settings.refreshSchedule.pattern, {
        timezone: settings.refreshSchedule.timezone,
        paused: true,
      })
    : null;
  // The scheduled pass runs once per slot. Unset at start, so the first tick catches up a slot
  // missed while the board was down.
  let nextScheduledPassAt: Maybe<Date> = null;

  function isResearchEnabled(): boolean {
    return researchRunner.isConfigured();
  }

  function isScheduledRefreshEnabled(): boolean {
    return schedule !== null && researchRunner.isConfigured();
  }

  async function getNextScheduledRefresh(ideaId: string): Promise<Maybe<Date>> {
    if (!schedule || !researchRunner.isConfigured()) return null;
    const idea = await getIdeaById(ideaId);
    if (!isRefreshedOnSchedule(idea) || !(await getLatestPlanForIdea(idea.id))) return null;
    return schedule.nextRun(now());
  }

  async function startResearch(ideaId: string): Promise<ResearchJob> {
    const idea = await getIdeaById(ideaId);
    if (!researchRunner.isConfigured()) {
      throw new ServiceUnavailableError('Research is not set up on this board (HERMES_API_URL).');
    }
    const at = now();
    const job = (await getLatestPlanForIdea(idea.id))
      ? await queueRefresh(idea.id, at, at)
      : await queueIntake(idea, at);
    // Asked for now: a refresh still waiting for more answers, or a retry, starts at once.
    if (job.status === ResearchJobStatus.QUEUED && job.notBefore > at) {
      return updateJob(job.id, { notBefore: at }, at);
    }
    return job;
  }

  async function answerQuestion(questionId: string, answer: string): Promise<AnsweredQuestion> {
    const at = now();
    const question = await saveAnswer(questionId, answer, at);
    return { question, refresh: await scheduleRefresh(question.ideaId, at) };
  }

  async function answerQuestionByNumber(
    ideaId: string,
    number: number,
    answer: string,
  ): Promise<AnsweredQuestion> {
    await getIdeaById(ideaId);
    const question = await getQuestionByNumber(ideaId, number);
    return answerQuestion(question.id, answer);
  }

  async function recordDecision(
    ideaId: string,
    text: string,
    source: DecisionSource,
  ): Promise<RecordedDecision> {
    await getIdeaById(ideaId);
    const at = now();
    const decision = await saveDecision(ideaId, text, source, at);
    return { decision, refresh: await scheduleRefresh(ideaId, at) };
  }

  async function deleteDecision(decisionId: string): Promise<Decision> {
    const decision = await getDecisionById(decisionId);
    // Once a run's prompt holds it, that run writes it into the plan whatever happens here.
    const active = await findActiveJobForIdea(decision.ideaId);
    if (active?.inputAsOf && decision.createdAt <= active.inputAsOf) {
      throw new ConflictError(
        'Research running now was given this decision; once it finishes, record a new decision to change course',
      );
    }
    return deleteDecisionRecord(decisionId);
  }

  async function deleteIdea(ideaId: string): Promise<void> {
    // Deleting the idea cascades to its job, so stop the run first or it keeps going unwatched
    // and the worker, seeing nothing running, starts the next one alongside it.
    const active = await findActiveJobForIdea(ideaId);
    if (active?.status === ResearchJobStatus.RUNNING && active.runId)
      await stopQuietly(active.runId);
    await deleteIdeaRecord(ideaId);
  }

  async function tickResearch(at: Date): Promise<void> {
    if (!researchRunner.isConfigured()) return;
    const running = await findRunningJob();
    if (running) {
      await pollJob(running, at);
      return;
    }
    if (settings.researchOnCapture) await queueCapturedIdeas(at);
    await queueScheduledRefreshes(at);
    const next = await findNextDueJob(at);
    if (next) await startJob(next, at);
  }

  async function queueIntake(idea: Idea, at: Date): Promise<ResearchJob> {
    const { job, created } = await queueJob(idea.id, ResearchJobKind.INTAKE, at);
    if (!created) return job;
    if (idea.status === IdeaStatus.CAPTURED) {
      await updateIdea(idea.id, { status: IdeaStatus.RESEARCHING });
    }
    logInfo(`queued research for idea ${idea.id}`, { tag: 'RESEARCH' });
    return job;
  }

  async function queueRefresh(ideaId: string, at: Date, notBefore: Date): Promise<ResearchJob> {
    const { job, created } = await queueJob(ideaId, ResearchJobKind.REFRESH, at, notBefore);
    if (created) {
      logInfo(`queued a plan refresh for idea ${ideaId} from ${notBefore.toISOString()}`, {
        tag: 'RESEARCH',
      });
    }
    return job;
  }

  async function queueCapturedIdeas(at: Date): Promise<void> {
    const researched = new Set(await listIdeaIdsWithJobs());
    const waiting = (await listIdeas()).filter(
      (idea) => idea.status === IdeaStatus.CAPTURED && !researched.has(idea.id),
    );
    for (const idea of waiting.reverse()) await queueIntake(idea, at);
  }

  // Due at a slot: a planned idea that is not shelved, done or muted, and that nothing has
  // researched since the slot. Read from the jobs, so a restart needs no state of its own.
  async function queueScheduledRefreshes(at: Date): Promise<void> {
    if (!schedule || (nextScheduledPassAt && at < nextScheduledPassAt)) return;
    // croner counts in whole seconds and leaves out the reference's own second.
    const [slot] = schedule.previousRuns(1, new Date(at.getTime() + 1_000));
    if (slot) {
      let queued = 0;
      for (const idea of await listIdeas()) {
        if (!isRefreshedOnSchedule(idea)) continue;
        const latest = await getLatestJobForIdea(idea.id);
        if (!latest || latest.createdAt >= slot || isActive(latest)) continue;
        if (!(await getLatestPlanForIdea(idea.id))) continue;
        await queueRefresh(idea.id, at, at);
        queued += 1;
      }
      if (queued > 0) {
        logInfo(`scheduled refresh for ${slot.toISOString()}: ${String(queued)} queued`, {
          tag: 'RESEARCH',
        });
      }
    }
    nextScheduledPassAt = schedule.nextRun(at) ?? NEVER;
  }

  // New input refreshes the plan after a pause, so a run of answers becomes one refresh. Without a
  // plan there is nothing to refresh: the first research reads everything recorded before it starts.
  async function scheduleRefresh(ideaId: string, at: Date): Promise<Maybe<ResearchJob>> {
    if (!researchRunner.isConfigured()) return null;
    if (!(await getLatestPlanForIdea(ideaId))) return findActiveJobForIdea(ideaId);
    const notBefore = new Date(at.getTime() + settings.refreshDebounceMs);
    const job = await queueRefresh(ideaId, at, notBefore);
    const waiting = job.status === ResearchJobStatus.QUEUED && !job.prompt && job.notBefore > at;
    if (waiting && job.notBefore < notBefore) return updateJob(job.id, { notBefore }, at);
    return job;
  }

  // Input that arrived while a job ran was not in its prompt, so it gets a refresh of its own.
  async function refreshForLateInput(ideaId: string, at: Date): Promise<void> {
    try {
      const [questions, decisions] = await Promise.all([
        listQuestionsForIdea(ideaId),
        listDecisionsForIdea(ideaId),
      ]);
      const late = [
        ...questions.flatMap((q) =>
          q.status === QuestionStatus.ANSWERED && q.answeredAt ? [q.answeredAt.getTime()] : [],
        ),
        ...decisions.flatMap((decision) =>
          decision.appliedAt ? [] : [decision.createdAt.getTime()],
        ),
      ];
      if (late.length === 0) return;
      const notBefore = Math.max(at.getTime(), Math.max(...late) + settings.refreshDebounceMs);
      await queueRefresh(ideaId, at, new Date(notBefore));
    } catch (error: unknown) {
      logException(error, { tag: 'RESEARCH', extra: { ideaId } });
    }
  }

  async function readAuthorInput(ideaId: string, asOf: Date): Promise<AuthorInput> {
    const [plan, questions, decisions] = await Promise.all([
      getLatestPlanForIdea(ideaId),
      listQuestionsForIdea(ideaId),
      listDecisionsForIdea(ideaId),
    ]);
    return {
      plan,
      answered: questions.filter(
        (q) =>
          q.status === QuestionStatus.ANSWERED && q.answeredAt !== null && q.answeredAt <= asOf,
      ),
      decisions: decisions.filter((d) => d.appliedAt === null && d.createdAt <= asOf),
      open: questions.filter((q) => q.status === QuestionStatus.OPEN),
      settled: questions.filter((q) => q.status === QuestionStatus.RESOLVED),
      standing: decisions.filter((d) => d.appliedAt !== null),
    };
  }

  async function buildPrompt(job: ResearchJob, asOf: Date): Promise<string> {
    const idea = await getIdeaById(job.ideaId);
    const input = await readAuthorInput(idea.id, asOf);
    if (job.kind === ResearchJobKind.INTAKE) {
      return buildIntakePrompt(idea, asOf, settings.context, input.decisions);
    }
    if (!input.plan) throw new Error('there is no plan to refresh');
    return buildRefreshPrompt({
      ...input,
      idea,
      plan: input.plan,
      today: asOf,
      context: settings.context,
    });
  }

  async function startJob(job: ResearchJob, at: Date): Promise<void> {
    try {
      // Built once per attempt and kept: a retried dispatch must send the same body, or the runner
      // treats the reused idempotency key as a conflict instead of a replay.
      let prompt = job.prompt;
      if (!prompt) {
        prompt = await buildPrompt(job, at);
        await updateJob(job.id, { prompt, inputAsOf: at }, at);
      }
      const { runId } = await researchRunner.startRun({
        prompt,
        sessionId: null,
        idempotencyKey: `research-${job.id}-${String(job.attempt)}`,
      });
      await updateJob(
        job.id,
        {
          status: ResearchJobStatus.RUNNING,
          runId,
          dispatchFailures: 0,
          repairUsed: false,
          startedAt: at,
          deadlineAt: new Date(at.getTime() + settings.runTimeoutMs),
          error: null,
        },
        at,
      );
      logInfo(`research run ${runId} started for idea ${job.ideaId}`, { tag: 'RESEARCH' });
    } catch (error: unknown) {
      logException(error, { tag: 'RESEARCH', extra: { jobId: job.id } });
      await retryDispatch(job, (error as Error).message, at);
    }
  }

  async function retryDispatch(job: ResearchJob, reason: string, at: Date): Promise<void> {
    const failures = job.dispatchFailures + 1;
    if (failures >= MAX_DISPATCH_FAILURES) {
      await finalFailure(
        job,
        `could not start the run after ${String(failures)} tries: ${reason}`,
        at,
      );
      return;
    }
    const delay =
      DISPATCH_RETRY_DELAYS_MS[failures - 1] ?? DISPATCH_RETRY_DELAYS_MS.at(-1) ?? 60_000;
    await updateJob(
      job.id,
      {
        status: ResearchJobStatus.QUEUED,
        dispatchFailures: failures,
        notBefore: new Date(at.getTime() + delay),
        error: `could not start the run, retrying: ${reason}`,
      },
      at,
    );
  }

  async function pollJob(job: ResearchJob, at: Date): Promise<void> {
    if (!job.runId) {
      await failAttempt(job, 'lost track of the run', at);
      return;
    }
    const pastDeadline = job.deadlineAt !== null && at >= job.deadlineAt;
    let run;
    try {
      run = await researchRunner.getRun(job.runId);
    } catch (error: unknown) {
      // A blip reaching Hermes is not a failed run; keep waiting until the deadline.
      logException(error, { tag: 'RESEARCH', extra: { jobId: job.id } });
      if (pastDeadline) await failAttempt(job, (error as Error).message, at);
      return;
    }
    if (!run) {
      await failAttempt(job, 'Hermes no longer knows this run (was it restarted?)', at);
      return;
    }
    if (run.state === ResearchRunState.ACTIVE) {
      if (!pastDeadline) return;
      await stopQuietly(job.runId);
      const minutes = Math.round(settings.runTimeoutMs / 60_000);
      await failAttempt(job, `timed out after ${String(minutes)} min (run was ${run.detail})`, at);
      return;
    }
    if (run.state === ResearchRunState.FAILED) {
      await failAttempt(job, `the run ended ${run.detail}`, at);
      return;
    }
    const parsed =
      job.kind === ResearchJobKind.REFRESH
        ? parseRefreshReply(run.output)
        : parseIntakeReply(run.output);
    if (parsed.ok) {
      await complete(job, parsed.reply, at, pastDeadline);
      return;
    }
    if (!job.repairUsed && run.sessionId && !pastDeadline) {
      try {
        const { runId } = await researchRunner.startRun({
          prompt: buildRepairPrompt(parsed.error),
          sessionId: run.sessionId,
          idempotencyKey: `research-${job.id}-${String(job.attempt)}-repair`,
        });
        await updateJob(
          job.id,
          {
            runId,
            repairUsed: true,
            deadlineAt: new Date(at.getTime() + settings.runTimeoutMs),
            error: `asked for a corrected reply: ${parsed.error}`,
          },
          at,
        );
        logWarning(`research reply for job ${job.id} unusable, asked for a repair`, {
          tag: 'RESEARCH',
          extra: { error: parsed.error },
        });
        return;
      } catch (error: unknown) {
        // The next tick sees the same unusable reply and retries the repair with the same key.
        logException(error, { tag: 'RESEARCH', extra: { jobId: job.id } });
        return;
      }
    }
    await failAttempt(job, `the reply could not be used: ${parsed.error}`, at);
  }

  // Safe to run more than once for a job (a retry after a failed write, a restart mid-way): the
  // plan is found by job id, questions are asked once per job, and only what is still unapplied
  // gets applied.
  async function complete(
    job: ResearchJob,
    reply: IntakeReplyData | RefreshReplyData,
    at: Date,
    pastDeadline: boolean,
  ): Promise<void> {
    let applied: Applied;
    try {
      const input = await readAuthorInput(job.ideaId, job.inputAsOf ?? job.startedAt ?? at);
      applied =
        'changed' in reply
          ? await applyRefresh(job, reply, input, at)
          : await applyIntake(job, reply, input, at);
      await updateJob(
        job.id,
        {
          status: ResearchJobStatus.SUCCEEDED,
          finishedAt: at,
          error: null,
          outcome: applied.outcome,
        },
        at,
      );
      logInfo(`research for idea ${job.ideaId} finished: ${applied.outcome}`, { tag: 'RESEARCH' });
    } catch (error: unknown) {
      logException(error, { tag: 'RESEARCH', extra: { jobId: job.id } });
      const reason = `could not save the result: ${(error as Error).message}`;
      // Keep the job running on the same finished run: the next tick tries again.
      if (pastDeadline) await failAttempt(job, reason, at);
      else await updateJob(job.id, { error: reason }, at);
      return;
    }
    // Told once the job is marked done, so finishing it again after a restart cannot repeat it.
    if (applied.news) await announce(job.ideaId, applied.news);
    await refreshForLateInput(job.ideaId, at);
  }

  async function applyIntake(
    job: ResearchJob,
    reply: IntakeReplyData,
    input: AuthorInput,
    at: Date,
  ): Promise<Applied> {
    const plan =
      (await findPlanForJob(job.id)) ??
      (await savePlan({
        ideaId: job.ideaId,
        summary: reply.summary,
        planMd: reply.plan_md,
        stack: toStack(reply.stack),
        researchMd: reply.research_md,
        sources: toSources(reply.sources),
        ...toSuggestion(reply),
        jobId: job.id,
      }));
    const asked = await appendQuestions(job.ideaId, reply.questions.map(toNewQuestion), {
      planId: plan.id,
      jobId: job.id,
    });
    await markDecisionsApplied(
      input.decisions.map((decision) => decision.id),
      plan.id,
      at,
    );
    const idea = await getIdeaById(job.ideaId);
    if (idea.status === IdeaStatus.CAPTURED || idea.status === IdeaStatus.RESEARCHING) {
      await updateIdea(idea.id, { status: IdeaStatus.PLANNED });
    }
    return {
      outcome: `Plan v${String(plan.version)}: ${plan.summary}`,
      news: planNews(ResearchNewsKind.PLAN_READY, plan, plan.summary, asked),
    };
  }

  async function applyRefresh(
    job: ResearchJob,
    reply: RefreshReplyData,
    input: AuthorInput,
    at: Date,
  ): Promise<Applied> {
    const base = input.plan;
    if (!base) throw new Error('the plan it refreshed is gone');
    const plan =
      (await findPlanForJob(job.id)) ??
      (reply.changed && reply.plan_md
        ? await savePlan(refreshedPlan(job, reply, reply.plan_md, base))
        : base);
    const notes = new Map(reply.resolved.map((entry) => [entry.number, entry.applied || null]));
    await resolveQuestions(
      input.answered.flatMap((q) =>
        q.answeredAt
          ? [
              {
                questionId: q.id,
                answeredAt: q.answeredAt,
                appliedNote: notes.get(q.number) ?? null,
              },
            ]
          : [],
      ),
      plan.id,
      at,
    );
    await markDecisionsApplied(
      input.decisions.map((decision) => decision.id),
      plan.id,
      at,
    );
    const asked = await appendQuestions(job.ideaId, reply.questions.map(toNewQuestion), {
      planId: plan.id,
      jobId: job.id,
    });
    const version = `v${String(plan.version)}`;
    // A re-check that changed nothing is not news.
    return plan.jobId === job.id
      ? {
          outcome: `Plan ${version}: ${reply.summary}`,
          news: planNews(ResearchNewsKind.PLAN_CHANGED, plan, reply.summary, asked),
        }
      : { outcome: `No change to plan ${version}: ${reply.summary}`, news: null };
  }

  // Best effort: a message that does not get through never fails the research behind it.
  async function announce(ideaId: string, news: Announcement): Promise<void> {
    try {
      const idea = await getIdeaById(ideaId);
      await researchNotifier.announceResearch({
        ...news,
        sourceUrl: idea.sourceUrl,
        ideaUrl: settings.ideaUrl(idea.id),
      });
    } catch (error: unknown) {
      logException(error, { tag: 'RESEARCH', extra: { ideaId } });
    }
  }

  async function failAttempt(job: ResearchJob, reason: string, at: Date): Promise<void> {
    if (job.attempt < MAX_ATTEMPTS) {
      const delay =
        RETRY_DELAYS_MS[job.attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 0;
      await updateJob(
        job.id,
        {
          status: ResearchJobStatus.QUEUED,
          attempt: job.attempt + 1,
          dispatchFailures: 0,
          // A new attempt is a new run: it reads the input afresh, answers since included.
          prompt: null,
          inputAsOf: null,
          runId: null,
          repairUsed: false,
          notBefore: new Date(at.getTime() + delay),
          deadlineAt: null,
          error: reason,
        },
        at,
      );
      logWarning(`research attempt ${String(job.attempt)} for job ${job.id} failed; retrying`, {
        tag: 'RESEARCH',
        extra: { reason },
      });
      return;
    }
    await finalFailure(job, reason, at);
  }

  async function finalFailure(job: ResearchJob, reason: string, at: Date): Promise<void> {
    await updateJob(
      job.id,
      { status: ResearchJobStatus.FAILED, finishedAt: at, error: reason },
      at,
    );
    logWarning(`research job ${job.id} failed for good`, {
      tag: 'RESEARCH',
      extra: { reason },
    });
    await announce(job.ideaId, {
      kind: ResearchNewsKind.FAILED,
      planVersion: null,
      summary: null,
      questions: [],
      shelveReason: null,
      error: reason,
    });
    const idea = await getIdeaById(job.ideaId).catch(() => null);
    if (idea?.status === IdeaStatus.RESEARCHING) {
      const plan = await getLatestPlanForIdea(idea.id);
      await updateIdea(idea.id, { status: plan ? IdeaStatus.PLANNED : IdeaStatus.CAPTURED });
    }
  }

  async function stopQuietly(runId: string): Promise<void> {
    try {
      await researchRunner.stopRun(runId);
    } catch (error: unknown) {
      logException(error, { tag: 'RESEARCH', extra: { runId } });
    }
  }

  return {
    isResearchEnabled,
    isScheduledRefreshEnabled,
    getNextScheduledRefresh,
    startResearch,
    answerQuestion,
    answerQuestionByNumber,
    recordDecision,
    deleteDecision,
    deleteIdea,
    tickResearch,
  };
}

function isRefreshedOnSchedule(idea: Idea): boolean {
  return idea.autoRefresh && idea.status !== IdeaStatus.SHELVED && idea.status !== IdeaStatus.DONE;
}

function isActive(job: ResearchJob): boolean {
  return job.status === ResearchJobStatus.QUEUED || job.status === ResearchJobStatus.RUNNING;
}

function planNews(
  kind: ResearchNewsKind,
  plan: Plan,
  summary: string,
  asked: Question[],
): Announcement {
  return {
    kind,
    planVersion: plan.version,
    summary,
    questions: asked.map((question) => ({ number: question.number, text: question.text })),
    shelveReason: plan.suggestion === PlanSuggestion.SHELVED ? plan.shelveReason : null,
    error: null,
  };
}

function refreshedPlan(
  job: ResearchJob,
  reply: RefreshReplyData,
  planMd: string,
  base: Plan,
): NewPlan {
  // A refresh reports only the pages it read this time; the ones behind the plan still count.
  const sources = [...toSources(reply.sources ?? []), ...base.sources].filter(
    (source, index, all) => all.findIndex((other) => other.url === source.url) === index,
  );
  return {
    ideaId: job.ideaId,
    summary: reply.summary,
    planMd,
    stack: reply.stack ? toStack(reply.stack) : base.stack,
    researchMd: reply.research_md || base.researchMd,
    sources: sources.slice(0, MAX_SOURCES),
    ...toSuggestion(reply),
    jobId: job.id,
  };
}

function toStack(stack: IntakeReplyData['stack']): Plan['stack'] {
  return stack.map((item) => ({ name: item.name, version: item.version ?? null, role: item.role }));
}

function toSources(sources: IntakeReplyData['sources']): PlanSource[] {
  return sources.map((source) => ({
    url: source.url,
    title: source.title,
    firstParty: source.first_party,
  }));
}

function toSuggestion(
  reply: Pick<IntakeReplyData, 'suggest_status' | 'shelve_reason'>,
): Pick<NewPlan, 'suggestion' | 'shelveReason'> {
  return reply.suggest_status === 'SHELVED'
    ? { suggestion: PlanSuggestion.SHELVED, shelveReason: reply.shelve_reason ?? null }
    : { suggestion: PlanSuggestion.PLANNED, shelveReason: null };
}

function toNewQuestion(question: IntakeReplyData['questions'][number]): NewQuestion {
  return {
    topic: question.topic,
    text: question.text,
    why: question.why,
    defaultAnswer: question.default,
  };
}
