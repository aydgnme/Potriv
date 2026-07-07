package me.aydgn.potriv;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import me.aydgn.potriv.organization.entity.Organization;
import me.aydgn.potriv.organization.repository.OrganizationRepository;

class TestcontainersFoundationIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private OrganizationRepository organizationRepository;

    @Test
    void persistsAndReadsEntityAgainstTestcontainersPostgres() {
        Organization organization = organizationRepository.save(
            new Organization("Foundation Org", "Foundation Address 1")
        );

        assertThat(organization.getId()).isNotNull();
        assertThat(organizationRepository.findById(organization.getId()))
            .isPresent()
            .get()
            .extracting(Organization::getName)
            .isEqualTo("Foundation Org");
    }
}
