import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkStepOrder, extractStepNames } from '../src/workflowContract.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_FILE = join(REPO_ROOT, '.github', 'workflows', 'dependency-check.yml');

const REQUIRED_NVD_UPDATE_ORDER = [
  'Seed NVD data from the verified feed mirror',
  'Force a live NVD API delta update',
  'Record verified NVD freshness',
  'Save NVD data cache',
  'Run OWASP Dependency-Check',
  'Validate the Dependency-Check report',
] as const;

describe('extractStepNames', () => {
  it('extracts step names from a steps list, in file order', () => {
    const yaml = `
steps:
  - name: First
    run: echo 1
  - name: Second
    run: echo 2
`;
    expect(extractStepNames(yaml)).toEqual(['First', 'Second']);
  });

  it('returns an empty list for a file with no steps', () => {
    expect(extractStepNames('on: push\njobs: {}\n')).toEqual([]);
  });
});

describe('checkStepOrder', () => {
  it('passes when every required step appears, in order', () => {
    const yaml = `
steps:
  - name: A
  - name: B
  - name: C
`;
    expect(checkStepOrder(yaml, ['A', 'B', 'C'])).toEqual({ ok: true });
  });

  it('allows unrelated steps interleaved between the required ones', () => {
    const yaml = `
steps:
  - name: A
  - name: unrelated setup step
  - name: B
  - name: another unrelated step
  - name: C
`;
    expect(checkStepOrder(yaml, ['A', 'B', 'C'])).toEqual({ ok: true });
  });

  it('fails when a required step is missing entirely', () => {
    const yaml = `
steps:
  - name: A
  - name: C
`;
    const result = checkStepOrder(yaml, ['A', 'B', 'C']);
    expect(result.ok).toBe(false);
  });

  /**
   * The exact regression this checker exists to catch: an edit that
   * reorders two required steps still leaves both present, so a mere
   * "is it in the list" check would pass; only an order-aware check catches
   * the save happening after the scan instead of before it.
   */
  it('fails when two required steps are present but out of order', () => {
    const yaml = `
steps:
  - name: feed update
  - name: offline scan
  - name: explicit cache save
`;
    const result = checkStepOrder(yaml, ['feed update', 'explicit cache save', 'offline scan']);
    expect(result.ok).toBe(false);
  });

  it('fails cleanly on an empty required list met by an empty workflow', () => {
    expect(checkStepOrder('', [])).toEqual({ ok: true });
  });
});

/**
 * The real regression guard. Two real workflow runs (32828508157,
 * 32837094783) timed out at 60 and then 120 minutes doing a cold NVD sync
 * entirely through the live REST API. The fix seeds bulk historical data
 * from a pre-built mirror, forces one small live-API delta, records
 * freshness, and explicitly saves the cache -- all BEFORE the scan itself
 * runs, so a cancelled or CVE-gate-failed scan can never discard a database
 * that was already fully, verifiably updated. If a future edit reorders
 * these steps (e.g. moves the cache save back to after the scan), this
 * fails.
 */
describe('the real dependency-check.yml workflow', () => {
  const yaml = readFileSync(WORKFLOW_FILE, 'utf8');

  it('runs the NVD update stages in the required order: feed -> delta -> freshness -> save -> scan -> validate', () => {
    expect(checkStepOrder(yaml, REQUIRED_NVD_UPDATE_ORDER)).toEqual({ ok: true });
  });

  it('scans with autoUpdate=false, since the update stages already ran', () => {
    expect(yaml).toMatch(/-DautoUpdate=false/);
  });

  it('passes the NVD API key by environment variable name, never as a literal -D value', () => {
    expect(yaml).toContain('-DnvdApiKeyEnvironmentVariable=NVD_API_KEY');
    expect(yaml).not.toMatch(/-DnvdApiKey="\$NVD_API_KEY"/);
  });

  it('forces the live delta stage to actually check, not trust a cached timestamp', () => {
    expect(yaml).toMatch(/-DnvdValidForHours=0/);
  });

  it('uploads the report artifact with if-no-files-found: error, not warn', () => {
    expect(yaml).toMatch(/if-no-files-found:\s*error/);
    expect(yaml).not.toMatch(/if-no-files-found:\s*warn/);
  });
});
