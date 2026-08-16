import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Flat config, replacing `.eslintrc.json` because Next 16 removed `next lint`
 * and with it the implicit legacy-config loading.
 *
 * The policy is unchanged and deliberately so: `next/core-web-vitals` and
 * nothing else, exactly what the old file extended. A framework migration is
 * the wrong moment to widen a lint policy — a new rule firing here would be
 * indistinguishable from a real Next 16 incompatibility.
 *
 * `eslint-config-next@16` publishes flat config natively, so it is imported
 * rather than translated through `FlatCompat`.
 */
const config = [
  {
    // `next lint` ignored build output implicitly. The CLI does not, so the
    // ignores are written down — without them ESLint walks `.next`, which is
    // generated, enormous, and not ours to lint.
    ignores: ["**/.next/**", "**/out/**", "**/build/**", "**/node_modules/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  {
    /**
     * `eslint-config-next@16` newly enables `react-hooks/set-state-in-effect`.
     * It reports three pre-existing patterns in the developer console — a
     * localStorage read on mount, a fetch-on-mount loading flag, and form state
     * derived from a preset prop. None is a Next 16 incompatibility: all three
     * behave identically on 15 and 16.
     *
     * The product code (`app/`, `src/modules/`, `src/shared/`) is clean under
     * the rule, so the policy is scoped rather than weakened, and only for the
     * console — which is a separate internal tool with its own boundary.
     * Rewriting its state management inside a framework security migration
     * would be the unrelated modernization this PR is meant to avoid; it is
     * noted as a follow-up instead.
     */
    files: ["src/dev-console/**"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
];

export default config;
