package me.aydgn.potriv.project.entity;

import java.time.LocalDate;

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
import me.aydgn.potriv.organization.entity.Organization;

@Entity
@Table(
    name = "projects",
    indexes = {
        @Index(name = "idx_projects_organization_id", columnList = "organization_id"),
        @Index(name = "idx_projects_project_manager_user_id", columnList = "project_manager_user_id"),
        @Index(name = "idx_projects_status", columnList = "status"),
        @Index(name = "idx_projects_deadline_date", columnList = "deadline_date")
    }
)
public class Project extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_manager_user_id", nullable = false)
    private User projectManager;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProjectPeriod period;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "deadline_date", nullable = true)
    private LocalDate deadlineDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProjectStatus status;

    @Column(name = "general_description", nullable = true, length = 10000)
    private String generalDescription;

    protected Project() {
    }

    public Project(
        Organization organization,
        User projectManager,
        String name,
        ProjectPeriod period,
        LocalDate startDate,
        LocalDate deadlineDate,
        ProjectStatus status,
        String generalDescription
    ) {
        this.organization = organization;
        this.projectManager = projectManager;
        this.name = name;
        this.period = period;
        this.startDate = startDate;
        this.deadlineDate = deadlineDate;
        this.status = status;
        this.generalDescription = generalDescription;
    }

    public Organization getOrganization() {
        return organization;
    }

    public User getProjectManager() {
        return projectManager;
    }

    public String getName() {
        return name;
    }

    public ProjectPeriod getPeriod() {
        return period;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getDeadlineDate() {
        return deadlineDate;
    }

    public ProjectStatus getStatus() {
        return status;
    }

    public String getGeneralDescription() {
        return generalDescription;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void changeSchedule(ProjectPeriod period, LocalDate startDate, LocalDate deadlineDate) {
        this.period = period;
        this.startDate = startDate;
        this.deadlineDate = deadlineDate;
    }

    public void changeStatus(ProjectStatus status) {
        this.status = status;
    }

    public void changeGeneralDescription(String generalDescription) {
        this.generalDescription = generalDescription;
    }
}
