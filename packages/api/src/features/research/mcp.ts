import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Maybe } from '../../common/types';
import { DECISION_MAX_LENGTH, DecisionSource } from '../../entities/decision/types';
import { ANSWER_MAX_LENGTH } from '../../entities/question/types';
import { ResearchJobStatus, type ResearchJob } from '../../entities/research-job/types';
import type { ResearchService } from './types';

// Tools to write back what was decided about an idea: by its author, or by an agent building it.
export function registerResearchTools(
  server: McpServer,
  {
    researchService: { answerQuestionByNumber, recordDecision },
  }: { researchService: ResearchService },
): void {
  server.registerTool(
    'answer_question',
    {
      title: 'Answer a question',
      description: `Saves the author's answer to one of an idea's open questions (Q1, Q2… in get_idea) and schedules a plan refresh that folds it in. The questions are the author's to answer: record only what they said in so many words, in their own words rather than a summary, and never answer one on their behalf, not even while building the idea. When the author says they don't know yet or haven't decided ("no idea yet", "not sure"), don't call this: the question stays open and the plan keeps its default. Answering again replaces the answer until a refresh has applied it; after that, use record_decision to change course.`,
      inputSchema: {
        idea_id: z.string().min(1).describe('The idea id'),
        number: z.number().int().positive().describe('The question number: 2 for Q2'),
        answer: z
          .string()
          .trim()
          .min(1)
          .max(ANSWER_MAX_LENGTH)
          .describe("The author's answer, in their words"),
      },
    },
    async ({ idea_id, number, answer }) => {
      const { question, refresh } = await answerQuestionByNumber(idea_id, number, answer);
      return asJson({
        saved: `Q${String(question.number)}`,
        answer: question.answer,
        nextRefresh: describeRefresh(refresh),
      });
    },
  );

  server.registerTool(
    'record_decision',
    {
      title: 'Record a decision',
      description: `Saves a decision about an idea that is not an answer to one of its questions, and schedules a plan refresh that folds it in; a decision overrides the plan's assumptions and earlier answers. Two kinds. Something the idea's author decided ("use Postgres", "drop the mobile app"): record only what they said in so many words, in their own words, never your own suggestion, a guess at what they meant, or what someone else said. Or, when you are building the idea, a choice you made that departs from the plan, with its reason ("switched from SQLite to Postgres: SQLite files lock badly on the NFS share"). Don't record routine implementation details the plan already covers.`,
      inputSchema: {
        idea_id: z.string().min(1).describe('The idea id'),
        decision: z
          .string()
          .trim()
          .min(1)
          .max(DECISION_MAX_LENGTH)
          .describe(
            "The author's decision in their words, or your change to the plan and its reason",
          ),
      },
    },
    async ({ idea_id, decision }) => {
      const recorded = await recordDecision(idea_id, decision, DecisionSource.ASSISTANT);
      return asJson({
        saved: recorded.decision.text,
        nextRefresh: describeRefresh(recorded.refresh),
      });
    },
  );
}

function describeRefresh(job: Maybe<ResearchJob>): string {
  if (!job) return 'Saved; the plan picks it up the next time this idea is researched.';
  if (job.status === ResearchJobStatus.RUNNING) {
    return 'Research is running now; another refresh folds this in right after it.';
  }
  return `The plan is refreshed with it from ${job.notBefore.toISOString()}, unless more arrives first.`;
}

function asJson(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
