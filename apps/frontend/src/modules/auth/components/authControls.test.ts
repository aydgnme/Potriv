import { describe, expect, it } from "vitest";

import { cssContract } from "@/test/cssContract";

/**
 * The control contract for the five public auth routes.
 *
 * Sign in, create workspace, forgot password, reset password and join by invite
 * are the product's front door, and they are not the product's dense screens.
 * These assert CSS source rather than behaviour: control height and pointer
 * target size are layout facts that jsdom does not compute.
 */

const shell = cssContract("src/modules/auth/components/PublicAuthShell.module.css");
const authPage = cssContract("src/modules/auth/components/AuthPage.module.css");
const workspace = cssContract("src/modules/auth/components/CreateWorkspacePage.module.css");

describe("public auth pages share one control standard", () => {
  it("redefines the control tokens on the shell root", () => {
    /*
      The defect: sign-in fields were 34px and its button 40px, create-workspace
      fields were 40px, and the marketing calls to action that send visitors
      there are 48px. Three different answers on one path.
    */
    const page = shell.rule(".page");

    expect(page).toMatch(/--p-control:\s*48px/);
    expect(page).toMatch(/--p-control-lg:\s*48px/);
  });

  it("sets field text at or above the size that stops iOS zooming on focus", () => {
    // 14px field text makes Safari zoom the page when the field takes focus,
    // which moves the form out from under the reader.
    expect(shell.rule(".page")).toMatch(/--p-text-base:\s*1rem/);
  });

  it("scopes the standard to the shell instead of the global tokens", () => {
    /*
      `tokens.css` is read by every authenticated screen, where 34px controls
      are a deliberate density for tables and rows. This override has to stay
      inside the auth shell.
    */
    expect(shell.source).not.toMatch(/:root\s*\{/);
  });

  it("leaves no hard-coded control height on create workspace", () => {
    // It had its own 44px minimums, which is how the two pages drifted apart.
    expect(workspace.source).not.toMatch(/min-height:\s*44px/);
    expect(workspace.source).toMatch(/min-height:\s*var\(--p-control-lg\)/);
  });
});

describe("secondary auth links are worth aiming at", () => {
  const overlay = /content:\s*""[\s\S]*?position:\s*absolute[\s\S]*?inset-block:\s*-(\d+)px/;

  it.each([
    ["the wordmark and shell footer links", () => shell.rule(".wordmark::after,\n.footer a::after")],
    ["the forgot-password link", () => authPage.rule(".footerLink a::after")],
    ["the create-workspace sign-in link", () => workspace.rule(".footerNote a::after")],
  ])("gives %s an overlay that reaches 44px", (_label, rule) => {
    const body = rule();
    const match = body.match(overlay);

    expect(match, `no 44px overlay found:\n${body}`).not.toBeNull();
    // Smallest text here is a 17px line box; 11px each side clears 44px, and
    // the 24px wordmark clears it with the same value.
    expect(Number(match![1])).toBeGreaterThanOrEqual(11);
  });

  it("positions the links so the overlay has something to sit on", () => {
    expect(shell.rule(".wordmark")).toMatch(/position:\s*relative/);
    expect(shell.rule(".footer a")).toMatch(/position:\s*relative/);
    expect(authPage.rule(".footerLink a")).toMatch(/position:\s*relative/);
    expect(workspace.rule(".footerNote a")).toMatch(/position:\s*relative/);
  });
});
