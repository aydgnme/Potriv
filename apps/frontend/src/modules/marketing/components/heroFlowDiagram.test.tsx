import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroFlowDiagram } from "./HeroFlowDiagram";

/**
 * The staffing-flow diagram, and the three things that were wrong with its
 * ranked-candidates half.
 *
 * These are geometry assertions read out of the rendered SVG, because that is
 * where the defects lived: a card whose right stroke fell outside the `viewBox`,
 * a connector that shared the candidate glyph column and ran through two people,
 * and a `<title>` that turned the whole drawing into a hover tooltip.
 *
 * jsdom lays out no SVG, so nothing here measures pixels. It measures the
 * coordinates the component emits, which is exactly what a browser would then
 * lay out — and what the responsive matrix confirms visually.
 */

const DESKTOP_VIEWBOX = { width: 720, height: 400 };
const MOBILE_VIEWBOX = { width: 320, height: 470 };

function svgs(container: HTMLElement) {
  const all = [...container.querySelectorAll("svg")];
  const desktop = all.find((s) => s.getAttribute("viewBox") === "0 0 720 400");
  const mobile = all.find((s) => s.getAttribute("viewBox") === "0 0 320 470");
  if (!desktop || !mobile) throw new Error("expected a desktop and a mobile variant");
  return { desktop, mobile, all };
}

/** The candidate card is the widest `.node` rect in the right half. */
function rankedCard(svg: SVGElement) {
  const rects = [...svg.querySelectorAll("rect")].filter(
    (rect) => Number(rect.getAttribute("x")) >= 400,
  );
  const card = rects.sort(
    (a, b) => Number(b.getAttribute("width")) - Number(a.getAttribute("width")),
  )[0];
  if (!card) throw new Error("no ranked-candidates card");
  const x = Number(card.getAttribute("x"));
  const y = Number(card.getAttribute("y"));
  return {
    x,
    y,
    width: Number(card.getAttribute("width")),
    height: Number(card.getAttribute("height")),
    right: x + Number(card.getAttribute("width")),
    bottom: y + Number(card.getAttribute("height")),
  };
}

/** Turns an `M/H/V` path into the points it visits. Those are all this uses. */
function pathPoints(d: string): readonly { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (const [, command, value] of d.matchAll(/([MHV])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g)) {
    const first = Number(value);
    if (command === "M") {
      const rest = d.match(/M\s*-?[\d.]+\s+(-?[\d.]+)/);
      x = first;
      y = rest ? Number(rest[1]) : y;
    } else if (command === "H") {
      x = first;
    } else {
      y = first;
    }
    points.push({ x, y });
  }
  return points;
}

/** The long dashed run — the proposal — as opposed to the short arrowhead. */
function proposalPath(svg: SVGElement) {
  const dashed = [...svg.querySelectorAll("path")]
    .map((path) => path.getAttribute("d") ?? "")
    .filter((d) => /^M\d/.test(d) && (d.includes("H") || d.includes("V")));
  const longest = dashed.sort((a, b) => b.length - a.length)[0];
  if (!longest) throw new Error("no proposal path");
  return longest;
}

describe("both variants are inline, server-rendered SVG", () => {
  it("renders two SVG variants and no image asset", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { all } = svgs(container);

    expect(all.length).toBeGreaterThanOrEqual(2);
    // Nothing depends on a raster asset loading, or on JavaScript running.
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("keeps the mobile variant a distinct composition, not a scaled desktop", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop, mobile } = svgs(container);

    expect(desktop.getAttribute("viewBox")).toBe(
      `0 0 ${DESKTOP_VIEWBOX.width} ${DESKTOP_VIEWBOX.height}`,
    );
    expect(mobile.getAttribute("viewBox")).toBe(
      `0 0 ${MOBILE_VIEWBOX.width} ${MOBILE_VIEWBOX.height}`,
    );
    // Shrinking the desktop flow to 390px would leave 9px labels.
    expect(desktop.innerHTML).not.toBe(mobile.innerHTML);
  });

  it("keeps all five stages in the mobile composition", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { mobile } = svgs(container);

    const text = mobile.textContent ?? "";
    for (const stage of [
      "REQUIREMENTS",
      "EVIDENCE",
      "RANKED CANDIDATES",
      "REVIEW",
      "ACTIVE TEAM",
    ]) {
      expect(text).toContain(stage);
    }
  });
});

describe("the ranked-candidates card fits inside the drawing", () => {
  it("leaves a safe inset between its right stroke and the desktop viewBox edge", () => {
    const { container } = render(<HeroFlowDiagram />);
    const card = rankedCard(svgs(container).desktop);

    // It used to end at exactly 720 — the viewBox edge — so the right stroke
    // and the rounded corner were clipped away.
    const inset = DESKTOP_VIEWBOX.width - card.right;
    expect(inset).toBeGreaterThanOrEqual(8);
  });

  it("keeps every mobile card off both vertical edges", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { mobile } = svgs(container);

    for (const rect of mobile.querySelectorAll("rect")) {
      const x = Number(rect.getAttribute("x"));
      const right = x + Number(rect.getAttribute("width"));
      expect(x).toBeGreaterThanOrEqual(8);
      expect(MOBILE_VIEWBOX.width - right).toBeGreaterThanOrEqual(8);
    }
  });

  it("keeps the scores inside the card they belong to", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop } = svgs(container);
    const card = rankedCard(desktop);

    const scores = [...desktop.querySelectorAll("text")].filter((text) =>
      /^\d{2}$/.test(text.textContent ?? ""),
    );
    expect(scores.length).toBe(3);
    for (const score of scores) {
      expect(Number(score.getAttribute("x"))).toBeLessThan(card.right);
    }
  });
});

describe("the proposal connector stays out of the candidate rows", () => {
  it("runs outside the card rather than down the glyph column", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop } = svgs(container);
    const card = rankedCard(desktop);
    const points = pathPoints(proposalPath(desktop));

    /*
      The old path was `M458 48 V210 H300`: it started at the selected person's
      own x and dropped straight through the two people below them. Every turn
      must now be clear of the card.
    */
    const verticalRun = points.filter((point, index) => index > 0 && point.y > card.bottom);
    expect(verticalRun.length).toBeGreaterThan(0);

    const insideCard = points.filter(
      (point) =>
        point.x > card.x && point.x < card.right && point.y > card.y && point.y < card.bottom,
    );
    expect(insideCard, "the connector turns inside the candidate card").toHaveLength(0);
  });

  it("leaves from the card's edge, not from a candidate's glyph", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop } = svgs(container);
    const card = rankedCard(desktop);
    const start = pathPoints(proposalPath(desktop))[0];

    expect(start.x).toBe(card.right);
    // The selected row is the first one, and the port sits on it.
    expect(start.y).toBeGreaterThan(card.y);
    expect(start.y).toBeLessThan(card.bottom);
  });

  it("crosses no row divider", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop } = svgs(container);
    const points = pathPoints(proposalPath(desktop));

    const dividers = [...desktop.querySelectorAll("line")].map((line) => ({
      x1: Number(line.getAttribute("x1")),
      x2: Number(line.getAttribute("x2")),
      y: Number(line.getAttribute("y1")),
    }));

    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      if (from.x !== to.x) continue; // only vertical runs can cross a horizontal divider
      for (const divider of dividers) {
        const crossesBand =
          divider.y > Math.min(from.y, to.y) && divider.y < Math.max(from.y, to.y);
        const withinDivider = from.x >= divider.x1 && from.x <= divider.x2;
        expect(
          crossesBand && withinDivider,
          `connector crosses a divider at y=${divider.y}`,
        ).toBe(false);
      }
    }
  });

  it("has a port on the card edge so the run is attached to a row", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop } = svgs(container);
    const card = rankedCard(desktop);

    const port = [...desktop.querySelectorAll("circle")].find(
      (circle) => Number(circle.getAttribute("cx")) === card.right,
    );
    expect(port, "no port on the ranked card's edge").toBeDefined();
  });
});

describe("the selected candidate is legible without colour", () => {
  it("marks the selected row with a shape, not only a hue", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop, mobile } = svgs(container);

    for (const svg of [desktop, mobile]) {
      // A narrow bar on the row's leading edge: three units wide, so it cannot
      // be confused with a card.
      const marks = [...svg.querySelectorAll("rect")].filter(
        (rect) => Number(rect.getAttribute("width")) === 3,
      );
      expect(marks.length).toBe(1);
    }
  });
});

describe("the figure is named without producing a tooltip", () => {
  it("has no SVG title element anywhere", () => {
    const { container } = render(<HeroFlowDiagram />);

    /*
      `<title>` is what browsers render as a hover tooltip. On a diagram this
      dense the tooltip lands on top of the drawing it is meant to explain, so
      the name comes from a visually hidden caption instead.
    */
    expect(container.querySelectorAll("title")).toHaveLength(0);
  });

  it("names and describes each variant from outside the SVG", () => {
    const { container } = render(<HeroFlowDiagram />);
    const { desktop, mobile } = svgs(container);

    for (const svg of [desktop, mobile]) {
      expect(svg).toHaveAttribute("role", "img");

      const labelId = svg.getAttribute("aria-labelledby") ?? "";
      const describedId = svg.getAttribute("aria-describedby") ?? "";
      expect(container.querySelector(`#${labelId}`)?.textContent).toMatch(
        /how potriv staffs a project/i,
      );
      expect(container.querySelector(`#${describedId}`)?.textContent).toMatch(
        /proposals are drawn as dashed lines/i,
      );
    }
  });

  it("keeps every referenced id unique", () => {
    const { container } = render(<HeroFlowDiagram />);

    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says which candidate is proposed, for a reader who sees none of it", () => {
    const { container } = render(<HeroFlowDiagram />);
    const description = container.querySelector('[id$="-desc"]')?.textContent ?? "";

    expect(description).toMatch(/mert aydogan at 80/i);
    expect(description).toMatch(/marked with a bar/i);
  });
});
