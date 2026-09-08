# Mettre Pharma.ai en ligne sur pharmaboost.app

Le projet se déploie comme un conteneur : l'image embarque Node, l'application
et Chromium (nécessaire au PDF du plan patient). Tout hébergeur qui accepte un
`Dockerfile` convient ; le plus simple et le moins cher est un serveur virtuel
(VPS) avec Docker, où `docker compose` lance l'application, PostgreSQL, la tâche
des suivis et le HTTPS automatique.

## Ce qu'il faut avoir avant de commencer

1. **Un serveur** Linux (Ubuntu 24.04, 2 vCPU, 4 Go de RAM, 40 Go) avec Docker
   installé — Hetzner, OVH, Scaleway… Pour des données de santé de patients
   réels, l'hébergeur doit être certifié **HDS** (Hébergeur de Données de
   Santé) ; en France : OVHcloud HDS, Scaleway HDS, Outscale, etc.
2. **Le DNS de pharmaboost.app** : un enregistrement `A` (et `AAAA` si IPv6)
   pour `pharmaboost.app` et `www` pointant vers l'adresse IP du serveur.
3. **Resend** : domaine `pharmaboost.app` ajouté et vérifié (enregistrements
   DKIM/SPF fournis par Resend, à créer dans le même DNS).
4. **Une clé Anthropic** pour la lecture d'ordonnance et le moteur.

## Installation (une fois)

```bash
# Sur le serveur
git clone https://github.com/adambavard19-hash/pharma-ai.git && cd pharma-ai
cp .env.production.example .env.production
# Renseigner .env.production (POSTGRES_PASSWORD, AUTH_SESSION_SECRET,
# DATA_ENCRYPTION_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY)
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
```

Au démarrage, le conteneur applique les migrations Prisma (`migrate deploy`)
puis démarre. Caddy obtient le certificat HTTPS dès que le DNS pointe vers le
serveur. Vérifier : `https://pharmaboost.app/api/sante` répond `{"ok":true}`.

## Après le premier démarrage

```bash
# Catalogue national des médicaments (fichiers BDPM déposés dans ./bdpm)
docker compose -f deploy/docker-compose.prod.yml exec app npm run bdpm:sync -- --from /app/bdpm --source-date AAAA-MM-JJ
# Compte super-administrateur et première officine : depuis la console /admin
```

## Mettre à jour

```bash
git pull && docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
```

## Sauvegardes

La base vit dans le volume `pgdata`, les ordonnances photographiées dans
`storage`. Sauvegarde quotidienne recommandée :
`docker compose exec db pg_dump -U pharma pharma_ai | gzip > sauvegarde-$(date +%F).sql.gz`
