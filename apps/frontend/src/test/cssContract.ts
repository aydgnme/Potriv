import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reading a stylesheet as a contract.
 *
 * A few layout guarantees cannot be asserted any other way: jsdom applies no
 * layout, and the responsive matrix that measures them runs against a real
 * browser and is not unit-runnable. Where a regression would otherwise have no
 * test at all, these helpers let one pin the exact declaration that carries the
 * behaviour.
 *
 * They are deliberately small and deliberately blunt. Brace matching, not a CSS
 * parser — the alternative was adding a dependency to read two stylesheets, and
 * the shapes here are hand-written CSS modules, not minified output.
 *
 * The point of scoping is causality. Matching a declaration *anywhere* in a file
 * lets an unrelated rule keep a test green while the rule it names is removed,
 * which is exactly how `tableHeaderWrap` was passing over a stylesheet that has
 * two blocks at the same breakpoint.
 */
export type CssContract = {
  /** The declarations of a top-level rule, e.g. `.table th`. */
  readonly rule: (selector: string) => string;
  /** Every `@media (max-width: <px>)` body, in source order. */
  readonly mediaBlocks: (maxWidth: number) => readonly string[];
  /** The raw source, for assertions that genuinely mean "anywhere". */
  readonly source: string;
};

/** `path` is relative to `apps/frontend`, which is vitest's cwd. */
export function cssContract(path: string): CssContract {
  const source = readFileSync(join(process.cwd(), path), "utf8");

  /** The body of the block opened by the first `{` at or after `index`. */
  function blockAfter(index: number): string {
    const open = source.indexOf("{", index);
    if (open === -1) throw new Error(`no block opens after index ${index} in ${path}`);

    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    if (depth !== 0) throw new Error(`unbalanced braces after index ${index} in ${path}`);

    return source.slice(open + 1, i - 1);
  }

  return {
    source,

    rule(selector) {
      const at = source.search(new RegExp(`^${escapeForRegExp(selector)}\\s*\\{`, "m"));
      if (at === -1) throw new Error(`no top-level rule for \`${selector}\` in ${path}`);
      return blockAfter(at);
    },

    mediaBlocks(maxWidth) {
      const bodies: string[] = [];
      const pattern = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)`, "g");
      for (let m = pattern.exec(source); m !== null; m = pattern.exec(source)) {
        bodies.push(blockAfter(m.index));
      }
      return bodies;
    },
  };
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
