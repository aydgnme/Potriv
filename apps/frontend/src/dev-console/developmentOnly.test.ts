import { readdirSync } from "node:fs";
import { join } from "node:path";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { describe, expect, it } from "vitest";

import nextConfig, { DEVELOPMENT_ONLY_EXTENSIONS, ROUTABLE_EXTENSIONS } from "../../next.config";

/**
 * The developer console is development-only, and this is where that stays true.
 *
 * `/console` used to be prerendered into the production output and answered
 * anonymous GETs from the production origin. Nothing leaked — the console holds
 * no credentials and the backend authorizes every call it makes — but a request
 * builder and endpoint enumerator has no reason to be served in production.
 *
 * The fix is a naming convention (`app/(dev)/**` uses `.dev.tsx`, which only the
 * development server's `pageExtensions` recognise), and a naming convention is
 * exactly the kind of thing that gets undone by accident: one `page.tsx` added
 * to that group and the console is back on the production origin, with a green
 * build and no other symptom. So the convention is asserted rather than trusted.
 */

/**
 * Resolved from this file rather than from `process.cwd()`, so the assertions
 * hold wherever the runner is invoked from. `import.meta.dirname` rather than
 * `new URL(..., import.meta.url)`: under jsdom the global `URL` resolves a
 * relative reference against the test document's origin, not the module's.
 */
const APP_DIRECTORY = join(import.meta.dirname, "..", "..", "app");
const DEV_GROUP = join(APP_DIRECTORY, "(dev)");

/**
 * Next's App Router file conventions — the names that make a file a route.
 *
 * Anything else in the group (a component, a helper) is an ordinary module: it
 * is never routable whatever its extension, so it is not this test's business.
 */
const ROUTE_CONVENTIONS = new Set([
  "page",
  "layout",
  "route",
  "template",
  "default",
  "loading",
  "error",
  "global-error",
  "not-found",
  "forbidden",
  "unauthorized",
]);

/**
 * How Next resolves a route file: the convention, a dot, then one of the
 * configured extensions — matched whole, not as a suffix. `page.dev.tsx` ends in
 * `.tsx` but its extension is `dev.tsx`, which is the entire point.
 */
function isRoutable(fileName: string, extensions: readonly string[]): boolean {
  const dot = fileName.indexOf(".");
  if (dot === -1) return false;

  return (
    ROUTE_CONVENTIONS.has(fileName.slice(0, dot)) && extensions.includes(fileName.slice(dot + 1))
  );
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function pageExtensionsFor(phase: string): string[] {
  return nextConfig(phase).pageExtensions ?? [];
}

describe("what the production build is allowed to route", () => {
  it("recognises no development-only extension", () => {
    const production = pageExtensionsFor(PHASE_PRODUCTION_BUILD);

    for (const extension of DEVELOPMENT_ONLY_EXTENSIONS) {
      expect(production).not.toContain(extension);
    }
  });

  it("still recognises every ordinary extension, so the product keeps building", () => {
    // The gate must not be satisfiable by shrinking the production list until
    // the console falls out of it — that would unbuild the product with it.
    expect(pageExtensionsFor(PHASE_PRODUCTION_BUILD)).toEqual(ROUTABLE_EXTENSIONS);
  });

  it("adds the development-only extensions for the dev server, and keeps the rest", () => {
    const development = pageExtensionsFor(PHASE_DEVELOPMENT_SERVER);

    expect(development).toEqual(expect.arrayContaining(DEVELOPMENT_ONLY_EXTENSIONS));
    expect(development).toEqual(expect.arrayContaining(ROUTABLE_EXTENSIONS));
  });

  it("keeps the two lists disjoint", () => {
    // A `dev.` prefix that collided with a real extension would route the
    // console in production while every other assertion here still passed.
    for (const extension of DEVELOPMENT_ONLY_EXTENSIONS) {
      expect(ROUTABLE_EXTENSIONS).not.toContain(extension);
    }
  });
});

describe("the developer console route group", () => {
  const devGroupFiles = filesUnder(DEV_GROUP);

  it("is still there, and still routes under the development server", () => {
    // Guards the other direction: a change that makes these unroutable
    // everywhere would pass every assertion below and silently delete the tool.
    const development = pageExtensionsFor(PHASE_DEVELOPMENT_SERVER);

    expect(devGroupFiles).toContain("page.dev.tsx");
    expect(devGroupFiles).toContain("layout.dev.tsx");
    expect(devGroupFiles.filter((file) => isRoutable(file, development))).toHaveLength(2);
  });

  it.each(["page.tsx", "layout.tsx", "route.ts"])(
    "would fail this test if someone added a %s to it",
    (fileName) => {
      // The failure mode being guarded, written out: these names are routable in
      // production, so none of them may appear in this group.
      expect(isRoutable(fileName, pageExtensionsFor(PHASE_PRODUCTION_BUILD))).toBe(true);
    },
  );

  it("contains no file the production build would route", () => {
    const production = pageExtensionsFor(PHASE_PRODUCTION_BUILD);
    const routableInProduction = devGroupFiles.filter((file) => isRoutable(file, production));

    expect(routableInProduction).toEqual([]);
  });
});

describe("the product route group, as a control", () => {
  it("is routed by the production build", () => {
    // If this ever went empty, "no console in production" would be true for the
    // uninteresting reason that nothing at all is.
    const production = pageExtensionsFor(PHASE_PRODUCTION_BUILD);
    const routable = filesUnder(join(APP_DIRECTORY, "(product)")).filter((file) =>
      isRoutable(file, production),
    );

    expect(routable.length).toBeGreaterThan(0);
  });
});
