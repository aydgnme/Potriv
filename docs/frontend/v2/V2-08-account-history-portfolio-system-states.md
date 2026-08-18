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

Identity is **not** re-fetched. The protected layout already resolved the session
to render the shell, so the route passes the user it has. A failed session read
therefore costs the sessions section and nothing else.

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

Local cookies are cleared either way. If the remote half failed, the UI says
"Signed out here only" rather than implying a stolen session was closed.

There is no retry button. Re-issuing an unsafe mutation after an ambiguous
failure is how one revokes a session somebody has since signed back into.

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
| `/account` | **1** — `GET /auth/sessions` (identity reuses the layout's session) |
| Revoke a session | 1 `DELETE` + one authoritative `revalidatePath` |
| Sign out everywhere | 1 fixed `POST` |
| Self history (`/projects?view=mine`) | **1** — `GET /me/projects` |
| Department portfolio | **1** — `GET /department/projects?status=` |

No per-session, per-project or per-person reads anywhere.

---

## 8. Security

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

## 9. Live verification

Local backend only (`localhost:8080/api`). Production never targeted.

```
two sessions listed, exactly one marked current
revoke the other      -> 204; that session then 401; current still 200
same-origin guard     -> foreign Origin 403, GET 405
logout-all (success)  -> 200 { revokedEverywhere: true }
other device after    -> 401
auth cookies left     -> 0
GET /account after    -> 307 (redirected to login)
```

An earlier `logout-all` probe returned `revokedEverywhere: false` — correctly, because
that probe had already cleared the cookies, leaving no token to revoke with. The
success path was then re-run cleanly from a fresh session.

---

## 10. Responsive and accessibility

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

## 11. Secret safety

**Secret values were never printed to stdout.** Not redacted — never emitted.
Tokens were parsed into `chmod 600` files by python and passed to curl by
reference; no `echo`, `cat`, `grep` or `sed` ever handled one. Cookie jars were
written with `-c` and used with `-b`, never read back; only cookie *counts* were
reported. Every request reported `%{http_code}` with the body to `/dev/null`, or
had it parsed by python printing only named non-secret fields.

---

## 12. Deliberately not changed

- The backend — no contract defect found; frontend-only slice
- Primary navigation (`NAVIGATION_DEFINITIONS` untouched) and the bottom-bar
  control budget
- Team Finder, Staffing, People, Skills, Organization
- Projects styling — the *Mine* and *Department* scopes were audited and kept
- `SignOutButton`, which already does the right thing
- No new dependency: no UA parser, no geolocation, no modal package

---

## 13. Production isolation

`main` was not modified. PR base is `v2`. `origin/main` remained
`3298c1cf079683033157500829a929caba08bd57` throughout.

No Git merge/update was made to `main`; external deployment behavior was not
independently observable. Neither `v2` nor `main` has branch protection, and no
repository settings were changed.

---

## 14. Next slice

```
V2-09 — Full integration, responsive, accessibility & polish
```
