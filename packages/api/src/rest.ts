import type { IncomingMessage, ServerResponse } from 'node:http';
import { BadRequestError, PayloadTooLargeError } from './common/errors';
import { logException } from './common/logger';
import { matchRoute, restErrorResponse, type RestResponse, type RestRoute } from './common/rest';
import { settings } from './common/settings';
import { ideaRoutesFactory } from './entities/idea/routes';
import { getServices } from './services';

const MAX_BODY_BYTES = 64 * 1024;

let routes: RestRoute[] | undefined;

function getRoutes(): RestRoute[] {
  if (routes) return routes;
  const { ideaService } = getServices();
  routes = [...ideaRoutesFactory({ ideaService })];
  return routes;
}

export async function handleRestRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const match = matchRoute(getRoutes(), req.method ?? 'GET', url.pathname);
  if (match === 'NOT_FOUND') return send(res, { status: 404, body: { error: 'Not found' } });
  if (match === 'METHOD_NOT_ALLOWED') {
    return send(res, { status: 405, body: { error: 'Method not allowed' } });
  }

  try {
    const body = await readJsonBody(req);
    const response = await match.route.handle({
      params: match.params,
      body,
      origin: settings.PUBLIC_URL ?? `http://${req.headers.host ?? 'localhost'}`,
    });
    send(res, response);
  } catch (error: unknown) {
    const response = restErrorResponse(error);
    if (response.status >= 500) logException(error, { tag: 'REST' });
    send(res, response);
  }
}

function send(res: ServerResponse, { status, body }: RestResponse): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError('Body is not valid JSON');
  }
}
