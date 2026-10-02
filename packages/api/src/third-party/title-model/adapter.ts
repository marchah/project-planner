import { z } from 'zod';
import type { Maybe } from '../../common/types';
import type { IdeaTitleGenerator } from '../../entities/idea/types';

export const TITLE_MAX_LENGTH = 120;

const SYSTEM_PROMPT =
  'You name project ideas. Reply with a title of at most 8 words for the idea the user gives: ' +
  'specific, plain, Title Case, in the same language as the idea, no quotes, no trailing ' +
  'punctuation. Reply with the title only.';

const ChatCompletion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable(),
      }),
    )
    .min(1),
});

export interface TitleModelConfig {
  TITLE_MODEL_BASE_URL: string | undefined;
  TITLE_MODEL: string | undefined;
  TITLE_MODEL_API_KEY: string | undefined;
  TITLE_MODEL_TIMEOUT_MS: number;
}

export function cleanTitle(raw: string): Maybe<string> {
  const firstLine = raw.split('\n').find((line) => line.trim().length > 0) ?? '';
  const title = firstLine
    .replace(/^\s*(title\s*:\s*)/i, '')
    .replace(/^["'“”‘’`*_\s]+|["'“”‘’`*_\s]+$/g, '')
    .replace(/[.!?;:,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title || title.length > TITLE_MAX_LENGTH) return null;
  return title;
}

// Any OpenAI-compatible chat endpoint: llama.cpp, LM Studio, Ollama, or a hosted API with a key.
export function titleModelAdapterFactory({
  config,
}: {
  config: TitleModelConfig;
}): IdeaTitleGenerator {
  async function generateIdeaTitle(text: string): Promise<Maybe<string>> {
    if (!config.TITLE_MODEL_BASE_URL) return null;
    const url = `${config.TITLE_MODEL_BASE_URL}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.TITLE_MODEL_API_KEY && {
          authorization: `Bearer ${config.TITLE_MODEL_API_KEY}`,
        }),
      },
      body: JSON.stringify({
        // Single-model servers such as llama.cpp ignore the name; hosted APIs require it.
        ...(config.TITLE_MODEL && { model: config.TITLE_MODEL }),
        temperature: 0.2,
        max_tokens: 40,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(config.TITLE_MODEL_TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new Error(`Title model unreachable at ${url}: ${failureReason(error)}`, {
        cause: error,
      });
    });
    if (!response.ok) throw new Error(`Title model answered HTTP ${String(response.status)}`);
    const completion = ChatCompletion.parse(await response.json());
    const [choice] = completion.choices;
    if (choice?.finish_reason !== 'stop') {
      throw new Error(`Title model stopped with ${String(choice?.finish_reason)}`);
    }
    const title = cleanTitle(choice.message.content ?? '');
    if (!title) throw new Error('Title model returned no usable title');
    return title;
  }

  return { generateIdeaTitle };
}

// fetch reports every network failure as "fetch failed" and keeps the reason on `cause`.
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'TimeoutError') return error.message;
  const cause = error.cause;
  if (cause instanceof Error) return 'code' in cause ? String(cause.code) : cause.message;
  return error.message;
}
