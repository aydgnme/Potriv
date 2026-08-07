import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config/env.js';
import { ApiClient } from '../http/client.js';
import { buildInventory, fetchOpenApi, validateDocument } from '../openapi/inventory.js';
import { CoverageRegistry, INTENTIONAL_EXCLUSIONS } from '../openapi/registry.js';
import { buildWorld } from '../fixtures/build.js';
import { Prober } from '../scenarios/probe.js';
import { runSuccessScenarios } from '../scenarios/success.js';
import { runMailScenarios } from '../scenarios/mail.js';
import { runAdminConsoleScenarios } from '../scenarios/admin-console.js';
import {
  runCorrelationScenarios, runCorsScenarios, runMailResilienceProbe,
  runNotFoundScenarios, runOperationalScenarios, runPaginationScenarios,
  runValidationScenarios,
} from '../scenarios/contract.js';
import {
  runAnonymousMatrix, runIsolationMatrix, runPublicMatrix, runRoleMatrix,
} from '../security/matrices.js';
import { percentile, type Report, type Verdict } from '../report/model.js';
import { writeReports } from '../report/writers.js';
import { preflight } from './preflight.js';
import { TestEnvironment } from './environment.js';

/**
 * Exit codes — documented in README.md and relied on by CI.
 *   0  every required check passed
 *   1  a test, assertion or coverage gate failed
 *   2  the environment or preflight blocked the run
 */
const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_BLOCKED = 2;

const here = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(here, '../..');
const repoRoot = resolve(toolRoot, '../..');
const reportsDir = resolve(toolRoot, 'reports');

async function main(): Promise<number> {
  const config = loadConfig();
  const startedAt = new Date();
  const started = performance.now();

  console.log('Potriv API E2E');
  console.log(`Run:    ${config.runId}`);
  console.log(`Target: ${config.baseUrl}`);
  console.log(`Mode:   ${config.useExistingTarget ? 'existing target' : 'isolated environment'}`);
  console.log('');

  const checks = await preflight(config, repoRoot);
  for (const check of checks) {
    console.log(`  ${check.ok ? 'ok  ' : 'FAIL'}  ${check.name} — ${check.detail}`);
  }
  if (checks.some((check) => !check.ok)) {
    console.error('\nPreflight failed. Nothing was started.');
    return EXIT_BLOCKED;
  }
  console.log('');

  mkdirSync(reportsDir, { recursive: true });
  const backendLog = resolve(reportsDir, config.runId, 'backend.log');
  const environment = new TestEnvironment(config, repoRoot, backendLog);
  const client = new ApiClient(config);

  let registry: CoverageRegistry | null = null;
  let blockedReason: string | null = null;
  let adminSummary = { routesDiscovered: 0, routesExecuted: 0 };
  let openApiProblems: string[] = [];
  let operationCount = 0;

  try {
    if (!config.useExistingTarget) {
      console.log('Starting isolated Postgres + Mailpit…');
      await environment.startServices();
      console.log('Starting backend…');
      await environment.startBackend();
      await environment.waitForReadiness();
      console.log('Backend ready.\n');
    }

    const document = await fetchOpenApi(client);
    const operations = buildInventory(document);
    operationCount = operations.length;
    openApiProblems = validateDocument(document, operations);
    registry = new CoverageRegistry(operations);
    const prober = new Prober(client, registry);
    console.log(`OpenAPI operations: ${operations.length}\n`);

    console.log('Building fixtures…');
    const context = await buildWorld(client, config.runId);

    console.log('Success paths…');
    await runSuccessScenarios(client, prober, context);
    console.log('Password-reset mail…');
    await runMailScenarios(client, prober, context, config);
    console.log('Validation, not-found, pagination…');
    await runValidationScenarios(prober, context);
    await runNotFoundScenarios(prober, context);
    await runPaginationScenarios(prober, context);
    console.log('Security matrices…');
    await runPublicMatrix(prober, operations, context);
    await runAnonymousMatrix(prober, operations, context);
    await runRoleMatrix(prober, context);
    await runIsolationMatrix(prober, context);
    console.log('Operational endpoints…');
    await runOperationalScenarios(client, prober, config);
    await runCorrelationScenarios(client, prober);
    await runCorsScenarios(client, prober);
    if (!config.useExistingTarget) {
      await runMailResilienceProbe(
        client, prober,
        () => environment.stopMail(), () => environment.startMail(),
      );
    }
    console.log('Admin console…');
    adminSummary = await runAdminConsoleScenarios(client, prober, context);
  } catch (error) {
    blockedReason = error instanceof Error ? error.message : String(error);
    console.error(`\nRun blocked: ${blockedReason}`);
  } finally {
    if (config.keepEnvironment) {
      console.log('\nE2E_KEEP_ENV=true — leaving the isolated environment running.');
    } else if (!config.useExistingTarget) {
      console.log('\nTearing down the isolated environment…');
      await environment.teardown();
    }
  }

  const finishedAt = new Date();
  const durationMs = Math.round(performance.now() - started);
  const summary = registry?.summary() ?? {
    operations: operationCount, PASS: 0, FAIL: 0, INTENTIONALLY_EXCLUDED: 0,
    BLOCKED: operationCount, accountingPercent: 0, successPathPercent: 0,
    scenarios: 0, scenariosPassed: 0, scenariosFailed: 0,
  };
  const scenarios = registry?.all ?? [];
  const failures = registry?.failures ?? [];
  const drift = registry?.drift() ?? { untested: [], unknownOperations: [], staleExclusions: [] };
  const unexpectedServerErrors = failures.filter((f) => f.message?.startsWith('SERVER ERROR')).length;

  const verdict: Verdict = blockedReason
    ? 'BLOCKED — ENVIRONMENT COULD NOT COMPLETE'
    : failures.length > 0 || drift.untested.length > 0 || drift.unknownOperations.length > 0
      ? 'NOT READY — ENDPOINT OR SECURITY FAILURES REMAIN'
      : INTENTIONAL_EXCLUSIONS.length > 0
        ? 'READY WITH EXPLICIT ACCEPTED GAPS'
        : 'READY — ALL IN-SCOPE ENDPOINTS VERIFIED';

  const timings = client.requestTimings.map((t) => t.ms);
  const report: Report = {
    schemaVersion: 1,
    runId: config.runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    gitSha: gitSha(),
    target: config.baseUrl,
    environment: config.useExistingTarget ? 'existing' : 'isolated',
    verdict,
    coverage: summary,
    reconciliation: {
      sourceMappings: null,
      openApiOperations: operationCount,
      adminRoutesDiscovered: adminSummary.routesDiscovered,
      adminRoutesExecuted: adminSummary.routesExecuted,
      notes: [
        'Admin console routes serve HTML behind a session login and are absent from '
          + 'OpenAPI by design; they are counted separately.',
        'Actuator and Swagger routes are infrastructure, not product operations, and are '
          + 'probed under operational checks rather than the REST registry.',
        ...(blockedReason ? [`Run blocked: ${blockedReason}`] : []),
      ],
    },
    security: {
      anonymous: countKind(scenarios, 'anonymous'),
      role: countKind(scenarios, 'role'),
      isolation: countKind(scenarios, 'isolation'),
      validation: {
        passed: countKind(scenarios, 'validation').passed + countKind(scenarios, 'notfound').passed,
        failed: countKind(scenarios, 'validation').failed + countKind(scenarios, 'notfound').failed,
      },
    },
    drift,
    openApiProblems,
    operations: registry?.operationRows() ?? [],
    scenarios,
    failures,
    performance: {
      requests: timings.length,
      medianMs: percentile(timings, 50),
      p95Ms: percentile(timings, 95),
      maxMs: timings.length ? Math.max(...timings) : 0,
      slowest: [...client.requestTimings].sort((a, b) => b.ms - a.ms).slice(0, 10),
    },
    unexpectedServerErrors,
    preflight: checks,
  };

  const runDir = writeReports(report, reportsDir);

  console.log('');
  for (const failure of failures.slice(0, 15)) {
    console.log(`FAIL  ${failure.method ?? ''} ${failure.path ?? failure.id}`);
    console.log(`      ${failure.message ?? 'assertion failed'}`
      + (failure.requestId ? `, req=${failure.requestId}` : ''));
  }
  console.log('');
  console.log(`Operations:  ${summary.PASS + summary.FAIL}/${summary.operations} executed, `
    + `accounting ${summary.accountingPercent}%, success path ${summary.successPathPercent}%`);
  console.log(`Scenarios:   ${summary.scenariosPassed} passed / ${summary.scenariosFailed} failed`);
  // Spelled out rather than "executed/discovered": the two numbers count
  // different things and a slash implies a ratio, so 15/14 read like a bug.
  console.log(`Admin routes: ${adminSummary.routesDiscovered} discovered, `
    + `${adminSummary.routesExecuted} checks executed`);
  console.log(`Result:      ${verdict}`);
  console.log(`Report:      ${runDir}/report.html`);

  if (blockedReason) return EXIT_BLOCKED;
  return verdict.startsWith('READY') ? EXIT_OK : EXIT_FAILED;
}

function countKind(
  scenarios: ReadonlyArray<{ kind: string; passed: boolean }>, kind: string,
): { passed: number; failed: number } {
  const of = scenarios.filter((s) => s.kind === kind);
  return { passed: of.filter((s) => s.passed).length, failed: of.filter((s) => !s.passed).length };
}

function gitSha(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

process.exitCode = await main();
