#!/usr/bin/env bash
# Migration de la base PharmaBoost vers l'hébergeur HDS.
#
#   scripts/hds/migrer-base.sh --source "$SOURCE_URL" --cible "$CIBLE_URL" [--dossier ./sauvegardes] [--forcer]
#
# Ce que fait le script, dans l'ordre :
#   1. Exporte la base source avec pg_dump (format custom, compressé). La
#      source n'est JAMAIS modifiée : lecture seule.
#   2. Refuse de restaurer dans une base cible qui contient déjà des tables,
#      sauf --forcer (et même alors, ne supprime rien : la restauration
#      s'ajoute, ce qui échouerait sur des tables existantes — on le dit).
#   3. Restaure dans la cible avec pg_restore, sans propriétaires ni droits
#      (ceux de l'hébergeur de destination s'appliquent).
#   4. Compare, table par table, le nombre de lignes entre source et cible,
#      et s'arrête en erreur à la moindre différence.
#
# Prérequis : pg_dump et pg_restore de version >= celle du serveur source
# (Neon est en PostgreSQL 18 : il faut les outils 18, par exemple
# /opt/homebrew/opt/postgresql@18/bin sur macOS). Le script le vérifie.
#
# Les URL ne sont jamais affichées ; elles ne passent que par l'environnement.
set -euo pipefail

SOURCE=""; CIBLE=""; DOSSIER="./sauvegardes"; FORCER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2;;
    --cible) CIBLE="$2"; shift 2;;
    --dossier) DOSSIER="$2"; shift 2;;
    --forcer) FORCER=1; shift;;
    *) echo "Option inconnue : $1" >&2; exit 2;;
  esac
done
[ -n "$SOURCE" ] && [ -n "$CIBLE" ] || { echo "Usage : $0 --source URL --cible URL [--dossier D] [--forcer]" >&2; exit 2; }

PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ] && [ -x /opt/homebrew/opt/postgresql@18/bin/pg_dump ]; then PG_BIN=/opt/homebrew/opt/postgresql@18/bin; fi
PG_DUMP="${PG_BIN:+$PG_BIN/}pg_dump"; PG_RESTORE="${PG_BIN:+$PG_BIN/}pg_restore"; PSQL="${PG_BIN:+$PG_BIN/}psql"

strip() { echo "${1%%\?*}"; }   # Prisma ajoute ?schema=public : psql n'en veut pas.
SRC="$(strip "$SOURCE")"; DST="$(strip "$CIBLE")"

serveur_version() { "$PSQL" "$1" -Atc "show server_version_num" 2>/dev/null | cut -c1-2; }
outil_version() { "$PG_DUMP" --version | grep -oE '[0-9]+' | head -1; }
SV="$(serveur_version "$SRC")"; TV="$(outil_version)"
[ -n "$SV" ] || { echo "✗ Base source injoignable." >&2; exit 1; }
if [ "$TV" -lt "$SV" ]; then
  echo "✗ pg_dump $TV ne peut pas exporter un serveur PostgreSQL $SV. Installez les outils $SV (PG_BIN=/chemin/vers/bin)." >&2; exit 1
fi
DV="$(serveur_version "$DST")"
[ -n "$DV" ] || { echo "✗ Base cible injoignable." >&2; exit 1; }
echo "→ Source : PostgreSQL $SV · Cible : PostgreSQL $DV · outils : $TV"

TABLES_CIBLE="$("$PSQL" "$DST" -Atc "select count(*) from pg_tables where schemaname='public'")"
if [ "$TABLES_CIBLE" != "0" ] && [ "$FORCER" != "1" ]; then
  echo "✗ La base cible contient déjà $TABLES_CIBLE table(s). Choisissez une base vide, ou --forcer en sachant que la restauration s'arrêtera sur les objets existants." >&2; exit 1
fi

mkdir -p "$DOSSIER"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$DOSSIER/pharmaboost-$STAMP.dump"
echo "→ Export de la source vers $DUMP (lecture seule)"
"$PG_DUMP" --format=custom --no-owner --no-privileges --compress=6 --file="$DUMP" "$SRC"
echo "   $(du -h "$DUMP" | cut -f1) exportés"

echo "→ Restauration dans la cible"
"$PG_RESTORE" --no-owner --no-privileges --exit-on-error --dbname="$DST" "$DUMP"

echo "→ Vérification table par table"
ECARTS=0
for T in $("$PSQL" "$SRC" -Atc "select tablename from pg_tables where schemaname='public' order by 1"); do
  A="$("$PSQL" "$SRC" -Atc "select count(*) from \"$T\"")"
  B="$("$PSQL" "$DST" -Atc "select count(*) from \"$T\"")"
  if [ "$A" != "$B" ]; then echo "   ✗ $T : $A dans la source, $B dans la cible"; ECARTS=$((ECARTS+1)); fi
done
if [ "$ECARTS" != "0" ]; then echo "✗ $ECARTS table(s) diffèrent : NE PAS basculer." >&2; exit 1; fi
N="$("$PSQL" "$SRC" -Atc "select count(*) from pg_tables where schemaname='public'")"
echo "✓ $N tables identiques, ligne pour ligne. L'export reste dans $DUMP."
