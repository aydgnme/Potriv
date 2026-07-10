package me.aydgn.potriv.project.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;
import me.aydgn.potriv.identity.entity.User;

/**
 * One recorded status transition of a project. The {@code createdAt} inherited
 * from {@code BaseEntity} is the change timestamp. On creation, a row is written
 * with {@code fromStatus == null}.
 */
@Entity
@Table(
    name = "project_status_history",
    indexes = {
        @Index(name = "idx_project_status_history_project_id", columnList = "project_id")
    }
)
public class ProjectStatusHistory extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", nullable = true, length = 20)
    private ProjectStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 20)
    private ProjectStatus toStatus;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by_user_id", nullable = false)
    private User changedBy;

    protected ProjectStatusHistory() {
    }

    public ProjectStatusHistory(
        Project project,
        ProjectStatus fromStatus,
        ProjectStatus toStatus,
        User changedBy
    ) {
        this.project = project;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.changedBy = changedBy;
    }

    public Project getProject() {
        return project;
    }

    public ProjectStatus getFromStatus() {
        return fromStatus;
    }

    public ProjectStatus getToStatus() {
        return toStatus;
    }

    public User getChangedBy() {
        return changedBy;
    }
}
