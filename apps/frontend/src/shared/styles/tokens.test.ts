import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every design token a stylesheet asks for has to exist.
 *
 * A `var(--name)` with no fallback whose property is never defined is not a
 * soft failure. The declaration is invalid at computed-value time, so it is
 * dropped entirely and the property falls back to its initial value — which
 * for `padding` is 0 and for `gap` is none. It fails silently, and a shorthand
 * takes everything it was carrying down with it.
 *
 * That is exactly how the hero lost its top and bottom padding: one
 * `padding-block: var(--p-space-8) var(--p-space-7)` where only the second
 * token existed.
 */

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

const files = cssFiles("src");
const corpus = files.map((path) => ({ path, source: readFileSync(path, "utf8") }));

/** Every `--name:` declaration anywhere, which is where a token can come from. */
const defined = new Set(
  corpus.flatMap(({ source }) => [...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])),
);

describe("the token vocabulary is complete", () => {
  it("finds the stylesheets to check", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(defined.has("--p-space-7")).toBe(true);
  });

  it("never references a custom property that nothing defines", () => {
    const missing: string[] = [];

    for (const { path, source } of corpus) {
      for (const m of source.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
        const [, name, next] = m;
        // A fallback makes the reference safe on its own.
        if (next === ",") continue;
        if (defined.has(name)) continue;
        const line = source.slice(0, m.index!).split("\n").length;
        missing.push(`${path}:${line} uses ${name}, which nothing defines`);
      }
    }

    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("keeps the spacing scale contiguous", () => {
    // A gap in the scale is what invites a rule to reach past the end of it.
    const steps = [...defined]
      .map((name) => /^--p-space-(\d+)$/.exec(name)?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number)
      .sort((a, b) => a - b);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps).toEqual(Array.from({ length: steps.length }, (_, i) => i + 1));
  });
});
