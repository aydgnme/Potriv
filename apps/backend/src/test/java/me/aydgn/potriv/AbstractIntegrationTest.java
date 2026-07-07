package me.aydgn.potriv;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Shared foundation for integration tests.
 *
 * A single PostgreSQL Testcontainers instance is started once per JVM and
 * reused by every Spring test context, so individual tests never manage
 * container lifecycle themselves. Datasource properties are wired through
 * {@link ServiceConnection}, the mechanism recommended for the project's
 * Spring Boot version.
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    @ServiceConnection
    protected static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("postgres:16");

    static {
        POSTGRES.start();
    }

    protected static final String SYSTEM_ADMIN_EMAIL = "test-admin@potriv.test";
    protected static final String SYSTEM_ADMIN_PASSWORD = "TestAdminPassword1!";
}
