package me.aydgn.potriv.ops.schema;

import java.util.List;

/**
 * One detected schema drift: an enum-backed column whose PostgreSQL {@code CHECK}
 * constraint no longer lists every constant the application can write.
 */
public record SchemaDriftIssue(String table, String column, List<String> missingValues) {

    /** Operator-facing message: what drifted, and exactly how to fix it. */
    public String message() {
        return "Development database schema drift detected: " + table + "." + column
            + " CHECK constraint is missing values " + missingValues
            + ". Recreate the local dev database or apply a manual dev-only constraint"
            + " refresh. Recommended local reset:"
            + " docker compose down --volumes && docker compose up -d"
            + " (or ./scripts/reset-dev-db.sh --yes).";
    }
}
