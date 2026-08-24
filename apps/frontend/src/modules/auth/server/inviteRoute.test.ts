import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the `/invite` route does on the server.
 *
 * It must not redirect. A server redirect keeps the fragment — the browser
 * reattaches it to a destination that has none — so redirecting a signed-in
 * reader moved the invite token onto `/home`, where nothing was listening to
 * clear it. The session is reported to the client instead, and the client
 * redirects once the token has been read and erased.
 *
 * This is the root cause rather than the symptom: the component test can only
 * show that the browser behaves, whereas this fails the moment somebody
 * reintroduces the server-side redirect.
 */

const redirect = vi.fn(() => {
  throw new Error("redirect() must not be called from the invite route");
});
const resolveProductSession = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/modules/auth/server/productSession", () => ({ resolveProductSession }));
vi.mock("@/modules/auth/components/InvitePage", () => ({
  InvitePage: (props: { authenticated: boolean }) => props,
}));

const { default: Page } = await import("../../../../app/(product)/invite/page");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the invite route", () => {
  it("does not redirect a signed-in reader", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "u-1", roles: ["EMPLOYEE"] },
    });

    await expect(Page()).resolves.toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("tells the client whether there is a session, and nothing else", async () => {
    resolveProductSession.mockResolvedValue({
      authenticated: true,
      user: { userId: "u-1", roles: ["EMPLOYEE"] },
    });

    const element = (await Page()) as { props: Record<string, unknown> };

    expect(element.props).toEqual({ authenticated: true });
  });

  it("reports an anonymous reader the same way", async () => {
    resolveProductSession.mockResolvedValue({ authenticated: false });

    const element = (await Page()) as { props: Record<string, unknown> };

    expect(element.props).toEqual({ authenticated: false });
    expect(redirect).not.toHaveBeenCalled();
  });
});
