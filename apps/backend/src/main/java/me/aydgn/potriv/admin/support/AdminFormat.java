package me.aydgn.potriv.admin.support;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;

/**
 * Consistent administrative formatting for dates and UUIDs, exposed to
 * templates as a Spring bean ({@code @adminFormat}).
 */
public final class AdminFormat {

    private static final DateTimeFormatter DATE_TIME =
        DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm", Locale.ENGLISH);

    /** e.g. {@code 23 Jul 2026, 21:43} in UTC; empty string for null. */
    public String dateTime(OffsetDateTime value) {
        if (value == null) {
            return "";
        }
        return value.atZoneSameInstant(ZoneOffset.UTC).format(DATE_TIME);
    }

    /** Short UUID for dense tables: first 8 characters. */
    public String shortId(UUID id) {
        if (id == null) {
            return "";
        }
        return id.toString().substring(0, 8);
    }

    public String shortId(String id) {
        if (id == null || id.length() < 8) {
            return id == null ? "" : id;
        }
        return id.substring(0, 8);
    }
}
