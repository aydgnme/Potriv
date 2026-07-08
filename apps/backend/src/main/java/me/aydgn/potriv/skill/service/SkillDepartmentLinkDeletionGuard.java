package me.aydgn.potriv.skill.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.organization.service.DepartmentDeletionGuard;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;

/**
 * Blocks deletion of a department that still has skill links, before any FK
 * failure. The links must be removed explicitly first.
 */
@Component
public class SkillDepartmentLinkDeletionGuard implements DepartmentDeletionGuard {

    private final SkillDepartmentLinkRepository skillDepartmentLinkRepository;

    public SkillDepartmentLinkDeletionGuard(
        SkillDepartmentLinkRepository skillDepartmentLinkRepository
    ) {
        this.skillDepartmentLinkRepository = skillDepartmentLinkRepository;
    }

    @Override
    public void verifyDeletable(UUID departmentId) {
        if (skillDepartmentLinkRepository.existsByDepartment_Id(departmentId)) {
            throw new ConflictException(
                "Department has linked skills and cannot be deleted. "
                    + "Remove the skill links first.");
        }
    }
}
