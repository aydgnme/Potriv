# Staffing capacity

One rule, applied in four places. This document exists because the fourth — the
review queue's capacity context — is a *read model*, and a read model that looks
like a guarantee is worse than no read model at all.

---

## The rule

```
MAX_HOURS_PER_DAY = 8
allocatedHours(employee) = Σ workHoursPerDay
                           where deallocatedAt is null
                             and project.status ∈ capacityConsumingStatuses
availableHours(employee) = max(0, 8 − allocatedHours)
```

`EmployeeCapacityService` owns it. The clamp at zero matters: legacy or
hand-edited data can leave someone over-committed, and every caller must treat
that as "no room", never as negative headroom.

Two things deliberately do **not** consume capacity: allocations that have been
deallocated (`deallocatedAt` set), and allocations on a project whose status is
not capacity-consuming.

## Where it is enforced

| Moment | Component | Failure |
| --- | --- | --- |
| Creating an assignment proposal | `AssignmentProposalService` | `409` — over 8h, no capacity at all, or more than remains |
| **Accepting** a proposal | `AssignmentProposalReviewService` | `409` — capacity is **recalculated**, because other proposals may have been accepted while this one waited |
| Activating a project | `AllocationProjectStatusChangeGuard` | `409` — the new status would push an already allocated employee over 8h |
| Reviewing a proposal | `ProposalCapacityContextFactory` | none — it reports, it does not decide |

## The review context

`GET /department/project-proposals` returns a `capacity` object on each row:

```json
{
  "maxHoursPerDay": 8,
  "allocatedHoursPerDay": 6,
  "availableHoursPerDay": 2,
  "requestedHoursPerDay": 6,
  "projectedAllocatedHoursPerDay": 12,
  "projectedAvailableHoursPerDay": 0,
  "currentlyAcceptableByCapacity": false
}
```

`maxHoursPerDay` is included so no client has to hard-code the number.

### It is current state, not a reservation

Nothing is held back for a pending proposal. The figures describe the world at
the instant the response was built, and **acceptance revalidates
transactionally**. A context that says a request fits is not a promise that
accepting it a minute later will succeed — the accept endpoint is the authority,
and the read model never becomes one.

### `currentlyAcceptableByCapacity` exists for a real state

A proposal can stay `PENDING` while the capacity it needs disappears. The backend
deliberately does **not** auto-reject it and does not mutate its status; a
department manager may still want to reject it explicitly, and that decision is
theirs. Without this flag a reviewer would only discover the situation by
pressing Accept and receiving a `409`.

So the honest rendering is a pending proposal that cannot currently be accepted —
`PENDING` plus "current capacity insufficient" — with reject still available.

### Where it is absent, and why

`capacity` is `null` on:

- **deallocation rows** — accepting a removal frees capacity rather than
  consuming it, so it can never fail on capacity. A number here would be
  decoration
- **decided rows** (`APPROVED` / `REJECTED`) — there is nothing left to check,
  and a figure that looks actionable on a closed decision invites misreading

Null means "not applicable", never "unknown".

## Query shape

The queue prices a whole page in **one** aggregate query
(`sumActiveCapacityHoursByEmployee`), grouped by employee over the distinct
employees of the pending rows. Adding capacity context did not turn a page into
one round trip per row, and `ProposalReviewCapacityContextIntegrationTest`
renders a multi-row queue to keep it that way.

Employees with no capacity-consuming allocation are absent from the aggregate;
`EmployeeCapacityService.allocatedHoursByEmployee` zero-fills them so no caller
has to decide what a missing key means.

## What this is not

Not an analytics surface. There is no organization-wide capacity endpoint, no
per-department utilisation, and no historical trend — the context is scoped to
the decision a reviewer is about to make. A department manager still has no
endpoint that reports their whole team's load, which remains a known gap rather
than something this document quietly implies is solved.

---

## Rejection reasons

Separate from capacity, but the same screen. When a reviewer declines, they may
say why:

```
POST /department/project-proposals/assignments/{proposalId}/reject
POST /department/project-proposals/deallocations/{proposalId}/reject

{ "reason": "Requested hours exceed current team capacity." }
```

**The body is optional and so is the field.** A reject with no body at all is
still valid, which is what keeps existing clients working. A blank or
whitespace-only reason is normalised to none, so "no reason given" has exactly
one representation rather than two.

Maximum 5 000 characters, matching the existing free-text convention on these
tables.

### Two different reasons, never merged

`project_deallocation_proposals` already had a `reason`, and it means something
else:

| Field | Written by | Means |
| --- | --- | --- |
| `reason` (deallocation proposal) | the project manager | why removal is being asked for |
| `rejectionReason` | the department manager | why the reviewer declined |

They are different statements by different people. The column is called
`rejection_reason` precisely so the two can never be confused, and a test asserts
that rejecting a removal leaves the proposer's `reason` untouched.

### It belongs to the rejection, and only to it

`rejectionReason` is null while pending, null when approved, and null for a
rejection made without one — including every rejection recorded before the field
existed. Those rows were left `NULL` rather than backfilled with invented text: a
reason nobody gave is not a reason.

The transition is immutable. A rejected proposal cannot be rejected again to
rewrite it — the review services lock and reject a non-pending proposal with
`409 This proposal has already been reviewed.` There is deliberately no endpoint
to edit a reason after the fact.

### Where it is readable

Stored text that cannot be read back is worse than no feature, so it appears on
every surface a rejected proposal reaches: the reviewer's queue
(`DepartmentProjectProposalResponse`), the assignment review response, and the
deallocation review response.

### Audit logging

Not duplicated into the security audit trail. The existing audit design records
that a review happened; the domain entity is the authoritative home for the text,
and copying free-form user input into a second store would spread it without
adding anything.
