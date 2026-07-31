#!/usr/bin/env bash
#
# DESTRUCTIVE: deletes the local development database and recreates it empty.
#
# Use this when the backend refuses to start with a schema-drift error, e.g.
#
#   Development database schema drift detected: security_audit_events.event_type
#   CHECK constraint is missing values [...]
#
# Development runs Hibernate `ddl-auto: update`, which never refreshes an
# existing enum CHECK constraint, so a database created by older code cannot
# store newly added enum values. Recreating it is the fastest clean fix.
#
# Scope: only this project's dev Compose resources (docker-compose.yml —
# the `postgres` service and the `potriv_postgres_data` volume). Nothing else on
# the machine is touched. Production is unaffected: it is Flyway-managed and
# never uses this script.
#
# Usage:
#   ./scripts/reset-dev-db.sh          # show what would happen, change nothing
#   ./scripts/reset-dev-db.sh --yes    # actually do it

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.yml)

if [ "${1:-}" != "--yes" ]; then
  cat <<EOF
This would DELETE your local development database (all local data is lost):

  ${COMPOSE[*]} down --volumes
  ${COMPOSE[*]} up -d

Nothing has been changed. Re-run with --yes to proceed:

  ./scripts/reset-dev-db.sh --yes
EOF
  exit 0
fi

echo "==> Stopping the dev stack and removing its volumes"
"${COMPOSE[@]}" down --volumes

echo "==> Starting a fresh dev stack"
"${COMPOSE[@]}" up -d

echo
echo "Done. The database is empty; the backend recreates the schema on next start"
echo "(dev uses Hibernate ddl-auto: update) and re-seeds the system admin from"
echo "SYSTEM_ADMIN_EMAIL / SYSTEM_ADMIN_PASSWORD / SYSTEM_ADMIN_NAME."
