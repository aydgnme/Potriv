-- A reviewer who rejects a staffing request can now say why.
--
-- Nullable on purpose. The reason is optional, so a reject with no body stays
-- valid, and every row rejected before this migration legitimately has no reason
-- to record. Existing rows are left NULL rather than backfilled with invented
-- text such as 'Rejected' — a reason nobody gave is not a reason.
--
-- Named rejection_reason, not reason: project_deallocation_proposals already has
-- a NOT NULL `reason`, which is why the *removal* was proposed. That is a
-- different statement by a different person, and the two must never merge.
--
-- Length matches the existing free-text convention on these tables
-- (project_assignment_proposals.comments, project_deallocation_proposals.reason).

ALTER TABLE project_assignment_proposals
    ADD COLUMN rejection_reason character varying(5000);

ALTER TABLE project_deallocation_proposals
    ADD COLUMN rejection_reason character varying(5000);
