import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logException } from './common/logger';
import { settings } from './common/settings';
import { ideaUrl } from './entities/idea/routes';
import { registerBriefTools } from './features/brief/mcp';
import { registerResearchTools } from './features/research/mcp';
import { readJsonBody } from './rest';
import { getServices } from './services';

// Stateless MCP over streamable HTTP: a fresh server + transport per request, plain JSON replies.
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed' },
        id: null,
      }),
    );
    return;
  }
  const origin = settings.PUBLIC_URL ?? `http://${req.headers.host ?? 'localhost'}`;
  const server = new McpServer({ name: 'project-planner', version: '1.0.0' });
  const services = getServices();
  registerBriefTools(server, services, (id) => ideaUrl(origin, id));
  registerResearchTools(server, services);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    const body = await readJsonBody(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error: unknown) {
    logException(error, { tag: 'MCP' });
    if (!res.headersSent) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Bad request' },
          id: null,
        }),
      );
    }
  }
}
