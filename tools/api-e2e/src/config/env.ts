import { randomBytes } from 'node:crypto';

/**
 * Suite configuration and the safety guard.
 *
 * The guard exists because `API_BASE_URL` is one environment variable away from
 * pointing at something real. Changing it must never be sufficient to run
 * destructive automation somewhere that matters.
 */

export type Config = {
  readonly baseUrl: string;
  readonly host: string;
  readonly mailApiUrl: string;
  readonly backendPort: number;
  readonly dbPort: number;
  readonly smtpPort: number;
  readonly requestTimeoutMs: number;
  readonly keepEnvironment: boolean;
  readonly useExistingTarget: boolean;
  readonly runId: string;
  readonly allowRemote: boolean;
  readonly allowDestructiveRemote: boolean;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function bool(name: string): boolean {
  return process.env[name] === 'true';
}

/** `qaapi-<utc-compact>-<random>` — stamped into every resource this run creates. */
export function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `qaapi-${stamp}-${randomBytes(3).toString('hex')}`;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): Config {
  const backendPort = num('E2E_BACKEND_PORT', 18080);
  const baseUrl = (process.env.API_BASE_URL ?? `http://127.0.0.1:${backendPort}/api`)
    .replace(/\/+$/, '');

  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`API_BASE_URL is not a valid URL: "${baseUrl}"`);
  }

  const mailHttpPort = num('E2E_MAIL_HTTP_PORT', 18025);
  return {
    baseUrl,
    host,
    mailApiUrl: process.env.E2E_MAIL_API_URL ?? `http://127.0.0.1:${mailHttpPort}`,
    backendPort,
    dbPort: num('E2E_DB_PORT', 55432),
    smtpPort: num('E2E_SMTP_PORT', 11025),
    requestTimeoutMs: num('E2E_REQUEST_TIMEOUT_MS', 10_000),
    keepEnvironment: bool('E2E_KEEP_ENV'),
    useExistingTarget: argv.includes('--existing'),
    runId: newRunId(),
    allowRemote: bool('E2E_ALLOW_REMOTE'),
    allowDestructiveRemote: bool('E2E_ALLOW_DESTRUCTIVE_REMOTE'),
  };
}

export function isLocalTarget(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

/**
 * Refuses to run destructive automation anywhere it was not explicitly told to.
 * Two separate opt-ins: reaching a remote host at all, and mutating it.
 */
export function assertTargetIsSafe(config: Config): void {
  if (isLocalTarget(config.host)) return;

  if (!config.allowRemote) {
    throw new Error(
      `Refusing to run against non-local host "${config.host}".\n` +
        'This suite creates and deletes data. Set E2E_ALLOW_REMOTE=true only if you\n' +
        'are certain the target is disposable.',
    );
  }
  if (!config.allowDestructiveRemote) {
    throw new Error(
      `Remote target "${config.host}" is allowed, but mutating scenarios are not.\n` +
        'Set E2E_ALLOW_DESTRUCTIVE_REMOTE=true to permit them.',
    );
  }
}
