import type { ApiClient } from '../http/client.js';

/**
 * Normalizes the OpenAPI document into a flat list of operations. One entry per
 * METHOD + PATH — that pair is the unit everything else accounts for.
 */

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

export type Operation = {
  readonly key: string; // "POST /auth/login"
  readonly method: string;
  readonly path: string;
  readonly operationId: string | null;
  readonly tags: readonly string[];
  readonly hasRequestBody: boolean;
  readonly declaredResponses: readonly string[];
  readonly pathParameters: readonly string[];
  readonly declaresSecurity: boolean;
};

export type OpenApiDocument = {
  readonly paths?: Record<string, Record<string, unknown>>;
  readonly openapi?: string;
};

export function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** Path template placeholders, e.g. `/projects/{projectId}` -> ["projectId"]. */
export function templateParameters(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
}

export function buildInventory(document: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];
  const seen = new Set<string>();

  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const raw = (item as Record<string, unknown>)[method];
      if (!raw || typeof raw !== 'object') continue;
      const op = raw as Record<string, unknown>;
      const key = operationKey(method, path);
      if (seen.has(key)) {
        throw new Error(`OpenAPI declares ${key} more than once`);
      }
      seen.add(key);
      operations.push({
        key,
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === 'string' ? op.operationId : null,
        tags: Array.isArray(op.tags) ? (op.tags as string[]) : [],
        hasRequestBody: Boolean(op.requestBody),
        declaredResponses: Object.keys((op.responses ?? {}) as object),
        pathParameters: templateParameters(path),
        declaresSecurity: Array.isArray(op.security) || Boolean(op.security),
      });
    }
  }
  return operations.sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchOpenApi(client: ApiClient): Promise<OpenApiDocument> {
  const response = await client.get('/v3/api-docs');
  if (!response.ok) {
    throw new Error(`OpenAPI document unavailable: HTTP ${response.status} from /api/v3/api-docs`);
  }
  if (!response.body || typeof response.body !== 'object') {
    throw new Error('OpenAPI document is not valid JSON');
  }
  return response.body as OpenApiDocument;
}

/** Structural checks worth enforcing. Not a documentation-quality audit. */
export function validateDocument(
  document: OpenApiDocument,
  operations: readonly Operation[],
): string[] {
  const problems: string[] = [];
  if (!document.paths || Object.keys(document.paths).length === 0) {
    problems.push('OpenAPI document declares no paths');
  }
  for (const op of operations) {
    if (op.declaredResponses.length === 0) {
      problems.push(`${op.key} declares no responses`);
    }
    if (['POST', 'PUT', 'PATCH'].includes(op.method) && !op.hasRequestBody
      && op.pathParameters.length === 0 && !op.path.includes('logout')) {
      // Informational: a body-less POST with no path parameter is unusual but legal.
      problems.push(`${op.key} has neither a request body nor a path parameter`);
    }
  }
  return problems;
}
