package me.aydgn.potriv.organization.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.identity.entity.AccessRole;
import me.aydgn.potriv.identity.entity.User;
import me.aydgn.potriv.organization.entity.DepartmentMembership;

public interface DepartmentMembershipRepository extends JpaRepository<DepartmentMembership, UUID> {

    Optional<DepartmentMembership> findByMember_Id(UUID memberUserId);

    boolean existsByDepartment_Id(UUID departmentId);

    long countByDepartment_Id(UUID departmentId);

    // Fetch-joins the member so a member listing avoids N+1.
    @Query("select m from DepartmentMembership m "
        + "join fetch m.member "
        + "where m.department.id = :departmentId "
        + "order by m.member.name asc, m.member.email asc")
    List<DepartmentMembership> findMembersByDepartmentId(@Param("departmentId") UUID departmentId);

    // Grouped member counts for a whole organization, to avoid N+1 in listings.
    @Query("select m.department.id, count(m) from DepartmentMembership m "
        + "where m.department.organization.id = :organizationId "
        + "group by m.department.id")
    List<Object[]> countMembersByOrganization(@Param("organizationId") UUID organizationId);

    // Employees in the organization holding the EMPLOYEE access role that have no
    // department membership yet. Platform users (organization is null) are excluded.
    @Query("select u from User u "
        + "where u.organization.id = :organizationId "
        + "and exists (select 1 from UserRole ur where ur.user = u and ur.role = :employeeRole) "
        + "and not exists (select 1 from DepartmentMembership m where m.member = u) "
        + "order by u.name asc, u.email asc")
    List<User> findUnassignedEmployees(
        @Param("organizationId") UUID organizationId,
        @Param("employeeRole") AccessRole employeeRole);
}
