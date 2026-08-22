import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { skillAdminCapabilities, type ManagedDepartmentState } from "../model/skillAdmin";
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
  return capabilitiesWith(
    target,
    currentUserId,
    department ? { kind: "managed", department } : { kind: "unassigned" },
  );
}

function capabilitiesWith(
  target: CatalogueSkill,
  currentUserId: string,
  managedDepartment: ManagedDepartmentState,
) {
  return skillAdminCapabilities({
    skill: target,
    currentUserId,
    roles: ["EMPLOYEE", "DEPARTMENT_MANAGER"],
    managedDepartment,
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

    await user.click(screen.getByRole("button", { name: "Retire category: Backend" }));

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
      screen.getByRole("button", { name: "Restore category: Retired tooling" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Retire category: Retired/ })).toBeNull();
  });

  it("sends only the id when retiring", async () => {
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[category(BACKEND, "Backend")]} includeInactive={false} />);

    await user.click(screen.getByRole("button", { name: "Retire category: Backend" }));
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
          managedDepartment: { kind: "unassigned" },
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
    expect(screen.queryByRole("button", { name: /^Link department/ })).toBeNull();
  });

  it("does not claim an absent appointment when the lookup failed", () => {
    // The wrong copy here is a false statement about the organization: a 500 on
    // the appointment endpoint would otherwise tell an appointed manager that
    // they were never appointed.
    const target = skill({ departments: [{ departmentId: PLATFORM, name: "Platform" }] });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesWith(target, ANA, { kind: "error" })}
      />,
    );

    expect(screen.getByText(/Could not load your department management context/))
      .toBeInTheDocument();
    expect(screen.queryByText(/not assigned to manage a department/)).toBeNull();

    // The relationship fails closed while everything else stays usable.
    expect(screen.queryByRole("button", { name: /^Link department/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Unlink department/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Edit skill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retire skill" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Link department: Platform" })).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "Unlink department: Platform" })).toBeInTheDocument();
  });

  it("offers no new link on a retired skill, and says why", () => {
    const target = skill({ active: false });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: "Platform" })}
      />,
    );

    expect(screen.queryByRole("button", { name: /^Link department/ })).toBeNull();
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

    expect(screen.getByRole("button", { name: "Unlink department: Platform" })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Link department: Platform" }));

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

/**
 * Free text belongs in the accessible name, not the visible button label.
 *
 * A button cannot wrap its label, and category/department names are
 * organization-authored and long: bounded at 120 and 160 characters
 * respectively, which is far wider than any mobile control. The bound is not the
 * point — a perfectly valid, contract-respecting name still does not fit. One
 * such category name, "Programming Languages And Runtime Platforms", made a
 * `Retire` button 367px wide inside a 248px row and pushed the whole document to
 * 422px at every mobile width.
 *
 * These regressions fail for that exact reason: putting the name back into the
 * visible label breaks the visible-text assertion, while the accessible name
 * stays intact so nothing is lost to a screen reader.
 */
describe("long organization names stay out of the visible button label", () => {
  const longCategory = "Programming Languages And Runtime Platforms For Backend Services";
  const longDepartment = "Platform Engineering And Developer Experience Department";

  /**
   * Two halves, and both must hold.
   *
   * The label has to stay short, or a 120/160-character name sets the page
   * width from inside a control that cannot wrap. And the accessible name has
   * to *contain* that visible label, or WCAG 2.5.3 fails and a speech-input
   * user saying what they can see does not reach the control.
   *
   * Fixing only the first is what the first attempt did.
   */
  const assertLabelInName = (button: HTMLElement, visible: string, value: string) => {
    expect(button.textContent?.trim()).toBe(visible);
    expect(button.textContent).not.toContain(value);

    const accessible = button.getAttribute("aria-label") ?? "";
    expect(accessible).toContain(visible);
    expect(accessible).toContain(value);
  };

  it("keeps the retire control short and its accessible name label-consistent", () => {
    render(<CategoryAdmin categories={[category(BACKEND, longCategory)]} includeInactive={false} />);

    assertLabelInName(
      screen.getByRole("button", { name: `Retire category: ${longCategory}` }),
      "Retire category",
      longCategory,
    );
  });

  it("keeps the restore control short and its accessible name label-consistent", () => {
    render(<CategoryAdmin categories={[category(RETIRED, longCategory, false)]} includeInactive />);

    assertLabelInName(
      screen.getByRole("button", { name: `Restore category: ${longCategory}` }),
      "Restore category",
      longCategory,
    );
  });

  it("keeps the department link control short and label-consistent", () => {
    const target = skill({ departments: [] });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: longDepartment })}
      />,
    );

    assertLabelInName(
      screen.getByRole("button", { name: `Link department: ${longDepartment}` }),
      "Link department",
      longDepartment,
    );
  });

  it("keeps the department unlink control short and label-consistent", () => {
    const target = skill({ departments: [{ departmentId: PLATFORM, name: longDepartment }] });
    render(
      <SkillAdminPanel
        skill={target}
        capabilities={capabilitiesFor(target, BOB, { departmentId: PLATFORM, name: longDepartment })}
      />,
    );

    assertLabelInName(
      screen.getByRole("button", { name: `Unlink department: ${longDepartment}` }),
      "Unlink department",
      longDepartment,
    );
  });
});

/**
 * One row, three actions, and only the newest of them speaking.
 *
 * A category row owns rename, retire and restore, each with its own action
 * state. Rendering all three results side by side left a rename failure sitting
 * beside a later retire confirmation, and could put two assertive regions on one
 * row at once. Worse, all three were plain `<p>` elements — visible and
 * announced to nobody.
 */
describe("a category row reports only its latest action", () => {
  const BACKEND_ROW = () => category(BACKEND, "Backend");

  /** Submits the rename form from the keyboard. */
  async function rename(user: ReturnType<typeof userEvent.setup>) {
    const save = screen.getByRole("button", { name: /^Save Backend$/ });
    save.focus();
    await user.keyboard("{Enter}");
  }

  /** Opens the retire dialog and confirms, from the keyboard. */
  async function retire(user: ReturnType<typeof userEvent.setup>) {
    const open = screen.getByRole("button", { name: "Retire category: Backend" });
    open.focus();
    await user.keyboard("{Enter}");
    const confirm = within(document.querySelector("dialog")!).getByRole("button", {
      name: /^Retire category$/,
    });
    confirm.focus();
    await user.keyboard("{Enter}");
  }

  it("announces a rename failure assertively", async () => {
    updateCategory.mockResolvedValue({ error: "That name is already used." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await rename(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That name is already used.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces a rename success politely", async () => {
    updateCategory.mockResolvedValue({ done: "Category renamed." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await rename(user);

    expect(await screen.findByRole("status")).toHaveTextContent("Category renamed.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a retire failure assertively", async () => {
    deactivateCategory.mockResolvedValue({ error: "Backend could not be retired." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await retire(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Backend could not be retired.",
    );
  });

  it("replaces a stale rename failure when a later retire fails", async () => {
    updateCategory.mockResolvedValue({ error: "That name is already used." });
    deactivateCategory.mockResolvedValue({ error: "Backend could not be retired." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await rename(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("That name is already used.");

    await retire(user);
    await screen.findByText("Backend could not be retired.");

    // The earlier failure is gone, and there is still exactly one region.
    expect(screen.queryByText("That name is already used.")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("clears a stale rename failure even when the later confirmation is suppressed", async () => {
    updateCategory.mockResolvedValue({ error: "That name is already used." });
    deactivateCategory.mockResolvedValue({ done: "Backend retired." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await rename(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("That name is already used.");

    await retire(user);

    /*
      The retire succeeded, but this row still renders as Available — the server
      data has not come back changed in this test — so its confirmation is
      suppressed as contradicting what is on screen. What must *not* survive is
      the earlier rename failure: it is no longer the latest thing that happened,
      and leaving it there would attach it to the retire the user just did.
    */
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText("That name is already used.")).toBeNull();
    expect(screen.queryByText("Backend retired.")).toBeNull();
  });

  it("lets a later success replace an earlier failure", async () => {
    deactivateCategory.mockResolvedValue({ error: "Backend could not be retired." });
    updateCategory.mockResolvedValue({ done: "Category renamed." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await retire(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend could not be retired.");

    // A rename confirmation carries no claim about Available/Retired, so it is
    // never filtered — which makes it the clean case for proving that a success
    // replaces a failure rather than stacking under it.
    await rename(user);

    expect(await screen.findByRole("status")).toHaveTextContent("Category renamed.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Backend could not be retired.")).toBeNull();
  });

  it("keeps a retire confirmation off a row that still reads Available", async () => {
    // The row's own state has not changed in this render, so a "retired"
    // confirmation under an Available row would contradict what is on screen.
    deactivateCategory.mockResolvedValue({ done: "Backend retired." });
    const user = userEvent.setup();
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    await retire(user);

    expect(screen.queryByText("Backend retired.")).toBeNull();
  });

  it("says nothing before any of the three actions has run", () => {
    render(<CategoryAdmin categories={[BACKEND_ROW()]} includeInactive={false} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
