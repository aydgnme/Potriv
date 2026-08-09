import { describe, expect, it } from "vitest";

import { safeBackendMessage } from "./backendTransport";

/**
 * How much of a backend error is allowed to reach a person.
 *
 * Spring's envelope carries `timestamp`, `status`, `error`, `message` and `path`.
 * Only `message` is a sentence written for a human, and even that is taken only
 * when it looks like one — a rejected message costs nothing, because the caller
 * always has its own wording.
 */

describe("safeBackendMessage", () => {
  it("accepts a controlled domain sentence", () => {
    expect(
      safeBackendMessage({
        timestamp: "2026-08-09T12:00:00Z",
        status: 409,
        error: "Conflict",
        message: "This project has progressed beyond planning and can no longer be deleted.",
        path: "/api/projects/abc",
      }),
    ).toBe("This project has progressed beyond planning and can no longer be deleted.");
  });

  it("takes only the message, never the rest of the envelope", () => {
    const taken = safeBackendMessage({ status: 409, message: "Not allowed.", path: "/api/x" });

    expect(taken).toBe("Not allowed.");
    expect(taken).not.toContain("/api");
  });

  it("rejects anything that describes infrastructure rather than the problem", () => {
    for (const message of [
      "Failed at https://backend.internal/api/projects",
      "Request to /api/projects/1 failed",
      "org.springframework.web.HttpRequestMethodNotSupportedException",
      "\tat me.aydgn.potriv.project.ProjectService.delete(ProjectService.java:215)",
      // Shaped like a leaked header without being one.
      "Bearer <redacted-token-shape>",
    ]) {
      expect(safeBackendMessage({ message })).toBeNull();
    }
  });

  it("rejects a multi-line message, which is usually a trace", () => {
    expect(safeBackendMessage({ message: "Something broke\n  at Foo.bar" })).toBeNull();
  });

  it("rejects an unbounded message", () => {
    expect(safeBackendMessage({ message: "x".repeat(301) })).toBeNull();
    expect(safeBackendMessage({ message: "x".repeat(300) })).toBe("x".repeat(300));
  });

  it("rejects a message that is not a string, and a body that is not an object", () => {
    for (const body of [null, undefined, "plain text", 42, [], { message: 42 }, { message: {} }]) {
      expect(safeBackendMessage(body)).toBeNull();
    }
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(safeBackendMessage({ message: "   " })).toBeNull();
  });
});
