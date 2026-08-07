import { mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';

import { redactText } from '../http/redaction.js';
import type { Report } from './model.js';

/** Every writer consumes the same already-redacted report object. */
export function writeReports(report: Report, reportsDir: string): string {
  const runDir = join(reportsDir, report.runId);
  mkdirSync(runDir, { recursive: true });

  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(runDir, 'endpoints.json'), JSON.stringify(report.operations, null, 2));
  writeFileSync(join(runDir, 'failures.json'), JSON.stringify(report.failures, null, 2));
  writeFileSync(join(runDir, 'report.md'), markdown(report));
  writeFileSync(join(runDir, 'report.html'), html(report));
  writeFileSync(join(runDir, 'junit.xml'), junit(report));

  const latest = join(reportsDir, 'latest');
  rmSync(latest, { recursive: true, force: true });
  cpSync(runDir, latest, { recursive: true });
  return runDir;
}

function markdown(report: Report): string {
  const c = report.coverage;
  const s = report.security;
  const lines: string[] = [];
  lines.push('# Potriv API E2E Report', '');
  lines.push(`Run ID: \`${report.runId}\``);
  lines.push(`Timestamp: ${report.startedAt}`);
  lines.push(`Git SHA: ${report.gitSha ?? 'unknown'}`);
  lines.push(`Backend: ${report.target}`);
  lines.push(`Environment: ${report.environment}`);
  lines.push(`Duration: ${(report.durationMs / 1000).toFixed(1)}s`, '');
  lines.push('## Executive result', '', `**${report.verdict}**`, '');

  lines.push('## Coverage', '');
  lines.push('| Measure | Value |', '| --- | --- |');
  lines.push(`| OpenAPI operations discovered | ${c.operations} |`);
  lines.push(`| Operations passed | ${c.PASS} |`);
  lines.push(`| Operations failed | ${c.FAIL} |`);
  lines.push(`| Operations excluded | ${c.INTENTIONALLY_EXCLUDED} |`);
  lines.push(`| Operations with no execution (BLOCKED) | ${c.BLOCKED} |`);
  lines.push(`| **Operation accounting** | **${c.accountingPercent}%** |`);
  lines.push(`| **Success-path execution** | **${c.successPathPercent}%** |`);
  lines.push(`| Scenarios run | ${c.scenarios} (${c.scenariosFailed} failed) |`);
  lines.push(`| Admin console routes | ${report.reconciliation.adminRoutesExecuted}/${report.reconciliation.adminRoutesDiscovered} |`, '');

  lines.push('## Source / OpenAPI reconciliation', '');
  lines.push(`- Source mappings discovered: ${report.reconciliation.sourceMappings ?? 'not counted'}`);
  lines.push(`- OpenAPI operations discovered: ${report.reconciliation.openApiOperations}`);
  for (const note of report.reconciliation.notes) lines.push(`- ${note}`);
  lines.push('');

  lines.push('## Security', '');
  lines.push('| Matrix | Passed | Failed |', '| --- | --- | --- |');
  lines.push(`| Anonymous auth | ${s.anonymous.passed} | ${s.anonymous.failed} |`);
  lines.push(`| Role boundaries | ${s.role.passed} | ${s.role.failed} |`);
  lines.push(`| Cross-organization isolation | ${s.isolation.passed} | ${s.isolation.failed} |`);
  lines.push(`| Validation / not-found | ${s.validation.passed} | ${s.validation.failed} |`);
  lines.push('', `Unexpected 5xx responses: **${report.unexpectedServerErrors}**`, '');

  lines.push('## Endpoint table', '');
  lines.push('| METHOD | PATH | SUCCESS | ANON | ROLE | VALID | ISO | RESULT | ms |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const op of report.operations) {
    lines.push(`| ${op.method} | \`${op.path}\` | ${tick(op.success)} | ${tick(op.anonymous)} | `
      + `${tick(op.role)} | ${tick(op.validation)} | ${tick(op.isolation)} | ${op.status} | `
      + `${op.latencyMs ?? '-'} |`);
  }
  lines.push('');

  lines.push('## Failures', '');
  if (report.failures.length === 0) {
    lines.push('None.', '');
  } else {
    for (const failure of report.failures) {
      lines.push(`### ${failure.id}`);
      lines.push('```text');
      lines.push(`operation : ${failure.method ?? '-'} ${failure.path ?? '-'}`);
      lines.push(`actor     : ${failure.actor ?? '-'}`);
      lines.push(`expected  : ${failure.expected ?? '-'}`);
      lines.push(`actual    : ${failure.actual ?? '-'}`);
      lines.push(`elapsed   : ${failure.elapsedMs ?? '-'} ms`);
      lines.push(`requestId : ${failure.requestId ?? '-'}`);
      lines.push(`request   : ${redactText(failure.requestSummary ?? '')}`);
      lines.push(`response  : ${redactText(failure.responseSummary ?? '')}`);
      lines.push(`message   : ${failure.message ?? '-'}`);
      lines.push('```', '');
    }
  }

  lines.push('## Slowest operations', '');
  lines.push('| METHOD | PATH | ms |', '| --- | --- | --- |');
  for (const entry of report.performance.slowest) {
    lines.push(`| ${entry.method} | \`${entry.path}\` | ${entry.ms} |`);
  }
  lines.push('', `median ${report.performance.medianMs}ms · p95 ${report.performance.p95Ms}ms `
    + `· max ${report.performance.maxMs}ms · ${report.performance.requests} requests`, '');

  lines.push('## Coverage drift', '');
  const d = report.drift;
  lines.push(`- Operations with no registered execution: ${d.untested.length}`);
  for (const key of d.untested) lines.push(`  - \`${key}\``);
  lines.push(`- Scenarios pointing at unknown operations: ${d.unknownOperations.length}`);
  for (const key of d.unknownOperations) lines.push(`  - \`${key}\``);
  lines.push(`- Stale exclusions: ${d.staleExclusions.length}`, '');

  if (report.openApiProblems.length) {
    lines.push('## OpenAPI structural notes', '');
    for (const problem of report.openApiProblems) lines.push(`- ${problem}`);
    lines.push('');
  }

  lines.push('## Verdict', '', `**${report.verdict}**`, '');
  return lines.join('\n');
}

function tick(value: boolean): string {
  return value ? '✓' : '·';
}

function html(report: Report): string {
  const rows = report.operations.map((op) => `<tr class="${op.status.toLowerCase()}">
    <td>${op.method}</td><td><code>${escape(op.path)}</code></td>
    <td>${tick(op.success)}</td><td>${tick(op.anonymous)}</td><td>${tick(op.role)}</td>
    <td>${tick(op.validation)}</td><td>${tick(op.isolation)}</td>
    <td><span class="badge">${op.status}</span></td><td class="num">${op.latencyMs ?? '-'}</td>
  </tr>`).join('\n');

  const failures = report.failures.map((f) => `<details><summary>${escape(f.id)}</summary>
    <pre>${escape([
      `operation : ${f.method ?? '-'} ${f.path ?? '-'}`,
      `actor     : ${f.actor ?? '-'}`,
      `expected  : ${f.expected ?? '-'}`,
      `actual    : ${f.actual ?? '-'}`,
      `requestId : ${f.requestId ?? '-'}`,
      `request   : ${redactText(f.requestSummary ?? '')}`,
      `response  : ${redactText(f.responseSummary ?? '')}`,
      `message   : ${f.message ?? '-'}`,
    ].join('\n'))}</pre></details>`).join('\n') || '<p>None.</p>';

  const c = report.coverage;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Potriv API E2E — ${report.runId}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px;
         max-width: 1100px; margin-inline: auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12.5px; margin-bottom: 20px; }
  .verdict { display: inline-block; padding: 8px 14px; border-radius: 6px; font-weight: 600;
             background: ${report.verdict.startsWith('READY') ? '#e7f6ec' : '#fdecea'};
             color: ${report.verdict.startsWith('READY') ? '#1b5e20' : '#a12b22'}; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin: 12px 0 24px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em;
       color: #666; border-bottom: 1px solid #ddd; padding: 6px 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  tr.pass .badge { background: #e7f6ec; color: #1b5e20; }
  tr.fail .badge { background: #fdecea; color: #a12b22; }
  tr.blocked .badge { background: #fff6e0; color: #8a6100; }
  tr.intentionally_excluded .badge { background: #eee; color: #666; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 12px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; }
  .card b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
  .card span { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  pre { background: #f6f6f6; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  @media (prefers-color-scheme: dark) {
    body { background:#121212; color:#e6e6e6 } th,td{border-color:#333} pre{background:#1c1c1c}
    .card{border-color:#333} .meta,.card span{color:#999}
  }
</style></head><body>
<h1>Potriv API E2E</h1>
<div class="meta">${escape(report.runId)} · ${escape(report.startedAt)} ·
  ${escape(report.target)} · ${(report.durationMs / 1000).toFixed(1)}s ·
  git ${escape(report.gitSha ?? 'unknown')}</div>
<p class="verdict">${escape(report.verdict)}</p>
<div class="cards">
  <div class="card"><b>${c.operations}</b><span>operations</span></div>
  <div class="card"><b>${c.accountingPercent}%</b><span>accounting</span></div>
  <div class="card"><b>${c.successPathPercent}%</b><span>success path</span></div>
  <div class="card"><b>${c.scenariosFailed}</b><span>failed scenarios</span></div>
  <div class="card"><b>${report.unexpectedServerErrors}</b><span>unexpected 5xx</span></div>
</div>
<h2>Endpoints</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Success</th><th>Anon</th><th>Role</th>
<th>Valid</th><th>Iso</th><th>Result</th><th>ms</th></tr></thead><tbody>
${rows}
</tbody></table>
<h2>Failures</h2>
${failures}
</body></html>`;
}

function junit(report: Report): string {
  const cases = report.scenarios.map((scenario) => {
    const name = escape(scenario.id);
    const classname = escape(scenario.kind);
    if (scenario.passed) return `    <testcase classname="${classname}" name="${name}"/>`;
    const message = escape(
      `${scenario.message ?? 'assertion failed'} (expected ${scenario.expected ?? '-'}, `
      + `got ${scenario.actual ?? '-'}, requestId ${scenario.requestId ?? '-'})`,
    );
    return `    <testcase classname="${classname}" name="${name}">\n`
      + `      <failure message="${message}"/>\n    </testcase>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="potriv-api-e2e" tests="${report.scenarios.length}" `
    + `failures="${report.failures.length}" time="${(report.durationMs / 1000).toFixed(3)}">
${cases}
  </testsuite>
</testsuites>
`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
