package me.aydgn.potriv.identity.repository;

import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface UserRoleRepository extends JpaRepository<UserRole, UUID> {

    List<UserRole> findByUser(User user);

    boolean existsByUserAndRole(User user, AccessRole role);

    void deleteByUserAndRoleIn(User user, Collection<AccessRole> roles);

    long countByUser_Organization_IdAndRole(UUID organizationId, AccessRole role);

    long countByRoleAndUser_StatusAndUser_IdNot(
        AccessRole role,
        AccessAccountStatus status,
        UUID excludedUserId
    );
}
