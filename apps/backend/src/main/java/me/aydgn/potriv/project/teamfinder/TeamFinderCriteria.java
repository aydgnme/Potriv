package me.aydgn.potriv.project.teamfinder;

/**
 * The normalized criteria the Team Finder actually used, echoed back in the
 * response. {@code closeToFinishWeeks} is the effective window when
 * {@code includeCloseToFinish} is true, otherwise null.
 */
public record TeamFinderCriteria(
    boolean includePartiallyAvailable,
    boolean includeCloseToFinish,
    Integer closeToFinishWeeks,
    boolean includeUnavailable,
    int limit
) {

}
