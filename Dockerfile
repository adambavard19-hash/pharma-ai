# syntax=docker/dockerfile:1.7
#
# Pharma.ai en production.
#
# Image de base : celle de Playwright, qui embarque Chromium et ses
# dépendances système — le générateur de PDF du plan patient en a besoin.
# La version doit rester alignée sur celle du paquet `playwright` du projet.

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

# ---- Dépendances ---------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --include=dev

# ---- Construction --------------------------------------------------------
FROM deps AS build
COPY . .
# Les variables ne servent qu'à la validation du schéma d'environnement au
# moment du build : aucune valeur réelle n'entre dans l'image.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SESSION_SECRET="build-only-value-never-used-at-runtime-0000" \
    DATA_ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" \
    npm run build

# ---- Image finale --------------------------------------------------------
FROM base AS runtime
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./
COPY deploy/entrypoint.sh /app/deploy/entrypoint.sh
RUN chmod +x /app/deploy/entrypoint.sh && mkdir -p /app/storage && chown -R pwuser:pwuser /app
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
CMD ["npm", "run", "start"]
