import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The Projects table headers must stay wrappable.
 *
 * This asserts a stylesheet contract rather than behaviour, because the defect
 * is a layout one that jsdom cannot measure — and the responsive matrix that
 * caught it is not something a unit test can run.
 *
 * The defect: `white-space: nowrap` on `.table th` made the header row the
 * table's min-content floor. The Project Team page has seven columns, so
 * between 768px and the width where these tables fold into stacked records the
 * row could not fit, and the document scrolled sideways (measured: 772px in a
 * 768px viewport). Letting "Review department" wrap onto two lines removes the
 * only reason the page overflowed.
 *
 * Reintroducing `nowrap` on the header rule fails this test for exactly that
 * reason.
 */

// Resolved from the project root: vitest runs with `apps/frontend` as cwd.
const css = readFileSync(
  join(process.cwd(), "src/modules/projects/components/Projects.module.css"),
  "utf8",
);

/** The declaration block for a selector at the top level of the stylesheet. */
function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

describe("projects table headers", () => {
  it("does not pin the header row to a single line", () => {
    const header = ruleBody(".table th");

    expect(header).toMatch(/white-space:\s*normal/);
    expect(header).not.toMatch(/white-space:\s*nowrap/);
  });

  it("still stacks into labelled records at narrow widths", () => {
    // The other half of the contract: below 768 the table stops being a table,
    // which is what keeps seven columns readable on a phone.
    expect(css).toMatch(/@media\s*\(max-width:\s*767px\)/);
    expect(css).toMatch(/content:\s*attr\(data-label\)/);
  });
});
