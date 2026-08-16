# MIG-01 — Next.js 16 migration and the audit gate

A security migration, not a modernization pass. The frontend sat on
`next@15.5.23` with three high advisories that no 15.x release could reach, and
a `npm audit` gate that could not be turned on because it would have been
permanently red. This moves to `next@16.3.1`, which drops all three, and turns
the gate on.

Baseline: `c49ee977610a4c0671ddeedc83736a88390b6af6` (merge of PR #94, SEC-01).
Branch: `migration/next-16-security`.

---

## 1. Why 16.3.1

`npm view next version` reported `16.3.1` as the newest stable 16.x at the time
of the migration. Checked before installing:

| Field | Value | Consequence |
| --- | --- | --- |
| `engines.node` | `>=20.9.0` | CI is Node 22, local is Node 26 — both fine |
| `peerDependencies.react` | `^18.2.0 \|\| ... \|\| ^19.0.0` | React stays at `19.2.0`, untouched |
| `dependencies.postcss` | `8.5.23` | above the patched line; advisory gone |
| `optionalDependencies.sharp` | `^0.35.3` | above the patched line; advisory gone |

React and react-dom were deliberately **not** bumped. The peer range is already
satisfied, and a React major inside a Next major would make any regression
ambiguous about which upgrade caused it.

Both `next` and `eslint-config-next` are pinned exact (`--save-exact`),
continuing the convention SEC-01 established.

## 2. Advisories, before and after

Full tree (`npm audit`), and runtime-only (`npm audit --omit=dev`):

| Severity | Before (full) | After (full) | Before (runtime) | After (runtime) |
| --- | --- | --- | --- | --- |
| critical | 0 | **0** | 0 | **0** |
| high | 3 | **0** | 3 | **0** |
| moderate | 0 | **0** | 0 | **0** |
| low | 0 | **0** | 0 | **0** |

The three highs were `postcss` and `sharp` reached through `next`'s own pins.
They are gone because the dependency moved, not because anything was overridden,
suppressed, or excluded. There is no `overrides` block and no audit exception in
this change.

`npm audit --audit-level=high` exits **0**. So does `--audit-level=critical`.

## 3. Breaking changes that actually applied

Next 16 removes several things. Only three touched this repository.

### `next lint` → ESLint CLI

`next lint` is gone. `.eslintrc.json` (which contained only
`{"extends": "next/core-web-vitals"}`) was deleted and replaced by
`eslint.config.mjs`, and the `lint` script became `eslint .`.

`eslint-config-next@16` publishes flat config natively, so the config imports
`eslint-config-next/core-web-vitals` directly. `FlatCompat` was tried first and
failed with `TypeError: Converting circular structure to JSON`; the native
export is the correct path, not a workaround.

The policy is unchanged — `core-web-vitals` and nothing else, exactly what the
old file extended. `next lint` ignored build output implicitly and the CLI does
not, so the ignores are now written down.

**Coverage check:** `eslint .` reports **301 files**, 0 errors, 0 warnings, and
walks neither `node_modules` nor `.next`. Confirming coverage matters here: a
flat config that silently linted nothing would also have exited 0.

One scoped exception. `eslint-config-next@16` newly enables
`react-hooks/set-state-in-effect`, which flags three pre-existing patterns in
`src/dev-console/` — a localStorage read on mount, a fetch-on-mount loading
flag, and form state derived from a preset prop. None is a Next 16
incompatibility; all three behave identically on 15 and 16. Product code
(`app/`, `src/modules/`, `src/shared/`) is clean under the rule, so the rule is
disabled for `src/dev-console/**` only, and rewriting the console's state
management is left as follow-up rather than smuggled into a security migration.

### `middleware.ts` → `proxy.ts`

The file was renamed and the exported function with it: `middleware()` →
`proxy()`. Nothing else changed — a diff of the two files confirmed they are
identical apart from comments.

Because a rename of a security-adjacent file deserves evidence rather than a
passing build, `proxy.test.ts` was added: **21 tests** covering

- matcher coverage for all six product domains and their deep paths
- the exclusions (`/login`, `/forgot-password`, `/reset-password`, `/console`,
  `/api/auth/*`, `/`) and *why* each is excluded
- prefix-is-not-a-segment (`/projects-archive` and `/peoplefinder` are not
  guarded)
- access cookie → `next()`, status 200, no `location`
- refresh-only → `/api/auth/refresh` with `returnTo`, query string preserved
- no cookies → `/login`
- access preferred when both cookies are present
- no refresh loop; redirects stay on the request origin

These tests were checked against deliberate mutations rather than trusted for
being green: dropping the query from `returnTo` fails
`preserves the query string in returnTo`, and removing `/organization` from the
matcher fails `covers /organization and everything under it`. Both were restored
after.

`vitest.config.mts` needed its `include` widened to `["src/**/*.test.{ts,tsx}",
"*.test.{ts,tsx}"]`, because Next requires `proxy.ts` at the app root and the
previous pattern only matched under `src/`.

The proxy's boundary is unchanged and deliberately so: it decides routing from
cookie *presence* only. It holds no authority, and the protected layout's
`/auth/me` call remains the thing that decides whether anyone is let in.

### Turbopack is the default builder

`npm run build` runs on Turbopack with no flag and no `--webpack` fallback:

```
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully
ƒ Proxy (Middleware)
```

The build output recognises the renamed proxy, which is independent
confirmation that the convention was picked up rather than silently ignored.

### `tsconfig.json`, rewritten by the framework

Next 16 edits `tsconfig.json` on first run. Two changes are real:
`"jsx": "preserve"` → `"jsx": "react-jsx"`, and `.next/dev/types/**/*.ts` added
to `include` (Next 16 emits dev-time route types to a new path). Both are kept —
reverting them just means Next rewrites the file again on the next run.

It also reformatted every array onto multiple lines. That was reverted, so the
committed diff is the two changes and nothing else. Typecheck and build were
re-run after the revert and Next did not rewrite the file again.

### Breaking changes that did **not** apply

- **Async request APIs.** Already compliant. Every `cookies()` call is awaited
  (`backendTransport.ts:77`, `productSession.ts:64` and `:77`); there is no
  `headers()` or `draftMode()` anywhere; every `searchParams` is already typed
  as a `Promise`.
- **`next/image` changes.** There is no `next/image` in the app and no `images`
  config, so none of the image-related breaking changes have a surface here.

## 4. Gates

From a wiped tree (`rm -rf node_modules .next && npm ci`), in CI order:

| Gate | Result |
| --- | --- |
| `npm audit --audit-level=high` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 — 301 files, 0 errors, 0 warnings |
| `npm test` | **1140 passed / 69 files** |
| `npm run build` | Turbopack, compiled successfully |

Test count moved 1119 → 1140 and file count 68 → 69: the 21 new proxy tests,
with nothing lost.

`git diff --check` is clean.

## 5. Live verification

Run against the dev server on Next 16 with the real backend, using two
throwaway actors created for this pass (an organization admin and an employee in
a fresh organization).

| Check | Result |
| --- | --- |
| unauthenticated `/projects?view=mine&status=OPEN` | proxy → `/login` |
| invalid credentials | one non-enumerating sentence, no cookie set |
| valid credentials | Server Action → `/home`, session established |
| protected shell | navigation, `aria-current`, identity footer, sign out |
| ten domain routes | all 200 for the authorized actor |
| Server Action write | department created, announced, list revalidated, derived warning recomputed |
| dynamic route (async `params`) | department detail renders, breadcrumb and title correct |
| confirmation dialog | true modal `<dialog>`, labelled, focus on the safe default |
| destructive action | delete → redirect back to the list, warning correctly gone |
| refresh-only session on a deep route | 307 → `/api/auth/refresh?returnTo=…`, query preserved |
| refresh handler | rotates the pair, returns to the exact deep route, 200 |
| `returnTo` open-redirect guard | absolute off-origin and protocol-relative both collapse to `/home` |
| same-origin guard on refresh | a request with no origin signal is refused |
| mobile shell (375px) | bottom nav, `More` in the last slot, sheet carries sign out |
| sign out | session cleared, `/home` redirects away |
| console | no hydration errors, no React errors, no Next 16 deprecation warnings |

Authorization matrix, both actors, seven administrative routes:

| Route | Organization admin | Employee |
| --- | --- | --- |
| `/organization` | allowed | denied |
| `/organization/departments` | allowed | denied |
| `/organization/team-roles` | allowed | denied |
| `/people` | allowed | denied |
| `/skills/categories` | denied | denied |
| `/projects/new` | denied | denied |
| `/staffing` | denied | denied |

The admin's three denials are correct: catalogue administration, project
creation and staffing review each require a role this actor does not hold. Every
denial rendered the same single sentence, and nothing leaked into a difference
between "not permitted" and "does not exist".

## 6. Follow-up: the protected POST edge case

Found in review of PR #95, after the migration commit. Reproduced, then fixed.

### What was wrong

The proxy recovered every unauthenticated-but-refreshable request the same way,
regardless of method:

```ts
return NextResponse.redirect(refreshUrl);   // defaults to 307
```

307 is method-preserving: the client must repeat the request verbatim, method
and body included, at the new location. That is correct for a navigation and
wrong for a mutation — and protected routes host Server Actions, which arrive as
`POST` to the page's own URL, which the matcher guards.

Reproduced live against Next 16 before any fix, with a refresh-only session:

```
POST /organization/departments
  → 307 /api/auth/refresh?returnTo=%2Forganization%2Fdepartments
  → POST /api/auth/refresh
  → 405 Method Not Allowed
```

Confirmed for both a plain form POST and the real Server Action transport (a
`Next-Action` header with an RSC body). The refresh route exports only `GET`, so
the session was never recovered and the user got a hard failure. The request
body — the user's form data — was also re-sent to an endpoint with no reason to
receive it.

### What it was not

The mutation did **not** execute, and could not have. Two independent reasons:

1. The proxy intercepts before the route runs, so the action never started.
2. Every product write goes through `backendPost` / `backendPatch` / `backendPut`
   / `backendDelete` → `request()` in `backendTransport.ts`, which returns
   `401` **before** issuing any backend fetch when the access cookie is absent.
   The only `fetch` calls outside that transport are the unauthenticated auth
   endpoints and the browser's calls to this app's own `/api/auth/*` handlers.

So this was a broken recovery path and an unnecessary body disclosure, not a
double-submit. The fix keeps it that way rather than introducing a replay.

### The fix

One change, in `proxy.ts`: choose the redirect status by method.

```ts
const SAFE_METHODS = new Set(["GET", "HEAD"]);

function recoveryStatus(method: string): 303 | 307 {
  return SAFE_METHODS.has(method) ? 307 : 303;
}
```

| Request | access absent, refresh present | no cookies |
| --- | --- | --- |
| `GET` / `HEAD` | 307 → `/api/auth/refresh?returnTo=…` | 307 → `/login` |
| `POST` `PUT` `PATCH` `DELETE`, and any unrecognised verb | **303** → `/api/auth/refresh?returnTo=…` | **303** → `/login` |

303 See Other is the status defined for this: RFC 9110 requires the client to
re-issue as `GET` and drop the body. An interrupted mutation therefore degrades
into an ordinary navigation — session recovered, user back on the page they were
on, and the action left for them to repeat deliberately.

Unrecognised methods fall to 303 rather than being enumerated, so an unfamiliar
verb fails to the careful branch.

Navigation recovery is byte-for-byte unchanged, which is why `GET` keeps 307.

### Why not the alternatives

- **Adding `POST` to `/api/auth/refresh`** — explicitly rejected. It would couple
  token rotation to an intercepted mutation and invite exactly the replay
  semantics this avoids.
- **Letting mutations through with `next()`** — the action would fail closed at
  the transport, but the user would be told they lack permission when in fact
  their session expired. That collapses two different facts into one message.
- **Failing closed to `/login`** — safe, but it discards a session that is still
  recoverable. 303 gets the same safety without that cost.

Nothing was added to the refresh route, `refreshOnce`, `safeReturnTo`, or the
same-origin guard.

### Verified live on Next 16

| Check | Result |
| --- | --- |
| form `POST`, refresh-only | 303 → refresh → rotated → `/organization/departments` **200** |
| Server Action `POST` (`Next-Action`), refresh-only | 303 → recovered → **200**, no 405 anywhere in the chain |
| was the mutation applied? | **no** — the name never appears in the recovered page |
| `GET` navigation recovery | still 307, query preserved through `returnTo` |
| open-redirect guard | absolute and protocol-relative both still collapse to `/home` |
| normal Server Action, valid session | unchanged — created, announced, list revalidated |
| network log | no `POST` to `/api/auth/refresh` at any point |

### Matcher tests now use Next's own matcher

The hand-written `matches()` helper that approximated `:path*` was replaced with
Next 16's `unstable_doesMiddlewareMatch`, so the assertions exercise the
framework's real matcher semantics instead of a re-implementation that could
drift from them. The two agreed on all 17 checked paths before the swap, so this
is a strengthening rather than a correction.

Two notes on using it. Next 16.3.1's own documentation names this export
`unstable_doesProxyMatch`, but the shipped package exports only
`unstable_doesMiddlewareMatch` — verified against the installed package, and the
shipped name is the one used. It is imported from the module path rather than
the `next/experimental/testing/server` barrel, because the barrel additionally
pulls in server internals that require `AsyncLocalStorage` and throw under
jsdom.

### Tests

`proxy.test.ts` goes 21 → 45 tests; the suite goes **1140 → 1164** across the
same 69 files.

The 24 new cases cover all six methods against all three cookie states, that an
unsafe method is never answered with 307 or 308, that recovery still reaches the
refresh route with `returnTo` intact, that an unrecognised verb is treated as
unsafe, and that a valid access cookie passes every method through untouched.

Nine of them failed against the pre-fix implementation and pass after it —
demonstrated in that order rather than written to match the new code.

### Gates after the fix

`npm audit --audit-level=high` exit 0 · `typecheck` exit 0 · `lint` exit 0 ·
**1164 passed / 69 files** · Turbopack build clean.

## 7. What this pass did not prove

- **Real keyboard operation.** Unchanged from FE-13: the environment cannot
  deliver activating key events to a browser. Two interactions here (opening the
  mobile account sheet, activating sign out) were driven by DOM `click()` rather
  than a real pointer, because the browser pane became unresponsive to synthetic
  pointer input at mobile width. A DOM click is a genuine click event and does
  exercise the handler, but it is not proof of a real pointer or a real key.
- **Authority-versus-outage under a failing backend.** The distinction between
  403, 5xx and an empty 200 is covered by unit tests; it was not re-proven live,
  because forcing a backend outage would have meant disrupting a shared local
  service. The migration does not touch that code path.
