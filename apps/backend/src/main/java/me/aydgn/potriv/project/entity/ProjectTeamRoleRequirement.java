package me.aydgn.potriv.project.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.organization.entity.TeamRole;

/**
 * How many members of a given team role a project requires. Unique per
 * {@code (project, teamRole)}.
 */
@Entity
@Table(
    name = "project_team_role_requirements",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_project_team_role_requirements_project_team_role",
            columnNames = {"project_id", "team_role_id"}
        )
    },
    indexes = {
        @Index(name = "idx_project_team_role_requirements_project_id", columnList = "project_id"),
        @Index(name = "idx_project_team_role_requirements_team_role_id", columnList = "team_role_id")
    }
)
public class ProjectTeamRoleRequirement extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_role_id", nullable = false)
    private TeamRole teamRole;

    @Column(name = "required_members", nullable = false)
    private int requiredMembers;

    protected ProjectTeamRoleRequirement() {
    }

    public ProjectTeamRoleRequirement(Project project, TeamRole teamRole, int requiredMembers) {
        this.project = project;
        this.teamRole = teamRole;
        this.requiredMembers = requiredMembers;
    }

    public Project getProject() {
        return project;
    }

    public TeamRole getTeamRole() {
        return teamRole;
    }

    public int getRequiredMembers() {
        return requiredMembers;
    }
}
