package me.aydgn.potriv.allocation.service;

import java.util.UUID;

import org.springframework.stereotype.Component;

/**
 * Default capacity source used until active allocation persistence exists. It
 * reports zero committed hours. PROJECT-ALLOC-02 will replace this with a query
 * over real {@code ProjectAllocation} rows.
 */
@Component
public class NoActiveAllocationCapacityQuery implements AllocationCapacityQuery {

    @Override
    public int sumCapacityConsumingHours(UUID employeeId) {
        return 0;
    }
}
