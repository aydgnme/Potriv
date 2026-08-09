"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/Button";

import type { ProjectFormErrors } from "../model/projectForm";

import styles from "./Projects.module.css";

export type TechnologyStackEditorProps = {
  readonly initial: readonly string[];
  readonly errors: ProjectFormErrors;
  readonly disabled: boolean;
};

type Row = { readonly key: number; value: string };

/**
 * The project's technologies, as free text.
 *
 * These are not skills. The skill catalogue is a shared, department-linked
 * vocabulary used to match people to work; a technology here is a note about the
 * project, and treating one as the other would invent a relationship nobody
 * declared.
 *
 * What is typed stays as typed. Trimming and whitespace collapsing happen at
 * validation and submission, because rewriting an input while someone is still
 * inside it is its own kind of bug — " react" would lose its space mid-keystroke
 * and the caret would jump.
 */
export function TechnologyStackEditor({
  initial,
  errors,
  disabled,
}: TechnologyStackEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((value, index) => ({ key: index, value })),
  );
  const [nextKey, setNextKey] = useState(initial.length);

  function update(key: number, value: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, value } : row)));
  }

  function add() {
    setRows((current) => [...current, { key: nextKey, value: "" }]);
    setNextKey((key) => key + 1);
  }

  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>Technology stack</legend>
      <p className={styles.panelNote}>
        Free text. Leave it empty if the project does not need one.
      </p>

      {rows.length === 0 ? (
        <p className={styles.panelNote}>No technologies listed.</p>
      ) : (
        <ul className={styles.editorRows}>
          {rows.map((row, index) => {
            const error = errors[`technology.${index}`];
            const errorId = `technology-error-${row.key}`;

            return (
              <li key={row.key} className={styles.editorRow}>
                <div className={styles.editorField}>
                  <label className={styles.visuallyHidden} htmlFor={`technology-${row.key}`}>
                    {`Technology ${index + 1}`}
                  </label>
                  <input
                    id={`technology-${row.key}`}
                    name="technology"
                    className={[styles.control, error ? styles.controlInvalid : null]
                      .filter(Boolean)
                      .join(" ")}
                    value={row.value}
                    maxLength={160}
                    onChange={(event) => update(row.key, event.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                  />
                  {error ? (
                    <span id={errorId} className={styles.fieldError}>
                      {error}
                    </span>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.key)}
                  // Names the row, so the button means something out of context.
                  aria-label={`Remove technology ${index + 1}${row.value ? `, ${row.value}` : ""}`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button variant="secondary" size="sm" onClick={add}>
          Add technology
        </Button>
      </div>
    </fieldset>
  );
}
