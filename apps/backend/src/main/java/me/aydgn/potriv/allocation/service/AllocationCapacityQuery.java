package me.aydgn.potriv.allocation.service;

import java.util.UUID;

/**
 * Small abstraction over the hours an employee already has committed to
 * capacity-consuming allocations. PROJECT-ALLOC-02 will back it with real
 * {@code ProjectAllocation} data; until then the default implementation returns
 * {@code 0}.
 */
public interface AllocationCapacityQuery {

    int sumCapacityConsumingHours(UUID employeeId);
}
