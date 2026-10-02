import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResearchRunState } from '../../features/research/types';
import { hermesAdapterFactory } from './adapter';

const config = {
  HERMES_API_URL: 'http://hermes:8642',
  HERMES_API_KEY: 'key-1',
  HERMES_PROVIDER: 'openai-codex',
  HERMES_REQUEST_TIMEOUT_MS: 1000,
};

function stub(status: number, body: unknown) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stub>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hermesAdapter', () => {
  it('is configured only with a URL', () => {
    expect(hermesAdapterFactory({ config }).isConfigured()).toBe(true);
    expect(
      hermesAdapterFactory({ config: { ...config, HERMES_API_URL: undefined } }).isConfigured(),
    ).toBe(false);
  });

  it('starts a run with the key, the provider and an idempotency key', async () => {
    const fetchMock = stub(202, { run_id: 'run_1', status: 'started' });
    const adapter = hermesAdapterFactory({ config });
    await expect(
      adapter.startRun({ prompt: 'research', sessionId: null, idempotencyKey: 'job-1-1' }),
    ).resolves.toEqual({ runId: 'run_1' });
    const request = sent(fetchMock);
    expect(request).toMatchObject({ url: 'http://hermes:8642/v1/runs', method: 'POST' });
    expect(request.headers).toMatchObject({
      authorization: 'Bearer key-1',
      'idempotency-key': 'job-1-1',
    });
    expect(request.body).toEqual({ input: 'research', provider: 'openai-codex' });
  });

  it('continues a session when asked, and sends no provider or key when none is set', async () => {
    const fetchMock = stub(202, { run_id: 'run_2' });
    const adapter = hermesAdapterFactory({
      config: { ...config, HERMES_PROVIDER: undefined, HERMES_API_KEY: undefined },
    });
    await adapter.startRun({ prompt: 'fix it', sessionId: 'sess-1', idempotencyKey: 'k' });
    const request = sent(fetchMock);
    expect(request.body).toEqual({ input: 'fix it', session_id: 'sess-1' });
    expect(request.headers.authorization).toBeUndefined();
  });

  it('maps Hermes run statuses onto active, completed and failed', async () => {
    const adapter = hermesAdapterFactory({ config });
    const cases: [string, ResearchRunState][] = [
      ['started', ResearchRunState.ACTIVE],
      ['running', ResearchRunState.ACTIVE],
      ['waiting_for_approval', ResearchRunState.ACTIVE],
      ['stopping', ResearchRunState.ACTIVE],
      ['completed', ResearchRunState.COMPLETED],
      ['failed', ResearchRunState.FAILED],
      ['cancelled', ResearchRunState.FAILED],
      ['interrupted', ResearchRunState.FAILED],
    ];
    for (const [status, state] of cases) {
      stub(200, {
        run_id: 'r',
        status,
        output: status === 'completed' ? '{}' : null,
        session_id: 's',
      });
      await expect(adapter.getRun('r')).resolves.toMatchObject({
        state,
        detail: status,
        sessionId: 's',
      });
    }
  });

  it('returns null for a run Hermes no longer knows', async () => {
    stub(404, { error: 'not found' });
    await expect(hermesAdapterFactory({ config }).getRun('gone')).resolves.toBeNull();
  });

  it('treats stopping a finished run as done', async () => {
    const fetchMock = stub(409, { error: 'run_not_active' });
    await expect(hermesAdapterFactory({ config }).stopRun('r')).resolves.toBeUndefined();
    expect(sent(fetchMock)).toMatchObject({
      url: 'http://hermes:8642/v1/runs/r/stop',
      method: 'POST',
    });
  });

  it('rejects an unexpected reply and names the cause of a network failure', async () => {
    const adapter = hermesAdapterFactory({ config });
    stub(500, {});
    await expect(
      adapter.startRun({ prompt: 'p', sessionId: null, idempotencyKey: 'k' }),
    ).rejects.toThrow('HTTP 500');
    stub(200, { nope: true });
    await expect(adapter.getRun('r')).rejects.toThrow();
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed', { cause: refused })));
    await expect(adapter.getRun('r')).rejects.toThrow(
      'Hermes unreachable at http://hermes:8642/v1/runs/r: ECONNREFUSED',
    );
  });
});
