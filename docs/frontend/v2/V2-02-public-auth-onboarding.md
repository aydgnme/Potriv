# V2-02 — Public auth and onboarding

The second V2 slice: every public authentication entry point moved onto one
Potriv V2 shell, the missing `/invite` destination built, and the stale
`app.frontend-url` that made invite links point nowhere corrected.

Baseline: `e7571940c9e019d18f6d81743cb2b5d64fcad282` on `main` — 1214 frontend
tests / 72 files, 839 backend tests, all gates green.
Branch: `feat/potriv-v2-public-auth-onboarding`.

Authenticated product screens are untouched. Those begin at V2-03.

---

## 1. Route inventory, read from the code

| Route | Existed | Access | V2-02 outcome |
| --- | --- | --- | --- |
| `/` | yes | public | untouched (V2-01 landing) |
| `/login` | yes | public | moved onto the V2 shell |
| `/create-workspace` | yes | public | moved onto the V2 shell |
| `/forgot-password` | yes | public | moved onto the V2 shell |
| `/reset-password` | yes | public | moved onto the V2 shell |
| `/invite` | **no** | public | **built** |
| `/organization/invite` | yes | protected | untouched (admin-side generation) |

BFF handlers before: login, logout, refresh, session, password-reset request and
confirm, register-workspace. Added: `register-invite`.

The proxy matcher guards six product domains and matched none of these routes
before or after, so no public route became protected and none of the protected
ones became public.

## 2. Auth contract matrix

| Operation | Method / path | Body | Returns | Notes |
| --- | --- | --- | --- | --- |
| sign in | `POST /auth/login` | email, password | token pair | cookies set by the BFF |
| create workspace | `POST /auth/register-admin` | name, email, password, organizationName, headquarterAddress | `userId`, `organizationId`, `employeeInviteUrl` | **no tokens** |
| join by invite | `POST /auth/register-employee/{token}` | name, email, password | `userId`, `organizationId` | **no tokens**; token in the path |
| forgot password | `POST /auth/password-reset/request` | email | 202 always | anti-enumeration |
| reset password | `POST /auth/password-reset/confirm` | token, newPassword | 204 | |
| session | `GET /auth/me` | — | current user | |

Validation mirrored from the backend records: name ≤120, email valid ≤180,
password 8–72, organizationName ≤160, headquarterAddress ≤1000.

Two contract facts shaped this slice:

- **Neither registration endpoint returns a token pair.** So neither screen can
  sign anybody in, and both end by sending the person to `/login`. That is not a
  UX preference; it is the only truthful outcome.
- **There is no endpoint that inspects an invite.** Nothing reports whether a
  token is usable, or which organization it belongs to, without registering. The
  invite page therefore cannot pre-validate and must not name an organization.

## 3. The public auth shell

`PublicAuthShell` is one server component behind all five routes: a desktop
context panel with a small technical topology, and a form column. It holds no
state, so the pages keep their own client boundaries and the shell never ships
to the browser.

Below 900px the context panel is removed entirely and its sentence rides above
the form instead. At 390px a topology drawing competes with the task, and the
form wins.

`AuthTopology` draws four small compositions — sign in, create workspace, invite,
recover — each showing the part of Potriv's topology the form is about to act
on. All four are decorative and `aria-hidden`; the heading beside them already
says what the page does.

`PersonMark` moved from `modules/marketing` to `shared/ui`, because marketing and
auth both draw people and modules may not import each other.

## 4. Invite

```
/invite?token=…              page
/api/auth/register-invite    BFF boundary, same-origin guarded
POST /auth/register-employee/{token}
```

**The token never crosses the server/client boundary.** Only a boolean saying
whether one is present is passed to the client component; the form reads the
real value from `window.location` at the moment it submits. It is never in React
state, never rendered, never stored, and never echoed in an error.

That design came out of live verification, not review: passing the token as a
prop put it in the RSC payload embedded in the served HTML. The fix removed
exactly that copy — measured at 4 occurrences before and 3 after.

**The three that remain are Next's own routing metadata** — the canonical URL,
the query string, and the page segment cache key — which Next embeds for any
dynamic route carrying a query string. They are the same value the URL already
contains, in the same document, and cannot be removed without changing the URL
contract the backend owns. Recorded here rather than claimed as absent.

The route also sends `robots: noindex, nofollow`, because an invite URL is a
capability and there is no reason for one to be indexed.

### Invalid invites

The backend distinguishes a token it has never seen (404) from one that is
inactive or expired (400). Both reach the reader as one sentence — *This invite
is no longer valid* — because telling them apart would confirm whether a guessed
token was ever real. Nothing about the organization, the invited address, or the
token is shown.

A duplicate email is different: it is about the caller's own input and is checked
before the token is even looked at, so it stays a specific, recoverable
validation error and the form remains.

## 5. Frontend URL alignment

| | Before | After |
| --- | --- | --- |
| dev / default | `http://localhost:5173` | `${FRONTEND_URL:http://localhost:3000}` |
| prod | `${FRONTEND_URL:https://potriv.aydgn.me}` | unchanged |

`apps/` contains only `backend` and the Next frontend; nothing in this repository
serves 5173. The property feeds exactly two generated links —
`InviteTokenService:37` and `PasswordResetService:134` — so invite links had no
destination and development reset links were dead.

Env override support was preserved rather than hardcoding the port.

Checked before changing: `allowed-origins` already contained `localhost:3000`,
and the api-e2e suite's 5173 reference is a CORS assertion against a different
property, while its invite-token extraction is host-agnostic. Neither was
affected.

Backend coverage: `GeneratedFrontendLinkTest` pins the invite URL shape without
asserting token contents, and `PasswordResetIntegrationTest` now asserts against
the *configured* base rather than a literal — it previously pinned the broken
5173 value and so defended the bug.

## 6. Founder next step

**Not implemented here, deliberately.** The checklist depends on authenticated
organization state — whether departments, team roles, skills, invited people and
projects exist — and every one of those signals requires a session and reads the
product does not perform on a public page. It belongs to V2-03 Home.

The signals it will need: `has departments?`, `has team roles?`, `has skills?`,
`has invited users?`, `has projects?` — each derived from a real backend read,
with no invented percentage.

## 7. Security

Unchanged and re-verified: HttpOnly cookies, the BFF boundary, refresh rotation
and single-flight, same-origin guards on every state-changing route, the proxy's
cookie routing and its 303 mutation-safe recovery, `safeReturnTo`, the protected
layout's `/auth/me` check, and role composition.

Neither new route touches a cookie. Both registration contracts return no tokens,
so no session code is involved at all.

Verified live after registering through the real invite page: `/api/auth/session`
reported `authenticated: false`, `/home` still redirected away, and no cookie was
readable from JavaScript. Signing in afterwards worked and returned `EMPLOYEE`.

## 8. Verification

End-to-end, against the real backend restarted with the new configuration:

1. admin registered → generated invite URL was `http://localhost:3000/invite?token=…`
2. that URL resolved on the Next route and rendered the join form
3. an employee registered through it
4. no session was created
5. sign-in with the new account succeeded, roles `[EMPLOYEE]`
6. an unknown token returned the neutral invalid state

Responsive: 320, 390, 768, 1024, 1440 — no page-level horizontal overflow, no
element past the viewport edge, one `h1` at every width, context panel present
only above 900px.

Accessibility: labels bound to their controls, `autocomplete` of `name`, `email`
and `new-password`, decorative panel and every SVG `aria-hidden`, one `h1`, no
skipped levels. Submit controls are 40px tall — above the 24×24 minimum WCAG 2.2
AA asks (2.5.8), below the 44×44 of AAA (2.5.5).

## 9. Tests

Frontend **1214 → 1228** across 72 → 73 files. Backend **839**, including three
new link-shape tests.

## 10. Next

**V2-03 — Product Shell & Home**, which owns the founder checklist described in
§6.
