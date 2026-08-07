import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the suite's own logic — redaction, inventory parsing, registry
 * drift. The endpoint automation itself is not a Vitest suite: it mutates shared
 * organization state and must run serially in one process, which the runner
 * (`npm run e2e`) does.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
});
