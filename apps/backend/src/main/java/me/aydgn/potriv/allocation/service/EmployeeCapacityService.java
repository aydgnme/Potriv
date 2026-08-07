package me.aydgn.potriv.allocation.service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
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
        return availableFrom(allocatedHours(employeeId));
    }

    /**
     * Allocated hours for many employees in one query. Anyone with no
     * capacity-consuming allocation is returned as {@code 0} rather than omitted,
     * so callers never have to decide what an absent key means.
     */
    public Map<UUID, Integer> allocatedHoursByEmployee(Collection<UUID> employeeIds) {
        Map<UUID, Integer> summed = allocationCapacityQuery.sumCapacityConsumingHoursByEmployee(employeeIds);

        Map<UUID, Integer> complete = new LinkedHashMap<>();
        for (UUID employeeId : employeeIds) {
            complete.put(employeeId, summed.getOrDefault(employeeId, 0));
        }
        return complete;
    }

    /**
     * Remaining hours for an already-known allocated total. Kept here so the
     * clamp at zero — which matters when legacy data has over-committed someone —
     * is applied identically by every caller.
     */
    public static int availableFrom(int allocatedHours) {
        return Math.max(0, MAX_HOURS_PER_DAY - allocatedHours);
    }
}
