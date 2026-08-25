import { expect, test, type Page } from "@playwright/test";

/**
 * The security headers, as a browser actually receives and enforces them.
 *
 * Everything here runs against `next build && next start`. That matters more
 * than it looks: the development server needs `'unsafe-eval'` for React
 * Refresh, so a CSP suite pointed at `next dev` would assert a policy that is
 * never served to anybody, and would keep passing after the production branch
 * broke.
 *
 * The tokens in the fragments below are obvious fakes. They are there because
 * the pages behave differently with and without one — the scrub path only runs
 * when there is something to scrub — and a page that hydrates cleanly with an
 * empty fragment tells us nothing about the page a real recipient loads.
 */

/** Exactly the routes the review named. */
const SENSITIVE_ROUTES = [
  "/invite",
  "/reset-password",
  "/forgot-password",
  "/login",
  "/create-workspace",
  "/create-workspace/verify",
] as const;

/** Fragments the token-bearing pages are reached with in the wild. */
const FRAGMENT: Partial<Record<(typeof SENSITIVE_ROUTES)[number], string>> = {
  "/invite": "#token=playwright-fake-invite-token",
  "/reset-password": "#token=playwright-fake-reset-token",
  "/create-workspace/verify": "#token=playwright-fake-registration-token",
};

/**
 * Collects everything a browser complains about, before any navigation.
 *
 * A CSP violation surfaces in three different places depending on what was
 * blocked — a `securitypolicyviolation` event, a console error, or a failed
 * request — so all three are watched. Listening only to `console` is the usual
 * way one of these suites ends up green while the page is broken.
 */
function watchForProblems(page: Page) {
  const violations: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });

  return {
    consoleErrors,
    pageErrors,
    async cspViolations(): Promise<string[]> {
      const fromPage = await page.evaluate(
        () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
      );
      return [...violations, ...fromPage];
    },
  };
}

test.describe("baseline headers on every route", () => {
  for (const route of [...SENSITIVE_ROUTES, "/product", "/"]) {
    test(`${route} is served with the baseline set`, async ({ request }) => {
      const response = await request.get(route);
      const headers = response.headers();

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["strict-transport-security"]).toContain("max-age=63072000");
      expect(headers["strict-transport-security"]).toContain("includeSubDomains");
      expect(headers["x-frame-options"]).toBe("DENY");

      for (const capability of ["camera", "microphone", "geolocation", "payment", "usb"]) {
        expect(headers["permissions-policy"]).toContain(`${capability}=()`);
      }

      // Names the framework and, with it, the CVE list worth trying.
      expect(headers["x-powered-by"]).toBeUndefined();
    });
  }
});

test.describe("the strict policy on the credential-bearing pages", () => {
  for (const route of SENSITIVE_ROUTES) {
    test(`${route} is served under a nonce policy with no eval`, async ({ request }) => {
      const headers = (await request.get(route)).headers();
      const policy = headers["content-security-policy"];

      expect(policy, `${route} must carry a CSP`).toBeTruthy();

      // The assertion the whole exercise is for.
      expect(policy).not.toContain("unsafe-eval");
      expect(policy).toMatch(/script-src 'self' 'nonce-[^']+'\s*;/);

      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("form-action 'self'");
      expect(policy).toContain("connect-src 'self'");
      expect(policy).toContain("default-src 'self'");

      // A fragment holds a credential; no page here should leak the referrer.
      expect(headers["referrer-policy"]).toBe("no-referrer");
    });
  }

  test("a fresh nonce is issued per request", async ({ request }) => {
    // A nonce reused across responses is an allow-list entry an injected
    // script can copy out of the DOM and reuse.
    const nonces = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      const policy = (await request.get("/login")).headers()["content-security-policy"];
      nonces.add(/nonce-([^']+)/.exec(policy ?? "")?.[1] ?? "");
    }
    expect(nonces.size).toBe(5);
  });

  test("an ordinary product route is not put under the strict policy", async ({
    request,
  }) => {
    // Scoped deliberately: the rest of the product is not force-dynamic and a
    // nonce policy would block its prerendered hydration script.
    const policy = (await request.get("/product")).headers()["content-security-policy"];
    expect(policy).toBeUndefined();
  });
});

test.describe("the pages still work under the policy", () => {
  for (const route of SENSITIVE_ROUTES) {
    test(`${route} hydrates with no CSP violation`, async ({ page }) => {
      const problems = watchForProblems(page);

      await page.goto(`${route}${FRAGMENT[route] ?? ""}`);
      await page.waitForLoadState("networkidle");

      expect(await problems.cspViolations()).toEqual([]);
      expect(problems.consoleErrors).toEqual([]);
      expect(problems.pageErrors).toEqual([]);

      /*
        Hydration, proved rather than assumed. Every one of these pages is a
        client component that renders a form; if the policy had blocked the
        bootstrap script the markup would still be there but React would never
        have attached, and a headers-only test would not notice.
      */
      await expect(page.locator("form")).toBeVisible();
    });
  }

  test("every script on a sensitive page carries the response's nonce", async ({
    page,
  }) => {
    const response = await page.goto("/reset-password#token=playwright-fake-reset-token");
    const nonce = /nonce-([^']+)/.exec(
      response?.headers()["content-security-policy"] ?? "",
    )?.[1];

    expect(nonce).toBeTruthy();

    /* `script.nonce` — the IDL attribute — not `getAttribute('nonce')`: a
       browser blanks the content attribute after CSP processing precisely so a
       script cannot read a nonce back out of the DOM. */
    const counts = await page.evaluate(() => {
      const scripts = [...document.scripts];
      return { total: scripts.length, nonced: scripts.filter((s) => s.nonce).length };
    });

    expect(counts.total).toBeGreaterThan(0);
    expect(counts.nonced).toBe(counts.total);
  });
});

test.describe("no third-party origin on a credential-bearing page", () => {
  for (const route of SENSITIVE_ROUTES) {
    test(`${route} loads nothing from another origin`, async ({ page }) => {
      /*
        The analytics/RUM requirement, tested as behaviour.

        The CSP already refuses a cross-origin script, so a tag that somebody
        added would be blocked rather than loaded — but "blocked" is a
        violation, not an absence, and the requirement is that these pages do
        not reach for one at all. So every request the page makes is recorded
        and checked against this origin, whatever the policy did about it.
      */
      const foreign: string[] = [];
      const origin = new URL("http://127.0.0.1:3000").origin;

      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin !== origin && url.protocol !== "data:") foreign.push(request.url());
      });

      await page.goto(`${route}${FRAGMENT[route] ?? ""}`);
      await page.waitForLoadState("networkidle");

      expect(foreign).toEqual([]);

      const embedded = await page.evaluate(() =>
        [...document.querySelectorAll("script[src], link[href], img[src], iframe[src]")]
          .map((element) => element.getAttribute("src") ?? element.getAttribute("href"))
          .filter((value): value is string => Boolean(value))
          .filter((value) => /^[a-z]+:\/\//i.test(value)),
      );
      expect(embedded.filter((url) => new URL(url).origin !== origin)).toEqual([]);
    });
  }
});

test.describe("the credential leaves the address bar", () => {
  /*
    Not a CSP assertion, and included here because this suite is the only one
    that runs a real browser.

    What this proves and what it does not: after the page has mounted, the
    address bar no longer holds the token. It does **not** prove the token is
    gone from the browser — `performance.getEntriesByType('navigation')` can
    still report the original URL, fragment included, because `replaceState`
    does not rewrite a navigation entry that has already been recorded. That is
    a documented residual behaviour, not something these tests can close, and
    `docs/backend/security-baseline.md` records it as such.
  */
  test("the fragment is scrubbed from the invite URL", async ({ page }) => {
    await page.goto("/invite#token=playwright-fake-invite-token");
    await expect(page.locator("form")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe("");
    expect(await page.evaluate(() => window.location.href)).not.toContain("token");
  });

  test("the fragment is scrubbed from the reset URL", async ({ page }) => {
    await page.goto("/reset-password#token=playwright-fake-reset-token");
    await expect(page.locator("form")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe("");
    expect(await page.evaluate(() => window.location.href)).not.toContain("token");
  });

  test("the fragment is scrubbed from the workspace-confirmation URL", async ({ page }) => {
    await page.goto("/create-workspace/verify#token=playwright-fake-registration-token");
    await expect(page.locator("form")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe("");
    expect(await page.evaluate(() => window.location.href)).not.toContain("token");
  });
});
