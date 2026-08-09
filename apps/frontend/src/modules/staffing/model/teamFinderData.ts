import type { ProjectStatus } from "@/shared/types/projectStatus";

/**
 * The Team Finder response, and the slice of a project this module needs.
 *
 * Staffing keeps its own types rather than reaching into `modules/projects`.
 * The two modules read the same `/projects/{id}/details` endpoint, but a shared
 * type would make either one's rendering decisions the other's problem — and the
 * architecture rule is that modules do not import each other.
 */

export type UserSummary = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
};

export type DepartmentSummary = {
  readonly departmentId: string;
  readonly name: string;
};

/** `POST /projects/{projectId}/team-finder` — a read that happens to be a POST. */
export type TeamFinderResult = {
  readonly projectId: string;
  readonly generatedAt: string | null;
  /**
   * The criteria the backend actually used, including the defaults it filled in.
   * This — not the form draft — is what "Showing results for…" reports.
   */
  readonly criteria: EffectiveCriteria;
  /**
   * How many candidates came back **after** the limit was applied. The service
   * sorts, limits, then counts, so this is not a pre-limit total and must never
   * be labelled as one.
   */
  readonly candidateCount: number;
  readonly candidates: readonly Candidate[];
};

export type EffectiveCriteria = {
  readonly includePartiallyAvailable: boolean;
  readonly includeCloseToFinish: boolean;
  /** The effective window when close-to-finish is on; null otherwise. */
  readonly closeToFinishWeeks: number | null;
  readonly includeUnavailable: boolean;
  readonly limit: number;
};

export type Candidate = {
  readonly employee: UserSummary;
  readonly department: DepartmentSummary | null;
  readonly availability: Availability;
  readonly skillMatches: readonly SkillMatch[];
  readonly pastProjectMatches: readonly PastProjectMatch[];
  readonly score: CandidateScore;
};

/**
 * Capacity as the backend computed it.
 *
 * The booleans are conclusions, not raw material — recomputing them here would
 * mean copying the backend's daily-hours constant into the browser, and the
 * payload deliberately does not include it.
 */
export type Availability = {
  readonly allocatedHours: number;
  readonly availableHours: number;
  readonly activeAllocationCount: number;
  readonly fullyAvailable: boolean;
  readonly partiallyAvailable: boolean;
  readonly unavailable: boolean;
  /** Additional evidence, not a state of its own: it can accompany any of the above. */
  readonly closeToFinish: boolean;
  readonly closeToFinishProjects: readonly CloseToFinishProject[];
};

export type CloseToFinishProject = {
  readonly projectId: string;
  readonly projectName: string;
  readonly deadlineDate: string | null;
  readonly workHoursPerDay: number;
};

/**
 * One exact-normalized match between a project technology and an active skill.
 *
 * `level` and `experience` are context. They carry the backend's own labels and
 * play no part in the score.
 */
export type SkillMatch = {
  readonly technologyName: string;
  readonly skillId: string;
  readonly skillName: string;
  readonly categoryName: string | null;
  readonly level: { readonly label: string } | null;
  readonly experience: { readonly label: string } | null;
};

/** A past project counts only where both a technology and a target role matched. */
export type PastProjectMatch = {
  readonly projectId: string;
  readonly projectName: string;
  readonly matchedTechnologies: readonly string[];
  readonly matchedTeamRoles: readonly string[];
  readonly deallocatedAt: string | null;
};

/** Maximums: skill 60, past project 20, availability 20 — total 100. */
export type CandidateScore = {
  readonly skillScore: number;
  readonly pastProjectScore: number;
  readonly availabilityScore: number;
  readonly totalScore: number;
};

/**
 * `GET /projects/{projectId}/details`, narrowed to what staffing needs: what the
 * project declares it works with, what roles it still wants, who is already on
 * it, and who manages it.
 */
export type StaffingProjectContext = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly projectPeriod: "FIXED" | "ONGOING";
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly projectManager: UserSummary;
  readonly technologyStack: readonly { readonly technologyId: string; readonly name: string }[];
  readonly teamRoleRequirements: readonly TeamRoleRequirement[];
  readonly activeMembers: readonly {
    readonly allocationId: string;
    readonly employee: UserSummary;
    readonly roles: readonly { readonly teamRoleId: string }[];
  }[];
};

export type TeamRoleRequirement = {
  readonly requirementId: string;
  readonly teamRole: {
    readonly teamRoleId: string;
    readonly name: string;
    readonly active: boolean;
  };
  readonly requiredMembers: number;
};

/** `POST /projects/{projectId}/assignment-proposals` — the part the UI reports back. */
export type AssignmentProposalResult = {
  readonly proposalId: string;
  readonly employee: UserSummary;
  /**
   * The department that will review this. Snapshotted by the backend from the
   * employee's current membership — there is no picker, and this response is the
   * authority for what to name.
   */
  readonly reviewDepartment: DepartmentSummary | null;
  readonly workHoursPerDay: number;
  readonly teamRoles: readonly { readonly teamRoleId: string; readonly name: string }[];
  readonly status: string;
};
