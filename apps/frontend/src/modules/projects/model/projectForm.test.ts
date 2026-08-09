import { describe, expect, it } from "vitest";

import type { TeamRoleCatalogueEntry } from "./projectDetail";
import {
  type ProjectFormInput,
  type ValidationContext,
  normalizeTechnology,
  validateProjectForm,
} from "./projectForm";

/**
 * The rules that decide whether a project definition can be saved.
 *
 * These assert the **payload**, not just the message: a validator that rejects
 * the right things but builds the wrong body is still broken, and the body is
 * what the backend acts on.
 */

const BACKEND: TeamRoleCatalogueEntry = {
  teamRoleId: "role-backend",
  name: "Backend",
  description: null,
  active: true,
};
const FRONTEND: TeamRoleCatalogueEntry = {
  teamRoleId: "role-frontend",
  name: "Frontend",
  description: null,
  active: true,
};
const RETIRED_QA: TeamRoleCatalogueEntry = {
  teamRoleId: "role-qa",
  name: "Deprecated QA",
  description: null,
  active: false,
};

const CATALOGUE = [BACKEND, FRONTEND, RETIRED_QA];

function input(overrides: Partial<ProjectFormInput> = {}): ProjectFormInput {
  return {
    name: "Apollo",
    period: "FIXED",
    startDate: "2026-08-01",
    deadlineDate: "2026-12-31",
    status: "NOT_STARTED",
    generalDescription: "",
    technologies: [],
    requirements: [],
    ...overrides,
  };
}

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return { mode: "create", catalogue: CATALOGUE, ...overrides };
}

function validate(
  overrides: Partial<ProjectFormInput> = {},
  contextOverrides: Partial<ValidationContext> = {},
) {
  return validateProjectForm(input(overrides), context(contextOverrides));
}

function payloadOf(result: ReturnType<typeof validate>) {
  if (!result.ok) throw new Error(`expected valid, got ${JSON.stringify(result.fieldErrors)}`);
  return result.payload;
}

function errorsOf(result: ReturnType<typeof validate>) {
  if (result.ok) throw new Error("expected invalid");
  return result.fieldErrors;
}

describe("name", () => {
  it("rejects a blank name", () => {
    expect(errorsOf(validate({ name: "   " })).name).toBeDefined();
  });

  it("rejects a name over 200 characters rather than cutting it", () => {
    // A truncated name is a different project.
    const errors = errorsOf(validate({ name: "x".repeat(201) }));
    expect(errors.name).toContain("200");
  });

  it("accepts 200 characters, and trims what it keeps", () => {
    expect(payloadOf(validate({ name: `  ${"x".repeat(200)}  ` })).name).toBe("x".repeat(200));
  });
});

describe("schedule", () => {
  it("requires a deadline for a fixed project", () => {
    expect(errorsOf(validate({ period: "FIXED", deadlineDate: "" })).deadlineDate).toBeDefined();
  });

  it("rejects a deadline before the start date", () => {
    const errors = errorsOf(
      validate({ period: "FIXED", startDate: "2026-08-01", deadlineDate: "2026-07-31" }),
    );
    expect(errors.deadlineDate).toContain("before the start date");
  });

  it("accepts a deadline on the start date", () => {
    expect(
      payloadOf(validate({ period: "FIXED", startDate: "2026-08-01", deadlineDate: "2026-08-01" }))
        .deadlineDate,
    ).toBe("2026-08-01");
  });

  it("rejects a deadline on an ongoing project", () => {
    expect(
      errorsOf(validate({ period: "ONGOING", deadlineDate: "2026-12-31" })).deadlineDate,
    ).toBeDefined();
  });

  it("sends no deadline for an ongoing project", () => {
    // The old date must not survive the switch, so it is null in the payload.
    expect(payloadOf(validate({ period: "ONGOING", deadlineDate: "" })).deadlineDate).toBeNull();
  });
});

describe("status", () => {
  it("allows only planning statuses on create", () => {
    for (const status of ["IN_PROGRESS", "CLOSING", "CLOSED"]) {
      expect(errorsOf(validate({ status })).status).toBeDefined();
    }
    expect(payloadOf(validate({ status: "STARTING" })).status).toBe("STARTING");
    expect(payloadOf(validate({ status: "NOT_STARTED" })).status).toBe("NOT_STARTED");
  });

  it("allows every backend status on edit", () => {
    for (const status of ["NOT_STARTED", "STARTING", "IN_PROGRESS", "CLOSING", "CLOSED"]) {
      expect(payloadOf(validate({ status }, { mode: "edit" })).status).toBe(status);
    }
  });

  it("rejects a status the backend does not have", () => {
    expect(errorsOf(validate({ status: "ARCHIVED" }, { mode: "edit" })).status).toBeDefined();
  });
});

describe("technology stack", () => {
  it("rejects a technology over 160 characters", () => {
    expect(errorsOf(validate({ technologies: ["x".repeat(161)] }))["technology.0"]).toBeDefined();
  });

  it("treats React and ' react ' as the same technology", () => {
    // Case and surrounding whitespace are not what makes two technologies
    // different, and the backend agrees.
    const errors = errorsOf(validate({ technologies: ["React", " react "] }));
    expect(errors["technology.1"]).toContain("already listed");
    expect(errors["technology.0"]).toBeUndefined();
  });

  it("collapses internal whitespace when comparing", () => {
    expect(errorsOf(validate({ technologies: ["Spring  Boot", "spring boot"] }))["technology.1"])
      .toBeDefined();
  });

  it("drops empty rows instead of failing on them", () => {
    // Someone added a row and changed their mind. Nothing is wrong.
    expect(payloadOf(validate({ technologies: ["React", "  ", ""] })).technologyStack).toEqual([
      "React",
    ]);
  });

  it("normalizes what it sends", () => {
    expect(payloadOf(validate({ technologies: ["  Spring   Boot "] })).technologyStack).toEqual([
      "Spring Boot",
    ]);
  });

  it("allows a deliberately empty list, and sends it as an empty array", () => {
    // Present and empty clears the collection; absent would leave it alone.
    expect(payloadOf(validate({ technologies: [] })).technologyStack).toEqual([]);
  });
});

describe("team-role requirements", () => {
  it("requires at least one person per role", () => {
    for (const count of ["0", "-1", "1.5", "", "many"]) {
      expect(
        errorsOf(validate({ requirements: [{ teamRoleId: BACKEND.teamRoleId, requiredMembers: count }] }))[
          "requirement.0"
        ],
      ).toBeDefined();
    }
  });

  it("rejects the same role twice", () => {
    const errors = errorsOf(
      validate({
        requirements: [
          { teamRoleId: BACKEND.teamRoleId, requiredMembers: "2" },
          { teamRoleId: BACKEND.teamRoleId, requiredMembers: "3" },
        ],
      }),
    );
    expect(errors["requirement.1"]).toContain("already required");
  });

  it("rejects a row with no role chosen", () => {
    expect(
      errorsOf(validate({ requirements: [{ teamRoleId: "", requiredMembers: "1" }] }))[
        "requirement.0"
      ],
    ).toContain("Choose a team role");
  });

  it("rejects a role that is not in the catalogue", () => {
    expect(
      errorsOf(validate({ requirements: [{ teamRoleId: "role-invented", requiredMembers: "1" }] }))[
        "requirement.0"
      ],
    ).toBeDefined();
  });

  it("allows a deliberately empty requirement list, sent as an empty array", () => {
    expect(payloadOf(validate({ requirements: [] })).teamRoles).toEqual([]);
  });

  it("sends the count as a number, not the string the form held", () => {
    expect(
      payloadOf(validate({ requirements: [{ teamRoleId: BACKEND.teamRoleId, requiredMembers: "3" }] }))
        .teamRoles,
    ).toEqual([{ teamRoleId: BACKEND.teamRoleId, requiredMembers: 3 }]);
  });
});

describe("inactive team roles", () => {
  it("refuses an inactive role the project never had", () => {
    const errors = errorsOf(
      validate(
        { requirements: [{ teamRoleId: RETIRED_QA.teamRoleId, requiredMembers: "1" }] },
        { mode: "edit", preservableRoleIds: [] },
      ),
    );
    expect(errors["requirement.0"]).toContain("inactive");
  });

  it("keeps an inactive role the project already had", () => {
    // Deactivating a role must not silently rewrite the projects using it.
    const result = validate(
      { requirements: [{ teamRoleId: RETIRED_QA.teamRoleId, requiredMembers: "2" }] },
      { mode: "edit", preservableRoleIds: [RETIRED_QA.teamRoleId] },
    );

    expect(payloadOf(result).teamRoles).toEqual([
      { teamRoleId: RETIRED_QA.teamRoleId, requiredMembers: 2 },
    ]);
  });

  it("keeps an attached inactive role while an unrelated change is saved", () => {
    const result = validate(
      {
        name: "Renamed",
        requirements: [
          { teamRoleId: RETIRED_QA.teamRoleId, requiredMembers: "1" },
          { teamRoleId: FRONTEND.teamRoleId, requiredMembers: "2" },
        ],
      },
      { mode: "edit", preservableRoleIds: [RETIRED_QA.teamRoleId] },
    );

    const payload = payloadOf(result);
    expect(payload.name).toBe("Renamed");
    expect(payload.teamRoles.map((role) => role.teamRoleId)).toEqual([
      RETIRED_QA.teamRoleId,
      FRONTEND.teamRoleId,
    ]);
  });
});

describe("description", () => {
  it("sends a present empty string when cleared", () => {
    // A null would mean "leave unchanged" to the backend, so Clear would keep
    // the old description — the exact bug this guards.
    const payload = payloadOf(validate({ generalDescription: "   " }, { mode: "edit" }));
    expect(payload.generalDescription).toBe("");
    expect(payload.generalDescription).not.toBeNull();
  });

  it("rejects a description over 10000 characters", () => {
    expect(
      errorsOf(validate({ generalDescription: "x".repeat(10_001) })).generalDescription,
    ).toBeDefined();
  });
});

describe("normalizeTechnology", () => {
  it("trims and collapses without lowercasing what is shown", () => {
    expect(normalizeTechnology("  Spring   Boot ")).toBe("Spring Boot");
  });
});
