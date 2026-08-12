import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogueQuery } from "../model/catalogueQuery";
import type { SkillProfileActionState } from "../model/skillsActionState";
import type { CatalogueSkill, EmployeeSkill, SkillCategory } from "../model/skillsData";

import { MySkills } from "./MySkills";
import { SkillCatalogue } from "./SkillCatalogue";
import { SkillDetail } from "./SkillDetail";

/**
 * The Skills screens as somebody uses them.
 *
 * The matrix on the detail page is the part worth pinning: whether a skill can be
 * added depends on its catalogue state and on whether the reader already has it —
 * and, crucially, *not* on which departments it is linked to.
 */

type ProfileAction = (
  state: SkillProfileActionState,
  formData: FormData,
) => Promise<SkillProfileActionState>;

const assign = vi.fn<ProfileAction>(async () => ({}));
const update = vi.fn<ProfileAction>(async () => ({}));
const remove = vi.fn<ProfileAction>(async () => ({}));

vi.mock("../server/actions/skillProfileActions", () => ({
  assignOwnSkillAction: (s: SkillProfileActionState, f: FormData) => assign(s, f),
  updateOwnSkillAction: (s: SkillProfileActionState, f: FormData) => update(s, f),
  removeOwnSkillAction: (s: SkillProfileActionState, f: FormData) => remove(s, f),
}));

const JAVA = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const GO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ASSIGNMENT = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";
const BACKEND = "686fcfea-14c7-493f-9c7a-2aa31267723a";

function category(categoryId: string, name: string, active = true): SkillCategory {
  return {
    categoryId,
    name,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function skill(overrides: Partial<CatalogueSkill> = {}): CatalogueSkill {
  return {
    skillId: JAVA,
    category: { categoryId: BACKEND, name: "Backend" },
    name: "Java",
    description: "The language, not the island.",
    author: { userId: "u-1", name: "Ana", email: "ana@potriv.test" },
    departments: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function assignmentOf(overrides: Partial<EmployeeSkill> = {}): EmployeeSkill {
  return {
    employeeSkillId: ASSIGNMENT,
    skill: {
      skillId: JAVA,
      name: "Java",
      active: true,
      category: { categoryId: BACKEND, name: "Backend" },
    },
    level: { code: "DOES", value: 3, label: "Does" },
    experience: { code: "ONE_TO_TWO_YEARS", label: "1-2 years" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

const NO_FILTERS: CatalogueQuery = { includeInactive: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the catalogue", () => {
  const categories = [category(BACKEND, "Backend"), category("c-2", "Frontend")];

  it("renders the backend's order without re-sorting", () => {
    render(
      <SkillCatalogue
        query={NO_FILTERS}
        categories={categories}
        skills={[
          skill({ skillId: "s-1", name: "Go", category: { categoryId: BACKEND, name: "Backend" } }),
          skill({ skillId: "s-2", name: "React", category: { categoryId: "c-2", name: "Frontend" } }),
          skill({ skillId: "s-3", name: "TypeScript", category: { categoryId: "c-2", name: "Frontend" } }),
        ]}
      />,
    );

    const names = screen.getAllByRole("link", { name: /^(Go|React|TypeScript)$/ });
    expect(names.map((link) => link.textContent)).toEqual(["Go", "React", "TypeScript"]);
  });

  it("shows the fields the contract has", () => {
    render(
      <SkillCatalogue
        query={NO_FILTERS}
        categories={categories}
        skills={[skill({ departments: [{ departmentId: "d-1", name: "Platform" }] })]}
      />,
    );

    // Scoped to the row: "Backend" is also a legitimate category-nav link.
    const row = within(screen.getByRole("link", { name: "Java" }).closest("li")!);
    expect(row.getByText("Backend")).toBeInTheDocument();
    expect(row.getByText("The language, not the island.")).toBeInTheDocument();
    expect(row.getByText("Platform")).toBeInTheDocument();
  });

  it("invents no popularity, rating or endorsement", () => {
    render(<SkillCatalogue query={NO_FILTERS} categories={categories} skills={[skill()]} />);

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "Verified",
      "Endorse",
      "Popularity",
      "Rating",
      "Team Finder score",
      "Average level",
      "people have",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("counts what came back, with no pagination implied", () => {
    render(
      <SkillCatalogue
        query={NO_FILTERS}
        categories={categories}
        skills={[skill({ skillId: "s-1" }), skill({ skillId: "s-2" })]}
      />,
    );

    expect(screen.getByText("2 skills")).toBeInTheDocument();
    for (const control of ["Next", "Previous", "Load more", "Page 1"]) {
      expect(screen.queryByRole("button", { name: control })).toBeNull();
      expect(screen.queryByRole("link", { name: control })).toBeNull();
    }
  });

  it("says how many matched once a filter is on", () => {
    render(
      <SkillCatalogue
        query={{ q: "java", includeInactive: false }}
        categories={categories}
        skills={[skill()]}
      />,
    );

    expect(screen.getByText("1 matching skill")).toBeInTheDocument();
  });

  it("submits search as a plain GET to the catalogue", () => {
    // One submit, one navigation, one backend query — linkable and working
    // before JavaScript loads.
    render(<SkillCatalogue query={NO_FILTERS} categories={categories} skills={[skill()]} />);

    const form = screen.getByLabelText("Search skills").closest("form")!;
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/skills");
  });

  it("keeps the current category when searching", () => {
    render(
      <SkillCatalogue
        query={{ categoryId: BACKEND, includeInactive: false }}
        categories={categories}
        skills={[skill()]}
      />,
    );

    const form = screen.getByLabelText("Search skills").closest("form")!;
    const hidden = form.querySelector('input[name="categoryId"]') as HTMLInputElement;
    expect(hidden.value).toBe(BACKEND);
  });

  it("marks the selected category and links the rest", () => {
    render(
      <SkillCatalogue
        query={{ categoryId: BACKEND, includeInactive: false }}
        categories={categories}
        skills={[skill()]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Skill categories" });
    expect(within(nav).getByRole("link", { current: true })).toHaveTextContent("Backend");
    expect(within(nav).getByRole("link", { name: "All skills" })).toHaveAttribute(
      "href",
      "/skills",
    );
  });

  it("carries the inactive mode through category links", () => {
    render(
      <SkillCatalogue
        query={{ includeInactive: true }}
        categories={categories}
        skills={[skill()]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Skill categories" });
    expect(within(nav).getByRole("link", { name: /^Backend/ })).toHaveAttribute(
      "href",
      `/skills?categoryId=${BACKEND}&includeInactive=true`,
    );
  });

  it("marks an inactive skill and an inactive category", () => {
    render(
      <SkillCatalogue
        query={{ includeInactive: true }}
        categories={[category("c-3", "Retired", false)]}
        skills={[skill({ active: false })]}
      />,
    );

    expect(screen.getAllByText(/Inactive/).length).toBeGreaterThanOrEqual(2);
  });

  it("distinguishes an empty catalogue from an empty result", () => {
    const { unmount } = render(
      <SkillCatalogue query={NO_FILTERS} categories={categories} skills={[]} />,
    );
    expect(screen.getByText("No skills have been added yet.")).toBeInTheDocument();
    // Catalogue management does not ship here, so no dead create button.
    expect(screen.queryByRole("button", { name: /Create skill|New skill/ })).toBeNull();
    unmount();

    render(
      <SkillCatalogue
        query={{ q: "kotlin", includeInactive: false }}
        categories={categories}
        skills={[]}
      />,
    );
    expect(screen.getByText("No skills match “kotlin”.")).toBeInTheDocument();
    // Offered once, in the filter row — not duplicated into the empty state.
    expect(screen.getAllByRole("link", { name: "Clear filters" })).toHaveLength(1);
  });

  it("offers no catalogue management to anybody", () => {
    render(<SkillCatalogue query={NO_FILTERS} categories={categories} skills={[skill()]} />);

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "New skill",
      "New category",
      "Edit catalogue skill",
      "Deactivate",
      "Link to my department",
      "Unlink",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("the skill detail", () => {
  it("shows category, author and departments from the one response", () => {
    render(
      <SkillDetail
        skill={skill({
          departments: [
            { departmentId: "d-1", name: "Platform" },
            { departmentId: "d-2", name: "QA" },
          ],
        })}
        assignment={null}
        profileLoaded
      />,
    );

    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Platform, QA")).toBeInTheDocument();
  });

  it("offers Add for an active skill linked to no department", () => {
    // Department links are metadata, not eligibility — the backend never checks
    // them on assign.
    render(<SkillDetail skill={skill({ departments: [] })} assignment={null} profileLoaded />);

    expect(screen.getByRole("button", { name: "Add to my skills" })).toBeInTheDocument();
    expect(screen.getByText("Not linked to a department")).toBeInTheDocument();
  });

  it("says it is already held, and points at the profile", () => {
    render(<SkillDetail skill={skill()} assignment={assignmentOf()} profileLoaded />);

    expect(screen.getByText("In my skills")).toBeInTheDocument();
    expect(screen.getByText(/Does, 1-2 years/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage in My skills" })).toHaveAttribute(
      "href",
      "/skills/my",
    );
    expect(screen.queryByRole("button", { name: "Add to my skills" })).toBeNull();
  });

  it("refuses to add an inactive skill nobody holds", () => {
    render(<SkillDetail skill={skill({ active: false })} assignment={null} profileLoaded />);

    expect(screen.queryByRole("button", { name: "Add to my skills" })).toBeNull();
    expect(screen.getByText(/inactive and cannot be newly added/)).toBeInTheDocument();
  });

  it("never claims an inactive skill can be added, even when it has links", () => {
    // The department note used to promise "anyone in the organization can add
    // it" unconditionally, so an inactive skill with links said both that it
    // could not be newly added and that anybody could add it.
    render(
      <SkillDetail
        skill={skill({ active: false, departments: [{ departmentId: "d-1", name: "Platform" }] })}
        assignment={null}
        profileLoaded
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("cannot be newly added");
    expect(text).not.toMatch(/[Aa]nyone in the organization can add it/);
    // The note itself still appears, saying what a link is not.
    expect(screen.getByText(/do not determine who may add an active skill/)).toBeInTheDocument();
  });

  it("keeps the department note truthful on an active skill too", () => {
    render(
      <SkillDetail
        skill={skill({ departments: [{ departmentId: "d-1", name: "Platform" }] })}
        assignment={null}
        profileLoaded
      />,
    );

    expect(screen.getByText(/do not determine who may add an active skill/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to my skills" })).toBeInTheDocument();
  });

  it("keeps an inactive skill manageable when it is already held", () => {
    render(
      <SkillDetail
        skill={skill({ active: false })}
        assignment={assignmentOf({
          skill: {
            skillId: JAVA,
            name: "Java",
            active: false,
            category: { categoryId: BACKEND, name: "Backend" },
          },
        })}
        profileLoaded
      />,
    );

    expect(screen.getByText("In my skills")).toBeInTheDocument();
    expect(screen.getByText(/This catalogue skill is inactive/)).toBeInTheDocument();
  });

  it("withholds the action when the profile could not be read", () => {
    // Guessing "not assigned" here is how a duplicate gets created.
    render(<SkillDetail skill={skill()} assignment={null} profileLoaded={false} />);

    expect(screen.queryByRole("button", { name: "Add to my skills" })).toBeNull();
    expect(screen.getByText("Could not load your skill-profile state.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try again" })).toBeInTheDocument();
  });

  it("pre-selects no level or experience", () => {
    render(<SkillDetail skill={skill()} assignment={null} profileLoaded />);

    expect((screen.getByLabelText("Level") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Experience") as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Add to my skills" })).toBeDisabled();
  });

  it("offers the exact vocabularies, by code", () => {
    render(<SkillDetail skill={skill()} assignment={null} profileLoaded />);

    const levels = within(screen.getByLabelText("Level")).getAllByRole("option");
    expect(levels.map((option) => (option as HTMLOptionElement).value)).toEqual([
      "",
      "LEARNS",
      "KNOWS",
      "DOES",
      "HELPS",
      "TEACHES",
    ]);
    expect(levels.map((option) => option.textContent)).toEqual([
      "Choose a level",
      "Learns",
      "Knows",
      "Does",
      "Helps",
      "Teaches",
    ]);

    const experiences = within(screen.getByLabelText("Experience")).getAllByRole("option");
    expect(experiences.map((option) => (option as HTMLOptionElement).value)).toEqual([
      "",
      "ZERO_TO_SIX_MONTHS",
      "SIX_TO_TWELVE_MONTHS",
      "ONE_TO_TWO_YEARS",
      "TWO_TO_FOUR_YEARS",
      "FOUR_TO_SEVEN_YEARS",
      "MORE_THAN_SEVEN_YEARS",
    ]);
  });

  it("sends the skill id and the two codes, and nothing else", async () => {
    const user = userEvent.setup();
    render(<SkillDetail skill={skill()} assignment={null} profileLoaded />);

    await user.selectOptions(screen.getByLabelText("Level"), "TEACHES");
    await user.selectOptions(screen.getByLabelText("Experience"), "FOUR_TO_SEVEN_YEARS");
    await user.click(screen.getByRole("button", { name: "Add to my skills" }));

    const formData = assign.mock.calls[0]![1];
    expect(formData.get("skillId")).toBe(JAVA);
    expect(formData.get("level")).toBe("TEACHES");
    expect(formData.get("experience")).toBe("FOUR_TO_SEVEN_YEARS");
    expect([...formData.keys()].sort()).toEqual(["experience", "level", "skillId"]);
  });

  it("claims nothing about ranking", () => {
    render(<SkillDetail skill={skill()} assignment={null} profileLoaded />);

    const text = document.body.textContent ?? "";
    for (const forbidden of ["higher ranking", "improves your match", "score", "Verified"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(screen.getByText(/self-reported skill profile/)).toBeInTheDocument();
  });
});

describe("my skills", () => {
  it("invites rather than apologising when the profile is empty", () => {
    render(<MySkills assignments={[]} />);

    expect(screen.getByText("Your skill profile is empty.")).toBeInTheDocument();
    expect(screen.getByText(/Team Finder matches people to projects/)).toBeInTheDocument();
    // Skills come from the shared catalogue; there is no free-text field.
    expect(screen.getByRole("link", { name: "Add a skill" })).toHaveAttribute("href", "/skills");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the backend's own labels", () => {
    render(<MySkills assignments={[assignmentOf()]} />);

    expect((screen.getByLabelText("Java level") as HTMLSelectElement).value).toBe("DOES");
    expect((screen.getByLabelText("Java experience") as HTMLSelectElement).value).toBe(
      "ONE_TO_TWO_YEARS",
    );
  });

  it("keeps the backend order", () => {
    render(
      <MySkills
        assignments={[
          assignmentOf({
            employeeSkillId: "es-1",
            skill: { skillId: GO, name: "Go", active: true, category: { categoryId: BACKEND, name: "Backend" } },
          }),
          assignmentOf({
            employeeSkillId: "es-2",
            skill: { skillId: JAVA, name: "React", active: true, category: { categoryId: "c-2", name: "Frontend" } },
          }),
        ]}
      />,
    );

    const names = screen.getAllByRole("link", { name: /^(Go|React)$/ });
    expect(names.map((link) => link.textContent)).toEqual(["Go", "React"]);
  });

  it("keeps an inactive catalogue skill visible and manageable", () => {
    // Hiding it would strand somebody with a row they can no longer reach.
    render(
      <MySkills
        assignments={[
          assignmentOf({
            skill: {
              skillId: JAVA,
              name: "Java",
              active: false,
              category: { categoryId: BACKEND, name: "Backend" },
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Inactive catalogue skill")).toBeInTheDocument();
    expect(screen.getByLabelText("Java level")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save Java" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Java" })).toBeInTheDocument();
  });

  it("saves the assignment id and both codes, never the skill id", async () => {
    const user = userEvent.setup();
    render(<MySkills assignments={[assignmentOf()]} />);

    await user.selectOptions(screen.getByLabelText("Java level"), "HELPS");
    await user.click(screen.getByRole("button", { name: "Save Java" }));

    const formData = update.mock.calls[0]![1];
    expect(formData.get("employeeSkillId")).toBe(ASSIGNMENT);
    expect(formData.get("level")).toBe("HELPS");
    expect(formData.get("experience")).toBe("ONE_TO_TWO_YEARS");
    expect(formData.get("skillId")).toBeNull();
    expect([...formData.keys()].sort()).toEqual(["employeeSkillId", "experience", "level"]);
  });

  it("does not save on every change", async () => {
    // Two fields describe one self-assessment; committing half is a claim
    // nobody made.
    const user = userEvent.setup();
    render(<MySkills assignments={[assignmentOf()]} />);

    await user.selectOptions(screen.getByLabelText("Java level"), "HELPS");
    await user.selectOptions(screen.getByLabelText("Java experience"), "TWO_TO_FOUR_YEARS");

    expect(update).not.toHaveBeenCalled();
  });

  it("names the skill in the removal confirmation, and what it does not do", async () => {
    const user = userEvent.setup();
    render(<MySkills assignments={[assignmentOf()]} />);

    await user.click(screen.getByRole("button", { name: "Remove Java" }));

    const dialog = within(document.querySelector("dialog")!);
    expect(dialog.getByText("Remove Java from your skill profile?")).toBeInTheDocument();
    expect(dialog.getByText(/only your skill assignment/)).toBeInTheDocument();
    expect(dialog.getByText(/Team Finder will no longer use this skill/)).toBeInTheDocument();
    // The catalogue entry survives, so nothing says "delete".
    expect(document.body.textContent).not.toContain("Delete Java");
  });

  it("does not claim an inactive skill is currently used for matching", async () => {
    const user = userEvent.setup();
    render(
      <MySkills
        assignments={[
          assignmentOf({
            skill: {
              skillId: JAVA,
              name: "Java",
              active: false,
              category: { categoryId: BACKEND, name: "Backend" },
            },
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Java" }));

    const dialog = within(document.querySelector("dialog")!);
    expect(dialog.getByText(/inactive catalogue skill/)).toBeInTheDocument();
    expect(dialog.queryByText(/Team Finder will no longer use/)).toBeNull();
  });

  it("sends only the assignment id when removing", async () => {
    const user = userEvent.setup();
    render(<MySkills assignments={[assignmentOf()]} />);

    await user.click(screen.getByRole("button", { name: "Remove Java" }));
    const dialog = within(document.querySelector("dialog")!);
    await user.click(dialog.getByRole("button", { name: "Remove skill" }));

    const formData = remove.mock.calls[0]![1];
    expect(formData.get("employeeSkillId")).toBe(ASSIGNMENT);
    expect([...formData.keys()]).toEqual(["employeeSkillId"]);
  });

  it("invents no verification or score column", () => {
    render(<MySkills assignments={[assignmentOf()]} />);

    const text = document.body.textContent ?? "";
    for (const forbidden of ["Verified", "Endorsed", "Team Finder score", "Certified"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
