package me.aydgn.potriv.admin.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Turns grouped {@code [id, count]} rows into a lookup map, so listings resolve
 * satellite counts from one batch query instead of one query per row.
 */
final class AdminCounts {

    private AdminCounts() {
    }

    static Map<UUID, Long> toMap(List<Object[]> rows) {
        Map<UUID, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        return map;
    }

    static Map<UUID, String> toStringMap(List<Object[]> rows) {
        Map<UUID, String> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put((UUID) row[0], (String) row[1]);
        }
        return map;
    }

    static long get(Map<UUID, Long> map, UUID id) {
        return map.getOrDefault(id, 0L);
    }
}
