package me.aydgn.potriv.admin.support;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

import jakarta.persistence.criteria.Predicate;
import me.aydgn.potriv.admin.viewmodel.AdminAuditLogViews;
import me.aydgn.potriv.security.entity.SecurityAuditEvent;
import me.aydgn.potriv.security.entity.SecurityAuditEventType;

/**
 * Parsed audit-log filter, translated into a JPA {@link Specification}.
 *
 * <p>Parsing is deliberately lenient. Every value arrives from the query string,
 * so an unknown event type, a malformed UUID or an unreadable timestamp is
 * dropped and the remaining filters still apply — a hand-edited URL narrows the
 * result set instead of hitting the admin error advice, which turns any thrown
 * exception into a 500.
 *
 * <p>Criteria combine with AND. Every value binds as a Criteria API parameter,
 * so no user input is ever concatenated into a query, and LIKE wildcards typed
 * by the operator are escaped rather than interpreted.
 */
public record AdminAuditQuery(
    SecurityAuditEventType eventType,
    Boolean success,
    UUID organizationId,
    String actor,
    String ipAddress,
    OffsetDateTime from,
    OffsetDateTime to
) {

    /** Query-parameter value selecting successful events. */
    public static final String OUTCOME_SUCCESS = "success";
    /** Query-parameter value selecting failed events. */
    public static final String OUTCOME_FAILURE = "failure";

    private static final char LIKE_ESCAPE = '\\';

    public static AdminAuditQuery of(AdminAuditLogViews.Filter filter) {
        if (filter == null) {
            return new AdminAuditQuery(null, null, null, null, null, null, null);
        }
        return new AdminAuditQuery(
            eventType(filter.eventType()),
            outcome(filter.outcome()),
            uuid(filter.organizationId()),
            AdminPaging.normalizeQuery(filter.actor()),
            AdminPaging.normalizeQuery(filter.ip()),
            timestamp(filter.from(), false),
            timestamp(filter.to(), true));
    }

    /** The filter values to retain across pagination links, in form order. */
    public static Map<String, String> retainedParams(AdminAuditLogViews.Filter filter) {
        Map<String, String> retained = new LinkedHashMap<>();
        if (filter == null) {
            return retained;
        }
        retained.put("eventType", filter.eventType());
        retained.put("outcome", filter.outcome());
        retained.put("organizationId", filter.organizationId());
        retained.put("actor", filter.actor());
        retained.put("ip", filter.ip());
        retained.put("from", filter.from());
        retained.put("to", filter.to());
        return retained;
    }

    public Specification<SecurityAuditEvent> specification() {
        return Specification.allOf(
            eventType == null ? null
                : (root, query, cb) -> cb.equal(root.get("eventType"), eventType),
            success == null ? null
                : (root, query, cb) -> cb.equal(root.get("success"), success),
            organizationId == null ? null
                : (root, query, cb) -> cb.equal(root.get("organizationId"), organizationId),
            actor == null ? null : actorSpecification(actor),
            ipAddress == null ? null
                : (root, query, cb) -> cb.like(
                    cb.lower(root.get("ipAddress")), containsPattern(ipAddress), LIKE_ESCAPE),
            from == null ? null
                : (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("createdAt"), from),
            to == null ? null
                : (root, query, cb) -> cb.lessThanOrEqualTo(root.get("createdAt"), to));
    }

    /**
     * Matches the actor by the two shapes the audit table actually stores: the
     * normalized email recorded on authentication events, and the user ids
     * recorded on administrative ones. A term that is not a UUID only searches
     * the email.
     */
    private static Specification<SecurityAuditEvent> actorSpecification(String term) {
        UUID id = uuid(term);
        String pattern = containsPattern(term);
        return (root, query, cb) -> {
            Predicate byEmail =
                cb.like(cb.lower(root.get("normalizedEmail")), pattern, LIKE_ESCAPE);
            if (id == null) {
                return byEmail;
            }
            return cb.or(
                byEmail,
                cb.equal(root.get("actorUserId"), id),
                cb.equal(root.get("userId"), id));
        };
    }

    private static SecurityAuditEventType eventType(String raw) {
        String value = AdminPaging.normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        try {
            return SecurityAuditEventType.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static Boolean outcome(String raw) {
        String value = AdminPaging.normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        if (OUTCOME_SUCCESS.equalsIgnoreCase(value)) {
            return Boolean.TRUE;
        }
        if (OUTCOME_FAILURE.equalsIgnoreCase(value)) {
            return Boolean.FALSE;
        }
        return null;
    }

    private static UUID uuid(String raw) {
        String value = AdminPaging.normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /**
     * Reads a browser {@code datetime-local} value, or a bare date, as UTC — the
     * zone every admin timestamp is rendered in. A date-only bound covers the
     * whole day so {@code to=2026-07-31} includes that day's events.
     */
    private static OffsetDateTime timestamp(String raw, boolean endOfDay) {
        String value = AdminPaging.normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        try {
            return LocalDateTime.parse(value).atOffset(ZoneOffset.UTC);
        } catch (DateTimeParseException notADateTime) {
            // Fall through: the value may still be a bare ISO date.
        }
        try {
            LocalDate date = LocalDate.parse(value);
            LocalTime time = endOfDay ? LocalTime.MAX : LocalTime.MIN;
            return date.atTime(time).atOffset(ZoneOffset.UTC);
        } catch (DateTimeParseException notADate) {
            return null;
        }
    }

    /** Lower-cased {@code %term%} pattern with LIKE wildcards escaped. */
    private static String containsPattern(String value) {
        String escaped = value.toLowerCase(Locale.ROOT)
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
