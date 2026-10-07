import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResearchNewsKind, type ResearchNews } from '../../features/research/types';
import { formatResearchNews, slackAdapterFactory, slackThread } from './adapter';

const PERMALINK = 'https://acme.slack.com/archives/C0123ABC/p1790965715402789';

const news = (over: Partial<ResearchNews> = {}): ResearchNews => ({
  kind: ResearchNewsKind.PLAN_READY,
  sourceUrl: PERMALINK,
  ideaUrl: 'http://board/?idea=i1',
  planVersion: 1,
  summary: 'Use SQLite & a <small> CLI.',
  questions: [{ number: 1, text: 'Multi-user?' }],
  shelveReason: null,
  error: null,
  ...over,
});

function stubSlack(body: unknown, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slackThread', () => {
  it('reads the channel and thread from a message permalink', () => {
    expect(slackThread(PERMALINK)).toEqual({ channel: 'C0123ABC', threadTs: '1790965715.402789' });
  });

  it('uses the thread of a reply permalink', () => {
    expect(slackThread(`${PERMALINK}?thread_ts=1790965000.000100&cid=C0123ABC`)).toEqual({
      channel: 'C0123ABC',
      threadTs: '1790965000.000100',
    });
  });

  it('ignores anything that is not a Slack permalink', () => {
    expect(slackThread(null)).toBeNull();
    expect(slackThread('https://example.com/archives/C0123ABC/p1790965715402789')).toBeNull();
  });
});

describe('formatResearchNews', () => {
  it('escapes Slack markup and lists the questions to answer in the thread', () => {
    const text = formatResearchNews(news());
    expect(text).toContain('*Plan v1 is ready:* Use SQLite &amp; a &lt;small&gt; CLI.');
    expect(text).toContain('answer them here in the thread');
    expect(text).toContain('Q1. Multi-user?');
    expect(text).toContain('<http://board/?idea=i1|Open the plan on the board>');
  });

  it('says what a refresh changed, and why research failed', () => {
    expect(
      formatResearchNews(
        news({ kind: ResearchNewsKind.PLAN_CHANGED, planVersion: 3, questions: [] }),
      ),
    ).not.toContain('Questions');
    expect(formatResearchNews(news({ kind: ResearchNewsKind.FAILED, error: 'timed out' }))).toBe(
      'Research failed: timed out\n<http://board/?idea=i1|Try again from the board>',
    );
  });
});

describe('slackAdapter', () => {
  const adapter = slackAdapterFactory({ config: { SLACK_BOT_TOKEN: 'xoxb-test' } });

  it('replies in the thread the idea was captured from', async () => {
    const fetchMock = stubSlack({ ok: true });
    await adapter.announceResearch(news());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer xoxb-test');
    expect(JSON.parse(init.body as string)).toMatchObject({
      channel: 'C0123ABC',
      thread_ts: '1790965715.402789',
      unfurl_links: false,
    });
  });

  it('says nothing without a token or a Slack thread', async () => {
    const fetchMock = stubSlack({ ok: true });
    await slackAdapterFactory({ config: { SLACK_BOT_TOKEN: undefined } }).announceResearch(news());
    await adapter.announceResearch(news({ sourceUrl: null }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports what Slack refused, or why it could not be reached', async () => {
    stubSlack({ ok: false, error: 'not_in_channel' });
    await expect(adapter.announceResearch(news())).rejects.toThrow(
      'Slack refused the message: not_in_channel',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.reject(
          new TypeError('fetch failed', {
            cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }),
          }),
        ),
      ),
    );
    await expect(adapter.announceResearch(news())).rejects.toThrow('Slack unreachable: ENOTFOUND');
  });
});
