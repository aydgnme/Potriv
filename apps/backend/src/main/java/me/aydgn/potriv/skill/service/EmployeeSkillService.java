package me.aydgn.potriv.skill.service;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.common.exception.BadRequestException;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.common.exception.NotFoundException;
import me.aydgn.potriv.common.security.AuthenticatedUser;
import me.aydgn.potriv.common.security.CurrentOrganizationResolver;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.skill.dto.AssignEmployeeSkillRequest;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.EmployeeSkillSkillRef;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.ExperienceView;
import me.aydgn.potriv.skill.dto.EmployeeSkillResponse.LevelView;
import me.aydgn.potriv.skill.dto.SkillCategoryRef;
import me.aydgn.potriv.skill.dto.UpdateEmployeeSkillRequest;
import me.aydgn.potriv.skill.entity.EmployeeSkill;
import me.aydgn.potriv.skill.entity.Skill;
import me.aydgn.potriv.skill.entity.SkillCategory;
import me.aydgn.potriv.skill.repository.EmployeeSkillRepository;
import me.aydgn.potriv.skill.repository.SkillRepository;

@Service
public class EmployeeSkillService {

    private final EmployeeSkillRepository employeeSkillRepository;
    private final SkillRepository skillRepository;
    private final UserRepository userRepository;
    private final CurrentOrganizationResolver currentOrganizationResolver;

    public EmployeeSkillService(
        EmployeeSkillRepository employeeSkillRepository,
        SkillRepository skillRepository,
        UserRepository userRepository,
        CurrentOrganizationResolver currentOrganizationResolver
    ) {
        this.employeeSkillRepository = employeeSkillRepository;
        this.skillRepository = skillRepository;
        this.userRepository = userRepository;
        this.currentOrganizationResolver = currentOrganizationResolver;
    }

    @Transactional(readOnly = true)
    public List<EmployeeSkillResponse> listOwn(AuthenticatedUser currentUser) {
        // Requires an organization context; platform users are rejected.
        currentOrganizationResolver.requireOrganizationId(currentUser);

        return employeeSkillRepository.findOwnedWithSkill(currentUser.userId()).stream()
            .map(EmployeeSkillService::toResponse)
            .toList();
    }

    @Transactional
    public EmployeeSkillResponse assign(
        AuthenticatedUser currentUser,
        AssignEmployeeSkillRequest request
    ) {
        UUID organizationId = currentOrganizationResolver.requireOrganizationId(currentUser);

        // Cross-org skill resolves to 404 (anti-leak). Department link is NOT required.
        Skill skill = skillRepository.findByIdAndOrganization_Id(request.skillId(), organizationId)
            .orElseThrow(() -> new NotFoundException("Skill was not found."));

        if (!skill.isActive()) {
            throw new BadRequestException("Inactive skill cannot be assigned.");
        }

        if (employeeSkillRepository.existsByUser_IdAndSkill_Id(
            currentUser.userId(), skill.getId())) {
            throw new ConflictException("You have already assigned this skill.");
        }

        User owner = userRepository.findById(currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Authenticated user was not found."));

        EmployeeSkill employeeSkill;
        try {
            employeeSkill = employeeSkillRepository.saveAndFlush(
                new EmployeeSkill(owner, skill, request.level(), request.experience()));
        } catch (DataIntegrityViolationException exception) {
            // Concurrent assignment won the unique (user_id, skill_id) race.
            throw new ConflictException("You have already assigned this skill.");
        }

        return toResponse(employeeSkill);
    }

    @Transactional
    public EmployeeSkillResponse update(
        AuthenticatedUser currentUser,
        UUID employeeSkillId,
        UpdateEmployeeSkillRequest request
    ) {
        currentOrganizationResolver.requireOrganizationId(currentUser);

        EmployeeSkill employeeSkill = requireOwned(currentUser, employeeSkillId);

        if (request.level() != null) {
            employeeSkill.changeLevel(request.level());
        }
        if (request.experience() != null) {
            employeeSkill.changeExperience(request.experience());
        }

        return toResponse(employeeSkill);
    }

    @Transactional
    public void delete(AuthenticatedUser currentUser, UUID employeeSkillId) {
        currentOrganizationResolver.requireOrganizationId(currentUser);

        // Cross-user / unknown IDs resolve to 404 (anti-leak). Never deletes the
        // Skill or the User, only the assignment row.
        EmployeeSkill employeeSkill = requireOwned(currentUser, employeeSkillId);
        employeeSkillRepository.delete(employeeSkill);
    }

    private EmployeeSkill requireOwned(AuthenticatedUser currentUser, UUID employeeSkillId) {
        return employeeSkillRepository.findByIdAndUser_Id(employeeSkillId, currentUser.userId())
            .orElseThrow(() -> new NotFoundException("Skill assignment was not found."));
    }

    private static EmployeeSkillResponse toResponse(EmployeeSkill employeeSkill) {
        Skill skill = employeeSkill.getSkill();
        SkillCategory category = skill.getCategory();
        return new EmployeeSkillResponse(
            employeeSkill.getId(),
            new EmployeeSkillSkillRef(
                skill.getId(),
                skill.getName(),
                skill.isActive(),
                new SkillCategoryRef(category.getId(), category.getName())),
            new LevelView(
                employeeSkill.getLevel().name(),
                employeeSkill.getLevel().getValue(),
                employeeSkill.getLevel().getLabel()),
            new ExperienceView(
                employeeSkill.getExperience().name(),
                employeeSkill.getExperience().getLabel()),
            employeeSkill.getCreatedAt(),
            employeeSkill.getUpdatedAt()
        );
    }
}
