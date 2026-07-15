package me.aydgn.potriv.allocation.service;

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
}
