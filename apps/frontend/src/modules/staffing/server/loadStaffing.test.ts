import { describe, expect, it, vi } from "vitest";

import type { AccessRole } from "@/shared/types/accessRole";

import { normalizeReviewStatus, staffingHref, emptyQueueMessage } from "../model/staffingQuery";

import { hasStaffingCapability, loadStaffing } from "./loadStaffing";
import type { StaffingDataSources } from "./staffingDataSources";

/**
 * Which side of the handshake this session is on, and what that entitles it to.
 *
 * "Was the source called?" is the contract. Asking the review endpoint on behalf
 * of a project manager would send a request the backend rightly refuses, on every
 * page load, and would make capability depend on error handling.
 */

function sources(overrides: Partial<StaffingDataSources> = {}) {
  return {
    getProjectContext: vi.fn(),
    findCandidates: vi.fn(),
    proposeAssignment: vi.fn(),
    getProjectTeamMembers: vi.fn(),
    getReviewQueue: vi.fn(async () => ({ ok: true as const, value: [] })),
    getManagedProjectEntries: vi.fn(async () => ({ ok: true as const, value: [] })),
    ...overrides,
  } as unknown as StaffingDataSources & Record<string, ReturnType<typeof vi.fn>>;
}

const DM: readonly AccessRole[] = ["EMPLOYEE", "DEPARTMENT_MANAGER"];
const PM: readonly AccessRole[] = ["EMPLOYEE", "PROJECT_MANAGER"];
const BOTH: readonly AccessRole[] = ["EMPLOYEE", "PROJECT_MANAGER", "DEPARTMENT_MANAGER"];

describe("source gating", () => {
  it("gives a department manager the queue and nothing else", async () => {
    const deps = sources();

    const data = await loadStaffing("PENDING", DM, deps);

    expect(deps.getReviewQueue).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjectEntries).not.toHaveBeenCalled();
    expect(data.managedProjects).toBeNull();
  });

  it("gives a project manager their projects and never asks the review endpoint", async () => {
    const deps = sources();

    const data = await loadStaffing("PENDING", PM, deps);

    expect(deps.getManagedProjectEntries).toHaveBeenCalledTimes(1);
    expect(deps.getReviewQueue).not.toHaveBeenCalled();
    expect(data.reviews).toBeNull();
  });

  it("gives someone who is both sides of the handshake both", async () => {
    const deps = sources();

    const data = await loadStaffing("PENDING", BOTH, deps);

    expect(deps.getReviewQueue).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjectEntries).toHaveBeenCalledTimes(1);
    expect(data.reviews).not.toBeNull();
    expect(data.managedProjects).not.toBeNull();
  });

  it("passes the requested status to the backend", async () => {
    const deps = sources();

    await loadStaffing("REJECTED", DM, deps);

    expect(deps.getReviewQueue).toHaveBeenCalledWith("REJECTED");
  });

  it("keeps a department-manager refusal distinct from an outage", async () => {
    // Holding the role without an assignment is a setup state, not a failure.
    const deps = sources({
      getReviewQueue: vi.fn(async () => ({ ok: false as const, reason: "FORBIDDEN" as const })),
    });

    const data = await loadStaffing("PENDING", DM, deps);

    expect(data.reviews).toEqual({ ok: false, reason: "FORBIDDEN" });
  });

  it("still loads the project side for a manager with no department", async () => {
    const deps = sources({
      getReviewQueue: vi.fn(async () => ({ ok: false as const, reason: "FORBIDDEN" as const })),
    });

    const data = await loadStaffing("PENDING", BOTH, deps);

    expect(data.reviews?.ok).toBe(false);
    expect(data.managedProjects?.ok).toBe(true);
  });
});

describe("hasStaffingCapability", () => {
  it("is true for either side of the handshake", () => {
    expect(hasStaffingCapability(DM)).toBe(true);
    expect(hasStaffingCapability(PM)).toBe(true);
    expect(hasStaffingCapability(BOTH)).toBe(true);
  });

  it("is false for anyone else", () => {
    expect(hasStaffingCapability(["EMPLOYEE"])).toBe(false);
    expect(hasStaffingCapability(["EMPLOYEE", "ORGANIZATION_ADMIN"])).toBe(false);
  });
});

describe("status normalization", () => {
  it("defaults to what is waiting", () => {
    expect(normalizeReviewStatus({})).toBe("PENDING");
  });

  it("keeps the three real statuses", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED"]) {
      expect(normalizeReviewStatus({ status })).toBe(status);
    }
  });

  it("falls back for anything else, so nothing arbitrary reaches the backend", () => {
    for (const status of ["pending", "Approved", "banana", "", "DELETED", "1"]) {
      expect(normalizeReviewStatus({ status })).toBe("PENDING");
    }
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(normalizeReviewStatus({ status: ["APPROVED", "REJECTED"] })).toBe("APPROVED");
  });
});

describe("links and empty states", () => {
  it("leaves the default status out of the URL", () => {
    expect(staffingHref("PENDING")).toBe("/staffing");
    expect(staffingHref("APPROVED")).toBe("/staffing?status=APPROVED");
  });

  it("says something true for each filter", () => {
    // An empty pending queue is good news, not missing data.
    expect(emptyQueueMessage("PENDING")).toBe("No proposals waiting.");
    expect(emptyQueueMessage("APPROVED")).toBe("No approved proposals.");
    expect(emptyQueueMessage("REJECTED")).toBe("No rejected proposals.");
  });
});

/**
 * The request budget, per capability.
 *
 * Every source is gated on the role that entitles it, so nothing is fetched
 * speculatively and no 403 is used as a capability check. The counts are the
 * contract: a page render must not grow a request because a queue got longer.
 */
describe("fixed request budget", () => {
  it("spends nothing privileged for someone with neither capability", async () => {
    const deps = sources();

    await loadStaffing("PENDING", ["EMPLOYEE"], deps);

    expect(deps.getReviewQueue).not.toHaveBeenCalled();
    expect(deps.getManagedProjectEntries).not.toHaveBeenCalled();
  });

  it("spends exactly one call for a department manager", async () => {
    const deps = sources();

    await loadStaffing("PENDING", ["EMPLOYEE", "DEPARTMENT_MANAGER"], deps);

    expect(deps.getReviewQueue).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjectEntries).not.toHaveBeenCalled();
  });

  it("spends exactly one call for a project manager", async () => {
    const deps = sources();

    await loadStaffing("PENDING", ["EMPLOYEE", "PROJECT_MANAGER"], deps);

    expect(deps.getManagedProjectEntries).toHaveBeenCalledTimes(1);
    expect(deps.getReviewQueue).not.toHaveBeenCalled();
  });

  it("spends exactly two for somebody who is both, and no more per status", async () => {
    const deps = sources();

    await loadStaffing("APPROVED", ["DEPARTMENT_MANAGER", "PROJECT_MANAGER"], deps);

    expect(deps.getReviewQueue).toHaveBeenCalledTimes(1);
    expect(deps.getManagedProjectEntries).toHaveBeenCalledTimes(1);
    // One queue call for the selected status — never three to label the tabs.
    expect(deps.getReviewQueue).toHaveBeenCalledWith("APPROVED");
  });
});

/**
 * One capability failing must not take the other down.
 *
 * Somebody who is both a department manager and a project manager is doing two
 * different jobs on this page. A failed queue read is not a reason to withhold
 * their own projects, and vice versa.
 */
describe("partial failure across capabilities", () => {
  const both = ["DEPARTMENT_MANAGER", "PROJECT_MANAGER"] as const;

  it("keeps the project section usable when the review queue fails", async () => {
    const deps = sources({
      getReviewQueue: vi.fn(async () => ({ ok: false, reason: "ERROR" }) as const),
    });

    const data = await loadStaffing("PENDING", both, deps);

    expect(data.reviews?.ok).toBe(false);
    expect(data.managedProjects?.ok).toBe(true);
  });

  it("keeps the review queue usable when managed projects fail", async () => {
    const deps = sources({
      getManagedProjectEntries: vi.fn(async () => ({ ok: false, reason: "ERROR" }) as const),
    });

    const data = await loadStaffing("PENDING", both, deps);

    expect(data.reviews?.ok).toBe(true);
    expect(data.managedProjects?.ok).toBe(false);
  });

  it("keeps a role-without-appointment refusal distinguishable from an outage", async () => {
    // The backend answers 403 to a DEPARTMENT_MANAGER who manages no department.
    // Flattening that into ERROR would describe a setup state as a failure.
    const deps = sources({
      getReviewQueue: vi.fn(async () => ({ ok: false, reason: "FORBIDDEN" }) as const),
    });

    const data = await loadStaffing("PENDING", both, deps);

    expect(data.reviews).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(data.managedProjects?.ok).toBe(true);
  });
});
