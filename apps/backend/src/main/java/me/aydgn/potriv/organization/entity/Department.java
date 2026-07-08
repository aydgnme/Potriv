package me.aydgn.potriv.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;

@Entity
@Table(
    name = "departments",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_departments_organization_normalized_name",
            columnNames = {"organization_id", "normalized_name"}
        )
    },
    indexes = {
        @Index(name = "idx_departments_organization_id", columnList = "organization_id")
    }
)
public class Department extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id", nullable = false)
    private Organization organization;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 160)
    private String normalizedName;

    protected Department() {
    }

    public Department(Organization organization, String name, String normalizedName) {
        this.organization = organization;
        this.name = name;
        this.normalizedName = normalizedName;
    }

    public Organization getOrganization() {
        return organization;
    }

    public String getName() {
        return name;
    }

    public String getNormalizedName() {
        return normalizedName;
    }

    public void rename(String name, String normalizedName) {
        this.name = name;
        this.normalizedName = normalizedName;
    }
}
