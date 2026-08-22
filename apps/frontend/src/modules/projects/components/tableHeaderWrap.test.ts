import { describe, expect, it } from "vitest";

import { cssContract } from "@/test/cssContract";

/**
 * The two stylesheet contracts that keep the Projects tables from overflowing.
 *
 * These assert CSS source rather than behaviour, because the defect is a layout
 * one that jsdom cannot measure and the responsive matrix that caught it is not
 * unit-runnable.
 *
 * The assertions are scoped to the exact rules they protect. An earlier version
 * matched `@media (max-width: 767px)` and `content: attr(data-label)`
 * independently anywhere in the file — and this stylesheet has a *second* 767px
 * block, so the table contract could have moved to another breakpoint, or broken
 * outright, while the test stayed green.
 *
 * The defect they protect against: `white-space: nowrap` on `.table th` made the
 * header row the table's min-content floor. Project Team has seven columns, so
 * between 768px and the point where these tables fold into stacked records the
 * row could not fit — measured at 772px inside a 768px viewport.
 */

const css = cssContract("src/modules/projects/components/Projects.module.css");

describe("table headers may wrap", () => {
  it("does not pin the header row to a single line", () => {
    const header = css.rule(".table th");

    expect(header).toMatch(/white-space:\s*normal/);
    expect(header).not.toMatch(/white-space:\s*nowrap/);
  });
});

describe("tables stack into labelled records below the table breakpoint", () => {
  /** The one 767px block that actually carries the table-stacking contract. */
  const stacking = css.mediaBlocks(767).find((body) => /\.table\b/.test(body));

  it("has a 767px block that redefines the table", () => {
    expect(stacking).toBeDefined();
  });

  it("turns the table and its rows into blocks in that same block", () => {
    expect(stacking).toMatch(/\.table\s*,/);
    expect(stacking).toMatch(/display:\s*block/);
  });

  it("labels each cell from within that same block", () => {
    // `data-label` is what replaces the visually hidden header row. If it ever
    // moves outside this breakpoint the records lose their column names.
    expect(stacking).toMatch(/content:\s*attr\(data-label\)/);
  });

  it("keeps the header row in the DOM rather than removing it", () => {
    // Visually hidden, not `display: none` — the header cells stay available to
    // anyone listening to the table.
    expect(stacking).toMatch(/clip-path:\s*inset\(50%\)/);
  });
});
