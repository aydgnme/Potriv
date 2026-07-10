package me.aydgn.potriv.allocation.service;

import java.util.UUID;

import org.springframework.stereotype.Service;

/**
 * Computes an employee's daily allocation capacity. The maximum is 8 hours/day;
 * available hours are {@code max(0, 8 - allocatedHours)}.
 */
@Service
public class EmployeeCapacityService {

    public static final int MAX_HOURS_PER_DAY = 8;

    private final AllocationCapacityQuery allocationCapacityQuery;

    public EmployeeCapacityService(AllocationCapacityQuery allocationCapacityQuery) {
        this.allocationCapacityQuery = allocationCapacityQuery;
    }

    public int allocatedHours(UUID employeeId) {
        return allocationCapacityQuery.sumCapacityConsumingHours(employeeId);
    }

    public int availableHours(UUID employeeId) {
        return Math.max(0, MAX_HOURS_PER_DAY - allocatedHours(employeeId));
    }
}
