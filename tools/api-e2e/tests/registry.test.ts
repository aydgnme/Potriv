import { describe, expect, it } from 'vitest';

import { buildInventory } from '../src/openapi/inventory.js';
import { CoverageRegistry } from '../src/openapi/registry.js';

const operations = buildInventory({
  paths: {
    '/a': { get: { responses: { '200': {} } } },
    '/b': { post: { responses: { '201': {} } } },
  },
});

function registry() {
  return new CoverageRegistry(operations);
}

describe('coverage registry', () => {
  it('treats an operation with no execution as BLOCKED, never as passing', () => {
    const r = registry();
    expect(r.statusOf('GET /a')).toBe('BLOCKED');
    expect(r.summary().accountingPercent).toBe(0);
    expect(r.drift().untested).toEqual(['GET /a', 'POST /b']);
  });

  it('accounts an operation once every probe passes', () => {
    const r = registry();
    r.record({ id: 's1', operation: 'GET /a', kind: 'success', description: '', passed: true });
    r.record({ id: 's2', operation: 'POST /b', kind: 'success', description: '', passed: true });
    expect(r.statusOf('GET /a')).toBe('PASS');
    expect(r.summary().accountingPercent).toBe(100);
    expect(r.summary().successPathPercent).toBe(100);
  });

  it('fails the operation when any of its probes fails', () => {
    const r = registry();
    r.record({ id: 's1', operation: 'GET /a', kind: 'success', description: '', passed: true });
    r.record({ id: 's2', operation: 'GET /a', kind: 'anonymous', description: '', passed: false });
    expect(r.statusOf('GET /a')).toBe('FAIL');
  });

  it('separates accounting from success-path coverage', () => {
    const r = registry();
    // Security-only coverage: accounted for, but never actually exercised.
    r.record({ id: 's1', operation: 'GET /a', kind: 'anonymous', description: '', passed: true });
    r.record({ id: 's2', operation: 'POST /b', kind: 'anonymous', description: '', passed: true });
    expect(r.summary().accountingPercent).toBe(100);
    expect(r.summary().successPathPercent).toBe(0);
  });

  it('detects a scenario pointing at an operation the backend no longer exposes', () => {
    const r = registry();
    r.record({ id: 's', operation: 'GET /gone', kind: 'success', description: '', passed: true });
    expect(r.drift().unknownOperations).toEqual(['GET /gone']);
  });
});
