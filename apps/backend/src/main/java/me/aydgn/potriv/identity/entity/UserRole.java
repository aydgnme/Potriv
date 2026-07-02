package me.aydgn.potriv.identity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import me.aydgn.potriv.common.audit.BaseEntity;

@Entity
@Table(
    name = "user_roles",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_user_roles_user_role",
            columnNames = {"user_id", "role"}
        )
    },
    indexes = {
        @Index(name = "idx_user_roles_user_id", columnList = "user_id")
    }
)
public class UserRole extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private AccessRole role;

    protected UserRole() {
    }

    public UserRole(User user, AccessRole role) {
        this.user = user;
        this.role = role;
    }

    public User getUser() {
        return user;
    }

    public AccessRole getRole() {
        return role;
    }
}