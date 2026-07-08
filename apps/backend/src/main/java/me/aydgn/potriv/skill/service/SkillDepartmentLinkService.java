package me.aydgn.potriv.skill.service;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ForbiddenException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;
import me.aydgn.potriv.organization.repository.DepartmentManagerAssignmentRepository;
import me.aydgn.potriv.skill.dto.SkillDepartmentRef;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillDepartmentLink;
import me.aydgn.potriv.skill.repository.SkillDepartmentLinkRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

@Service
public class SkillDepartmentLinkService {

    private final SkillRepository skillRepository;
    private final SkillDepartmentLinkRepository linkRepository;
    private final DepartmentManagerAssignmentRepository managerAssignmentRepository;
    private final UserRepository userRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public SkillDepartmentLinkService(
        SkillRepository skillRepository,
        SkillDepartmentLinkRepository linkRepository,
        DepartmentManagerAssignmentRepository managerAssignmentRepository,
        UserRepository userRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.skillRepository = skillRepository;
        this.linkRepository = linkRepository;
        this.managerAssignmentRepository = managerAssignmentRepository;
        this.userRepository = userRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional(readOnly = true)
    public List<SkillDepartmentRef> listDepartments(AuthenticatedUser currentUser, UUID skillId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        requireOrganizationSkill(organizationId, skillId);
        return departmentsOf(skillId);
    }

    @Transactional
    public List<SkillDepartmentRef> linkCurrentDepartment(
        AuthenticatedUser currentUser,
        UUID skillId
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Department managedDepartment = requireManagedDepartment(currentUser);
        Skill skill = requireOrganizationSkill(organizationId, skillId);

        if (!skill.isActive()) {
            throw new BadRequestException("Inactive skill cannot receive new department links.");
        }

        if (linkRepository.findBySkill_IdAndDepartment_Id(skillId, managedDepartment.getId())
            .isEmpty()) {
            User linkedBy = userRepository.findById(currentUser.userId())
                .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));
            try {
                linkRepository.saveAndFlush(
                    new SkillDepartmentLink(skill, managedDepartment, linkedBy));
            } catch (DataIntegrityViolationException exception) {
                // Concurrent identical link won the unique race; idempotent success.
            }
        }

        return departmentsOf(skillId);
    }

    @Transactional
    public void unlinkCurrentDepartment(AuthenticatedUser currentUser, UUID skillId) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);
        Department managedDepartment = requireManagedDepartment(currentUser);
        // Cross-org skill resolves to 404; inactive skills may still be unlinked.
        requireOrganizationSkill(organizationId, skillId);

        // Idempotent, and only the manager's own department link is removed.
        linkRepository.findBySkill_IdAndDepartment_Id(skillId, managedDepartment.getId())
            .ifPresent(linkRepository::delete);
    }

    private Department requireManagedDepartment(AuthenticatedUser currentUser) {
        // Holding the DEPARTMENT_MANAGER role is not enough; an actual assignment
        // is required to link a skill to the manager's own department.
        return managerAssignmentRepository.findByManager_Id(currentUser.userId())
            .map(DepartmentManagerAssignment::getDepartment)
            .orElseThrow(() -> new ForbiddenException(
                "You are not assigned as a department manager."));
    }

    private Skill requireOrganizationSkill(UUID organizationId, UUID skillId) {
        return skillRepository.findByIdAndOrganization_Id(skillId, organizationId)
            .orElseThrow(() -> new NotFoundException("Skill was not found."));
    }

    private List<SkillDepartmentRef> departmentsOf(UUID skillId) {
        return linkRepository.findBySkillIdWithDepartment(skillId).stream()
            .map(link -> new SkillDepartmentRef(
                link.getDepartment().getId(), link.getDepartment().getName()))
            .toList();
    }
}
