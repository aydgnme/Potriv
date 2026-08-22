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
    expect(landing.rule(".overviewLink")).toMatch(/min-height:\s*44px/);
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

    const wide = diagram.source.slice(diagram.source.indexOf("@media (min-width: 860px)"));
    expect(wide).toMatch(/\.desktop\s*\{[^}]*display:\s*block/);
    expect(wide).toMatch(/\.mobile\s*\{[^}]*display:\s*none/);
  });

  it("lets each drawing take the width it is given, and keep its ratio", () => {
    expect(diagram.rule(".mobile")).toMatch(/width:\s*100%/);
    expect(diagram.rule(".mobile")).toMatch(/height:\s*auto/);
  });
});

describe("the landing previews stack before they sit side by side", () => {
  it("is a single column until there is room for two", () => {
    expect(landing.rule(".overview")).toMatch(/display:\s*grid/);
    // No `grid-template-columns` in the base rule: one column at 320 and 375.
    expect(landing.rule(".overview")).not.toMatch(/grid-template-columns/);
    const wide = landing.source.slice(landing.source.indexOf("@media (min-width: 720px)"));
    expect(wide).toMatch(/\.overview\s*\{[^}]*grid-template-columns/);
  });
});
