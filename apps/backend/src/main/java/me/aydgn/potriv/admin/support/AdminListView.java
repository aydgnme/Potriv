package me.aydgn.potriv.admin.support;

import java.util.List;

import org.springframework.data.domain.Page;

/**
 * View wrapper for a paged admin list. Carries the page items plus the query
 * state (search term and per-column query string) so pagination links can
 * retain search/filter/sort across page changes.
 *
 * @param baseQuery already-encoded query string of retained params without a
 *                  leading {@code ?} or {@code page} (e.g. {@code q=foo&size=25}),
 *                  used by the pagination fragment to build page links.
 */
public record AdminListView<T>(
    List<T> items,
    int page,
    int size,
    int totalPages,
    long totalElements,
    boolean hasPrevious,
    boolean hasNext,
    String query,
    String baseQuery
) {

    public static <T> AdminListView<T> of(Page<T> page, String query, String baseQuery) {
        return new AdminListView<>(
            page.getContent(),
            page.getNumber(),
            page.getSize(),
            page.getTotalPages(),
            page.getTotalElements(),
            page.hasPrevious(),
            page.hasNext(),
            query,
            baseQuery);
    }

    public int firstItemNumber() {
        return totalElements == 0 ? 0 : page * size + 1;
    }

    public long lastItemNumber() {
        return Math.min((long) (page + 1) * size, totalElements);
    }
}
