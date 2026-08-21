# V2-08 — Account, History, Portfolio & System States

Base: `v2` at `444b4e1d519f155c40c8b907496ebe2a9d18e7b5` (after PR #103).

The slice that finishes the authenticated product: who you are, where you are
signed in, and states that stay honest when there is nothing to show.

---

## 1. Discovery, before any edit

Three findings decided the shape of this slice:

| Question | Answer |
|---|---|
| Does an Account route exist? | **No** — nothing under `account`, `settings` or `profile` |
| Do App Router boundaries exist? | **No** `error.tsx`, `not-found.tsx` or `loading.tsx` anywhere |
| Do History and Portfolio already have homes? | **Yes** — V2-04's Projects *Mine* and *Department* scopes |

So Account and the two global boundaries were **added**; History and Portfolio
were **audited and left in place**, because duplicating them into new routes
would have split one domain across two screens for no reason but proximity.

---

## 2. Account

### Route and entry decision

`/account`, under the protected product layout. No client auth gate, no role
gate beyond being signed in.

**It is not in the primary navigation.** `NAVIGATION_DEFINITIONS` is unchanged.
The shell already exposes an `accountActions` slot that `ProductNavigation`
passes to *both* the desktop `Sidebar` and the mobile `MobileNavigation` drawer,
so composing an Account link beside `SignOutButton` gives both surfaces an entry
with **zero shared-component changes** and without spending one of the five
bottom-bar control slots — that budget is for primary domains, and Account is a
utility destination.

The composition lives in the protected layout, the one layer allowed to reach
into two modules at once. `shared` still imports no feature.

### Identity

Exactly what the product session carries: display name, email, access roles. No
department, job title, avatar, tenure, plan or "last login" — the contract has
none of them.

**Correction after review.** An earlier draft said the route "passes the user the
layout already resolved". It does not — the page calls `resolveProductSession()`
independently, and so does the layout. Measured against a local backend, one
`/account` render made **two** `GET /auth/me` calls plus one `GET /auth/sessions`.

`resolveProductSession` is now wrapped in React's per-request `cache()`, and the
same measurement afterwards shows **one** `/auth/me` plus one `/auth/sessions`.
That memo is request-scoped, not the Data Cache: it is created and discarded with
the request, so two users can never share an entry, nothing is persisted, and the
underlying `cache: "no-store"` fetch semantics are untouched. It is safe because
the function is a pure read that deliberately never refreshes.

A failed session read still costs only the sessions section — identity does not
depend on it.

### Sessions

`SessionResponse`, rendered field for field:

```
sessionId · createdAt · lastSeenAt · revokedAt · userAgent · ipAddress · currentSession
```

Nothing is derived from them. No city from the IP, no device model from the user
agent, no "active now" from `lastSeenAt`. A security screen is the worst place to
guess.

**Order is proven, not assumed.** `UserSessionService.listSessions` calls
`findByUserIdOrderByCreatedAtDesc`, so the backend guarantees newest-first. The
current/other split is presentation over that same list, not a re-sort.

**Revoked rows are returned.** That same repository method filters nothing on
`revokedAt`, so ended sessions come back — they render their end time and are
read-only rather than being silently dropped.

### Current session

Taken **only** from the backend's `currentSession` boolean — never from a cookie,
token, IP or user-agent match. Verified live: exactly one row marked, out of
three.

The current row deliberately offers **no revoke control**. Revoking it at the
backend while this browser still held refresh cookies would leave a session that
could be silently restored, so the row points at the real sign-out flow, which
clears them.

### Sign out everywhere

`POST /api/auth/logout-all` — a fixed, same-origin, no-store BFF route.

The two halves are reported separately, because this promises something about
other devices that clearing local cookies cannot deliver:

```json
{ "authenticated": false, "revokedEverywhere": true }
```

**Second correction after review.** The first fix sent *every* failure to
`/login?logout=local-only`. That was wrong for a different reason: a rejected
`fetch` is not evidence that the BFF ran, so the cookies may still be valid — and
`/login` redirects an authenticated session straight to `/home`. Somebody would
have been told they were signed out and then dropped back into the product,
never seeing the notice. Reproduced live: `GET /login?logout=local-only` with
valid cookies answers **307 → /home**.

There are three outcomes, not two, classified by `classifyLogoutOutcome`:

```
ok && authenticated === false && revokedEverywhere === true    GLOBAL_CONFIRMED
ok && authenticated === false && revokedEverywhere === false   LOCAL_ONLY_CONFIRMED
anything else                                                  UNCONFIRMED
```

`authenticated: false` is required for either confirmed outcome — it is the BFF's
own statement that it took the local sign-out path. A body carrying
`revokedEverywhere: false` without it is some other response, not evidence.

```
GLOBAL_CONFIRMED      → /login
LOCAL_ONLY_CONFIRMED  → /login?logout=local-only
UNCONFIRMED           → /account?logout=unconfirmed
```

The local-only notice therefore requires **confirmed** local cookie clearing:

> You were signed out of this browser, but we could not confirm that your other
> sessions were ended.

The unknown case is not guessed at. It returns to Account, where the protected
layout resolves the session on the server: if the cookies really were cleared it
redirects to login by itself; if they were not, Account renders and says so.

> Sign out was not confirmed — We could not confirm whether sign out completed.
> You are still signed in here, and your other sessions may still be active.

No retry control in any of the three cases. Re-issuing an unsafe mutation after
an ambiguous failure is how one revokes a session somebody has since signed back
into — and no destination claims all sessions were revoked.

### Password

**No authenticated change-password endpoint exists**, so there is no form —
offering one would be a control that cannot save. The Password section links to
the real `/forgot-password` flow.

---

## 3. Self project history

Left in Projects (*Mine* scope), which already renders `/me/projects` truthfully:
current and past separated, keyed by `allocationId`, one request, and no invented
deallocation reason — `/me/projects` does not carry one, and nothing fetches
`/team` to manufacture it.

### The episode invariant, and a gap that was found

**One item = one allocation episode. The same project may appear more than once.**

V2-04 already had a test for this — but it placed the two episodes in *different*
groups (one current, one past). A dedupe-by-`projectId` applied per group would
leave one in each and pass it untouched. Verified by mutating the component: the
suite stayed green.

A second test now puts **two episodes of one project inside the same group**, and
the identical mutation fails it. Somebody who left and rejoined a project twice
in one year has two past episodes, and collapsing them would delete half a career
from the record while every other assertion stayed green.

---

## 4. Department portfolio

Left in Projects (*Department* scope). The existing wording is already the
truthful active-member scope §49 asks for:

> Active allocations staffed through the department you manage.

with each project's members under *"Staffed through {department}"* — not "the
team", and not a complete historical portfolio. One request, no per-project
enrichment, no analytics.

`DEPARTMENT_MANAGER` role without an appointment remains a setup state, not an
empty list and not an outage.

---

## 5. System-state taxonomy

The two global boundaries that did not exist were added, and deliberately kept
narrow:

- **`app/not-found.tsx`** — unknown URLs only. It is *not* wired to domain 404s:
  several domains collapse "missing" and "not visible to you" into one sentence
  on purpose, and routing those through a page that says "not found" would turn
  a refusal into proof of absence.
- **`app/error.tsx`** — one sentence, no stack, no backend path, no envelope. The
  digest is logged for people who can act on it. `reset()` re-renders a segment,
  which is a read; nothing here retries a mutation.

  **Correction after review.** It previously said *"Nothing you were doing has
  been changed."* A server action can commit and the render that follows can
  still throw, so a boundary this far out has no evidence for that — it was
  reassurance the page could not back up. The copy is now neutral, and a test
  forbids the claim returning.

The domain states each slice built stay where they are:

```
true empty            successful read, zero records
filtered empty        a filter is active — offer Clear filters
setup required        role held, record relationship missing (DM without appointment)
permission limited    capability terms, no object detail
anti-leak unavailable "does not exist or is not visible to you"
service error         short, safe, retryable only where the read is safe
stale / conflict      409 already-reviewed vs 409 capacity — different facts
```

---

## 6. Request ID audit (§65)

**Not implemented; documented as a gap.** The BFF calls `fetch` with a fixed
header set (`Accept`, `Content-Type`, `Authorization`, `User-Agent`) and does not
propagate an inbound `X-Request-ID`; the sanitized error envelope carries only a
message. Threading a correlation id would mean changing the shared transport,
every BFF route and the error normalizer — a cross-cutting observability change
with no V2-08 surface depending on it. Recorded for V2-09 or later rather than
bolted on here.

---

## 7. Request budgets

| Surface | Calls |
|---|---|
| `/account` | **2** — `GET /auth/me` (once, memoized across layout and page) + `GET /auth/sessions` |
| Revoke a session | 1 `DELETE` + one authoritative `revalidatePath` |
| Sign out everywhere | 1 fixed `POST` |
| Self history (`/projects?view=mine`) | **1** — `GET /me/projects` |
| Department portfolio | **1** — `GET /department/projects?status=` |

No per-session, per-project or per-person reads anywhere.

---

## 8. Automated security coverage

Added after review, because the new transport and action were only exercised
indirectly through a component render:

| File | Pins |
|---|---|
| `logoutAllRoute.test.ts` (10) | cross-origin 403 before any revocation · POST-only, no GET handler · `revokedEverywhere` true/false reported honestly · cookies cleared in **both** outcomes and with no token at all · response contains only the two documented fields and no secret · exactly one backend call, no retry |
| `sessionActions.test.ts` (13) | unauthenticated refused before any call · four malformed-id shapes never reach a path · valid id hits exactly `/auth/sessions/{uuid}` · success revalidates `/account` · 404 = already ended, still revalidates · 401 distinct from failure · safe message with no status/path/envelope · one attempt, never retried · nothing revalidated when nothing was attempted · no token in any outcome |
| `SignOutEverywhere.test.tsx` (11) | confirmation names the consequence · Cancel mutates nothing · confirmed global → `/login` · confirmed local-only → `/login?logout=local-only` · network rejection, non-ok, unreadable body and a body missing `authenticated:false` all → `/account?logout=unconfirmed` and **never** the local-only notice · exactly one mutation, no retry |
| `logoutOutcome.test.ts` (13) | the three-way classification · seven distinct unconfirmed shapes · each destination · an unconfirmed outcome never routes through the local-only notice |
| `AccountPage.test.tsx` (+4) | the unconfirmed warning states a fact · never claims local sign-out succeeded · offers no automatic retry · absent on an ordinary visit |
| `systemStates.test.tsx` (5) | the error page makes no "nothing was changed" claim · leaks no message, digest, stack or backend origin · not-found never borrows anti-leak vocabulary |
| `sessionMemoization.test.ts` (5) | identity is identical for every caller in a request · nothing survives into another request · expiry still ends the session · still a pure read |

**Mutation-tested.** Restoring the "nothing changed" sentence fails
`systemStates`; making the failure path stay on Account fails four
`SignOutEverywhere` tests; collapsing `UNCONFIRMED` back into
`/login?logout=local-only` fails six across two files; treating a rejected
`fetch` as a confirmed local sign-out fails one.

Note on `sessionMemoization.test.ts`: React's `cache()` is inert outside a
request context, so vitest cannot demonstrate the deduplication — that is proven
by the live measurement above. The file pins the safety properties instead, run
with the memo inert, which is the worst case.

---

## 9. Security

- Session mutations are `POST`/`DELETE` on fixed same-origin BFF paths. Verified
  live: a foreign `Origin` gets **403**, a `GET` gets **405**.
- `sessionId` is UUID-validated before it can reach a path.
- Ownership stays backend-authoritative: `revokeOwnedSession` looks up by id
  **and** user, so another user's session is simply not found. The frontend adds
  no second opinion.
- No optimistic removal — rows disappear because a fresh read no longer returns
  them.
- A 404 on revoke is treated as *already ended* and refreshes the list, rather
  than reported as a permanent failure.
- Verified live: **no** `accessToken`, `refreshToken`, `Bearer ` or
  `Authorization` string anywhere in the rendered Account DOM.

---

## 10. Live verification

Local backend only (`localhost:8080/api`). Production never targeted.

```
two sessions listed, exactly one marked current
revoke the other      -> 204; that session then 401; current still 200
same-origin guard     -> foreign Origin 403, GET 405

logout-all SUCCESS
  revokedEverywhere   -> true
  other device after  -> 401
  auth cookies left   -> 0
  GET /account        -> 307

logout-all CONFIRMED LOCAL-ONLY (forced: the session's own token revoked first,
                                 so the BFF still runs and still answers)
  authenticated       -> false
  revokedEverywhere   -> false
  auth cookies left   -> 0
  -> /login?logout=local-only

TRANSPORT UNKNOWN (no usable response; the BFF may not have run)
  old behaviour would have gone to /login?logout=local-only, which with valid
  cookies answers 307 -> /home — telling somebody they were signed out and then
  returning them to the product

  new behaviour -> /account?logout=unconfirmed
    with a valid session:  Account renders the "could not confirm" warning,
                           says "still signed in here", and never claims a
                           local sign-out
    with no session:       307, the protected layout redirects to login
```

The failure was forced safely: sign in, revoke that same session at the backend
so its access token is already dead, then call `logout-all`. No app code was
edited to fake an outage.

### Account request counts, measured

```
before cache()   2 × GET /auth/me   + 1 × GET /auth/sessions
after  cache()   1 × GET /auth/me   + 1 × GET /auth/sessions
```

Taken by temporarily instrumenting the two transports, rendering `/account` once
against a warm route, and reverting the instrument. Not inferred.

---

## 11. Responsive and accessibility

Three surfaces × seven widths, **21/21 clean**, with a deliberately long user
agent in the fixture:

```
               320  375  390  768  1024  1280  1440
account         ok   ok   ok   ok    ok    ok    ok
projects_mine   ok   ok   ok   ok    ok    ok    ok
notfound        ok   ok   ok   ok    ok    ok    ok
```

The session table is `display: table` at 1440 and labelled records at 375, with
`data-label` prefixes intact. The long user agent wraps inside its column and
never sets the page width.

One `h1`; logical headings (`Account → Identity → Sessions → This session /
Other sessions → Password → Session controls`); native `th[scope=col]` and seven
`th[scope=row]`; **zero** `div`/`tr` click targets; the dialog is a labelled
native `<dialog>`; "Current session" is text, not styling alone.

### Stated limitations

- **The browser snapshots do not hydrate.** They are server-rendered HTML with
  CSS applied, served from a second origin, so React never attaches. They prove
  layout, reflow, DOM structure and CSS — **not** hydration, click behaviour or
  client state. Interaction is covered by `userEvent` tests, including the mobile
  account drawer, which is React-state driven and therefore cannot be opened in a
  non-hydrated snapshot.
- **Keyboard default actions were not exercised** — the harness delivers key
  events to JS listeners but performs no browser defaults. Verified instead that
  every control is a native element the browser supplies those defaults for.
- **Real 200% browser zoom was not exercised; narrow-width reflow was tested
  instead.**

---

## 12. Secret safety

**Secret values were never printed to stdout.** Not redacted — never emitted.
Tokens were parsed into `chmod 600` files by python and passed to curl by
reference; no `echo`, `cat`, `grep` or `sed` ever handled one. Cookie jars were
written with `-c` and used with `-b`, never read back; only cookie *counts* were
reported. Every request reported `%{http_code}` with the body to `/dev/null`, or
had it parsed by python printing only named non-secret fields.

---

## 13. Deliberately not changed

- The backend — no contract defect found; frontend-only slice
- Primary navigation (`NAVIGATION_DEFINITIONS` untouched) and the bottom-bar
  control budget
- Team Finder, Staffing, People, Skills, Organization
- Projects styling — the *Mine* and *Department* scopes were audited and kept
- `SignOutButton`, which already does the right thing
- No new dependency: no UA parser, no geolocation, no modal package

---

## 14. Production isolation

`main` was not modified. PR base is `v2`. `origin/main` remained
`3298c1cf079683033157500829a929caba08bd57` throughout.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable. Neither `v2` nor `main` has branch protection, and no
repository settings were changed.

---

## 15. Next slice

```
V2-09 — Full integration, responsive, accessibility & polish
```
