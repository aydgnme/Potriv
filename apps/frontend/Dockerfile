# Potriv frontend production image.
#
# Next.js builds a standalone server bundle so the runtime image contains only
# the files needed to serve the application. No environment file or secret is
# copied into the image; server-only configuration is injected at runtime.

FROM node:22.23.2-alpine3.24 AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.23.2-alpine3.24 AS build
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run build \
    && if [ -d public ]; then cp -R public .next/standalone/public; fi \
    && mkdir -p .next/standalone/.next \
    && cp -R .next/static .next/standalone/.next/static

FROM node:22.23.2-alpine3.24 AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/lib/node_modules/corepack \
        /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
