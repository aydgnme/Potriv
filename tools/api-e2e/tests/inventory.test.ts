import { describe, expect, it } from 'vitest';

import { buildInventory, templateParameters, validateDocument } from '../src/openapi/inventory.js';

const document = {
  paths: {
    '/auth/login': { post: { operationId: 'login', responses: { '200': {} }, requestBody: {} } },
    '/projects/{projectId}': {
      get: { responses: { '200': {} } },
      delete: { responses: { '204': {} } },
    },
  },
};

describe('operation inventory', () => {
  it('flattens every method+path pair', () => {
    const operations = buildInventory(document);
    expect(operations.map((o) => o.key)).toEqual([
      'DELETE /projects/{projectId}', 'GET /projects/{projectId}', 'POST /auth/login',
    ]);
  });

  it('extracts path template parameters', () => {
    expect(templateParameters('/projects/{projectId}/allocations/{allocationId}'))
      .toEqual(['projectId', 'allocationId']);
    expect(templateParameters('/departments')).toEqual([]);
  });

  it('reports an operation that declares no responses', () => {
    const problems = validateDocument(
      { paths: { '/x': { get: {} } } }, buildInventory({ paths: { '/x': { get: {} } } }),
    );
    expect(problems.some((p) => p.includes('declares no responses'))).toBe(true);
  });
});
