package me.aydgn.potriv.project.teamfinder;

/**
 * Deterministic candidate score. Maximums: skill 60, past project 20,
 * availability 20 — total 100.
 */
public record TeamFinderScore(
    int skillScore,
    int pastProjectScore,
    int availabilityScore,
    int totalScore
) {

}
