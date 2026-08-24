package me.aydgn.potriv.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * What happens to old invitations when a pre-change backup is restored.
 *
 * This is the case a schema migration cannot assume away. Before this work, an
 * invitation's raw token was a plaintext column and an invitation never
 * expired, so every row in any backup taken before V7 is a live, unlimited-use
 * credential for an organization. Restoring such a backup — for an unrelated
 * incident, months later — and then migrating must not bring those credentials
 * back to life.
 *
 * V7 revokes every pre-existing invitation unconditionally rather than
 * migrating it, precisely so that this is true by construction rather than by
 * anyone remembering to clean up afterwards. This test restores that situation:
 * it migrates a database to the version *before* V7, writes the kind of rows a
 * backup would contain — including one with no expiry, which the old schema
 * allowed — and then applies the rest of the migrations.
 *
 * Run against real PostgreSQL, because the assertions are about what SQL
 * actually does to those rows.
 */
class RestoredBackupMigrationTest {

    private static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("postgres:16");

    static {
        POSTGRES.start();
    }

    @Test
    @DisplayName("invitations restored from a pre-V7 backup come back unusable")
    void oldInvitationsAreNotRevivedByMigratingARestoredBackup() throws Exception {
        DataSource dataSource = dataSourceFor(UUID.randomUUID().toString().replace("-", ""));

        // The state a restored backup is in: schema at V6, rows from before.
        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .target("6")
            .load()
            .migrate();

        UUID organizationId = seedOrganization(dataSource);
        seedLegacyInvite(dataSource, organizationId, "legacy-plaintext-token-one", true, null);
        seedLegacyInvite(dataSource, organizationId, "legacy-plaintext-token-two", true,
            "now() + interval '30 days'");

        assertThat(count(dataSource, "select count(*) from invite_tokens where active"))
            .as("the backup really does contain live invitations")
            .isEqualTo(2);

        // Now the deployment catches up.
        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load()
            .migrate();

        assertThat(count(dataSource, "select count(*) from invite_tokens where active"))
            .as("no restored invitation may be usable after migrating")
            .isZero();

        assertThat(count(dataSource,
            "select count(*) from invite_tokens where revoked_at is null"))
            .as("every restored invitation records when it was retired")
            .isZero();

        // The plaintext column is gone, so the tokens are not merely disabled —
        // they are no longer readable from the database at all.
        assertThat(columnExists(dataSource, "invite_tokens", "token")).isFalse();

        // And nothing can be redeemed: the hashes these rows were given cannot
        // be produced by hashing any token, because they are not that shape.
        assertThat(count(dataSource,
            "select count(*) from invite_tokens where token_hash like 'retired-%'"))
            .isEqualTo(2);
    }

    // ---- helpers ----

    private DataSource dataSourceFor(String schema) throws Exception {
        PGSimpleDataSource base = new PGSimpleDataSource();
        base.setUrl(POSTGRES.getJdbcUrl());
        base.setUser(POSTGRES.getUsername());
        base.setPassword(POSTGRES.getPassword());

        // A schema per run, so this test cannot collide with another.
        try (Connection connection = base.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("create schema \"" + schema + "\"");
        }

        PGSimpleDataSource scoped = new PGSimpleDataSource();
        scoped.setUrl(POSTGRES.getJdbcUrl() + "?currentSchema=" + schema);
        scoped.setUser(POSTGRES.getUsername());
        scoped.setPassword(POSTGRES.getPassword());
        return scoped;
    }

    private UUID seedOrganization(DataSource dataSource) throws Exception {
        UUID id = UUID.randomUUID();
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("""
                insert into organizations (id, name, headquarter_address, created_at, updated_at)
                values ('%s', 'Restored Org %s', 'Address', now(), now())
                """.formatted(id, id));
        }
        return id;
    }

    /** A row shaped the way the pre-V7 schema allowed: plaintext, maybe no expiry. */
    private void seedLegacyInvite(
        DataSource dataSource, UUID organizationId, String token, boolean active, String expiresAt
    ) throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("""
                insert into invite_tokens
                    (id, organization_id, token, active, expires_at, created_at, updated_at)
                values ('%s', '%s', '%s', %s, %s, now(), now())
                """.formatted(UUID.randomUUID(), organizationId, token, active,
                    expiresAt == null ? "null" : expiresAt));
        }
    }

    private int count(DataSource dataSource, String sql) throws Exception {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getInt(1);
        }
    }

    private boolean columnExists(DataSource dataSource, String table, String column)
        throws Exception {
        return count(dataSource, """
            select count(*) from information_schema.columns
             where table_name = '%s' and column_name = '%s'
            """.formatted(table, column)) > 0;
    }
}
