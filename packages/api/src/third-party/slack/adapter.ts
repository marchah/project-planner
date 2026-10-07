import { z } from 'zod';
import { fetchFailureReason } from '../../common/errors';
import type { Maybe } from '../../common/types';
import {
  ResearchNewsKind,
  type ResearchNews,
  type ResearchNotifier,
} from '../../features/research/types';

const POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';
const TIMEOUT_MS = 10_000;
// …/archives/<channel>/p<ts without its dot>, with ?thread_ts=… when it links a reply.
const PERMALINK =
  /^https:\/\/[^/]+\.slack\.com\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})(?:\?(.*))?$/;

const SlackReply = z.object({ ok: z.boolean(), error: z.string().optional() });

export interface SlackConfig {
  SLACK_BOT_TOKEN: string | undefined;
}

export interface SlackThread {
  channel: string;
  threadTs: string;
}

/** The thread a Slack permalink belongs to; null for anything else. */
export function slackThread(url: Maybe<string>): Maybe<SlackThread> {
  const match = PERMALINK.exec(url ?? '');
  if (!match) return null;
  const [, channel = '', seconds = '', micros = '', query] = match;
  const threadTs = new URLSearchParams(query ?? '').get('thread_ts');
  return { channel, threadTs: threadTs ?? `${seconds}.${micros}` };
}

// Slack reads <, > and & as markup, so text from the plan is escaped.
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatResearchNews(news: ResearchNews): string {
  const version = `v${String(news.planVersion ?? '?')}`;
  const link = (label: string) => (news.ideaUrl ? [`<${news.ideaUrl}|${label}>`] : []);
  const questions = news.questions.map((q) => `Q${String(q.number)}. ${escape(q.text)}`);
  switch (news.kind) {
    case ResearchNewsKind.PLAN_READY:
      return [
        `*Plan ${version} is ready:* ${escape(news.summary ?? '')}`,
        ...(news.shelveReason
          ? [`Research suggests something that already exists: ${escape(news.shelveReason)}`]
          : []),
        ...(questions.length > 0
          ? [
              '',
              '*Questions*, answer them here in the thread (until you do, the plan uses a default):',
              ...questions,
            ]
          : []),
        '',
        ...link('Open the plan on the board'),
      ].join('\n');
    case ResearchNewsKind.PLAN_CHANGED:
      return [
        `*Plan ${version}:* ${escape(news.summary ?? '')}`,
        ...(news.shelveReason
          ? [`Research now suggests something that already exists: ${escape(news.shelveReason)}`]
          : []),
        ...(questions.length > 0 ? ['', '*New questions*:', ...questions] : []),
        '',
        ...link('Open the plan on the board'),
      ].join('\n');
    case ResearchNewsKind.FAILED:
      return [
        `Research failed: ${escape(news.error ?? 'unknown error')}`,
        ...link('Try again from the board'),
      ].join('\n');
  }
}

// Replies in the Slack thread an idea was captured from; ideas from elsewhere get nothing.
export function slackAdapterFactory({ config }: { config: SlackConfig }): ResearchNotifier {
  async function announceResearch(news: ResearchNews): Promise<void> {
    const thread = slackThread(news.sourceUrl);
    if (!config.SLACK_BOT_TOKEN || !thread) return;
    const response = await fetch(POST_MESSAGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${config.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: thread.channel,
        thread_ts: thread.threadTs,
        text: formatResearchNews(news),
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new Error(`Slack unreachable: ${fetchFailureReason(error)}`, { cause: error });
    });
    if (!response.ok) throw new Error(`Slack answered HTTP ${String(response.status)}`);
    // Slack reports most failures as HTTP 200 with ok: false.
    const reply = SlackReply.parse(await response.json());
    if (!reply.ok)
      throw new Error(`Slack refused the message: ${reply.error ?? 'no reason given'}`);
  }

  return { announceResearch };
}
