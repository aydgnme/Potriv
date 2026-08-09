import { EmptyState } from "@/shared/ui/EmptyState";

import type { LoadFailure } from "../server/projectsDataSources";

import { ProjectsLoadError } from "./ProjectsLoadError";

export type ProjectUnavailableProps = {
  readonly reason: LoadFailure;
};

/**
 * What a relationship-aware project read says when it produced nothing.
 *
 * The wording is deliberately ambiguous, because the backend's 404 is: a project
 * that does not exist and a project this person has no relationship to answer
 * identically, so that being refused never confirms something is there. "You do
 * not own this project" would undo exactly that, and is never said.
 *
 * **A 403 gets the same sentence.** `GET /projects/{id}/details` answers 404 for
 * an unrelated employee, but 403 for a caller holding `DEPARTMENT_MANAGER` while
 * managing no department — the refusal escapes the department check inside the
 * visibility rule. Found by running it, not by reading it. Two different
 * sentences would turn that into an existence oracle: 403 would mean "this
 * project is real", 404 would mean "it is not". Saying one thing costs nothing,
 * because to the person reading it both mean the same — you cannot see this
 * project.
 *
 * Capability refusals ("only a project manager can do this") are a different
 * question, and are said where no project is named.
 */
export function ProjectUnavailable({ reason }: ProjectUnavailableProps) {
  if (reason === "NOT_FOUND" || reason === "FORBIDDEN") {
    return (
      <EmptyState
        title="This project does not exist or is not visible to you."
        description="If you were expecting to see it, ask the project manager to check your allocation."
      />
    );
  }

  return <ProjectsLoadError>Could not load this project.</ProjectsLoadError>;
}
