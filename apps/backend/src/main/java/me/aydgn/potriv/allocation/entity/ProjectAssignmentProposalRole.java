package me.aydgn.potriv.allocation.entity;

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
 * A proposal-time snapshot of one team role selected for an assignment proposal.
 * It is explicit (no ManyToMany) and unique per {@code (proposal, teamRole)}. It
 * is not derived from and need not be a subset of the project's estimated role
 * requirements.
 */
@Entity
@Table(
    name = "project_assignment_proposal_roles",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_project_assignment_proposal_roles_proposal_team_role",
            columnNames = {"proposal_id", "team_role_id"}
        )
    },
    indexes = {
        @Index(name = "idx_project_assignment_proposal_roles_proposal_id", columnList = "proposal_id"),
        @Index(name = "idx_project_assignment_proposal_roles_team_role_id", columnList = "team_role_id")
    }
)
public class ProjectAssignmentProposalRole extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposal_id", nullable = false)
    private ProjectAssignmentProposal proposal;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_role_id", nullable = false)
    private TeamRole teamRole;

    protected ProjectAssignmentProposalRole() {
    }

    public ProjectAssignmentProposalRole(ProjectAssignmentProposal proposal, TeamRole teamRole) {
        this.proposal = proposal;
        this.teamRole = teamRole;
    }

    public ProjectAssignmentProposal getProposal() {
        return proposal;
    }

    public TeamRole getTeamRole() {
        return teamRole;
    }
}
