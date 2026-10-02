import { ConflictError, NotFoundError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import type {
  ResearchJob,
  ResearchJobKind,
  ResearchJobPatch,
  ResearchJobRepository,
  ResearchJobService,
} from './types';

export function researchJobServiceFactory({
  researchJobRepository,
}: {
  researchJobRepository: ResearchJobRepository;
}): ResearchJobService {
  async function getJobById(id: string): Promise<ResearchJob> {
    const job = await researchJobRepository.findJobById(id);
    if (!job) throw new NotFoundError(`No research job with id ${id}`);
    return job;
  }

  function findActiveJobForIdea(ideaId: string): Promise<Maybe<ResearchJob>> {
    return researchJobRepository.findActiveJobByIdeaId(ideaId);
  }

  function getLatestJobForIdea(ideaId: string): Promise<Maybe<ResearchJob>> {
    return researchJobRepository.findLatestJobByIdeaId(ideaId);
  }

  function findRunningJob(): Promise<Maybe<ResearchJob>> {
    return researchJobRepository.findRunningJob();
  }

  function findNextDueJob(now: Date): Promise<Maybe<ResearchJob>> {
    return researchJobRepository.findNextDueJob(now);
  }

  function listIdeaIdsWithJobs(): Promise<string[]> {
    return researchJobRepository.listIdeaIdsWithJobs();
  }

  async function queueJob(
    ideaId: string,
    kind: ResearchJobKind,
    now: Date,
  ): Promise<{ job: ResearchJob; created: boolean }> {
    const job = await researchJobRepository.insertJobUnlessActive(ideaId, kind, now);
    if (job) return { job, created: true };
    const active = await researchJobRepository.findActiveJobByIdeaId(ideaId);
    if (!active) throw new ConflictError(`Could not queue research for idea ${ideaId}`);
    return { job: active, created: false };
  }

  async function updateJob(id: string, patch: ResearchJobPatch, now: Date): Promise<ResearchJob> {
    const job = await researchJobRepository.updateJob(id, patch, now);
    if (!job) throw new NotFoundError(`No research job with id ${id}`);
    return job;
  }

  return {
    getJobById,
    findActiveJobForIdea,
    getLatestJobForIdea,
    findRunningJob,
    findNextDueJob,
    listIdeaIdsWithJobs,
    queueJob,
    updateJob,
  };
}
