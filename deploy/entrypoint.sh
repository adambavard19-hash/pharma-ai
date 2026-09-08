#!/bin/sh
# Applique les migrations en attente, puis démarre. Jamais de `migrate reset`,
# jamais de `db push` : uniquement les migrations versionnées du dépôt.
set -e
echo "→ Migrations Prisma"
npx prisma migrate deploy
exec "$@"
