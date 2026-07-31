package me.aydgn.potriv.admin.support;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * Builds a bounded {@link Pageable} for admin list pages. Page size is clamped
 * to a safe range so a caller can never request an unbounded result set.
 */
public final class AdminPaging {

    public static final int DEFAULT_SIZE = 25;
    public static final int MAX_SIZE = 100;

    private AdminPaging() {
    }

    public static Pageable of(Integer page, Integer size, Sort sort) {
        int safePage = page == null || page < 0 ? 0 : page;
        int safeSize = size == null ? DEFAULT_SIZE : Math.min(Math.max(size, 1), MAX_SIZE);
        return PageRequest.of(safePage, safeSize, sort);
    }

    /**
     * Reads a page/size query parameter that arrived as raw text. A blank or
     * non-numeric value becomes {@code null} so {@link #of} applies its default
     * — binding these as {@code Integer} instead lets a hand-edited URL raise a
     * type-mismatch, which the admin error advice renders as a 500.
     */
    public static Integer number(String raw) {
        String value = normalizeQuery(raw);
        if (value == null) {
            return null;
        }
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /** Normalizes a free-text search term to null when blank. */
    public static String normalizeQuery(String query) {
        if (query == null) {
            return null;
        }
        String trimmed = query.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Builds a lower-cased SQL LIKE pattern. A blank query becomes {@code "%"}
     * (match all). Passing a non-null pattern avoids the Postgres "lower(bytea)"
     * type-inference error that a nullable bind in {@code concat(...)} triggers.
     */
    public static String likePattern(String query) {
        String normalized = normalizeQuery(query);
        if (normalized == null) {
            return "%";
        }
        return "%" + normalized.toLowerCase(java.util.Locale.ROOT) + "%";
    }
}
