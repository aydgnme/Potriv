/**
 * `server-only` throws on import outside a React Server Component, including
 * under Vitest. Aliasing it here lets server modules be unit-tested directly.
 *
 * The real boundary is unaffected: `next build` still refuses to bundle any of
 * these modules into client code, which is what actually enforces the rule.
 */
export {};
