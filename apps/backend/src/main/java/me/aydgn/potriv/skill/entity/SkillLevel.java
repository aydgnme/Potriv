package me.aydgn.potriv.skill.entity;

/**
 * Self-assessed proficiency level. The numeric {@code value} (1-5) is an explicit
 * property and is never derived from the enum ordinal. Persisted as a string.
 */
public enum SkillLevel {
    LEARNS(1, "Learns"),
    KNOWS(2, "Knows"),
    DOES(3, "Does"),
    HELPS(4, "Helps"),
    TEACHES(5, "Teaches");

    private final int value;
    private final String label;

    SkillLevel(int value, String label) {
        this.value = value;
        this.label = label;
    }

    public int getValue() {
        return value;
    }

    public String getLabel() {
        return label;
    }
}
