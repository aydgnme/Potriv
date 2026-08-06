package me.aydgn.potriv.admin.service;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import me.aydgn.potriv.admin.security.AdminPrincipal;
import me.aydgn.potriv.admin.support.AdminNotFoundException;
import me.aydgn.potriv.admin.support.AdminPaging;
import me.aydgn.potriv.common.exception.ConflictException;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.repository.UserRepository;
import me.aydgn.potriv.project.entity.Project;
import me.aydgn.potriv.project.entity.ProjectStatus;
import me.aydgn.potriv.project.entity.ProjectStatusHistory;
import me.aydgn.potriv.project.repository.ProjectRepository;
import me.aydgn.potriv.project.repository.ProjectStatusHistoryRepository;
import me.aydgn.potriv.project.repository.ProjectTeamRoleRequirementRepository;
import me.aydgn.potriv.project.repository.ProjectTechnologyRepository;
import me.aydgn.potriv.project.service.ProjectDeletionContributor;
import me.aydgn.potriv.project.service.ProjectStatusChangeGuard;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;
import me.aydgn.potriv.security.service.SecurityAuditService;

/**
 * Transactional write service for project administration.
 *
 * <p><strong>Why this is not {@code ProjectService}.</strong> Every mutation
 * there goes through {@code requireOwnedProject}, which demands the caller be in
 * the project's organization <em>and</em> be its project manager. A
 * {@code SYSTEM_ADMIN} is a platform actor and is neither, so the product
 * service cannot be called from the console at all.
 *
 * <p>What differs is therefore only <em>who may act</em> — the same distinction
 * every other admin write service already makes. Every <em>lifecycle</em> rule is
 * reused rather than reimplemented: the same {@link ProjectStatusChangeGuard}
 * beans veto a transition, the same {@link ProjectStatusHistory} row is written
 * with the real actor, the same
 * {@link ProjectStatus#deletionBlockingStatuses()} rule decides deletability, and
 * the same {@link ProjectDeletionContributor} beans clean up before the same
 * bounded delete. Nothing here loosens an invariant.
 */
@Service
public class AdminProjectWriteService {

    /** Outcome of a project action, mapped by the controller to a flash message. */
    public record ProjectActionOutcome(Kind kind, String message) {
        public enum Kind { SUCCESS, INFO, BLOCKED }

        static ProjectActionOutcome success(String message) {
            return new ProjectActionOutcome(Kind.SUCCESS, message);
        }

        static ProjectActionOutcome info(String message) {
            return new ProjectActionOutcome(Kind.INFO, message);
        }

        static ProjectActionOutcome blocked(String message) {
            return new ProjectActionOutcome(Kind.BLOCKED, message);
        }

        public boolean succeeded() {
            return kind == Kind.SUCCESS;
        }
    }

    private final ProjectRepository projectRepository;
    private final ProjectStatusHistoryRepository statusHistoryRepository;
    private final ProjectTechnologyRepository technologyRepository;
    private final ProjectTeamRoleRequirementRepository requirementRepository;
    private final UserRepository userRepository;
    private final List<ProjectStatusChangeGuard> statusChangeGuards;
    private final List<ProjectDeletionContributor> deletionContributors;
    private final SecurityAuditService securityAuditService;

    public AdminProjectWriteService(
        ProjectRepository projectRepository,
        ProjectStatusHistoryRepository statusHistoryRepository,
        ProjectTechnologyRepository technologyRepository,
        ProjectTeamRoleRequirementRepository requirementRepository,
        UserRepository userRepository,
        List<ProjectStatusChangeGuard> statusChangeGuards,
        List<ProjectDeletionContributor> deletionContributors,
        SecurityAuditService securityAuditService
    ) {
        this.projectRepository = projectRepository;
        this.statusHistoryRepository = statusHistoryRepository;
        this.technologyRepository = technologyRepository;
        this.requirementRepository = requirementRepository;
        this.userRepository = userRepository;
        this.statusChangeGuards = statusChangeGuards;
        this.deletionContributors = deletionContributors;
        this.securityAuditService = securityAuditService;
    }

    /**
     * Moves a project to another status, recording history exactly as the
     * product's own path does. A guard veto blocks the change and leaves both the
     * status and its history untouched.
     */
    @Transactional
    public ProjectActionOutcome changeStatus(
        UUID projectId, String rawStatus, AdminPrincipal actor) {

        Project project = requireProject(projectId);
        ProjectStatus target = parseStatus(rawStatus);

        if (target == null) {
            return ProjectActionOutcome.blocked("Select a valid project status.");
        }
        if (target == project.getStatus()) {
            return ProjectActionOutcome.info(
                "Project is already " + target.name() + "; nothing was changed.");
        }

        ProjectStatus previous = project.getStatus();
        try {
            statusChangeGuards.forEach(guard -> guard.beforeStatusChange(project, target));
        } catch (ConflictException veto) {
            // The domain refused the transition. Record the attempt and report the
            // domain's own reason rather than inventing an administrative override.
            audit(SecurityAuditEventType.ADMIN_PROJECT_ACTION_BLOCKED, project, actor,
                "Blocked status change " + previous + " -> " + target);
            return ProjectActionOutcome.blocked(veto.getMessage());
        }

        project.changeStatus(target);
        statusHistoryRepository.save(
            new ProjectStatusHistory(project, previous, target, requireActor(actor)));

        audit(SecurityAuditEventType.ADMIN_PROJECT_STATUS_CHANGED, project, actor,
            "Status " + previous + " -> " + target);
        return ProjectActionOutcome.success(
            "Project status changed from " + previous + " to " + target + ".");
    }

    /**
     * Deletes a project that never progressed beyond planning. The historical rule
     * is the product's own: a project that has ever been {@code IN_PROGRESS},
     * {@code CLOSING} or {@code CLOSED} is kept forever, whatever its status is now.
     */
    @Transactional
    public ProjectActionOutcome delete(UUID projectId, AdminPrincipal actor) {
        Project project = requireProject(projectId);

        if (!deletable(projectId)) {
            audit(SecurityAuditEventType.ADMIN_PROJECT_ACTION_BLOCKED, project, actor,
                "Blocked delete of project that progressed beyond planning");
            return ProjectActionOutcome.blocked(
                "This project has progressed beyond planning and can no longer be deleted.");
        }

        // Audited before the rows disappear — afterwards there is no project to read.
        audit(SecurityAuditEventType.ADMIN_PROJECT_DELETED, project, actor,
            "Deleted project " + project.getId());

        // Other modules clean up their project-scoped data first (assignment
        // proposals), exactly as the product's own deletion path does.
        deletionContributors.forEach(contributor -> contributor.beforeProjectDelete(projectId));

        // Explicit, bounded deletion: never a broad cascade onto users or allocations.
        technologyRepository.deleteByProject_Id(projectId);
        requirementRepository.deleteByProject_Id(projectId);
        statusHistoryRepository.deleteByProject_Id(projectId);
        projectRepository.delete(project);

        return ProjectActionOutcome.success("Project deleted.");
    }

    /** Whether the project's history still permits deletion. */
    @Transactional(readOnly = true)
    public boolean deletable(UUID projectId) {
        return !statusHistoryRepository.existsByProject_IdAndToStatusIn(
            projectId, ProjectStatus.deletionBlockingStatuses());
    }

    private Project requireProject(UUID projectId) {
        return projectRepository.findById(projectId)
            .orElseThrow(() -> new AdminNotFoundException("Project was not found."));
    }

    private User requireActor(AdminPrincipal actor) {
        UUID actorId = actor == null ? null : actor.userId();
        if (actorId == null) {
            throw new AdminNotFoundException("Acting administrator was not found.");
        }
        return userRepository.findById(actorId)
            .orElseThrow(() -> new AdminNotFoundException("Acting administrator was not found."));
    }

    /** Submitted status values are untrusted; an unknown one is rejected, never thrown. */
    private static ProjectStatus parseStatus(String raw) {
        String value = AdminPaging.normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        try {
            return ProjectStatus.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private void audit(
        SecurityAuditEventType type, Project project, AdminPrincipal actor, String details) {
        securityAuditService.record(SecurityAuditEvent.builder(type, true)
            .actorUserId(actor == null ? null : actor.userId())
            .organizationId(project.getOrganization() == null
                ? null : project.getOrganization().getId())
            .details(details)
            .build());
    }
}
