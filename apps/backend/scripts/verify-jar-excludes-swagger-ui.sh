#!/usr/bin/env bash
set -euo pipefail

# Fails if the packaged Spring Boot jar contains any Swagger UI, WebJar, or
# DOMPurify asset. springdoc-openapi-starter-webmvc-api (this project's
# actual dependency) generates /v3/api-docs without bundling any of these --
# their presence here would mean the removed -ui starter, or an equivalent
# interactive-UI asset, crept back in without the resolved dependency tree
# alone catching it (the Enforcer rule in pom.xml is the first line of
# defence; this is the second, checking what actually got packaged).
#
# Usage: run after `mvn package` (or `mvn verify`, which packages first),
# from anywhere -- it locates its own project root.

cd "$(dirname "$0")/.."

JAR="$(ls target/potriv-backend-*.jar 2>/dev/null | grep -v '\.original$' | head -1 || true)"
if [[ -z "$JAR" ]]; then
  echo "No packaged jar found under target/ -- run 'mvn package' first." >&2
  exit 1
fi

MATCHES="$(unzip -l "$JAR" | grep -iE 'swagger-ui|webjars|dompurify' || true)"
if [[ -n "$MATCHES" ]]; then
  echo "Forbidden Swagger UI / WebJar / DOMPurify assets found in $JAR:" >&2
  echo "$MATCHES" >&2
  exit 1
fi

echo "OK: $JAR contains no Swagger UI, WebJar, or DOMPurify assets."
