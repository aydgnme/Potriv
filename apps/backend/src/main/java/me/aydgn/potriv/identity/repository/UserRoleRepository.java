package me.aydgn.potriv.identity.repository;

import me.aydgn.potriv.identity.entity.AccessAccountStatus;
import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.identity.entity.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface UserRoleRepository extends JpaRepository<UserRole, UUID> {

    List<UserRole> findByUser(User user);

    List<UserRole> findByUser_IdIn(Collection<UUID> userIds);

    // Organization-scoped users currently holding a given role, in one query.
    @Query("select ur.user from UserRole ur "
        + "where ur.user.organization.id = :organizationId and ur.role = :role")
    List<User> findUsersByOrganizationIdAndRole(
        @Param("organizationId") UUID organizationId, @Param("role") AccessRole role);

    boolean existsByUserAndRole(User user, AccessRole role);

    void deleteByUserAndRoleIn(User user, Collection<AccessRole> roles);

    long countByUser_Organization_IdAndRole(UUID organizationId, AccessRole role);

    long countByRoleAndUser_StatusAndUser_IdNot(
        AccessRole role,
        AccessAccountStatus status,
        UUID excludedUserId
    );
}
