package me.aydgn.potriv.allocation.service;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.dto.ProposalCapacityContext;

/**
 * Builds the review-queue capacity view from the same numbers the acceptance
 * guard uses, so the figure a reviewer sees and the figure that decides the
 * request can never drift apart.
 *
 * <p>Deliberately batch-shaped: the queue prices every employee it is about to
 * render in one query, so adding capacity context does not turn a single page
 * into one database round trip per row.
 */
@Component
public class ProposalCapacityContextFactory {

    private final EmployeeCapacityService employeeCapacityService;

    public ProposalCapacityContextFactory(EmployeeCapacityService employeeCapacityService) {
        this.employeeCapacityService = employeeCapacityService;
    }

    /** Allocated hours for every given employee, zero-filled. One query. */
    public Map<UUID, Integer> allocatedHoursFor(Collection<UUID> employeeIds) {
        return employeeCapacityService.allocatedHoursByEmployee(employeeIds);
    }

    /**
     * @param allocatedHours the employee's current capacity-consuming total
     * @param requestedHours the hours this proposal asks for
     */
    public ProposalCapacityContext build(int allocatedHours, int requestedHours) {
        int available = EmployeeCapacityService.availableFrom(allocatedHours);
        int projectedAllocated = allocatedHours + requestedHours;

        return new ProposalCapacityContext(
            EmployeeCapacityService.MAX_HOURS_PER_DAY,
            allocatedHours,
            available,
            requestedHours,
            projectedAllocated,
            EmployeeCapacityService.availableFrom(projectedAllocated),
            requestedHours <= available
        );
    }
}
