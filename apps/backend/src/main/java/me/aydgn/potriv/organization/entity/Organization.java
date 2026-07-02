package me.aydgn.potriv.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import me.aydgn.potriv.common.audit.BaseEntity;

@Entity
@Table(name = "organizations")
public class Organization extends BaseEntity {
    
    @Column(nullable = false, length= 160)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String headquarterAddress;

    protected Organization() {
        // JPA requires a default constructor
    }

    public Organization(String name, String headquarterAddress) {
        this.name = name;
        this.headquarterAddress = headquarterAddress;
    }

    public String getName() {
        return name;
    }

    public String getHeadquarterAddress() {
        return headquarterAddress;
    }

    public void updateDetails(String name, String headquarterAddress) {
        this.name = name;
        this.headquarterAddress = headquarterAddress;
    }
}
