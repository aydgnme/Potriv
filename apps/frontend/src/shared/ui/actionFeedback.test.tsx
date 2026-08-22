import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState } from "react";
import { describe, expect, it } from "vitest";

import { ActionFeedback, useLatestOutcome, type ActionOutcome } from "./ActionFeedback";

/**
 * The action-result contract.
 *
 * `FormErrorSummary` covers validation — the failure that happens *before* an
 * action runs. This covers what happens after one: a revoke that failed, a skill
 * that saved, a category that could not be renamed. Those were rendered as plain
 * `<span>` and `<p>`: visible, and programmatically silent, so somebody using a
 * screen reader could complete an action and hear nothing about the result.
 *
 * As in the validation tests, "announced" means the message is inside a region
 * with the right role. That is the DOM contract screen readers act on. It is not
 * a screen-reader product matrix and is not claimed as one.
 */

describe("an outcome maps to the right role", () => {
  it("announces a failure assertively", () => {
    render(<ActionFeedback outcome={{ error: "That session was not revoked." }} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("That session was not revoked.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces a success politely", () => {
    render(<ActionFeedback outcome={{ done: "Session revoked." }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Session revoked.");
    // Politely, not assertively: a confirmation can wait for a gap in speech.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says nothing at all when there is no outcome", () => {
    const { container } = render(<ActionFeedback outcome={{}} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one region, not two, if an outcome somehow carries both", () => {
    render(<ActionFeedback outcome={{ error: "Failed.", done: "Saved." }} />);

    // A contradiction; the failure is the half that needs acting on.
    expect(screen.getByRole("alert")).toHaveTextContent("Failed.");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Saved.")).toBeNull();
  });

  it("keeps each site's own element and class", () => {
    render(
      <ActionFeedback
        outcome={{ error: "Nope." }}
        as="span"
        errorClassName="rowError"
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.tagName).toBe("SPAN");
    expect(alert).toHaveClass("rowError");
  });

  it("adds no tab stop", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <ActionFeedback outcome={{ error: "Nope." }} />
        <button type="button">After</button>
      </>,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    await user.tab();
    // Straight past the feedback: it is something to hear, not something to visit.
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });
});

describe("a repeated identical outcome is announced again", () => {
  /** A row whose action keeps failing with exactly the same sentence. */
  function AlwaysFails() {
    const [state, formAction] = useActionState(
      async (): Promise<ActionOutcome> => ({ error: "That did not work." }),
      {} as ActionOutcome,
    );
    return (
      <form action={formAction}>
        <ActionFeedback outcome={state} revision={state} />
        <button type="submit">Try</button>
      </form>
    );
  }

  it("replaces the node so the live region has a change to report", async () => {
    const user = userEvent.setup();
    render(<AlwaysFails />);

    const button = screen.getByRole("button", { name: "Try" });
    button.focus();
    await user.keyboard("{Enter}");
    const first = await screen.findByRole("alert");
    expect(first).toHaveTextContent("That did not work.");

    button.focus();
    await user.keyboard("{Enter}");
    const second = await screen.findByRole("alert");

    /*
      The text is identical, so re-rendering it into the same node would change
      nothing and announce nothing. A live region reports DOM changes, not the
      fact that something happened. `revision` remounts the node, which is the
      change it needs.
    */
    expect(second).not.toBe(first);
    expect(second).toHaveTextContent("That did not work.");
    // And still exactly one region, not one per attempt.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("only the newest of several row actions is feedback", () => {
  /** Two independent actions on one row, exactly as a category row has three. */
  function Row({ first, second }: { first: ActionOutcome; second: ActionOutcome }) {
    const [firstState, firstAction] = useActionState(async () => first, {} as ActionOutcome);
    const [secondState, secondAction] = useActionState(async () => second, {} as ActionOutcome);
    const latest = useLatestOutcome([firstState, secondState]);
    return (
      <div>
        <ActionFeedback outcome={latest.outcome} revision={latest.revision} />
        <form action={firstAction}>
          <button type="submit">First</button>
        </form>
        <form action={secondAction}>
          <button type="submit">Second</button>
        </form>
      </div>
    );
  }

  const press = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    screen.getByRole("button", { name }).focus();
    await user.keyboard("{Enter}");
  };

  it("does not leave an earlier error beside a later success", async () => {
    const user = userEvent.setup();
    render(<Row first={{ error: "Rename failed." }} second={{ done: "Retired." }} />);

    await press(user, "First");
    expect(await screen.findByRole("alert")).toHaveTextContent("Rename failed.");

    await press(user, "Second");
    expect(await screen.findByRole("status")).toHaveTextContent("Retired.");
    // The stale failure is gone, not merely pushed down the row.
    expect(screen.queryByText("Rename failed.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not let an earlier success mask a later error", async () => {
    const user = userEvent.setup();
    render(<Row first={{ done: "Saved." }} second={{ error: "Could not remove." }} />);

    await press(user, "First");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");

    await press(user, "Second");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not remove.");
    expect(screen.queryByText("Saved.")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never puts two live regions on one row", async () => {
    const user = userEvent.setup();
    render(<Row first={{ error: "Rename failed." }} second={{ error: "Retire failed." }} />);

    await press(user, "First");
    await screen.findByRole("alert");
    await press(user, "Second");
    await screen.findByText("Retire failed.");

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("reports nothing before any action has run", () => {
    render(<Row first={{ error: "x" }} second={{ error: "y" }} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("useLatestOutcome picks by identity, not by content", () => {
  it("treats a new object with the same text as a new result", async () => {
    const seen: number[] = [];
    function Probe({ outcome }: { outcome: ActionOutcome }) {
      const { revision } = useLatestOutcome([outcome]);
      seen.push(revision);
      return null;
    }

    const same = { error: "Same." };
    const { rerender } = render(<Probe outcome={same} />);
    rerender(<Probe outcome={same} />);
    const before = seen.at(-1);

    // A different object carrying identical text is still a new result.
    rerender(<Probe outcome={{ error: "Same." }} />);
    expect(seen.at(-1)).toBe((before ?? 0) + 1);
  });
});
