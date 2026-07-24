package me.aydgn.potriv.admin.support;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

import org.springframework.data.domain.Sort;

/**
 * Parsing helpers for admin list requests: a whitelisted {@link Sort} parser
 * (so a client can never sort by an arbitrary/unmapped property) and a
 * query-string builder used to retain search/filter/sort across pagination.
 */
public final class AdminRequests {

    private AdminRequests() {
    }

    /**
     * Parses a {@code field,dir} sort parameter, accepting only fields present
     * in {@code allowed}; anything else falls back to {@code defaultSort}.
     */
    public static Sort sort(String sortParam, Set<String> allowed, Sort defaultSort) {
        if (sortParam == null || sortParam.isBlank()) {
            return defaultSort;
        }
        String[] parts = sortParam.split(",");
        String field = parts[0].trim();
        if (!allowed.contains(field)) {
            return defaultSort;
        }
        Sort.Direction direction = parts.length > 1 && parts[1].trim().equalsIgnoreCase("desc")
            ? Sort.Direction.DESC
            : Sort.Direction.ASC;
        return Sort.by(direction, field);
    }

    /** Builds an encoded {@code k=v&...} string from non-blank params (no leading ?). */
    public static String baseQuery(Map<String, String> params) {
        StringJoiner joiner = new StringJoiner("&");
        params.forEach((key, value) -> {
            if (value != null && !value.isBlank()) {
                joiner.add(encode(key) + "=" + encode(value));
            }
        });
        return joiner.toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
