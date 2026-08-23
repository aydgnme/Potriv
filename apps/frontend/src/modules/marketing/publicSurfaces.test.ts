import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cssContract } from "@/test/cssContract";

/**
 * The surface system the four chapter pages share.
 *
 * A page's content should not have to know which ground it is on. These pin the
 * mechanism that makes that true, and the contrast rule that made it necessary.
 */

const plan = cssContract("src/modules/marketing/styles/plan.module.css");
const pages = cssContract("src/modules/marketing/styles/pages.module.css");
const home = cssContract("src/modules/marketing/styles/home.module.css");

const GROUNDS = [".section", ".sectionDark", ".chapterHead", ".chapterHeadDark"] as const;

describe("every ground says what text means on it", () => {
  it.each(GROUNDS)("declares the ground variables on %s", (selector) => {
    const rule = plan.rule(selector);
    expect(rule).toMatch(/--ground-text:/);
    expect(rule).toMatch(/--ground-muted:/);
    expect(rule).toMatch(/--ground-brand:/);
  });

  it("gives the dark ground inverse values, not the light ones", () => {
    /*
      Measured: `--p-brand` is 2.92:1 on charcoal and `--p-text` is unreadable
      on it outright. The dark ground has to answer differently or the variables
      are decoration.
    */
    const dark = plan.rule(".sectionDark");
    expect(dark).toMatch(/--ground-text:\s*var\(--p-inverse-text\)/);
    expect(dark).toMatch(/--ground-muted:\s*var\(--p-inverse-text-muted\)/);
    expect(dark).toMatch(/--ground-brand:\s*var\(--p-inverse-brand\)/);
  });

  it("makes a panel that paints its own ground re-declare them", () => {
    /*
      `.boundary` paints a light teal panel inside whichever section holds it.
      Inheriting the section's answer put near-white text on it at 1.13:1 the
      moment that section went dark.
    */
    const boundary = pages.rule(".boundary");
    expect(boundary).toMatch(/--ground-text:\s*var\(--p-text\)/);
    // And passes the colour on, because the title inside declares none of its own.
    expect(boundary).toMatch(/color:\s*var\(--ground-text\)/);
  });
});

describe("no chapter-page class hard-codes a text colour", () => {
  /*
    This is the guard for a whole class of defect rather than one instance.

    While these classes named palette entries directly, giving a section a
    different ground silently broke every one of them: 14 failures of WCAG 1.4.3
    appeared the moment three sections went dark, at ratios down to 1.13:1.
  */
  const FORBIDDEN = [
    "--p-text",
    "--p-text-muted",
    "--p-inverse-text",
    "--p-inverse-text-muted",
    "--p-brand",
    "--p-brand-strong",
  ];

  it.each(FORBIDDEN)("does not set a text colour from %s", (token) => {
    const pattern = new RegExp(`color:\\s*var\\(${token}\\)`, "g");
    const hits = [...pages.source.matchAll(pattern)];
    const lines = hits.map((h) => pages.source.slice(0, h.index!).split("\n").length);

    expect(hits, `hard-coded text colour at line(s) ${lines.join(", ")}`).toHaveLength(0);
  });

  it("uses the ground variables instead", () => {
    expect(pages.source).toMatch(/color:\s*var\(--ground-text\)/);
    expect(pages.source).toMatch(/color:\s*var\(--ground-muted\)/);
    expect(pages.source).toMatch(/color:\s*var\(--ground-brand\)/);
  });
});

describe("small text stays readable once a section is not white", () => {
  /*
    `--p-text-subtle` is measured at 4.5:1 against white and falls to 4.32:1 on
    the light neutral. With more than one ground in play it has no safe use for
    text, so the public stylesheets do not reach for it.
  */
  it.each([
    ["the homepage", () => home.source],
    ["the chapter pages", () => pages.source],
    ["the chapter shell", () => plan.source],
  ])("keeps --p-text-subtle out of %s", (_label, read) => {
    expect(read()).not.toMatch(/color:\s*var\(--p-text-subtle\)/);
  });
});

describe("a chapter introduces itself, then its sections do", () => {
  it("gives the chapter title a display size of its own", () => {
    // `--p-display-2` tops out at 36px, which this scale gives a *section*
    // heading. A chapter's own title is the strongest text on its page.
    const title = plan.rule(".chapterTitle");
    const clamp = title.match(/font-size:\s*clamp\([^,]+,[^,]+,\s*([\d.]+)rem\s*\)/);

    expect(clamp, "the chapter title has no display clamp").not.toBeNull();
    expect(Number(clamp![1])).toBeGreaterThan(2.25);
  });

  it("runs the chapter entrance on load and the section heads on scroll", () => {
    /*
      The header is above the fold on every chapter page; the last section is
      thousands of pixels below it. One timing cannot serve both.
    */
    const guarded = plan.source.slice(
      plan.source.indexOf("@media (prefers-reduced-motion: no-preference)"),
    );
    expect(guarded).toMatch(/\.chapterMark\s*\{[^}]*animation-delay:\s*0ms/);
    expect(guarded).toMatch(/@supports \(animation-timeline: view\(\)\)/);
    expect(guarded).toMatch(/\.sectionHead\s*\{[\s\S]*?animation-timeline:\s*view\(\)/);
  });

  it("moves only the heading block on scroll, never the body", () => {
    // Scrubbing a whole section's opacity against scroll position leaves its
    // body part-transparent while it is being read.
    const scrolled = plan.source.slice(plan.source.indexOf("@supports (animation-timeline: view())"));
    const block = scrolled.slice(0, scrolled.indexOf("\n  }\n"));
    expect(block).toMatch(/\.sectionHead/);
    expect(block).not.toMatch(/\.section\s*[,{]/);
  });
});

describe("every chapter page draws something", () => {
  /*
    Product and Security carried no drawing at all while the homepage carried
    eight — a chapter that only sets type is a document, not a product page.
    Product gets the object map, Security the anatomy of a control claim.
  */
  it("gives the object map the site's own stroke language", () => {
    // Dashed is a proposal, solid is an allocation. This page is where a reader
    // first meets both objects, so it is where the convention has to be visible.
    const map = readFileSync("src/modules/marketing/components/plan/ObjectMap.tsx", "utf8");
    expect(map).toMatch(/styles\.proposed/);
    expect(map).toMatch(/styles\.accepted/);
    expect(map).toMatch(/aria-hidden="true"/);
  });

  it("draws the control anatomy from the ground variables only", () => {
    /*
      Security is charcoal throughout. Drawing it with palette entries would tie
      the component to that one ground; asking the ground what its colours are
      lets the same component read correctly on white.
    */
    for (const cls of [".anatomyStage", ".anatomyTitle", ".anatomyDetail", ".anatomyNode"]) {
      const rule = pages.rule(cls);
      expect(rule, `${cls} is missing`).toBeTruthy();
      expect(rule, `${cls} names a palette entry instead of the ground`)
        .not.toMatch(/var\(--p-(?:text|inverse-text|brand)/);
    }
    expect(pages.rule(".anatomyStage")).toMatch(/var\(--ground-brand\)/);
    expect(pages.rule(".anatomyTitle")).toMatch(/var\(--ground-text\)/);
  });

  it("marks the limitation as an edge rather than another claim", () => {
    // Dashed, like everything else on this site that is not yet a fact.
    expect(pages.rule(".anatomyNodeBounded")).toMatch(/stroke-dasharray/);
  });
});

describe("both chapter drawings survive a narrow column", () => {
  /*
    They were removed outright below their breakpoints. No information was lost
    — the text underneath carries it — but the page fell back to being text on
    exactly the screens where a reader has the least of it.

    Two compositions, not one drawing scaled, the same answer the hero graph
    uses: the narrow ones drop the second line of detail on each node and keep
    the relationships, which is the part the list underneath cannot state.
  */
  it.each([
    ["the object map", ".objectMapDrawing", ".objectMapNarrow"],
    ["the control anatomy", ".anatomyDrawing", ".anatomyNarrow"],
  ])("gives %s a narrow composition that shows by default", (_label, wide, narrow) => {
    // Narrow is the default and the wide one is opted into, so a width the
    // breakpoints do not anticipate still draws something.
    expect(pages.rule(wide)).toMatch(/display:\s*none/);
    expect(pages.rule(narrow)).toMatch(/display:\s*block/);
  });

  it("swaps the object map in as soon as it fits, not a breakpoint later", () => {
    /*
      Its viewBox is 700 across and a 768px viewport gives 704px of content, so
      it renders at its designed size there. Holding the swap at 900px left
      tablets reading text where a desktop reader saw the model.
    */
    const swaps = [...pages.source.matchAll(/@media \(min-width: (\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
      .filter(([, , body]) => /\.objectMapDrawing\s*\{[^}]*display:\s*block/.test(body));

    expect(swaps.length, "the object map has no swap breakpoint").toBe(1);
    expect(Number(swaps[0][1])).toBeLessThanOrEqual(768);
  });

  it("keeps the caption at every width now that a drawing is always shown", () => {
    // It used to be hidden alongside the wide drawing, which left the narrow
    // one uncaptioned once that existed.
    expect(pages.rule(".objectMapCaption")).not.toMatch(/display:\s*none/);
  });
});
