package me.aydgn.potriv.admin.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import me.aydgn.potriv.organization.entity.Department;

public interface AdminDepartmentRepository extends Repository<Department, UUID> {

    @Query(value = "select d from Department d left join fetch d.organization "
        + "where lower(d.name) like :pattern",
        countQuery = "select count(d) from Department d where lower(d.name) like :pattern")
    Page<Department> search(@Param("pattern") String pattern, Pageable pageable);

    @Query("select d from Department d left join fetch d.organization where d.id = :id")
    Optional<Department> findDetailById(@Param("id") UUID id);

    @Query("select m.department.id, count(m) from DepartmentMembership m "
        + "where m.department.id in :ids group by m.department.id")
    List<Object[]> countMembersByDepartmentIds(@Param("ids") Collection<UUID> ids);

    @Query("select a.department.id, a.manager.name from DepartmentManagerAssignment a "
        + "where a.department.id in :ids")
    List<Object[]> managerNamesByDepartmentIds(@Param("ids") Collection<UUID> ids);

    @Query("select a.manager.id, a.manager.name from DepartmentManagerAssignment a "
        + "where a.department.id = :departmentId")
    List<Object[]> manager(@Param("departmentId") UUID departmentId);

    @Query("select m.member.id, m.member.name, m.member.email from DepartmentMembership m "
        + "where m.department.id = :departmentId order by m.member.name asc")
    List<Object[]> memberSummaries(@Param("departmentId") UUID departmentId);
}
