import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../common/errors';
import { registerIdeaTools } from './mcp';
import { IdeaSource, IdeaStatus, type Idea, type IdeaService } from './types';

const T0 = new Date('2026-11-03T12:00:00Z');

const idea = (status: IdeaStatus): Idea => ({
  id: 'idea-1',
  title: 'NAS Reader',
  body: 'a reader',
  status,
  source: IdeaSource.SLACK,
  sourceUrl: null,
  autoRefresh: true,
  createdAt: T0,
  updatedAt: T0,
});

async function connect(ideaService: Partial<IdeaService>) {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  // @ts-expect-error -- partial mock: only the operations the tool uses
  registerIdeaTools(server, { ideaService }, (id) => `http://board/?idea=${id}`);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

async function setStatus(client: Client, status: string) {
  const result = await client.callTool({
    name: 'set_idea_status',
    arguments: { idea_id: 'idea-1', status },
  });
  const [content] = result.content as { text: string }[];
  return { isError: result.isError === true, text: content?.text ?? '' };
}

describe('idea MCP tools', () => {
  it('set_idea_status moves the idea and links it', async () => {
    const updateIdea = vi.fn(() => Promise.resolve(idea(IdeaStatus.BUILDING)));
    const result = await setStatus(await connect({ updateIdea }), 'BUILDING');
    expect(updateIdea).toHaveBeenCalledWith('idea-1', { status: IdeaStatus.BUILDING });
    expect(JSON.parse(result.text)).toEqual({
      id: 'idea-1',
      title: 'NAS Reader',
      status: 'BUILDING',
      url: 'http://board/?idea=idea-1',
    });
  });

  it('leaves the research statuses to the board', async () => {
    const updateIdea = vi.fn(() => Promise.resolve(idea(IdeaStatus.RESEARCHING)));
    const client = await connect({ updateIdea });
    for (const status of ['RESEARCHING', 'CAPTURED']) {
      expect((await setStatus(client, status)).isError).toBe(true);
    }
    expect(updateIdea).not.toHaveBeenCalled();
  });

  it('reports an unknown idea as a tool error the agent can read', async () => {
    const client = await connect({
      updateIdea: () => Promise.reject(new NotFoundError('No idea with id idea-1')),
    });
    expect(await setStatus(client, 'DONE')).toEqual({
      isError: true,
      text: 'No idea with id idea-1',
    });
  });
});
