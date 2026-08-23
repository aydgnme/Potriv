import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InvitePage } from "./InvitePage";
import { ResetPasswordPage } from "./ResetPasswordPage";

/**
 * The address bar after either credential-bearing page has loaded.
 *
 * Both pages read the token from the fragment, and neither accepts one from the
 * query string. But refusing to *read* a query token is not the same as
 * removing it: `/reset-password?token=SECRET` was rejected and then left sitting
 * in the address bar, which is the copy that ends up in a screenshot, a
 * bookmark, or a shared link.
 *
 * The matrix below is the four ways a link actually arrives, against both
 * pages, because the previous implementation handled exactly one of them.
 */

const SECRET = "token-value-SECRET";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

const PAGES = [
  { name: "invite", path: "/invite", element: <InvitePage authenticated={false} /> },
  { name: "reset-password", path: "/reset-password", element: <ResetPasswordPage /> },
] as const;

const ARRIVALS = [
  { name: "fragment only", suffix: `#token=${SECRET}` },
  { name: "query only", suffix: `?token=${SECRET}` },
  { name: "query and fragment", suffix: `?token=${SECRET}#token=${SECRET}` },
  { name: "a credential beside an ordinary parameter", suffix: `?from=email&token=${SECRET}` },
  { name: "every credential parameter name", suffix: "?token=a&inviteToken=b&resetToken=c" },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(PAGES)("$name", ({ path, element }) => {
  it.each(ARRIVALS)("clears the credential when it arrives as $name", async ({ suffix }) => {
    window.history.replaceState({}, "", `${path}${suffix}`);

    render(element);

    await waitFor(() => expect(window.location.hash).toBe(""));

    expect(window.location.href).not.toContain(SECRET);
    expect(window.location.search).not.toContain("token=");
    expect(window.location.search).not.toContain("inviteToken");
    expect(window.location.search).not.toContain("resetToken");
  });

  it("keeps a parameter that is not a credential", async () => {
    window.history.replaceState({}, "", `${path}?from=email#token=${SECRET}`);

    render(element);

    await waitFor(() => expect(window.location.hash).toBe(""));

    // Removing this would break ordinary attribution links for no benefit.
    expect(window.location.search).toBe("?from=email");
  });

  it("replaces the history entry, so Back cannot restore the credential", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    window.history.replaceState({}, "", `${path}#token=${SECRET}`);
    // The line above is this test arranging the URL, not the component acting.
    // `spyOn` returns an existing spy when one is already installed, so the
    // arrangement has to be cleared explicitly rather than assumed absent.
    replace.mockClear();
    push.mockClear();

    render(element);

    await waitFor(() => expect(window.location.hash).toBe(""));

    expect(push).not.toHaveBeenCalled();
    for (const call of replace.mock.calls) {
      expect(String(call[2])).not.toContain(SECRET);
    }
  });
});
