import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests, kept separate from the Vitest suite on purpose.
 *
 * Vitest asserts what the policy *string* says. That is worth having, and it is
 * not the same question: a policy can be word-perfect and still block the
 * page's own hydration script, and no amount of string comparison notices. The
 * suite here answers the other half — does a real browser, loading a real
 * production build, report a violation — which is the only evidence that
 * actually means the pages still work.
 *
 * `next build` first, then `next start`: the development server serves React
 * Refresh through `eval` and needs `'unsafe-eval'`, so a CSP test against
 * `next dev` would be testing a policy that never reaches production. The
 * `webServer` block below runs the production pair.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
    /*
      No trace, no video, no screenshots.

      These tests navigate to `/invite#token=…` and `/reset-password#token=…`.
      A Playwright trace records the URL of every navigation, so it would write
      the very credential the pages exist to keep out of recorded places into a
      CI artifact. The values used are fake, but a suite that only stays safe
      because somebody remembered to use a fake token is one edit from leaking a
      real one, and `tools/api-e2e` already scans artifacts for tokens.
    */
    video: "off",
    screenshot: "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000/forgot-password",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // The production branch of the policy is the one under test.
      NODE_ENV: "production",
    },
  },
});
