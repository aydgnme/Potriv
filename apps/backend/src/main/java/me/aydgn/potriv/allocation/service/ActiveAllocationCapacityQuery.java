package me.aydgn.potriv.allocation.service;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.project.entity.ProjectStatus;

/**
 * Real capacity source backed by active {@code ProjectAllocation} rows. It sums,
 * via a repository aggregate, only allocations that are active
 * ({@code deallocatedAt is null}) and whose project is in a capacity-consuming
 * status. Allocations on NOT_STARTED or CLOSED projects contribute zero.
 */
@Component
public class ActiveAllocationCapacityQuery implements AllocationCapacityQuery {

    private final ProjectAllocationRepository projectAllocationRepository;

    public ActiveAllocationCapacityQuery(ProjectAllocationRepository projectAllocationRepository) {
        this.projectAllocationRepository = projectAllocationRepository;
    }

    @Override
    public int sumCapacityConsumingHours(UUID employeeId) {
        return projectAllocationRepository.sumActiveCapacityHours(
            employeeId, ProjectStatus.capacityConsumingStatuses());
    }

    @Override
    public Map<UUID, Integer> sumCapacityConsumingHoursByEmployee(Collection<UUID> employeeIds) {
        if (employeeIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, Integer> hoursByEmployee = new HashMap<>();
        for (Object[] row : projectAllocationRepository.sumActiveCapacityHoursByEmployee(
            employeeIds, ProjectStatus.capacityConsumingStatuses())) {
            hoursByEmployee.put((UUID) row[0], ((Number) row[1]).intValue());
        }
        return hoursByEmployee;
    }
}
