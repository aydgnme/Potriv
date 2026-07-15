package me.aydgn.potriv.allocation.service;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.allocation.entity.ProjectAllocation;
import me.aydgn.potriv.allocation.repository.ProjectAllocationRepository;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.service.ProjectStatusChangeGuard;

/**
 * Blocks activating a project (moving it from a non-capacity-consuming status to
 * a capacity-consuming one) when doing so would push any active-allocation
 * employee beyond the 8 hour daily maximum.
 */
@Component
public class AllocationProjectStatusChangeGuard implements ProjectStatusChangeGuard {

    private final ProjectAllocationRepository projectAllocationRepository;

    public AllocationProjectStatusChangeGuard(
        ProjectAllocationRepository projectAllocationRepository
    ) {
        this.projectAllocationRepository = projectAllocationRepository;
    }

    @Override
    public void beforeStatusChange(Project project, ProjectStatus newStatus) {
        boolean activating = !project.getStatus().consumesAllocationCapacity()
            && newStatus.consumesAllocationCapacity();
        if (!activating) {
            return;
        }

        for (ProjectAllocation allocation : projectAllocationRepository
            .findActiveByProject(project.getId())) {
            int otherHours = projectAllocationRepository.sumActiveCapacityHoursExcludingProject(
                allocation.getEmployee().getId(),
                project.getId(),
                ProjectStatus.capacityConsumingStatuses());
            if (otherHours + allocation.getWorkHoursPerDay()
                > EmployeeCapacityService.MAX_HOURS_PER_DAY) {
                throw new ConflictException(
                    "Activating this project would exceed an allocated employee's "
                        + EmployeeCapacityService.MAX_HOURS_PER_DAY + " hour daily capacity.");
            }
        }
    }
}
