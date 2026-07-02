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
    private String headquaterAddress;

    protected Organization() {
        // JPA requires a default constructor
    }

    public Organization(String name, String headquaterAddress) {
        this.name = name;
        this.headquaterAddress = headquaterAddress;
    }

    public String getName() {
        return name;
    }

    public String getHeadquaterAddress() {
        return headquaterAddress;
    }

    public void updateDetails(String name, String headquaterAddress) {
        this.name = name;
        this.headquaterAddress = headquaterAddress;
    }
}
