import { z } from 'zod';
import type { Maybe } from '../../common/types';
import {
  ResearchRunState,
  type ResearchRun,
  type ResearchRunner,
} from '../../features/research/types';

export interface HermesConfig {
  HERMES_API_URL: string | undefined;
  HERMES_API_KEY: string | undefined;
  HERMES_PROVIDER: string | undefined;
  HERMES_REQUEST_TIMEOUT_MS: number;
}

const StartedRun = z.object({ run_id: z.string().min(1) });
const RunStatus = z.object({
  status: z.string(),
  output: z.string().nullish(),
  session_id: z.string().nullish(),
});

const TERMINAL_OK = new Set(['completed']);
const TERMINAL_FAILED = new Set(['failed', 'cancelled', 'interrupted']);

// Hermes Agent's run API: POST /v1/runs starts an agent turn and returns at once; GET polls it.
export function hermesAdapterFactory({ config }: { config: HermesConfig }): ResearchRunner {
  function isConfigured(): boolean {
    return Boolean(config.HERMES_API_URL);
  }

  async function startRun({
    prompt,
    sessionId,
    idempotencyKey,
  }: {
    prompt: string;
    sessionId: Maybe<string>;
    idempotencyKey: string;
  }): Promise<{ runId: string }> {
    const body = {
      input: prompt,
      ...(config.HERMES_PROVIDER && { provider: config.HERMES_PROVIDER }),
      ...(sessionId && { session_id: sessionId }),
    };
    const response = await request('/v1/runs', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'idempotency-key': idempotencyKey },
    });
    if (!response.ok) throw new Error(`Hermes refused the run: HTTP ${String(response.status)}`);
    return { runId: StartedRun.parse(await response.json()).run_id };
  }

  async function getRun(runId: string): Promise<Maybe<ResearchRun>> {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}`, { method: 'GET' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Hermes run status: HTTP ${String(response.status)}`);
    const run = RunStatus.parse(await response.json());
    return {
      state: TERMINAL_OK.has(run.status)
        ? ResearchRunState.COMPLETED
        : TERMINAL_FAILED.has(run.status)
          ? ResearchRunState.FAILED
          : ResearchRunState.ACTIVE,
      output: run.output ?? null,
      sessionId: run.session_id ?? null,
      detail: run.status,
    };
  }

  async function stopRun(runId: string): Promise<void> {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: 'POST',
    });
    // 409: the run already finished, which is what stopping wanted.
    if (!response.ok && response.status !== 409) {
      throw new Error(`Hermes could not stop the run: HTTP ${String(response.status)}`);
    }
  }

  async function request(path: string, init: RequestInit): Promise<Response> {
    if (!config.HERMES_API_URL) throw new Error('HERMES_API_URL is not set');
    const url = `${config.HERMES_API_URL}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(config.HERMES_API_KEY && { authorization: `Bearer ${config.HERMES_API_KEY}` }),
        ...(init.headers as Record<string, string>),
      },
      signal: AbortSignal.timeout(config.HERMES_REQUEST_TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new Error(`Hermes unreachable at ${url}: ${failureReason(error)}`, { cause: error });
    });
  }

  return { isConfigured, startRun, getRun, stopRun };
}

// fetch reports every network failure as "fetch failed" and keeps the reason on `cause`.
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'TimeoutError') return error.message;
  const cause = error.cause;
  if (cause instanceof Error) return 'code' in cause ? String(cause.code) : cause.message;
  return error.message;
}
