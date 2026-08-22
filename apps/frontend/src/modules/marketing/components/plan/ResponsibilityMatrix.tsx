import { RESPONSIBILITY_MATRIX } from "../../businessPlan";
import styles from "../../styles/plan.module.css";

/**
 * Who may do what.
 *
 * A real `<table>`, because it is one: roles down, actions across, and the
 * meaning of a cell comes from both headers at once. Every cell here is the
 * authority the backend actually enforces rather than what the role name
 * suggests — see `RESPONSIBILITY_MATRIX` for what proves each column.
 *
 * On a phone the table stacks into one labelled block per role, with each
 * action named in full beside its answer. The `data-label` carries the column
 * name so the row keeps its meaning when the header row is out of view; the
 * header row stays in the DOM rather than being removed, so anything reading
 * the table still has it.
 *
 * "Yes" and "No" are words, not marks: a tick and a cross are a colour and a
 * shape a screen reader has to be told about separately.
 */
export function ResponsibilityMatrix({ captionId }: { readonly captionId: string }) {
  const { actions, roles } = RESPONSIBILITY_MATRIX;

  return (
    <div className={styles.matrixScroll}>
      <table className={styles.matrix} aria-describedby={captionId}>
        <thead>
          <tr>
            <th scope="col">Responsibility</th>
            {actions.map((action) => (
              <th scope="col" key={action}>
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.title}>
              <th scope="row">{role.title}</th>
              {role.owns.map((owns, index) => (
                <td key={actions[index]} data-label={actions[index]}>
                  <span className={owns ? styles.matrixYes : styles.matrixNo}>
                    {owns ? "Yes" : "No"}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
