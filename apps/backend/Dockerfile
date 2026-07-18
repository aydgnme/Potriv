# Potriv backend — production runtime image.
#
# Multi-stage build: Maven + JDK 21 compiles the Spring Boot jar, a slim JRE 21
# image runs it as a non-root user. No secrets are baked in; all configuration
# comes from environment variables at runtime (see docs/backend/environment.md).

FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# Warm the dependency cache before copying sources so code changes do not
# re-download the world.
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw -q -DskipTests dependency:go-offline

COPY src src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

# curl is needed only for the container healthcheck against /api/actuator/health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system potriv \
    && adduser --system --ingroup potriv potriv

COPY --from=build /workspace/target/potriv-backend-*.jar /app/potriv-backend.jar

USER potriv
EXPOSE 8080

# SPRING_PROFILES_ACTIVE is expected to be set by the orchestrator (compose
# sets it to prod); JAVA_OPTS carries container-aware JVM flags.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/potriv-backend.jar"]
