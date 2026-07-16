package me.aydgn.potriv.project.teamfinder;

/**
 * Availability criteria for the Team Finder. All fields are optional; the
 * service applies defaults (flags false, limit 50) and validates ranges
 * (closeToFinishWeeks 2..6, limit 1..100).
 */
public record TeamFinderRequest(
    Boolean includePartiallyAvailable,
    Boolean includeCloseToFinish,
    Integer closeToFinishWeeks,
    Boolean includeUnavailable,
    Integer limit
) {

}
