import { describe, expect, it } from "vitest";

import { cssContract } from "@/test/cssContract";

/**
 * The homepage's surface rhythm, layout and motion, asserted at the source.
 *
 * These are layout and paint facts that jsdom does not compute — a background,
 * a grid placement, an animation delay — so they are checked as CSS rather than
 * as behaviour. The content and accessibility contracts for the same page live
 * in `marketingRoutes.test.tsx`.
 */

const home = cssContract("src/modules/marketing/styles/home.module.css");

/** The body of every `prefers-reduced-motion: no-preference` block in a file. */
function motionBlocks(source: string): string[] {
  const blocks: string[] = [];
  const marker = "@media (prefers-reduced-motion: no-preference)";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) return blocks;
    let depth = 0;
    let i = source.indexOf("{", at);
    const open = i;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) break;
    }
    blocks.push(source.slice(open + 1, i));
    from = i;
  }
}

describe("the page changes ground between sections", () => {
  /*
    The page was one white surface with rules between the parts, which is how a
    long document is set. Crossing a boundary now changes the ground, so a
    reader knows a new subject has started before they have read a word of it.
  */
  const surfaces = [
    [".hero", "--p-surface-warm"],
    [".evidence", "--p-surface"],
    [".gateSection", "--p-inverse-bg"],
    [".chaptersSection", "--p-surface-sunken"],
    [".final", "--p-brand-strong"],
  ] as const;

  it.each(surfaces)("gives %s its own background", (selector, token) => {
    expect(home.rule(selector)).toMatch(new RegExp(`background:\\s*var\\(${token}\\)`));
  });

  it("uses five distinct grounds, not one repeated", () => {
    const tokens = surfaces.map(([, token]) => token);
    expect(new Set(tokens).size).toBe(surfaces.length);
  });

  it("puts the dark section and the closing scene on different grounds", () => {
    // Two charcoal sections would make the second one read as a repeat rather
    // than as an ending.
    expect(home.rule(".gateSection")).not.toMatch(/--p-brand-strong/);
    expect(home.rule(".final")).not.toMatch(/--p-inverse-bg/);
  });
});

describe("the ledger reads across, at every width", () => {
  /*
    The defect this exists for: with only `grid-template-columns` set, auto
    placement dropped the answer into the number's column — a couple of
    characters wide — so each row wrapped its answer down a narrow channel and
    the four of them ran to 2569px on a 375px screen. Measured at 817px after
    placing them.
  */
  it("places the number, condition and answer explicitly", () => {
    expect(home.rule(".ledgerNumber")).toMatch(/grid-column:\s*1/);
    expect(home.rule(".ledgerProblem")).toMatch(/grid-column:\s*2/);
    expect(home.rule(".ledgerAnswer")).toMatch(/grid-column:\s*2/);
  });

  it("moves the answer across into its own column once there is room", () => {
    const wide = home.source.slice(home.source.indexOf("@media (min-width: 768px)"));
    expect(wide).toMatch(/\.ledgerAnswer\s*\{[^}]*grid-column:\s*4/);
    expect(wide).toMatch(/\.ledgerJoin\s*\{[^}]*grid-column:\s*3/);
  });
});

describe("the chapter index is an index, not a card grid", () => {
  it("stacks every preview in one grid cell", () => {
    // Same cell means switching panels cannot move anything: the height is the
    // tallest of the four, reserved before any of them is shown.
    const wide = home.source.slice(home.source.indexOf("@media (min-width: 900px)"));
    expect(wide).toMatch(/\.chapterPreview\s*\{[^}]*grid-area:\s*1\s*\/\s*1/);
  });

  it("drives the panel from the row, by pointer and keyboard alike", () => {
    // One rule for both, so the keyboard path cannot drift from the pointer one.
    expect(home.source).toMatch(/:has\([^)]*\.chapterRow:is\(:hover,\s*:focus-visible\)/);
  });

  it("gives the whole row a target well past 44px", () => {
    const row = home.rule(".chapterRow");
    const min = row.match(/min-height:\s*(\d+)px/);
    expect(min, "the chapter row has no min-height").not.toBeNull();
    expect(Number(min![1])).toBeGreaterThanOrEqual(44);
  });
});

describe("motion says something, once, and then stops", () => {
  const guarded = motionBlocks(home.source).join("\n");

  it("keeps every animation inside the reduced-motion query", () => {
    const declarations = [...home.source.matchAll(/^\s*animation(?:-name|-delay|-duration|-timeline|-range|-fill-mode|-timing-function)?:/gm)];

    expect(declarations.length, "no animation declarations found").toBeGreaterThan(0);
    for (const d of declarations) {
      const line = home.source.slice(d.index!, home.source.indexOf(";", d.index!) + 1).trim();
      expect(guarded, `outside the reduced-motion query: ${line}`).toContain(line);
    }
  });

  it("never loops", () => {
    expect(home.source).not.toMatch(/animation[^;]*infinite/);
    expect(home.source).not.toMatch(/animation-iteration-count:\s*infinite/);
  });

  it("animates nothing that moves the page", () => {
    for (const m of home.source.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      let depth = 0;
      let i = home.source.indexOf("{", m.index!);
      const open = i;
      for (; i < home.source.length; i++) {
        if (home.source[i] === "{") depth++;
        else if (home.source[i] === "}" && --depth === 0) break;
      }
      const body = home.source.slice(open + 1, i);
      for (const property of ["width", "height", "margin", "padding", "top", "left", "right", "bottom"]) {
        expect(body, `@keyframes ${m[1]} animates ${property}`).not.toMatch(
          new RegExp(`(^|[;{\\s])${property}:`),
        );
      }
    }
  });

  it("derives each stage's place in the sequence from its index", () => {
    // So a sixth stage in the drawing needs no new CSS.
    expect(guarded).toMatch(/animation-delay:\s*calc\([^)]*--stage/);
    expect(guarded).toMatch(/animation-delay:\s*calc\([^)]*--row/);
  });

  it("runs the whole choreography inside a second and a half", () => {
    // Measured in the browser at 1600ms end to end. This pins the last delay so
    // the sequence cannot quietly grow into something a reader waits for.
    const delays = [...guarded.matchAll(/(\d+)ms\s+backwards/g)].map((m) => Number(m[1]));
    expect(delays.length).toBeGreaterThan(0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(1300);
  });

  it("teaches the dark section on scroll rather than on load", () => {
    /*
      It sits about 2000px down. On a load-time delay it would have finished
      long before anyone reached it — the same defect the closing call to action
      had. Scroll-driven needs no observer and no client component; where the
      browser lacks support the section is simply in its finished state.
    */
    expect(guarded).toMatch(/@supports \(animation-timeline: view\(\)\)/);
    expect(guarded).toMatch(/animation-timeline:\s*view\(\)/);
  });
});

describe("the page keeps to the spacing scale", () => {
  it("sets section padding from the scale, not from a literal", () => {
    expect(home.rule(".section")).toMatch(/padding-block:\s*var\(--p-space-10\)/);
  });

  it("uses a tighter block on phones", () => {
    const phone = home.source.slice(home.source.indexOf("@media (max-width: 767px)"));
    expect(phone).toMatch(/padding-block:\s*var\(--p-space-8\)/);
  });
});
