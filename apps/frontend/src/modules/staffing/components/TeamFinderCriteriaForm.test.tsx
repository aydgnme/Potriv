import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EffectiveCriteria } from "../model/teamFinderData";
import { normalizeTeamFinderQuery } from "../model/teamFinderQuery";

import { TeamFinderCriteriaForm } from "./TeamFinderCriteriaForm";

/**
 * The criteria form.
 *
 * Two things it must never do: run the finder on a toggle, and report criteria
 * the backend did not actually confirm. The sentence under the form is the
 * backend's echo, and where the backend said nothing the form says nothing.
 */

function effective(overrides: Partial<EffectiveCriteria> = {}): EffectiveCriteria {
  return {
    includePartiallyAvailable: false,
    includeCloseToFinish: false,
    closeToFinishWeeks: null,
    includeUnavailable: false,
    limit: 50,
    ...overrides,
  };
}

function renderForm(
  params: Record<string, string> = {},
  echoed: EffectiveCriteria | null = effective(),
) {
  return render(
    <TeamFinderCriteriaForm criteria={normalizeTeamFinderQuery(params)} effective={echoed} />,
  );
}

describe("one explicit run", () => {
  it("navigates with GET rather than firing a request per toggle", () => {
    const { container } = renderForm();
    const form = container.querySelector("form") as HTMLFormElement;

    // A GET form puts the criteria in the address and reloads once. Team Finder
    // ranks a whole organization; running it because somebody ticked a box on
    // the way to ticking three more is work nobody asked for.
    expect(form.getAttribute("method")).toBe("get");
    expect(screen.getByRole("button", { name: "Run finder" })).toHaveAttribute("type", "submit");
  });

  it("calls the cap a cap, never a page or a total", () => {
    renderForm();

    expect(screen.getByText("Return at most")).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/page size|per page|total matches|of \d+ results/i);
  });
});

describe("including unavailable people", () => {
  /**
   * Widening who comes back is not widening who can be asked for. Without this
   * sentence a manager reads a full evidence panel and only then finds the
   * proposal form closed because the person has no hours.
   */
  it("says that it widens who is returned, not who can be proposed", () => {
    renderForm();

    expect(
      screen.getByText(/widens who is returned, not who can be proposed/i),
    ).toBeInTheDocument();
  });
});

describe("what the summary is allowed to claim", () => {
  it("reports the backend's echoed criteria, not the form draft", () => {
    // The URL asked for 10; the backend says it used 50. The backend wins.
    renderForm({ limit: "10" }, effective({ limit: 50 }));

    expect(screen.getByText(/at most 50 candidates/)).toBeInTheDocument();
    expect(screen.queryByText(/at most 10 candidates/)).toBeNull();
  });

  it("names the close-to-finish window only when the backend returned one", () => {
    renderForm({}, effective({ includeCloseToFinish: true, closeToFinishWeeks: 4 }));

    expect(screen.getByText(/finishing other work within 4 weeks/)).toBeInTheDocument();
  });

  it("invents no window when the backend echoed none", () => {
    renderForm({}, effective({ includeCloseToFinish: true, closeToFinishWeeks: null }));

    // Falling back to a number would assert a backend default the browser does
    // not know — in a sentence whose whole job is reporting what the backend did.
    expect(screen.getByText(/finishing other work soon/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/within \d+ weeks/);
  });

  it("says nothing at all when the finder has not answered", () => {
    renderForm({}, null);

    expect(screen.queryByText(/Showing results for/)).toBeNull();
  });
});
