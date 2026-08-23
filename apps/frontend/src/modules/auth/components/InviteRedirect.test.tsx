import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitePage } from "./InvitePage";

/**
 * An invite link opened by somebody who is already signed in.
 *
 * The route used to redirect on the server when a session existed. A redirect
 * keeps the fragment — the browser reattaches it when the destination has none
 * of its own — so `/invite#token=SECRET` landed on `/home#token=SECRET`, and no
 * client component ever mounted on `/invite` to clear it. The token then sat in
 * the address bar of an ordinary product page, in that history entry, and in
 * every screenshot taken from there.
 *
 * The redirect happens in the browser now, and only after the fragment has been
 * read and erased. These tests are the proof of that ordering.
 */

const SECRET = "invite-token-value-SECRET";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", `/invite#token=${SECRET}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a signed-in reader opening an invite link", () => {
  it("is sent to /home", async () => {
    render(<InvitePage authenticated />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/home"));
  });

  it("leaves the credential nowhere in the URL it is redirected from", async () => {
    render(<InvitePage authenticated />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalled());

    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(SECRET);
    expect(window.location.search).not.toContain("token");
  });

  it("erases the fragment before it navigates, not after", async () => {
    /*
      The ordering is the whole fix. If the redirect were issued first, the
      browser would carry the fragment to /home and this page would be gone
      before anything could clear it.
    */
    let hashAtRedirect: string | null = null;
    routerReplace.mockImplementation(() => {
      hashAtRedirect = window.location.hash;
    });

    render(<InvitePage authenticated />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(hashAtRedirect).toBe("");
  });

  it("replaces the history entry rather than pushing one", async () => {
    // A pushed entry would leave the original, token-bearing URL one Back away.
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");

    render(<InvitePage authenticated />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    for (const call of replace.mock.calls) {
      expect(String(call[2])).not.toContain(SECRET);
    }
  });

  it("never renders the invitation form, and never the token", async () => {
    const { container } = render(<InvitePage authenticated />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalled());

    expect(screen.queryByLabelText("Work email")).toBeNull();
    expect(container.innerHTML).not.toContain(SECRET);
    expect(container.textContent).not.toContain(SECRET);
  });

  it("writes no copy to storage or cookies", async () => {
    render(<InvitePage authenticated />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalled());

    for (const store of [window.localStorage, window.sessionStorage]) {
      if (!store) continue;
      const values: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null) values.push(store.getItem(key) ?? "");
      }
      expect(values.join("|")).not.toContain(SECRET);
    }
    expect(document.cookie).not.toContain(SECRET);
  });

  it("does not redirect a reader who is not signed in", async () => {
    render(<InvitePage authenticated={false} />);

    expect(await screen.findByLabelText("Work email")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
