import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanTitle, titleModelAdapterFactory } from './adapter';

const config = {
  TITLE_MODEL_BASE_URL: 'http://model:1234/v1',
  TITLE_MODEL: 'test-model',
  TITLE_MODEL_API_KEY: undefined,
  TITLE_MODEL_TIMEOUT_MS: 1000,
};

function sentRequest(fetchMock: ReturnType<typeof stubCompletion>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as { model?: string; messages: { content: string }[] },
  };
}

function stubCompletion(body: unknown, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const completion = (content: unknown, finish_reason = 'stop') => ({
  choices: [{ message: { content }, finish_reason }],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cleanTitle', () => {
  it('strips quotes, a "Title:" prefix, trailing punctuation and extra lines', () => {
    expect(cleanTitle('"Freezer Inventory Tracker."')).toBe('Freezer Inventory Tracker');
    expect(cleanTitle('Title: **Shared Grocery List**\n\nBecause…')).toBe('Shared Grocery List');
    expect(cleanTitle('  Bike   Log  ')).toBe('Bike Log');
  });

  it('rejects empty or runaway output', () => {
    expect(cleanTitle('   ')).toBeNull();
    expect(cleanTitle('x'.repeat(200))).toBeNull();
  });
});

describe('titleModelAdapter', () => {
  it('does not call out when no endpoint is configured', async () => {
    const fetchMock = stubCompletion(completion('unused'));
    const adapter = titleModelAdapterFactory({
      config: { ...config, TITLE_MODEL_BASE_URL: undefined },
    });
    await expect(adapter.generateIdeaTitle('idea')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the configured model and returns the cleaned title', async () => {
    const fetchMock = stubCompletion(completion("'Board Game Night Scheduler'"));
    const adapter = titleModelAdapterFactory({ config });
    await expect(adapter.generateIdeaTitle('an app to schedule board game nights')).resolves.toBe(
      'Board Game Night Scheduler',
    );
    const { url, init, headers, body } = sentRequest(fetchMock);
    expect(url).toBe('http://model:1234/v1/chat/completions');
    expect(body.model).toBe('test-model');
    expect(body.messages.at(-1)?.content).toBe('an app to schedule board game nights');
    expect(headers.authorization).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends a key only when one is set, and leaves the model out when none is named', async () => {
    const fetchMock = stubCompletion(completion('Shared Grocery List'));
    await titleModelAdapterFactory({
      config: { ...config, TITLE_MODEL: undefined, TITLE_MODEL_API_KEY: 'sk-test' },
    }).generateIdeaTitle('x');
    const { headers, body } = sentRequest(fetchMock);
    expect(headers.authorization).toBe('Bearer sk-test');
    expect(body).not.toHaveProperty('model');
  });

  it('names the address and the cause when the model cannot be reached', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed', { cause: refused })));
    await expect(titleModelAdapterFactory({ config }).generateIdeaTitle('x')).rejects.toThrow(
      'Title model unreachable at http://model:1234/v1/chat/completions: ECONNREFUSED',
    );
  });

  it('rejects a bad status, an unexpected shape, a cut-off reply and an empty title', async () => {
    const adapter = titleModelAdapterFactory({ config });
    stubCompletion({ error: 'busy' }, 503);
    await expect(adapter.generateIdeaTitle('x')).rejects.toThrow('HTTP 503');
    stubCompletion({ unexpected: true });
    await expect(adapter.generateIdeaTitle('x')).rejects.toThrow();
    stubCompletion(completion('A Title That Ran', 'length'));
    await expect(adapter.generateIdeaTitle('x')).rejects.toThrow('stopped with length');
    stubCompletion(completion(null));
    await expect(adapter.generateIdeaTitle('x')).rejects.toThrow('no usable title');
  });
});
