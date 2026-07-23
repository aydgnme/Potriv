package me.aydgn.potriv.admin.viewmodel;

import java.util.List;

/**
 * Safe operational counts for the admin dashboard. Every value is derived from
 * an existing repository; a metric that cannot be produced safely is omitted
 * (never fabricated).
 */
public record AdminDashboardView(List<Metric> metrics) {

    public record Metric(String label, long count, String href) {
    }
}
