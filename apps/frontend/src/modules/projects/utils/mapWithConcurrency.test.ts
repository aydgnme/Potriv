import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./mapWithConcurrency";

/**
 * The fan-out bound, tested as a bound rather than as a total.
 *
 * Counting finished calls proves nothing about load: an unbounded
 * `Promise.all` produces exactly the same total while opening every connection
 * at once. What matters is how many were in flight together.
 */

/** Instruments a task so the peak overlap can be observed. */
function instrumented<T>(work: (item: T) => Promise<void> = async () => {}) {
  let inFlight = 0;
  let peak = 0;
  const seen: T[] = [];

  return {
    get peak() {
      return peak;
    },
    get seen() {
      return seen;
    },
    task: async (item: T) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      seen.push(item);
      await work(item);
      inFlight -= 1;
      return item;
    },
  };
}

/** Yields to the microtask queue a few times, so overlap has a chance to happen. */
async function tick(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once", async () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    const probe = instrumented<number>(() => tick());

    await mapWithConcurrency(items, 5, probe.task);

    expect(probe.peak).toBeLessThanOrEqual(5);
    // Not a trivial pass: with a limit of five it should genuinely reach five.
    expect(probe.peak).toBe(5);
  });

  it("still visits every item, not just the first batch", async () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    const probe = instrumented<number>(() => tick());

    await mapWithConcurrency(items, 5, probe.task);

    expect(probe.seen.length).toBe(23);
    expect(new Set(probe.seen).size).toBe(23);
  });

  it("keeps results in input order however they finish", async () => {
    // The first item is deliberately the slowest.
    const items = [0, 1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 3, async (item) => {
      await tick(item === 0 ? 10 : 1);
      return `item-${item}`;
    });

    expect(results).toEqual([
      "item-0",
      "item-1",
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
  });

  it("handles fewer items than workers", async () => {
    const probe = instrumented<number>();

    const results = await mapWithConcurrency([7], 5, probe.task);

    expect(results).toEqual([7]);
    expect(probe.peak).toBe(1);
  });

  it("does nothing for an empty list", async () => {
    const probe = instrumented<number>();

    expect(await mapWithConcurrency([], 5, probe.task)).toEqual([]);
    expect(probe.seen).toEqual([]);
  });
});
