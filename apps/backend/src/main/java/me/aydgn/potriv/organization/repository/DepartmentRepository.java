package me.aydgn.potriv.organization.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import me.aydgn.potriv.organization.entity.Department;

public interface DepartmentRepository extends JpaRepository<Department, UUID> {

    List<Department> findByOrganization_IdOrderByNameAsc(UUID organizationId);

    Optional<Department> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    Optional<Department> findByOrganization_IdAndNormalizedName(UUID organizationId, String normalizedName);
}
