package me.aydgn.potriv.organization.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.organization.entity.DepartmentManagerAssignment;

public interface DepartmentManagerAssignmentRepository
    extends JpaRepository<DepartmentManagerAssignment, UUID> {

    Optional<DepartmentManagerAssignment> findByDepartment_Id(UUID departmentId);

    Optional<DepartmentManagerAssignment> findByManager_Id(UUID managerUserId);

    boolean existsByDepartment_Id(UUID departmentId);

    // Fetch-joins the manager to avoid N+1 when building department listings.
    @Query("select a from DepartmentManagerAssignment a "
        + "join fetch a.manager "
        + "where a.department.organization.id = :organizationId")
    List<DepartmentManagerAssignment> findAllWithManagerByOrganizationId(
        @Param("organizationId") UUID organizationId);
}
