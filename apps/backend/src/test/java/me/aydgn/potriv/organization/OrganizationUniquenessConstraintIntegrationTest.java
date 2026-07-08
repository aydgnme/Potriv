package me.aydgn.potriv.organization;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import me.aydgn.potriv.AbstractIntegrationTest;
import me.aydgn.potriv.organization.entity.Department;
import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.entity.TeamRole;
import me.aydgn.potriv.organization.repository.DepartmentRepository;
import me.aydgn.potriv.organization.repository.OrganizationRepository;
import me.aydgn.potriv.organization.repository.TeamRoleRepository;

/**
 * Proves persistence-level uniqueness of (organization, normalizedName) directly
 * at the database, independent of any service-level duplicate check.
 */
class OrganizationUniquenessConstraintIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private TeamRoleRepository teamRoleRepository;

    @Autowired
    private DepartmentRepository departmentRepository;

    @Test
    void teamRoleOrganizationAndNormalizedNameAreUniqueAtDatabaseLevel() {
        Organization organization = newOrganization();
        teamRoleRepository.saveAndFlush(
            new TeamRole(organization, "Backend Developer", "backend developer", null));

        assertThatThrownBy(() -> teamRoleRepository.saveAndFlush(
            new TeamRole(organization, "Backend DEVELOPER", "backend developer", null)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void departmentOrganizationAndNormalizedNameAreUniqueAtDatabaseLevel() {
        Organization organization = newOrganization();
        departmentRepository.saveAndFlush(
            new Department(organization, "Engineering", "engineering"));

        assertThatThrownBy(() -> departmentRepository.saveAndFlush(
            new Department(organization, "ENGINEERING", "engineering")))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Organization newOrganization() {
        return organizationRepository.save(
            new Organization("Constraint Org " + UUID.randomUUID(), "Address 1"));
    }
}
