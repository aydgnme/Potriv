import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { skillAdminCapabilities } from "../model/skillAdmin";
import type { SkillAdminActionState } from "../model/skillsActionState";
import type { CatalogueSkill, SkillCategory } from "../model/skillsData";

import { CategoryAdmin } from "./CategoryAdmin";
import { SkillAdminPanel } from "./SkillAdminPanel";
import { SkillCatalogue } from "./SkillCatalogue";
import { SkillEditor } from "./SkillEditor";

/**
 * Catalogue administration on screen.
 *
 * The point of these is that the three authorities produce three independent sets
 * of controls: the role gets authoring links, authorship gets content controls,
 * and an appointment gets a department link. Somebody can have any combination.
 */

type Action = (
  state: SkillAdminActionState,
  formData: FormData,
) => Promise<SkillAdminActionState>;

const createCategory = vi.fn<Action>(async () => ({}));
const updateCategory = vi.fn<Action>(async () => ({}));
const deactivateCategory = vi.fn<Action>(async () => ({}));
const reactivateCategory = vi.fn<Action>(async () => ({}));
const createSkill = vi.fn<Action>(async () => ({}));
const updateSkill = vi.fn<Action>(async () => ({}));
const deactivateSkill = vi.fn<Action>(async () => ({}));
const reactivateSkill = vi.fn<Action>(async () => ({}));
const link = vi.fn<Action>(async () => ({}));
const unlink = vi.fn<Action>(async () => ({}));

vi.mock("../server/actions/skillAdminActions", () => ({
  createSkillCategoryAction: (s: SkillAdminActionState, f: FormData) => createCategory(s, f),
  updateSkillCategoryAction: (s: SkillAdminActionState, f: FormData) => updateCategory(s, f),
  deactivateSkillCategoryAction: (s: SkillAdminActionState, f: FormData) =>
    deactivateCategory(s, f),
  reactivateSkillCategoryAction: (s: SkillAdminActionState, f: FormData) =>
    reactivateCategory(s, f),
  createCatalogueSkillAction: (s: SkillAdminActionState, f: FormData) => createSkill(s, f),
  updateCatalogueSkillAction: (s: SkillAdminActionState, f: FormData) => updateSkill(s, f),
  deactivateCatalogueSkillAction: (s: SkillAdminActionState, f: FormData) =>
    deactivateSkill(s, f),
  reactivateCatalogueSkillAction: (s: SkillAdminActionState, f: FormData) =>
    reactivateSkill(s, f),
  linkSkillToCurrentDepartmentAction: (s: SkillAdminActionState, f: FormData) => link(s, f),
  unlinkSkillFromCurrentDepartmentAction: (s: SkillAdminActionState, f: FormData) =>
    unlink(s, f),
}));

vi.mock("../server/actions/skillProfileActions", () => ({
  assignOwnSkillAction: vi.fn(async () => ({})),
  updateOwnSkillAction: vi.fn(async () => ({})),
  removeOwnSkillAction: vi.fn(async () => ({})),
}));

const BACKEND = "3e38e3cc-140c-4b89-a51d-a184c6e85700";
const RETIRED = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const JAVA = "9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f";
const ANA = "0f7d1c62-4b0e-4a6f-9d2a-7c1b8e5f3a10";
const BOB = "686fcfea-14c7-493f-9c7a-2aa31267723a";
const PLATFORM = "c817dc97-3552-49c9-ab27-a47a790deb57";

function category(categoryId: string, name: string, active = true): SkillCategory {
  return {
    categoryId,
    name,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
  };
}

function skill(overrides: Partial<CatalogueSkill> = {}): CatalogueSkill {
  return {
    skillId: JAVA,
    category: { categoryId: BACKEND, name: "Backend" },
    name: "Java",
    description: null,
    author: { userId: ANA, name: "Ana", email: "ana@potriv.test" },
    departments: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-03T00:00:00Z",
    ...overrides,
  };
}

function capabilitiesFor(
  target: CatalogueSkill,
  currentUserId: string,
  department: { departmentId: string; name: string } | null,
) {
  return skillAdminCapabilities({
    skill: target,
    currentUserId,
    roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"],
    managedDepartment: department,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("catalogue authoring links", () => {
  const categories = [category(BACKEND, "Backend")];

  it("appear for a department manager", () => {
    render(
      <SkillCatalogue
        query={{ includeInactive: false }}
        categories={categories}
        skills={[skill()]}
        canAuthorCatalogue
      />,
    );

    expect(screen.getByRole("link", { name: "New skill" })).toHaveAttribute("href", "/skills/new");
    expect(screen.getByRole("link", { name: "Manage categories" })).toHaveAttribute(
      "href",
      "/skills/categories",
    );
  });

  it("stay hidden from everybody else", () => {
    render(
      <SkillCatalogue
        query={{ includeInactive: false }}
        categories={categories}
        skills={[skill()]}
      />,
    );

    expect(screen.queryByRole("link", { name: "New skill" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage categories" })).toBeNull();
  });
});

describe("the category screen", () => {
  it("says a retirement stops at the category", async () => {
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[category(BACKEND, "Backend")]} includeInactive={false} />);

    await user.click(screen.getByRole("button", { name: "Retire Backend" }));

    const dialog = within(document.querySelector("dialog")!);
    expect(dialog.getByText("Retire Backend?")).toBeInTheDocument();
    // The thing people assume wrongly.
    expect(dialog.getByText(/skills already in it are unchanged/)).toBeInTheDocument();
    expect(dialog.getByText(/existing skill profiles/)).toBeInTheDocument();
  });

  it("offers a restore for a retired category instead", () => {
    render(
      <CategoryAdmin categories={[category(RETIRED, "Retired tooling", false)]} includeInactive />,
    );

    expect(
      screen.getByRole("button", { name: "Restore Retired tooling" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Retire Retired/ })).toBeNull();
  });

  it("sends only the id when retiring", async () => {
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[category(BACKEND, "Backend")]} includeInactive={false} />);

    await user.click(screen.getByRole("button", { name: "Retire Backend" }));
    const dialog = within(document.querySelector("dialog")!);
    await user.click(dialog.getByRole("button", { name: "Retire category" }));

    const formData = deactivateCategory.mock.calls[0]![1];
    expect([...formData.keys()]).toEqual(["categoryId"]);
    expect(formData.get("categoryId")).toBe(BACKEND);
  });
});

describe("the skill editor", () => {
  it("offers only active categories", () => {
    render(
      <SkillEditor
        categories={[category(BACKEND, "Backend"), category(RETIRED, "Retired", false)]}
      />,
    );

    const options = within(screen.getByLabelText("Category"))
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual(["Choose a category", "Backend"]);
  });

  it("keeps the skill's own retired category selected, and marked", () => {
    // The backend allows a skill to stay in a category that was retired
    // underneath it; removing the option would make a move the price of an edit.
    render(
      <SkillEditor
        categories={[category(BACKEND, "Backend"), category(RETIRED, "Retired", false)]}
        skill={skill({ category: { categoryId: RETIRED, name: "Retired" } })}
      />,
    );

    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    expect(select.value).toBe(RETIRED);
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Choose a category", "Backend", "Retired (current category)"]);
    expect(screen.getByText(/This skill can stay in it/)).toBeInTheDocument();
  });

  it("offers no other retired category as a destination", () => {
    render(
      <SkillEditor
        categories={[
          category(BACKEND, "Backend"),
          category(RETIRED, "Retired", false),
          category("c-3", "Also retired", false),
        ]}
        skill={skill({ category: { categoryId: RETIRED, name: "Retired" } })}
      />,
    );

    expect(
      within(screen.getByLabelText("Category"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).not.toContain("Also retired");
  });

  it("says who will own a new skill", () => {
    render(<SkillEditor categories={[category(BACKEND, "Backend")]} />);

    expect(screen.getByText(/You will be recorded as the author/)).toBeInTheDocument();
  });

  it("sends category, name and description only", async () => {
    const user = userEvent.setup();
    render(<SkillEditor categories={[category(BACKEND, "Backend")]} />);

    await user.selectOptions(screen.getByLabelText("Category"), BACKEND);
    await user.type(screen.getByLabelText("Name"), "Go");
    await user.click(screen.getByRole("button", { name: "Add to catalogue" }));

    const formData = createSkill.mock.calls[0]![1];
    expect([...formData.keys()].sort()).toEqual(["categoryId", "description", "name"]);
    for (const forbidden of ["authorId", "organizationId", "active", "departments"]) {
      expect(formData.get(forbidden)).toBeNull();
    }
  });
});

describe("the admin panel on a skill", () => {
  it("shows nothing at all to somebody without the role", () => {
    const { container } = render(
      <SkillAdminPanel
        skill={skill()}
        capabilities={skillAdminCapabilities({
          skill: skill(),
          currentUserId: ANA,
          roles: ["EMPLOYEE"],
          managedDepartment: null,
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("gives the author content controls", () => {
    const target = skill();
    render(
      <SkillAdminPanel skill={target} capabilities={capabilitiesFor(target, ANA, null)} />,
    );

    expect(screen.getByRole("link", { name: "Edit skill" })).toHaveAttribute(
      "href",
      `/skills/${JAVA}/edit`,
    );
    expect(screen.getByRole("button", { name: "Retire skill" })).toBeInTheDocument();
  });

  it("gives another manager none, and says whose it is", () => {
    const target = skill();
    render(
      <SkillAdminPanel skill={target} capabilities={capabilitiesFor(target, BOB, null)} />,
    );

    expect(screen.queryByRole("link", { name: "Edit skill" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retire skill" })).toBeNull();
    expect(screen.getByText("Ana added this skill. Only they can change it.")).toBeInTheDocument();
  });

  it("explains the missing link control to a manager with no department", () => {
    const target = skill();
    render(
      <SkillAdminPanel skill={target} capabilities={capabilitiesFor(target, ANA, null)} />,
    );

    expect(screen.getByText(/not assigned to manage a department/)).toBeInTheDocument();
    expect(screen.getByText(/still add skills and categories/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Link to/ })).toBeNull();
  });

  it("offers a link to the manager's own department, named", () => {
    const target = skill();
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    // Bob wrote nothing here; link authority is the appointment, not authorship.
    expect(screen.getByRole("button", { name: "Link to Platform" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit skill" })).toBeNull();
  });

  it("offers an unlink once linked", () => {
    const target = skill({ departments: [{ departmentId: PLATFORM, name: "Platform" }] });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    expect(screen.getByRole("button", { name: "Unlink from Platform" })).toBeInTheDocument();
  });

  it("offers no new link on a retired skill, and says why", () => {
    const target = skill({ active: false });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    expect(screen.queryByRole("button", { name: /^Link to/ })).toBeNull();
    expect(screen.getByText(/retired skill cannot be linked to Platform/)).toBeInTheDocument();
  });

  it("still offers unlink on a retired skill that is linked", () => {
    // Retiring must not trap a department in a relationship it cannot end.
    const target = skill({
      active: false,
      departments: [{ departmentId: PLATFORM, name: "Platform" }],
    });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    expect(screen.getByRole("button", { name: "Unlink from Platform" })).toBeInTheDocument();
  });

  it("offers no department picker anywhere", () => {
    const target = skill();
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, ANA, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    // The endpoint takes no department; the backend resolves the caller's own.
    expect(screen.queryByRole("combobox")).toBeNull();
    const formData = document.querySelectorAll('input[name="departmentId"]');
    expect(formData).toHaveLength(0);
  });

  it("sends only the skill id when linking", async () => {
    const user = userEvent.setup();
    const target = skill();
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Link to Platform" }));

    const formData = link.mock.calls[0]![1];
    expect([...formData.keys()]).toEqual(["skillId"]);
    expect(formData.get("skillId")).toBe(JAVA);
  });

  it("says what retiring a skill leaves behind", async () => {
    const user = userEvent.setup();
    const target = skill();
    render(
      <SkillAdminPanel skill={target} capabilities={capabilitiesFor(target, ANA, null)} />,
    );

    await user.click(screen.getByRole("button", { name: "Retire skill" }));

    const dialog = within(document.querySelector("dialog")!);
    expect(dialog.getByText("Retire Java?")).toBeInTheDocument();
    expect(dialog.getByText(/People who already have it keep it/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Delete Java/);
  });
});
