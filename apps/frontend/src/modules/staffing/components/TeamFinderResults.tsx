"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/Button";

import type { Candidate, TeamFinderResult } from "../model/teamFinderData";
import type { RequirementOpening } from "../utils/openRequirements";

import { CandidateDetail } from "./CandidateDetail";
import styles from "./TeamFinder.module.css";

export type TeamFinderResultsProps = {
  readonly projectId: string;
  readonly result: TeamFinderResult;
  readonly openings: readonly RequirementOpening[];
};

type SortKey = "backend" | "skillScore" | "pastProjectScore" | "availabilityScore";

const SORTS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: "backend", label: "Total (ranked)" },
  { key: "skillScore", label: "Skills" },
  { key: "pastProjectScore", label: "Past projects" },
  { key: "availabilityScore", label: "Availability" },
];

/**
 * The candidate list beside the selected candidate.
 *
 * Selecting somebody is a client-side move: the finder has already returned
 * everyone, and re-running it to look at a second person would repeat a whole
 * organization-wide ranking to no purpose. The first backend-ranked candidate is
 * selected to begin with, because backend order is the default and pretending
 * otherwise would mean inventing a ranking.
 *
 * Sorting is presentation over the returned set only. It never re-runs the
 * finder, and it never becomes the default.
 */
export function TeamFinderResults({ projectId, result, openings }: TeamFinderResultsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    result.candidates[0]?.employee.userId ?? null,
  );
  const [sort, setSort] = useState<SortKey>("backend");
  // On a narrow screen the two panes take turns instead of being squeezed.
  const [showingDetail, setShowingDetail] = useState(false);

  const ordered = sortCandidates(result.candidates, sort);
  const selected =
    ordered.find((candidate) => candidate.employee.userId === selectedId) ?? ordered[0] ?? null;

  function select(candidate: Candidate) {
    setSelectedId(candidate.employee.userId);
    setShowingDetail(true);
  }

  return (
    <div className={styles.split} data-showing={showingDetail ? "detail" : "list"}>
      <div className={styles.listPane}>
        <div className={styles.listHeader}>
          <p className={styles.panelNote}>{countLabel(result)}</p>
          <label className={styles.inlineField}>
            <span className={styles.inlineLabel}>Sort returned candidates</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className={styles.control}
            >
              {SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* A native table: these are comparable records with real columns, and
            100 of them have to stay scannable. The row is not the click target —
            a bare `<tr>` with an onClick is unreachable by keyboard — so the
            name cell carries a real button and the rest of the row is data. */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Candidate</th>
              <th scope="col">Department</th>
              <th scope="col">Availability</th>
              <th scope="col">Matched evidence</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((candidate) => {
              const isSelected = candidate.employee.userId === selected?.employee.userId;

              return (
                <tr
                  key={candidate.employee.userId}
                  className={isSelected ? styles.candidateRowSelected : undefined}
                >
                  <th scope="row" className={styles.candidateCell}>
                    <button
                      type="button"
                      onClick={() => select(candidate)}
                      aria-pressed={isSelected}
                      className={styles.candidateButton}
                    >
                      {candidate.employee.name}
                      {/* Stated in text as well as in style, so the selection
                          survives without colour. */}
                      {isSelected ? (
                        <span className={styles.muted}> · Selected</span>
                      ) : null}
                    </button>
                  </th>
                  <td data-label="Department" className={styles.muted}>
                    {candidate.department?.name ?? "No department"}
                  </td>
                  <td data-label="Availability">
                    {capacityLabel(candidate)}
                    <span className={styles.candidateMeta}>
                      {`${candidate.availability.availableHours} h available`}
                      {candidate.availability.closeToFinish ? " · finishing other work" : ""}
                    </span>
                  </td>
                  {/* Counts of what the backend returned, not a judgement of it. */}
                  <td data-label="Matched evidence" className={styles.muted}>
                    {evidenceLabel(candidate)}
                  </td>
                  <td data-label="Score" className={styles.scoreCell}>
                    {`${candidate.score.totalScore} / 100`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.detailPane}>
        <div className={styles.backToList}>
          <Button variant="secondary" size="sm" onClick={() => setShowingDetail(false)}>
            Back to candidates
          </Button>
        </div>

        {selected ? (
          <CandidateDetail
            projectId={projectId}
            candidate={selected}
            openings={openings}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The count the backend gave, described as what it is.
 *
 * The service sorts, limits, then counts, so this is how many came back — not a
 * total of everyone who matched. Saying "50 total matches" against a limit of 50
 * would be a number nobody computed.
 */
function countLabel(result: TeamFinderResult): string {
  const noun = result.candidateCount === 1 ? "candidate" : "candidates";
  return result.candidateCount >= result.criteria.limit
    ? `${result.candidateCount} ${noun} returned · limit ${result.criteria.limit}`
    : `${result.candidateCount} ${noun}`;
}

/**
 * How much evidence the backend returned for this person, counted.
 *
 * Counts only — the detail panel carries the skills and projects themselves.
 * Nothing here weighs them: the score already did that, server-side, and a
 * second summary that looked like a verdict would compete with it.
 */
function evidenceLabel(candidate: Candidate): string {
  const skills = candidate.skillMatches.length;
  const past = candidate.pastProjectMatches.length;
  const parts = [
    `${skills} skill${skills === 1 ? "" : "s"}`,
    `${past} past project${past === 1 ? "" : "s"}`,
  ];
  return parts.join(" · ");
}

function capacityLabel(candidate: Candidate): string {
  if (candidate.availability.fullyAvailable) return "Fully available";
  if (candidate.availability.partiallyAvailable) return "Partially available";
  if (candidate.availability.unavailable) return "Unavailable";
  return "Availability not recorded";
}

function sortCandidates(
  candidates: readonly Candidate[],
  sort: SortKey,
): readonly Candidate[] {
  if (sort === "backend") return candidates;

  // Stable within equal values, so the backend's deterministic tie-breaking
  // still decides anything this comparison cannot.
  return [...candidates].sort((left, right) => right.score[sort] - left.score[sort]);
}
