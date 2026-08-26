#!/usr/bin/env bash
#
# Builds and starts the production-like stack (docker-compose.prod.yml) and
# waits for both the backend readiness endpoint and the public frontend.
# Requires a local .env.prod copied from .env.prod.example — never uses real
# production secrets.
#
# Usage:
#   cp .env.prod.example .env.prod   # then edit .env.prod
#   ./scripts/backend-prod-smoke.sh
#
# The stack keeps running afterwards; volumes are never deleted by this script.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=.env.prod
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml)
# Matches the container healthcheck: readiness, not the mail-inclusive aggregate.
BACKEND_HEALTH_URL=http://localhost:8080/api/actuator/health/readiness

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE."
  echo "Create it from the template first:  cp .env.prod.example .env.prod"
  echo "Then edit the placeholder values (POSTGRES_PASSWORD, JWT_SECRET, ...)."
  exit 1
fi

echo "==> Validating compose configuration"
"${COMPOSE[@]}" config --quiet

echo "==> Building and starting the production-like stack"
"${COMPOSE[@]}" up --build --detach

FRONTEND_PORT_BINDING=$("${COMPOSE[@]}" port potriv-frontend 3000)
FRONTEND_HOST_PORT=${FRONTEND_PORT_BINDING##*:}
FRONTEND_HEALTH_URL="http://127.0.0.1:${FRONTEND_HOST_PORT}/"

echo "==> Waiting for backend readiness ($BACKEND_HEALTH_URL)"
echo "==> Waiting for frontend response ($FRONTEND_HEALTH_URL)"
for _ in $(seq 1 60); do
  if curl -fsS "$BACKEND_HEALTH_URL" > /dev/null 2>&1 \
    && curl -fsS "$FRONTEND_HEALTH_URL" > /dev/null 2>&1; then
    echo "Backend and frontend are UP."
    echo
    echo "Next commands:"
    echo "  curl $BACKEND_HEALTH_URL"
    echo "  open $FRONTEND_HEALTH_URL"
    echo "  ${COMPOSE[*]} ps"
    echo "  ${COMPOSE[*]} logs -f potriv-backend potriv-frontend"
    echo "  ${COMPOSE[*]} down            # stop (volumes are kept)"
    echo "  ${COMPOSE[*]} down --volumes  # stop AND delete the database volume"
    exit 0
  fi
  sleep 5
done

echo "The production-like stack did not become healthy in time."
echo "Inspect logs with:  ${COMPOSE[*]} logs potriv-backend potriv-frontend"
echo "On an empty database the prod profile applies the Flyway migrations"
echo "(V1 + V2__create_application_schema.sql) and then validates the schema, so"
echo "a failure here usually means missing configuration or a migration that does"
echo "not match the current entity model — check the log for Flyway or Hibernate"
echo "schema validation errors."
exit 1
