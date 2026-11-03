import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IdeaStatus, type IdeaService } from './types';

// RESEARCHING belongs to the research queue and CAPTURED to new ideas; an agent sets the rest.
const AGENT_STATUSES = [
  IdeaStatus.PLANNED,
  IdeaStatus.BUILDING,
  IdeaStatus.DONE,
  IdeaStatus.SHELVED,
] as const;

// Tools for an agent working from the board: it says where an idea stands.
export function registerIdeaTools(
  server: McpServer,
  { ideaService: { updateIdea } }: { ideaService: IdeaService },
  ideaUrl: (id: string) => string,
): void {
  server.registerTool(
    'set_idea_status',
    {
      title: "Set an idea's status",
      description:
        'Moves an idea on the Project Planner board. Set BUILDING when you start working on it, DONE when it is built, and PLANNED to hand it back unfinished. Set SHELVED only when its author says to drop it. Shelved and done ideas leave the main board and are no longer re-checked on schedule.',
      inputSchema: {
        idea_id: z.string().min(1).describe('The idea id'),
        status: z.enum(AGENT_STATUSES).describe('PLANNED, BUILDING, DONE or SHELVED'),
      },
    },
    async ({ idea_id, status }) => {
      const idea = await updateIdea(idea_id, { status });
      return asJson({ id: idea.id, title: idea.title, status: idea.status, url: ideaUrl(idea.id) });
    },
  );
}

function asJson(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
