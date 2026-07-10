package me.aydgn.potriv.project.entity;

public enum ProjectStatus {
    NOT_STARTED,
    STARTING,
    IN_PROGRESS,
    CLOSING,
    CLOSED;

    /**
     * Whether a project in this status consumes member allocation capacity.
     * True only for STARTING, IN_PROGRESS and CLOSING.
     */
    public boolean consumesAllocationCapacity() {
        return this == STARTING || this == IN_PROGRESS || this == CLOSING;
    }
}
