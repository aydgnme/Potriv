#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildFreshnessRecord, checkFreshness } from './freshness.js';
import { checkNvdPreflight } from './preflight.js';
import { validateReportContent } from './reportValidator.js';

/**
 * The exact entry point the GitHub Actions workflow invokes for each of
 * these gates — never a second, ad-hoc copy of the logic living in the
 * workflow's own `run:` blocks. Everything each subcommand does is exercised
 * by this package's own test suite against `preflight.ts`, `freshness.ts`
 * and `reportValidator.ts` directly; this file is only argument parsing,
 * environment/file plumbing, and the exit code.
 */

const DEFAULT_NVD_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1';

function readArg(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0 || index === args.length - 1) return undefined;
  return args[index + 1];
}

function readFileIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/** GitHub Actions' own annotation format — the same one the previous inline bash used. */
function fail(title: string, message: string): never {
  console.log(`::error title=${title}::${message}`);
  process.exit(1);
}

async function runPreflight(args: readonly string[]): Promise<void> {
  const baseUrl = readArg(args, '--base-url') ?? DEFAULT_NVD_BASE_URL;
  const timeoutMs = Number(readArg(args, '--timeout-ms') ?? '10000');
  const maxRetries = Number(readArg(args, '--max-retries') ?? '2');
  const retryDelayMs = Number(readArg(args, '--retry-delay-ms') ?? '2000');

  const result = await checkNvdPreflight({
    apiKey: process.env.NVD_API_KEY,
    baseUrl,
    timeoutMs,
    maxRetries,
    retryDelayMs,
  });

  if (!result.ok) {
    const guidance =
      result.reason === 'missing-key'
        ? 'Add the secret (free key: https://nvd.nist.gov/developers/request-an-api-key) and re-run.'
        : result.reason === 'unauthorized' || result.reason === 'forbidden'
          ? 'NVD_API_KEY is set but was not accepted. Request a fresh key and update the secret.'
          : 'This may be transient — re-run once NVD is reachable, or check the runner\'s network egress.';
    fail(
      'Dependency-Check preflight failed',
      `${result.detail} ${guidance} (reason: ${result.reason})`,
    );
  }
  console.log('NVD preflight passed: the API key is present and NVD is reachable.');
}

function runCheckFreshness(args: readonly string[]): void {
  const metadataPath = readArg(args, '--metadata');
  const maxAgeDays = Number(readArg(args, '--max-age-days') ?? '10');
  const cacheHit = readArg(args, '--cache-hit') === 'true';

  if (!metadataPath) {
    fail('Dependency-Check freshness check misconfigured', '--metadata path was not provided.');
  }

  const raw = readFileIfExists(metadataPath);
  const result = checkFreshness(raw, new Date(), maxAgeDays, cacheHit);

  if (!result.ok) {
    fail(
      'Dependency-Check cache freshness check failed',
      `${result.detail} Treating this as a failed run rather than trusting a possibly-stale `
        + `cache silently. (reason: ${result.reason})`,
    );
  }
  console.log(`NVD cache freshness check passed (${result.reason}).`);
}

function runValidateReport(args: readonly string[]): void {
  const reportPath = readArg(args, '--report');
  const maxCvss = Number(readArg(args, '--max-cvss') ?? '9');

  if (!reportPath) {
    fail('Dependency-Check report validation misconfigured', '--report path was not provided.');
  }

  const raw = readFileIfExists(reportPath);
  const result = validateReportContent(raw, maxCvss);

  if (!result.ok) {
    const findingsSuffix = result.findings ? ` Findings: ${result.findings.join('; ')}` : '';
    fail(
      'Dependency-Check report rejected',
      `${result.detail}${findingsSuffix} (reason: ${result.reason})`,
    );
  }
  console.log(`Dependency-Check report accepted: ${result.dependencyCount} dependencies scanned.`);
}

function runRecordFreshness(args: readonly string[]): void {
  const metadataPath = readArg(args, '--metadata');
  if (!metadataPath) {
    fail('Dependency-Check freshness recording misconfigured', '--metadata path was not provided.');
  }

  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, buildFreshnessRecord(new Date()), 'utf8');
  console.log(`Recorded a fresh verification timestamp at ${metadataPath}.`);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case 'preflight':
      await runPreflight(rest);
      return;
    case 'check-freshness':
      runCheckFreshness(rest);
      return;
    case 'validate-report':
      runValidateReport(rest);
      return;
    case 'record-freshness':
      runRecordFreshness(rest);
      return;
    default:
      console.error(
        `Unknown command "${command ?? ''}". Expected one of: `
          + 'preflight, check-freshness, validate-report, record-freshness.',
      );
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.log(`::error title=dependency-scan CLI crashed::${message}`);
  process.exit(1);
});
