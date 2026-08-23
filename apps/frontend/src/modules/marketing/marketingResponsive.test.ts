import { describe, expect, it } from "vitest";

import { cssContract } from "@/test/cssContract";

/**
 * The responsive contracts jsdom cannot measure.
 *
 * jsdom applies no media queries and lays out nothing, so the rules that decide
 * what a phone sees are invisible to a component test. These pin them at the
 * source, in the same style as the projects table contract: the browser matrix
 * measures the result, and this stops the rule quietly disappearing between
 * matrices.
 */

const header = cssContract("src/modules/marketing/components/MarketingHeader.module.css");
const landing = cssContract("src/modules/marketing/styles/landing.module.css");
const plan = cssContract("src/modules/marketing/styles/plan.module.css");
const pages = cssContract("src/modules/marketing/styles/pages.module.css");
const diagram = cssContract("src/modules/marketing/components/HeroFlowDiagram.module.css");

describe("one navigation model is visible at a time", () => {
  it("hides the desktop nav until there is room for it", () => {
    // Base state is hidden; a min-width query turns it on. The two must never
    // be painted together, which is what a horizontally scrolling row looks like.
    expect(header.rule(".nav")).toMatch(/display:\s*none/);
    const wide = header.source.slice(header.source.indexOf("@media (min-width: 900px)"));
    expect(wide).toMatch(/\.nav\s*\{[^}]*display:\s*flex/);
  });

  it("hides the menu button once the desktop nav appears, at the same breakpoint", () => {
    const wide = header.source.slice(header.source.indexOf("@media (min-width: 900px)"));
    expect(wide).toMatch(/\.menuButton\s*\{[^}]*display:\s*none/);
    expect(wide).toMatch(/\.panel\s*\{[^}]*display:\s*none/);
  });
});

describe("phone-width touch targets", () => {
  it("gives the menu button a 44px square", () => {
    const button = header.rule(".menuButton");
    expect(button).toMatch(/width:\s*44px/);
    expect(button).toMatch(/height:\s*44px/);
  });

  it("gives every phone navigation link at least 44px of height", () => {
    expect(header.rule(".panelLink")).toMatch(/min-height:\s*44px/);
    expect(header.rule(".skipLink")).toMatch(/min-height:\s*44px/);
    // The footer is real navigation now, not a decorative strip.
    expect(landing.rule(".footerLink")).toMatch(/min-height:\s*44px/);
    expect(landing.rule(".footerWordmark")).toMatch(/min-height:\s*44px/);
    // The bar's own controls, which are touch targets below 900px.
    expect(header.rule(".wordmark")).toMatch(/min-height:\s*44px/);
    expect(header.rule(".signIn")).toMatch(/min-height:\s*44px/);
    // And the two links that carry the plan forward.
    expect(pages.rule(".chapterEntryLink")).toMatch(/min-height:\s*44px/);
    expect(plan.rule(".continuationLink")).toMatch(/min-height:\s*44px/);
  });
});

describe("the skip link is reachable and then visible", () => {
  it("sits off-screen until it takes focus", () => {
    expect(header.rule(".skipLink")).toMatch(/top:\s*-100%/);
    // Not `display: none`, which would take it out of the tab order entirely.
    expect(header.rule(".skipLink")).not.toMatch(/display:\s*none/);
    expect(header.source).toMatch(/\.skipLink:focus-visible\s*\{[^}]*top:/);
  });
});

describe("the current page is not signalled by colour alone", () => {
  it("carries a weight and a rule as well as a hue", () => {
    const current = header.rule('.navLink[aria-current="page"]');
    expect(current).toMatch(/font-weight:/);
    expect(current).toMatch(/border-bottom:/);

    const panel = header.rule('.panelLink[aria-current="page"]');
    expect(panel).toMatch(/font-weight:/);
    expect(panel).toMatch(/box-shadow:/);
  });
});

describe("the diagram swaps composition rather than scaling", () => {
  it("shows the mobile drawing by default and the desktop one only when wide", () => {
    expect(diagram.rule(".desktop")).toMatch(/display:\s*none/);
    expect(diagram.rule(".mobile")).toMatch(/display:\s*block/);

    const wide = diagram.source.slice(diagram.source.indexOf("@media (min-width: 768px)"));
    expect(wide).toMatch(/\.desktop\s*\{[^}]*display:\s*block/);
    expect(wide).toMatch(/\.mobile\s*\{[^}]*display:\s*none/);
  });

  it("swaps as soon as the desktop drawing fits, not a breakpoint later", () => {
    /*
      The desktop `viewBox` is 720 wide and a 768px viewport gives 704px of
      content, so it renders at 0.98x — its designed size. Holding the swap at
      860px left tablets rendering the 320-wide mobile drawing stretched across
      704px: a 2.2x blow-up, 704 x 1034, taller than the viewport, with every
      12px label reading at 26px.
    */
    const swap = diagram.source.match(/@media\s*\(min-width:\s*(\d+)px\)/);
    expect(swap, "the diagram has no swap breakpoint").not.toBeNull();
    expect(Number(swap![1])).toBeLessThanOrEqual(768);
  });

  it("lets each drawing take the width it is given, and keep its ratio", () => {
    expect(diagram.rule(".mobile")).toMatch(/width:\s*100%/);
    expect(diagram.rule(".mobile")).toMatch(/height:\s*auto/);
  });

  it("caps both drawings so neither is stretched past its design size", () => {
    /*
      `width: 100%` alone hands each drawing the whole column. The mobile
      variant is 320 units wide and was reaching 704px; the desktop variant is
      720 and was reaching 1136px, where it stopped illustrating the page and
      started being it.
    */
    expect(diagram.rule(".mobile")).toMatch(/max-width:\s*400px/);
    expect(diagram.rule(".mobile")).toMatch(/margin-inline:\s*auto/);

    const wide = diagram.source.slice(diagram.source.indexOf("@media (min-width: 768px)"));
    expect(wide).toMatch(/\.desktop\s*\{[^}]*max-width:\s*960px/);
    expect(wide).toMatch(/\.desktop\s*\{[^}]*margin-inline:\s*auto/);
  });
});

describe("the chapter index stacks before it sits side by side", () => {
  it("is a single column until there is room for two", () => {
    expect(pages.rule(".chapters")).toMatch(/display:\s*grid/);
    // No `grid-template-columns` in the base rule: one column at 320 and 375.
    expect(pages.rule(".chapters")).not.toMatch(/grid-template-columns/);
    const wide = pages.source.slice(pages.source.indexOf("@media (min-width: 900px)"));
    expect(wide).toMatch(/\.chapters\s*\{[^}]*grid-template-columns/);
  });
});

/**
 * The responsibility matrix is the one genuinely two-dimensional thing on these
 * pages, and the one most likely to push a phone sideways. jsdom applies no
 * media queries, so this pins the stacking contract at the source.
 */
describe("the responsibility matrix survives a phone", () => {
  it("stacks into labelled blocks below the table breakpoint", () => {
    const stacking = plan.mediaBlocks(849).find((body) => /\.matrix\b/.test(body));
    expect(stacking).toBeDefined();
    expect(stacking).toMatch(/display:\s*block/);
    // The column name travels with the cell, so a stacked row keeps its meaning.
    expect(stacking).toMatch(/content:\s*attr\(data-label\)/);
    // The header row is hidden, not removed: anything reading the table keeps it.
    expect(stacking).toMatch(/clip-path:\s*inset\(50%\)/);
  });

  it("lets a wide table scroll inside its own container", () => {
    // Never the document. A page that scrolls sideways has lost its layout.
    expect(plan.rule(".matrixScroll")).toMatch(/overflow-x:\s*auto/);
  });

  it("only renders the grid at widths where the whole grid fits", () => {
    /*
      The eight columns need 772px of min-content, measured in the browser. A
      viewport spends 64px on gutters above 768px, so the content column reaches
      772px at a 836px viewport — below that the table renders wider than its
      container and roughly 68px of it sits behind a scroll the reader has no
      cue to look for. The breakpoint has to be at least 835px for the choice to
      be between a whole stacked reading and a whole grid.
    */
    const breakpoints = [...plan.source.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)]
      .map((m) => Number(m[1]));
    const matrixBreakpoint = breakpoints.find((bp) =>
      plan.mediaBlocks(bp).some((body) => /\.matrix\b/.test(body)),
    );

    expect(matrixBreakpoint, "no max-width block carries the matrix").toBeDefined();
    expect(matrixBreakpoint!).toBeGreaterThanOrEqual(835);
  });

  it("lets the column headings wrap", () => {
    // `nowrap` on six column names is what makes a table set the page width.
    expect(plan.source).toMatch(/\.matrix thead th\s*\{[^}]*white-space:\s*normal/);
  });
});

/**
 * The motion contract.
 *
 * The site had no motion system at all — the only non-zero transition anywhere
 * was a button's background colour. The hero spine now reveals once, in order,
 * to say that the five stages happen in a sequence.
 *
 * These pin the three rules that keep that from becoming decoration: it runs
 * once rather than looping, it is disabled outright under `prefers-reduced-motion`,
 * and it animates only opacity and transform so it cannot shift layout.
 */
describe("the hero motion says something and then stops", () => {
  it("reveals each stage after the one above it", () => {
    const stage = plan.rule(".spineStage");
    expect(plan.source).toMatch(/@keyframes spine-enter/);
    // Delay derived from the stage's index, so adding a stage needs no new CSS.
    expect(plan.source).toMatch(/animation-delay:\s*calc\([^)]*--stage-index/);
    void stage;
  });

  it("never loops", () => {
    expect(plan.source).not.toMatch(/animation[^;]*infinite/);
    expect(plan.source).not.toMatch(/animation-iteration-count:\s*infinite/);
  });

  it("animates only opacity and transform", () => {
    const frames = plan.source.slice(plan.source.indexOf("@keyframes spine-enter"));
    const block = frames.slice(0, frames.indexOf("}\n}") + 3);
    for (const property of ["width", "height", "margin", "padding", "top", "left"]) {
      expect(block).not.toMatch(new RegExp(`\\b${property}:`));
    }
    expect(block).toMatch(/opacity:/);
    expect(block).toMatch(/transform:/);
  });

  it("runs only where motion is welcome", () => {
    // The animation lives inside the query, so reduced-motion users get the
    // final state with no opt-out needed and no chance of a stuck first frame.
    const guarded = plan.source.slice(
      plan.source.indexOf("@media (prefers-reduced-motion: no-preference)"),
    );
    expect(guarded).toMatch(/\.spineStage\s*\{[^}]*animation:/);
  });

  it("sends the finished state, so nothing waits on JavaScript", () => {
    // `backwards` only affects the pre-delay frame; the element's own styles are
    // the final state, which is what the server renders.
    expect(plan.rule(".spineStage")).not.toMatch(/opacity:\s*0/);
    expect(plan.rule(".spineName")).not.toMatch(/visibility:\s*hidden/);
  });
});

/**
 * Heading hierarchy across widths.
 *
 * The chapter title uses a fluid `clamp()`; the part heading was a fixed size.
 * In a narrow column the two crossed over and an `h2` rendered larger than the
 * `h1`, which inverts the hierarchy exactly where a reader has least context.
 */
describe("a part heading never out-sizes the page title", () => {
  /** `clamp(<min>rem, <a>rem + <b>vw, <max>rem)` evaluated at a viewport width. */
  const evaluate = (clamp: string, viewport: number) => {
    const m = clamp.match(
      /clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)/,
    );
    if (!m) throw new Error(`not a two-part clamp: ${clamp}`);
    const [, min, base, vw, max] = m.map(Number) as unknown as number[];
    const preferred = base * 16 + (vw / 100) * viewport;
    return Math.min(Math.max(preferred, min * 16), max * 16);
  };

  const chapter = "clamp(1.5rem, 1.15rem + 1.5vw, 2.25rem)"; // --p-display-2
  const section = plan.rule(".sectionTitle").match(/font-size:\s*(clamp\([^;]*\))/)?.[1] ?? "";

  it("uses a fluid size, like the chapter title above it", () => {
    expect(section).toMatch(/^clamp\(/);
  });

  /*
    The bug this exists for: the section title was a fixed 28px while the chapter
    title shrinks with the viewport. In a 500px column the h2 rendered larger
    than the h1 — the hierarchy inverted exactly where a reader has the least
    context. Comparing the two ceilings is the wrong check, because the h1 grows
    past the h2 at wide widths; the invariant is that the h2 is smaller at *every*
    width, so both are evaluated.
  */
  it.each([320, 375, 500, 768, 1024, 1440])(
    "stays smaller than the chapter title at %ipx",
    (width) => {
      expect(evaluate(section, width)).toBeLessThan(evaluate(chapter, width));
    },
  );
});

/**
 * The marketing surface sets its own type scale.
 *
 * `--p-text-base` is 14px globally, which suits the product's density and is too
 * small for public prose — at that size body, lead and every subheading landed
 * within 2px of each other. Redefined on the marketing root only, so the six
 * non-marketing stylesheets that read the same token are untouched.
 */
describe("marketing prose reads at its own size", () => {
  it("scopes the scale to the marketing root", () => {
    const page = landing.rule(".page");
    expect(page).toMatch(/--p-text-base:\s*1rem/);
    expect(page).toMatch(/--p-text-lg:\s*1\.125rem/);
    expect(page).toMatch(/font-size:\s*var\(--p-text-base\)/);
  });

  it("expresses every step relative to the reader's own default", () => {
    /*
      Nothing sets a `font-size` on `html`, so `1rem` is whatever the reader set
      in their browser. The heading tokens are already `rem`-based `clamp()`s.
      While these steps were `px`, raising that default grew the headings and
      left the body copy behind — the reader asked for larger text and got a
      wider gap instead.
    */
    const page = landing.rule(".page");
    const steps = [...page.matchAll(/--p-text-[\w-]+:\s*([^;]+);/g)].map((m) => m[1].trim());

    expect(steps.length).toBeGreaterThanOrEqual(5);
    for (const step of steps) {
      expect(step, `type step "${step}" is not reader-relative`).toMatch(/rem$/);
    }
  });

  it("leaves the global tokens alone", () => {
    // Redefining these in tokens.css would move every protected surface too.
    expect(landing.source).not.toMatch(/:root\s*\{/);
  });
});

/**
 * A standfirst has to outrank the prose it introduces.
 *
 * Both leads sit directly under a heading and introduce what follows. When a
 * lead is set at the body step it carries the same size, weight and muted
 * colour as the paragraphs beneath it, and stops doing any work.
 */
describe("leads read above body copy", () => {
  it.each([
    ["hero lead", () => pages.rule(".heroLead")],
    ["section lead", () => plan.rule(".sectionLead")],
  ])("sets %s one step above the base", (_label, rule) => {
    expect(rule()).toMatch(/font-size:\s*var\(--p-text-lg\)/);
  });

  it("leaves body copy on the base step", () => {
    // `.gapBody` declares no size, so it inherits the marketing root's base.
    expect(pages.rule(".gapBody")).not.toMatch(/font-size:/);
  });
});

/**
 * Pointer targets in the desktop header.
 *
 * Every other control in the header already cleared 44px; the four navigation
 * links were the height of their own text, about 24px.
 */
describe("desktop navigation links are worth aiming at", () => {
  it("carries an overlay that reaches 44px", () => {
    // 24px of text plus 10px above and below. An overlay rather than padding:
    // see the rule's own comment for why the box itself cannot grow.
    const overlay = header.rule(".navLink::after");

    expect(overlay).toMatch(/content:\s*""/);
    expect(overlay).toMatch(/position:\s*absolute/);
    expect(overlay).toMatch(/inset-block:\s*-10px/);
  });

  it("keeps the link positioned so the overlay has something to sit on", () => {
    expect(header.rule(".navLink")).toMatch(/position:\s*relative/);
  });

  it("leaves the current-page rule attached to the word", () => {
    // The marker is a `border-bottom` on the link box. Growing that box with
    // padding would strand the rule at the bottom of a 44px target.
    const current = header.rule('.navLink[aria-current="page"]');
    expect(current).toMatch(/border-bottom:/);
    expect(header.rule(".navLink")).not.toMatch(/padding-block:/);
  });
});

/**
 * Footer height on a phone.
 *
 * The footer stacks below 720px and its height lands at the end of an already
 * long page. Its link columns are 44px targets and stay that way — the padding
 * is the part that can give.
 */
describe("the stacked footer is tighter than the laid-out one", () => {
  it("uses the smaller block padding by default", () => {
    expect(landing.rule(".footerInner")).toMatch(/padding-block:\s*var\(--p-space-6\)/);
  });

  it("restores the generous padding once it lays out in columns", () => {
    const wide = landing.source.slice(landing.source.indexOf("@media (min-width: 720px)"));
    expect(wide).toMatch(/\.footerInner\s*\{[^}]*padding-block:\s*var\(--p-space-7\)/);
  });
});
