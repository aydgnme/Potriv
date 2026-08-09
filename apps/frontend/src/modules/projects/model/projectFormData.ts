import type { ProjectFormInput, RequirementInput } from "./projectForm";

/**
 * A submitted form, read into the shape the validator expects.
 *
 * Repeatable rows arrive as repeated field names in DOM order. Each requirement
 * row always emits both of its inputs, so the two lists line up by index; a row
 * that somehow emitted only one is padded with an empty string and fails
 * validation rather than silently shifting every row after it.
 *
 * Nothing is trusted here — this only turns `FormData` into strings.
 */
export function readProjectForm(formData: FormData): ProjectFormInput {
  const teamRoleIds = strings(formData, "teamRoleId");
  const requiredMembers = strings(formData, "requiredMembers");
  const rowCount = Math.max(teamRoleIds.length, requiredMembers.length);

  const requirements: RequirementInput[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    requirements.push({
      teamRoleId: teamRoleIds[index] ?? "",
      requiredMembers: requiredMembers[index] ?? "",
    });
  }

  return {
    name: single(formData, "name"),
    period: single(formData, "period"),
    startDate: single(formData, "startDate"),
    deadlineDate: single(formData, "deadlineDate"),
    status: single(formData, "status"),
    generalDescription: single(formData, "generalDescription"),
    technologies: strings(formData, "technology"),
    requirements,
  };
}

function single(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function strings(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}
