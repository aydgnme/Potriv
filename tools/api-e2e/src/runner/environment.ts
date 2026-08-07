import { spawn, type ChildProcess } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { promisify } from 'node:util';

import type { Config } from '../config/env.js';
import { DATABASE_PASSWORD, SYSTEM_ADMIN_PASSWORD } from '../config/credentials.js';
import { SYSTEM_ADMIN_EMAIL } from '../fixtures/context.js';

const run = promisify(execFile);

export const COMPOSE_PROJECT = 'potriv-api-e2e';

/**
 * Brings up an isolated Postgres + Mailpit and a backend pointed at them.
 *
 * Everything is namespaced by the Compose project name and torn down again, so
 * a developer's normal stack is never touched — this suite creates and deletes
 * data and must own everything it talks to.
 */
export class TestEnvironment {
  private backend: ChildProcess | null = null;
  private composeUp = false;

  constructor(
    private readonly config: Config,
    private readonly repoRoot: string,
    private readonly logPath: string,
  ) {}

  private compose(...args: string[]): string[] {
    return ['compose', '-p', COMPOSE_PROJECT, '-f',
      `${this.repoRoot}/tools/api-e2e/docker-compose.e2e.yml`, ...args];
  }

  private composeEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      E2E_DB_PORT: String(this.config.dbPort),
      E2E_SMTP_PORT: String(this.config.smtpPort),
      E2E_MAIL_HTTP_PORT: String(new URL(this.config.mailApiUrl).port),
      E2E_DB_PASSWORD: DATABASE_PASSWORD,
    };
  }

  async startServices(): Promise<void> {
    await run('docker', this.compose('up', '-d', '--wait'), {
      env: this.composeEnv(),
      maxBuffer: 8 * 1024 * 1024,
    });
    this.composeUp = true;
  }

  /**
   * Starts the backend with the dev profile pointed at the isolated services.
   * Deterministic bootstrap credentials are local-only and never leave this run.
   */
  async startBackend(): Promise<void> {
    mkdirSync(this.logPath.replace(/\/[^/]+$/, ''), { recursive: true });
    const logFile = createWriteStream(this.logPath, { flags: 'a' });

    this.backend = spawn(
      './mvnw',
      ['-q', 'spring-boot:run'],
      {
        cwd: `${this.repoRoot}/apps/backend`,
        env: {
          ...process.env,
          SPRING_PROFILES_ACTIVE: 'dev',
          SERVER_PORT: String(this.config.backendPort),
          SPRING_DATASOURCE_URL:
            `jdbc:postgresql://127.0.0.1:${this.config.dbPort}/potriv_e2e`,
          SPRING_DATASOURCE_USERNAME: 'potriv_e2e',
          SPRING_DATASOURCE_PASSWORD: DATABASE_PASSWORD,
          SPRING_MAIL_HOST: '127.0.0.1',
          SPRING_MAIL_PORT: String(this.config.smtpPort),
          // The embedded console is part of the surface under test.
          BACKEND_CONSOLE_ENABLED: process.env.E2E_CONSOLE_ENABLED ?? 'true',
          SYSTEM_ADMIN_EMAIL,
          SYSTEM_ADMIN_PASSWORD,
          SYSTEM_ADMIN_NAME: 'E2E System Admin',
          // A fresh disposable database: let Hibernate build it, no Flyway needed.
          SPRING_JPA_HIBERNATE_DDL_AUTO: 'update',
          POTRIV_DEV_SCHEMA_DRIFT_ENABLED: 'false',
          // The readiness group is declared only in application-prod.yml, so the
          // dev profile has no /actuator/health/readiness. Recreate production's
          // shape here — as an environment override, never a source change — so
          // the suite exercises the contract the container probe actually uses.
          MANAGEMENT_ENDPOINT_HEALTH_GROUP_READINESS_INCLUDE: 'db,ping',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    this.backend.stdout?.pipe(logFile);
    this.backend.stderr?.pipe(logFile);
  }

  /** Polls readiness rather than sleeping. */
  async waitForReadiness(timeoutMs = 180_000): Promise<void> {
    const url = `${this.config.baseUrl}/actuator/health/readiness`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.backend?.exitCode !== null && this.backend?.exitCode !== undefined) {
        throw new Error(`backend exited early with code ${this.backend.exitCode}`);
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (response.ok) return;
      } catch {
        // not up yet
      }
      await delay(2000);
    }
    throw new Error(`backend did not become ready within ${timeoutMs}ms`);
  }

  async stopMail(): Promise<void> {
    await run('docker', this.compose('stop', 'e2e-mail'), { env: this.composeEnv() });
  }

  async startMail(): Promise<void> {
    await run('docker', this.compose('start', 'e2e-mail'), { env: this.composeEnv() });
  }

  /** Stops only what this run created. Never a broad prune. */
  async teardown(): Promise<void> {
    if (this.backend && this.backend.exitCode === null) {
      this.backend.kill('SIGTERM');
      await delay(2000);
      if (this.backend.exitCode === null) this.backend.kill('SIGKILL');
    }
    if (this.composeUp) {
      await run('docker', this.compose('down', '-v', '--remove-orphans'), {
        env: this.composeEnv(),
      }).catch(() => undefined);
    }
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
