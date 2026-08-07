package me.aydgn.potriv.allocation.dto;

/**
 * What a department manager needs to know about an employee's daily load before
 * accepting a staffing request, computed with the same rule acceptance uses.
 *
 * <p>This is <strong>current state at response time, not a reservation</strong>.
 * Nothing is held back for this proposal, and acceptance revalidates capacity
 * transactionally — so a context that says a request fits is not a promise that
 * accepting it a minute later will succeed. {@code currentlyAcceptableByCapacity}
 * exists to let the reviewer see a pending proposal that no longer fits, which is
 * a real state: the backend deliberately leaves such proposals {@code PENDING}
 * rather than auto-rejecting them.
 *
 * <p>Only capacity-consuming allocations count — deallocated rows and projects in
 * a non-consuming status contribute nothing.
 *
 * <p>Present on pending assignment rows only. Deallocation review frees capacity
 * rather than consuming it and can never fail on capacity, and a proposal that
 * has already been decided has nothing left to check, so both carry {@code null}
 * instead of a fabricated figure.
 */
public record ProposalCapacityContext(
    /** The domain maximum, so no client has to hard-code it. */
    int maxHoursPerDay,
    int allocatedHoursPerDay,
    int availableHoursPerDay,
    int requestedHoursPerDay,
    /** Allocated hours if this proposal were accepted right now. */
    int projectedAllocatedHoursPerDay,
    /** Remaining hours if this proposal were accepted right now; never negative. */
    int projectedAvailableHoursPerDay,
    /** Whether acceptance would fit within the daily maximum as of this response. */
    boolean currentlyAcceptableByCapacity
) {
}
