package me.aydgn.potriv.admin.support;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * Builds a bounded {@link Pageable} for admin list pages.
 *
 * <p>Pagination parameters arrive as raw query-string text and are parsed here
 * rather than bound as {@code Integer}: a hand-edited {@code ?page=abc} would
 * otherwise raise a type mismatch, which {@code AdminErrorAdvice} renders as a
 * 500. Parsing never throws — a missing, malformed, negative or oversized value
 * falls back to a safe default, so every admin list URL answers with a list.
 *
 * <p>Size is clamped to {@link #MAX_SIZE} so a caller can never request an
 * unbounded result set.
 */
public final class AdminPaging {

    public static final int DEFAULT_SIZE = 25;
    public static final int MAX_SIZE = 100;

    private AdminPaging() {
    }

    /** A bounded {@link Pageable} from raw {@code page}/{@code size} query values. */
    public static Pageable of(String page, String size, Sort sort) {
        return PageRequest.of(page(page), size(size), sort);
    }

    /**
     * Page index. Missing, malformed or negative becomes {@code 0}. A large but
     * valid index is honoured — it simply pages past the end and renders empty;
     * anything outside {@code int} range fails to parse and defaults instead, so
     * the offset multiplication can never overflow.
     */
    public static int page(String raw) {
        Integer parsed = number(raw);
        return parsed == null || parsed < 0 ? 0 : parsed;
    }

    /**
     * Page size. Missing, malformed or non-positive becomes {@link #DEFAULT_SIZE};
     * anything larger than {@link #MAX_SIZE} is clamped down to it.
     */
    public static int size(String raw) {
        Integer parsed = number(raw);
        if (parsed == null || parsed < 1) {
            return DEFAULT_SIZE;
        }
        return Math.min(parsed, MAX_SIZE);
    }

    /**
     * The {@code size} value to retain in pagination links: {@code null} when the
     * caller did not ask for one, otherwise the <em>effective</em> size. Retaining
     * the normalized value rather than the raw one keeps a hostile
     * {@code ?size=<script>} out of every link the page renders.
     */
    public static String retainedSize(String raw) {
        return normalizeQuery(raw) == null ? null : String.valueOf(size(raw));
    }

    /** Parses raw query text to an {@code Integer}, or {@code null} if it is not one. */
    private static Integer number(String raw) {
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
