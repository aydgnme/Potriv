package me.aydgn.potriv.organization.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import me.aydgn.potriv.organization.entity.Department;

public interface DepartmentRepository extends JpaRepository<Department, UUID> {

    List<Department> findByOrganization_IdOrderByNameAsc(UUID organizationId);

    // All departments across organizations (org fetched) for the admin skill
    // create form's department picker, grouped by organization.
    @Query("select d from Department d join fetch d.organization "
        + "order by d.organization.name asc, d.name asc")
    List<Department> findAllWithOrganization();

    Optional<Department> findByIdAndOrganization_Id(UUID id, UUID organizationId);

    Optional<Department> findByOrganization_IdAndNormalizedName(UUID organizationId, String normalizedName);
}
