import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import { assertTargetIsSafe, isLocalTarget, type Config } from '../config/env.js';

const run = promisify(execFile);

export type PreflightCheck = { name: string; ok: boolean; detail: string };

/**
 * Everything that must be true before a single request is sent. Failing here
 * produces a report, not a stack trace.
 */
export async function preflight(config: Config, repoRoot: string): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];

  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({
    name: 'node >= 20',
    ok: major >= 20,
    detail: `node ${process.versions.node}`,
  });

  checks.push(await command('docker', ['--version']));
  checks.push(await command('docker', ['compose', 'version']));

  checks.push({
    name: 'repo root detected',
    ok: existsSync(`${repoRoot}/apps/backend/pom.xml`),
    detail: repoRoot,
  });

  if (!config.useExistingTarget) {
    checks.push(await command('java', ['-version']));
    checks.push({
      name: 'maven wrapper',
      ok: existsSync(`${repoRoot}/apps/backend/mvnw`),
      detail: `${repoRoot}/apps/backend/mvnw`,
    });
    for (const [label, port] of [
      ['backend', config.backendPort],
      ['postgres', config.dbPort],
      ['mailpit smtp', config.smtpPort],
    ] as const) {
      const free = await portIsFree(port);
      checks.push({
        name: `port ${port} (${label}) available`,
        ok: free,
        detail: free ? 'free' : 'in use — set a different E2E_* port',
      });
    }
  }

  let targetDetail = `${config.baseUrl} (${isLocalTarget(config.host) ? 'local' : 'REMOTE'})`;
  let targetOk = true;
  try {
    assertTargetIsSafe(config);
  } catch (error) {
    targetOk = false;
    targetDetail = error instanceof Error ? error.message : String(error);
  }
  checks.push({ name: 'target allowed by safety guard', ok: targetOk, detail: targetDetail });

  return checks;
}

async function command(bin: string, args: string[]): Promise<PreflightCheck> {
  try {
    const { stdout, stderr } = await run(bin, args);
    return { name: `${bin} available`, ok: true, detail: (stdout || stderr).split('\n')[0] ?? '' };
  } catch {
    return { name: `${bin} available`, ok: false, detail: 'not found on PATH' };
  }
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
