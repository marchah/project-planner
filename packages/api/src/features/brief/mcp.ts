import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BriefService, IdeaBrief } from './types';

// Read-only tools for an agent discussing an idea (Hermes, in the idea's Slack thread).
export function registerBriefTools(
  server: McpServer,
  { briefService: { getIdeaBrief, listIdeaSummaries } }: { briefService: BriefService },
  ideaUrl: (id: string) => string,
): void {
  server.registerTool(
    'list_ideas',
    {
      title: 'List ideas',
      description:
        'Every idea on the Project Planner board, newest first: id, title, status, whether it has a plan, and how many questions are open.',
      inputSchema: {},
    },
    async () => {
      const ideas = await listIdeaSummaries();
      return asJson(ideas.map((idea) => ({ ...idea, url: ideaUrl(idea.id) })));
    },
  );

  server.registerTool(
    'get_idea',
    {
      title: 'Get an idea',
      description:
        "One idea with everything the board knows: the idea as its author wrote it, the current plan (Markdown, stack, sources, research notes), its questions with their defaults and answers, the author's decisions, and the state of its latest research run. The id is the `idea` parameter of the idea's board link (…/?idea=<id>).",
      inputSchema: { id: z.string().min(1).describe('The idea id') },
    },
    async ({ id }) => asJson(present(await getIdeaBrief(id), ideaUrl)),
  );
}

function present(
  { idea, plan, questions, decisions, research }: IdeaBrief,
  ideaUrl: (id: string) => string,
) {
  return {
    idea: {
      id: idea.id,
      url: ideaUrl(idea.id),
      title: idea.title,
      text: idea.body,
      status: idea.status,
      capturedFrom: idea.source,
      refreshedOnSchedule: idea.autoRefresh,
      createdAt: idea.createdAt,
    },
    plan: plan && {
      version: plan.version,
      createdAt: plan.createdAt,
      summary: plan.summary,
      planMarkdown: plan.planMd,
      stack: plan.stack,
      suggestion: plan.suggestion,
      shelveReason: plan.shelveReason,
      researchMarkdown: plan.researchMd,
      sources: plan.sources,
    },
    questions: questions.map((question) => ({
      number: question.number,
      topic: question.topic,
      question: question.text,
      whyItMatters: question.why,
      defaultUntilAnswered: question.defaultAnswer,
      answer: question.answer,
      status: question.status,
      answeredAt: question.answeredAt,
      whatTheAnswerChanged: question.appliedNote,
    })),
    decisions: decisions.map((decision) => ({
      decision: decision.text,
      recordedBy: decision.source,
      createdAt: decision.createdAt,
      appliedToPlan: decision.appliedAt !== null,
    })),
    research: research && {
      kind: research.kind,
      status: research.status,
      attempt: research.attempt,
      notBefore: research.notBefore,
      outcome: research.outcome,
      error: research.error,
      startedAt: research.startedAt,
      finishedAt: research.finishedAt,
    },
  };
}

function asJson(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
