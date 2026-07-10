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

/**
 * Free-text technology used on a project. It is not a Skill foreign key: it is
 * a cleaned display value plus an internal normalized value for de-duplication.
 */
@Entity
@Table(
    name = "project_technologies",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_project_technologies_project_normalized_name",
            columnNames = {"project_id", "normalized_name"}
        )
    },
    indexes = {
        @Index(name = "idx_project_technologies_project_id", columnList = "project_id")
    }
)
public class ProjectTechnology extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 160)
    private String normalizedName;

    protected ProjectTechnology() {
    }

    public ProjectTechnology(Project project, String name, String normalizedName) {
        this.project = project;
        this.name = name;
        this.normalizedName = normalizedName;
    }

    public Project getProject() {
        return project;
    }

    public String getName() {
        return name;
    }

    public String getNormalizedName() {
        return normalizedName;
    }
}
