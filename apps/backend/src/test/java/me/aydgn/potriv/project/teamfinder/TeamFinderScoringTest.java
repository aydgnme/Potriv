package me.aydgn.potriv.project.teamfinder;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Focused unit tests for the deterministic Team Finder scoring rules (plain
 * JUnit, no Spring context).
 */
class TeamFinderScoringTest {

    @Test
    void skillScoreIsProportionalToMatchedTechnologies() {
        assertThat(TeamFinderService.skillScore(0, 4)).isZero();
        assertThat(TeamFinderService.skillScore(2, 4)).isEqualTo(30);
        assertThat(TeamFinderService.skillScore(4, 4)).isEqualTo(60);
        assertThat(TeamFinderService.skillScore(1, 3)).isEqualTo(20);
        // Rounding: 60 * 1/7 = 8.57 -> 9.
        assertThat(TeamFinderService.skillScore(1, 7)).isEqualTo(9);
    }

    @Test
    void availabilityScoreFollowsCapacityWithCloseToFinishFloor() {
        assertThat(TeamFinderService.availabilityScore(8, false)).isEqualTo(20);
        assertThat(TeamFinderService.availabilityScore(4, false)).isEqualTo(10);
        assertThat(TeamFinderService.availabilityScore(0, false)).isZero();
        // The close-to-finish floor lifts a zero-capacity candidate to 10.
        assertThat(TeamFinderService.availabilityScore(0, true)).isEqualTo(10);
        // The floor never lowers a higher capacity-based score.
        assertThat(TeamFinderService.availabilityScore(8, true)).isEqualTo(20);
        // Rounding: 20 * 1/8 = 2.5 -> 3, and the result stays within 0..20.
        assertThat(TeamFinderService.availabilityScore(1, false)).isEqualTo(3);
    }
}
