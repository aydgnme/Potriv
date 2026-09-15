import { defineConfig } from 'vitest/config';

/**
 * Every test here runs against a local, ephemeral HTTP server or an in-memory
 * fixture — never the real NVD service. That is the point: the workflow's
 * fail-closed behaviour has to be provable without a real API key or network
 * access to a third party, in this repository, on every run.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
  },
});
