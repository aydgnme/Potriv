package me.aydgn.potriv.skill.entity;

/**
 * Experience bucket for a self-assigned skill. Persisted as a string; the label
 * is an explicit property.
 */
public enum SkillExperience {
    ZERO_TO_SIX_MONTHS("0-6 months"),
    SIX_TO_TWELVE_MONTHS("6-12 months"),
    ONE_TO_TWO_YEARS("1-2 years"),
    TWO_TO_FOUR_YEARS("2-4 years"),
    FOUR_TO_SEVEN_YEARS("4-7 years"),
    MORE_THAN_SEVEN_YEARS(">7 years");

    private final String label;

    SkillExperience(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
