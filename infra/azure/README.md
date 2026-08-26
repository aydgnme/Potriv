# Low-cost staging deployment

Potriv deliberately uses three managed services instead of running a Kubernetes
cluster:

- **Vercel** serves the Next.js frontend and its same-origin BFF routes;
- **Azure Container Apps Consumption** runs only the Spring Boot backend and can
  scale to zero;
- **Neon Postgres** stores application data and scales inactive compute to zero.

Azure also contains a Basic Container Registry, a managed identity, a small
Container Apps VNet/subnet, and Log Analytics. There is no Azure PostgreSQL,
frontend Container App, VM, node pool, NAT gateway, or Kubernetes cluster.

The backend has public TLS ingress because Vercel must reach it over the
internet. The browser still uses the Vercel origin: production frontend code
calls same-origin BFF routes, and only those server-side routes know
`POTRIV_BACKEND_BASE_URL`. Public ingress is not treated as authentication.
Backend authorization, rate limits, exact CORS origins, and TLS remain required.

## Cost boundary

The Azure deploy is manual and requires the literal `deploy-staging` input.
The backend has `minReplicas: 0`, so the first request after inactivity accepts
a cold start instead of paying for an idle replica. Neon also suspends inactive
compute. The Basic ACR is the only intentional fixed-cost application resource;
it is retained so Container Apps can pull with managed identity instead of a
long-lived registry password.

Costs can still come from ACR storage, Log Analytics ingestion, Container Apps
requests/compute, bandwidth, and paid Vercel or Neon usage. Confirm current plan
terms and account limits before deployment. Free tiers are useful for staging,
but they are not a production availability promise.

## 1. Create the Vercel frontend project

1. Import `aydgnme/Potriv` in Vercel.
2. Set **Root Directory** to `apps/frontend` and keep the detected Next.js
   framework settings.
3. Use `v2` as the production branch while this environment is staging.
4. Deploy once to reserve a stable production URL such as
   `https://potriv.vercel.app`. The first deployment can complete before the
   backend variable exists, but authentication calls will not work yet.
5. Do not configure `NEXT_PUBLIC_API_BASE_URL` in Vercel production. The backend
   address must remain server-only.

After Azure is deployed, add this Vercel environment variable for Production
and Preview and redeploy:

| Variable | Value |
| --- | --- |
| `POTRIV_BACKEND_BASE_URL` | `https://<azure-backend-fqdn>/api` |

Vercel deploys from the repository. `apps/frontend/Dockerfile` remains a tested,
non-root portability artifact for local smoke tests and recovery; Vercel does
not deploy that image.

## 2. Create the Neon database

Create a Neon project in a European region near the Azure Container Apps region.
Use the **direct** endpoint for this deployment because Flyway executes schema
migrations during Spring Boot startup. Keep credentials out of the JDBC URL:

```text
NEON_DATABASE_URL=jdbc:postgresql://<direct-endpoint>/<database>?sslmode=require
NEON_DATABASE_USERNAME=<role>
NEON_DATABASE_PASSWORD=<password>
```

The workflow rejects a URL that is not `jdbc:postgresql://...` or does not
contain `sslmode=require`. Never place these values in commits, issue comments,
workflow logs, or chat.

## 3. Configure Azure OIDC

1. Select the Azure subscription and create the staging resource group:

   ```bash
   az account set --subscription '<subscription-id>'
   az group create --name potriv-staging --location polandcentral
   ```

2. Create a Microsoft Entra application/service principal with a federated
   credential whose subject is exactly:

   ```text
   repo:aydgnme/Potriv:environment:staging
   ```

3. Grant it `Contributor` and `Role Based Access Control Administrator` only at
   the `potriv-staging` resource-group scope. Contributor deploys resources;
   the RBAC role permits the template to grant the runtime identity `AcrPull`.
   Do not create or store an Azure client secret.

## 4. Configure the GitHub staging environment

Create a protected GitHub environment named `staging` with a required reviewer.
Add these environment variables:

| Variable | Example |
| --- | --- |
| `AZURE_CLIENT_ID` | Entra application/client ID |
| `AZURE_TENANT_ID` | Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | `potriv-staging` |
| `AZURE_LOCATION` | `polandcentral` |
| `VERCEL_FRONTEND_ORIGIN` | `https://potriv.vercel.app` |
| `SMTP_HOST` | authenticated SMTP relay host |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | dedicated application SMTP identity |
| `MAIL_FROM` | verified sender address |
| `SYSTEM_ADMIN_EMAIL` | staging system administrator email |

Add these environment secrets. Generate every application secret independently:

- `NEON_DATABASE_URL`
- `NEON_DATABASE_USERNAME`
- `NEON_DATABASE_PASSWORD`
- `JWT_SECRET` (at least 32 random characters)
- `RATE_LIMIT_HMAC_SECRET` (at least 32 random characters)
- `SMTP_PASSWORD`
- `SYSTEM_ADMIN_PASSWORD` (at least 12 characters)

The workflow rejects Neon URLs containing embedded credentials. Keep the
database role and password only in their dedicated secrets.

GitHub exchanges its short-lived OIDC identity for an Azure token. No Azure
client secret is stored in GitHub.

## 5. Deploy the backend

Open **Actions → Deploy Azure Backend Staging → Run workflow** on `v2` and enter
`deploy-staging`. Before Azure authentication or any resource mutation, the
workflow:

1. validates variables and secret presence without printing values;
2. compiles both Bicep templates;
3. builds the backend image and the frontend portability image;
4. generates CycloneDX SBOMs and blocks HIGH/CRITICAL image findings.

It then authenticates with Azure OIDC, deploys the low-cost foundation, pushes
only the uniquely tagged backend image, deploys the public scale-to-zero backend,
and verifies readiness, the exact Vercel CORS origin, and a safe nonexistent
login response. The final log prints the backend URL needed by Vercel.

## 6. Complete and verify the Vercel deployment

Set `POTRIV_BACKEND_BASE_URL` in Vercel to the workflow's backend URL ending in
`/api`, then redeploy the frontend. Verify:

```bash
curl --fail https://<vercel-production-domain>/
curl --fail https://<azure-backend-fqdn>/api/actuator/health/readiness
```

Then perform a login with a non-existent test identity through the Vercel UI.
The request must reach the BFF and return the application's normal
anti-enumeration response, not a `502`.

## Before production promotion

- Measure the combined Vercel, Container Apps, and Neon cold-start path.
- Confirm Container Apps' observed immediate peer belongs to `10.20.0.0/27`
  and unrelated callers receive separate IP-scoped rate-limit buckets.
- Bind and validate the final Vercel custom domain, then replace
  `VERCEL_FRONTEND_ORIGIN` with that exact origin.
- Prove registration, password reset, and invite delivery against the selected
  SMTP relay without credentials or tokens entering logs.
- Upgrade the Vercel/Neon plans if production traffic, storage, backups, support,
  or availability requirements exceed their current limits.
- Promote only an image digest that passed the staging scan and smoke tests.

## Local production image checks

```bash
docker build -t potriv-backend:local apps/backend
docker build -t potriv-frontend:local apps/frontend
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build
```

Both images run as non-root users and contain no deployment secrets.
