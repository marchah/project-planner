import { ZodError } from 'zod';
import { ServerError } from './errors';

export type RestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RestRequest {
  params: Record<string, string>;
  body: unknown;
  /** Scheme + host the caller reached us on, for building absolute links. */
  origin: string;
}

export interface RestResponse {
  status: number;
  body: unknown;
}

// Transport-agnostic so slices never touch node:http; the server adapts these.
export interface RestRoute {
  method: RestMethod;
  /** Literal segments plus `:name` params, e.g. `/api/ideas/:id`. */
  path: string;
  handle: (request: RestRequest) => Promise<RestResponse>;
}

export interface RouteMatch {
  route: RestRoute;
  params: Record<string, string>;
}

export function matchRoute(
  routes: RestRoute[],
  method: string,
  pathname: string,
): RouteMatch | 'METHOD_NOT_ALLOWED' | 'NOT_FOUND' {
  const segments = splitPath(pathname);
  let pathMatched = false;
  for (const route of routes) {
    const params = matchSegments(splitPath(route.path), segments);
    if (!params) continue;
    pathMatched = true;
    if (route.method === method) return { route, params };
  }
  return pathMatched ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND';
}

export function restErrorResponse(error: unknown): RestResponse {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Invalid request',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }
  if (error instanceof ServerError) return { status: error.status, body: { error: error.message } };
  return { status: 500, body: { error: 'Server error' } };
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | undefined {
  if (pattern.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const value = actual[index] ?? '';
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return undefined;
  }
  return params;
}
