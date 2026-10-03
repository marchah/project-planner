import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../common/errors';
import { DecisionSource, type Decision } from '../../entities/decision/types';
import { QuestionStatus, type Question } from '../../entities/question/types';
import {
  ResearchJobKind,
  ResearchJobStatus,
  type ResearchJob,
} from '../../entities/research-job/types';
import { registerResearchTools } from './mcp';
import type { ResearchService } from './types';

const T0 = new Date('2026-10-02T12:00:00Z');

async function connect(researchService: Partial<ResearchService>) {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  // @ts-expect-error -- partial mock: only the operations the tools use
  registerResearchTools(server, { researchService });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, text: content?.text ?? '' };
}

const job = { status: ResearchJobStatus.QUEUED, kind: ResearchJobKind.REFRESH, notBefore: T0 };

describe('research MCP tools', () => {
  it('answer_question answers by number and says when the plan picks it up', async () => {
    const answerQuestionByNumber = vi.fn(() =>
      Promise.resolve({
        question: { number: 2, answer: 'Just me', status: QuestionStatus.ANSWERED } as Question,
        refresh: job as ResearchJob,
      }),
    );
    const client = await connect({ answerQuestionByNumber });
    const result = await call(client, 'answer_question', {
      idea_id: 'idea-1',
      number: 2,
      answer: ' Just me ',
    });
    expect(answerQuestionByNumber).toHaveBeenCalledWith('idea-1', 2, 'Just me');
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      saved: 'Q2',
      answer: 'Just me',
      nextRefresh: `The plan is refreshed with it from ${T0.toISOString()}, unless more arrives first.`,
    });
  });

  it('record_decision records it as the assistant', async () => {
    const recordDecision = vi.fn(() =>
      Promise.resolve({ decision: { text: 'Use Postgres' } as Decision, refresh: null }),
    );
    const client = await connect({ recordDecision });
    const result = await call(client, 'record_decision', {
      idea_id: 'idea-1',
      decision: 'Use Postgres',
    });
    expect(recordDecision).toHaveBeenCalledWith('idea-1', 'Use Postgres', DecisionSource.ASSISTANT);
    expect(JSON.parse(result.text)).toMatchObject({
      nextRefresh: 'Saved; the plan picks it up the next time this idea is researched.',
    });
  });

  it('reports a refused answer as a tool error the agent can read', async () => {
    const client = await connect({
      answerQuestionByNumber: () =>
        Promise.reject(new NotFoundError('This idea has no question Q9')),
    });
    const result = await call(client, 'answer_question', {
      idea_id: 'idea-1',
      number: 9,
      answer: 'x',
    });
    expect(result).toEqual({ isError: true, text: 'This idea has no question Q9' });
  });
});
