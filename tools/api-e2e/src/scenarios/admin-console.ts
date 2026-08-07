import type { ApiClient } from '../http/client.js';
import { SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD, type RunContext } from '../fixtures/context.js';
import { Prober } from './probe.js';

/**
 * The embedded admin console: HTML pages behind a session login, not REST.
 *
 * Counted and reported separately from the OpenAPI operations — pretending an
 * HTML page is a JSON endpoint would corrupt the REST accounting. No visual
 * assertions: this is endpoint automation, not snapshot testing.
 */

/** GET pages the console exposes. Kept in source so drift is reviewable. */
export const ADMIN_PAGES: readonly string[] = [
  '/admin',
  '/admin/users',
  '/admin/organizations',
  '/admin/departments',
  '/admin/projects',
  '/admin/allocations',
  '/admin/invitations',
  '/admin/skills',
  '/admin/skill-categories',
  '/admin/audit-logs',
  '/admin/monitor',
];

export type AdminConsoleSummary = {
  readonly routesDiscovered: number;
  readonly routesExecuted: number;
};

export async function runAdminConsoleScenarios(
  client: ApiClient, prober: Prober, ctx: RunContext,
): Promise<AdminConsoleSummary> {
  let executed = 0;

  // Anonymous must be redirected to the login page, never served content.
  const anonymous = await client.get('/admin/users', { accept: 'text/html' });
  prober.record({
    id: 'admin:anonymous-redirected', kind: 'admin',
    description: 'anonymous access to a console page is redirected, not served',
    passed: anonymous.status >= 300 && anonymous.status < 400,
    expected: '3xx', actual: String(anonymous.status),
  });
  executed += 1;

  const loginPage = await client.get('/admin/login', { accept: 'text/html' });
  prober.record({
    id: 'admin:login-page', kind: 'admin', description: 'the login page is anonymous',
    passed: loginPage.status === 200, expected: '200', actual: String(loginPage.status),
  });
  executed += 1;

  const session = await signIn(client, SYSTEM_ADMIN_EMAIL, SYSTEM_ADMIN_PASSWORD);
  prober.record({
    id: 'admin:system-admin-can-sign-in', kind: 'admin',
    description: 'a SYSTEM_ADMIN establishes a console session',
    passed: Boolean(session), actual: session ? 'session established' : 'no session cookie',
  });

  // A non-SYSTEM_ADMIN must not be able to authenticate into the console at all.
  const rejected = await signIn(client, ctx.orgA.admin.email, ctx.orgA.admin.password);
  prober.record({
    id: 'admin:non-system-admin-rejected', kind: 'admin',
    description: 'an organization admin cannot authenticate into the console',
    passed: rejected === null,
    actual: rejected ? 'session established — privilege boundary broken' : 'refused',
  });
  executed += 1;

  if (!session) {
    return { routesDiscovered: ADMIN_PAGES.length + 2, routesExecuted: executed };
  }

  const actor = { name: 'systemAdminConsole', role: 'SYSTEM_ADMIN', cookies: session };
  for (const page of ADMIN_PAGES) {
    const response = await client.get(page, { actor, accept: 'text/html' });
    executed += 1;
    prober.record({
      id: `admin:page:${page}`, kind: 'admin', description: `GET ${page} renders`,
      passed: response.status === 200,
      expected: '200', actual: String(response.status),
      elapsedMs: response.elapsedMs, requestId: response.requestId,
      message: response.status === 200 ? undefined
        : `console page did not render (HTTP ${response.status})`,
    });
    if (response.status === 200) {
      prober.record({
        id: `admin:page:${page}:no-secrets`, kind: 'admin',
        description: 'the rendered page carries no hash, token or stack trace',
        passed: !/\$2[ab]\$|eyJ[A-Za-z0-9]|at me\.aydgn\.potriv/.test(response.text),
      });
    }
  }

  // A mutation without a CSRF token must be refused by the session chain.
  const noCsrf = await client.post(`/admin/users/${ctx.orgA.employee.userId}/suspend`, { actor });
  prober.record({
    id: 'admin:mutation-requires-csrf', kind: 'admin',
    description: 'a console mutation without a CSRF token is refused',
    passed: noCsrf.status === 403, expected: '403', actual: String(noCsrf.status),
  });
  executed += 1;

  return { routesDiscovered: ADMIN_PAGES.length + 3, routesExecuted: executed };
}

/**
 * Performs the real form login and returns the session cookie, or null.
 *
 * The console chain has CSRF enabled, so this fetches the login page first, reads
 * the token out of the form and posts with the page's own session — the same
 * three steps a browser performs.
 *
 * A cookie alone proves nothing: Spring issues a session for a *failed* login
 * too, and redirects to `?error`. Success is the redirect target, not the cookie.
 */
async function signIn(client: ApiClient, username: string, password: string): Promise<string | null> {
  const page = await client.get('/admin/login', { accept: 'text/html' });
  const pageCookie = /JSESSIONID=[^;]+/.exec(page.setCookie ?? '')?.[0];
  const csrf = /name="_csrf"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="_csrf"/
    .exec(page.text);
  const token = csrf?.[1] ?? csrf?.[2];
  if (!token || !pageCookie) return null;

  const response = await client.post('/admin/login', {
    form: { username, password, _csrf: token },
    accept: 'text/html',
    actor: { name: 'adminLogin', role: 'ANONYMOUS', cookies: pageCookie },
  });

  const location = response.headers.location ?? '';
  if (response.status !== 302 || location.includes('error')) return null;
  // Session fixation protection issues a new session on success.
  return /JSESSIONID=[^;]+/.exec(response.setCookie ?? '')?.[0] ?? pageCookie;
}
