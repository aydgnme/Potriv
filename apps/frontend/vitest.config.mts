import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Component and unit tests. Tests are colocated with the code they cover, so
 * there is no separate test tree to keep in sync.
 *
 * `.mts` because the config is ESM; `resolve.tsconfigPaths` resolves the `@/*`
 * alias natively, so no path plugin is needed.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // See src/test/serverOnlyStub.ts — the build still enforces the boundary.
      "server-only": new URL("./src/test/serverOnlyStub.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `src/**` plus the app root, where Next requires `proxy.ts` to live. The
    // convention is unchanged — tests sit beside the code they cover — but that
    // code is not all under `src/`.
    include: ["src/**/*.test.{ts,tsx}", "*.test.{ts,tsx}"],
    css: true,
  },
});
