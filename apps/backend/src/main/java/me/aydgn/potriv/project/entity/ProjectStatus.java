package me.aydgn.potriv.project.entity;

import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

public enum ProjectStatus {
    NOT_STARTED,
    STARTING,
    IN_PROGRESS,
    CLOSING,
    CLOSED;

    private static final Set<ProjectStatus> CAPACITY_CONSUMING_STATUSES =
        Collections.unmodifiableSet(Arrays.stream(values())
            .filter(ProjectStatus::consumesAllocationCapacity)
            .collect(Collectors.toCollection(() -> EnumSet.noneOf(ProjectStatus.class))));

    /**
     * Whether a project in this status consumes member allocation capacity.
     * True only for STARTING, IN_PROGRESS and CLOSING.
     */
    public boolean consumesAllocationCapacity() {
        return this == STARTING || this == IN_PROGRESS || this == CLOSING;
    }

    /**
     * The single source of truth for capacity-consuming statuses, so repository
     * queries can pass them as parameters without scattering raw status lists
     * across services.
     */
    public static Set<ProjectStatus> capacityConsumingStatuses() {
        return CAPACITY_CONSUMING_STATUSES;
    }
}
