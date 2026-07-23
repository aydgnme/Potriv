# Backend Control Console

A browser-based developer/demo console (`apps/frontend`, Next.js + TypeScript)
for manually verifying the Potriv backend: health, auth and token handling,
arbitrary API calls, and the core project workflows. It always calls the real
backend HTTP API — nothing is mocked. This is not the product UI.

## Run the backend

```bash
docker compose up -d          # local PostgreSQL + Mailpit (repo root)
cd apps/backend
./mvnw spring-boot:run        # dev profile is the default
```

The API serves at `http://localhost:8080/api`; health at
`/api/actuator/health` (the health indicator includes SMTP, so Mailpit must be
running for `UP`).

## Run the console

```bash
cd apps/frontend
cp .env.example .env.local    # sets NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev                   # http://localhost:3000
```

`NEXT_PUBLIC_API_BASE_URL` defaults to `http://localhost:8080/api` when unset.
The backend dev CORS config allows both `http://localhost:5173` and
`http://localhost:3000`.

Scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`
(`next lint`, deprecated by Next.js in v16 — migrate to the ESLint CLI when
upgrading).

## Using the console

- **Home** (`/`): backend health card (status, raw body, last checked,
  refresh) and the token panel.
- **Console** (`/console`): token panel, auth panel, endpoint presets, the
  generic API console, and the response viewer.
- **Tokens**: paste an access token manually or let the auth panel store it
  automatically after a successful login/refresh. Tokens live in
  localStorage (dev convenience only), are always masked in the UI, and are
  sent as `Authorization: Bearer …` when the auth toggle is on.
- **Auth panel**: register organization admin, login, refresh, logout — real
  `/auth/*` endpoints with editable JSON bodies. The refresh token stays in
  the JSON response (current backend flow); it is never persisted by the
  console.
- **Presets**: real backend endpoints only, grouped by domain, with method,
  path, example body, expected role, and auth requirement. Selecting a preset
  only fills the console; replace `{placeholders}` and send manually.
- **Response viewer**: status code, success/failure badge, headers summary,
  pretty JSON (raw fallback), copy-response, and copy-curl. The curl command
  masks the token unless "include real token in curl" is checked.
- Full URLs in the path field are rejected; paths always resolve against
  `NEXT_PUBLIC_API_BASE_URL`.

## Suggested manual smoke flow

1. Start backend (dev profile) and frontend.
2. Check the health card shows `UP`.
3. Register an org admin (or login an existing user) from the auth panel.
4. Confirm the access token was saved (masked) in the token panel.
5. Call a protected endpoint, e.g. preset "My project history"
   (`GET /me/projects`) → 200.
6. Use the project presets to create a team role, project, proposal, etc.
7. Clear the token and resend → 401 through the real security chain.
8. Expand the curl preview and copy the command for terminal reproduction.
