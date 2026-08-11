/**
 * What a department name has to be before it is worth sending.
 *
 * The backend trims the display value and compares uniqueness on a lowercased
 * normalized form. Both matter here in different ways: the trim is reproduced so
 * the payload matches what will be stored, and the lowercasing is deliberately
 * *not* — "Platform" and "platform" collide, but the one the user typed is the
 * one that gets displayed.
 *
 * Uniqueness itself is never predicted. Only the organization's whole department
 * set could answer it, that set can change between render and submit, and the
 * backend answers 409 authoritatively.
 */

/** `@Size(max = 160)` on both the create and update requests. */
export const DEPARTMENT_NAME_MAX = 160;

export type DepartmentFormErrors = {
  readonly name?: string;
};

export type DepartmentFormResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly errors: DepartmentFormErrors };

/**
 * @param raw exactly what the field held, untrimmed
 */
export function validateDepartmentName(raw: string): DepartmentFormResult {
  const name = raw.trim();

  if (name.length === 0) {
    return { ok: false, errors: { name: "Enter a department name." } };
  }

  if (name.length > DEPARTMENT_NAME_MAX) {
    return {
      ok: false,
      errors: {
        name: `Use ${DEPARTMENT_NAME_MAX} characters or fewer.`,
      },
    };
  }

  return { ok: true, name };
}
