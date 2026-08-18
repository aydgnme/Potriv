import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProductError from "../../../../app/error";
import NotFound from "../../../../app/not-found";

/**
 * The two global system-state pages.
 *
 * Both are last resorts, and the temptation in a last resort is to reassure. The
 * tests below are mostly about what these pages must *not* say, because an
 * untrue reassurance on an error screen is worse than the error.
 */

describe("the global error page", () => {
  function renderError() {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<ProductError error={Object.assign(new Error("boom"), { digest: "abc123" })} reset={reset} />);
    return reset;
  }

  it("does not claim anything about whether work was saved", () => {
    renderError();

    /*
      A server action can commit and the render that follows can still throw.
      A boundary this far out has no evidence either way, so it must not say
      "nothing was changed" — that is reassurance it cannot back up.
    */
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const claim of [
      "nothing you were doing has been changed",
      "nothing was changed",
      "no changes were made",
      "your action was not saved",
      "your changes were not saved",
      "nothing has been saved",
    ]) {
      expect(text).not.toContain(claim);
    }
  });

  it("says only that the page could not be displayed", () => {
    renderError();

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/This page could not be displayed/)).toBeInTheDocument();
  });

  it("leaks no diagnostic detail", () => {
    renderError();

    const text = document.body.textContent ?? "";
    // No message, no digest, no stack, no backend origin.
    for (const detail of ["boom", "abc123", "localhost:8080", "at Object", "Error:"]) {
      expect(text).not.toContain(detail);
    }
  });

  it("offers a re-render and a way home, and calls neither a guarantee", () => {
    const reset = renderError();

    // `reset()` re-renders a segment — a read. It is not described as proving
    // anything about mutation state.
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/home");
  });
});

describe("the global not-found page", () => {
  it("speaks about the address, never about an object's existence", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();

    /*
      Domain routes collapse "missing" and "not visible to you" into one
      sentence on purpose. This page must not import that vocabulary, or a
      refusal elsewhere could be read as proof of absence here.
    */
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const leak of ["does not exist or is not visible", "you do not have access", "forbidden"]) {
      expect(text).not.toContain(leak);
    }
  });
});
