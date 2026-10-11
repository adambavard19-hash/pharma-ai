#!/bin/zsh
# PharmaBoost Mobile → App Store Connect, en une commande.
#
#   ./app-store.sh --configurer   une seule fois : enregistre l'identifiant d'équipe Apple et la clé d'API
#   ./app-store.sh                construit l'application iPhone, la signe et l'envoie sur App Store Connect
#
# L'envoi dépose une version dans App Store Connect (visible dans TestFlight) : rien n'est public. La soumission à la
# vérification d'Apple reste un clic du fondateur, dans App Store Connect.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="$HOME/.pharmaboost-apple.env"
KEYS="$HOME/.appstoreconnect/private_keys"

if [[ "${1:-}" == "--configurer" ]]; then
  echo "Configuration Apple (une seule fois). Rien de ceci n'est envoyé ailleurs qu'à Apple."
  read "TEAM?Identifiant d'équipe (Team ID, 10 caractères, developer.apple.com › Membership) : "
  read "KEY?Identifiant de la clé (Key ID, 10 caractères) : "
  read "ISSUER?Identifiant de l'émetteur (Issuer ID, avec des tirets) : "
  read "P8?Chemin du fichier AuthKey_….p8 téléchargé (glissez-le ici) : "
  P8="${P8//\'/}"; P8="${P8%% }"
  [[ -f "$P8" ]] || { echo "Fichier introuvable : $P8"; exit 1; }
  mkdir -p "$KEYS" && cp "$P8" "$KEYS/AuthKey_${KEY}.p8" && chmod 600 "$KEYS/AuthKey_${KEY}.p8"
  umask 077
  printf 'APPLE_TEAM_ID=%s\nASC_KEY_ID=%s\nASC_ISSUER_ID=%s\nASC_KEY_PATH=%s\n' "$TEAM" "$KEY" "$ISSUER" "$KEYS/AuthKey_${KEY}.p8" > "$CONFIG"
  echo "✓ Enregistré. Lancez maintenant : ./app-store.sh"
  exit 0
fi

[[ -f "$CONFIG" ]] || { echo "Lancez d'abord : ./app-store.sh --configurer"; exit 1; }
source "$CONFIG"

BUILD_DIR="$PWD/build"
ARCHIVE="$BUILD_DIR/PharmaBoost.xcarchive"
BUILD_NUMBER="$(date +%Y%m%d%H%M)"
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")

rm -rf "$BUILD_DIR" && mkdir -p "$BUILD_DIR"
echo "1/3  Préparation…"
npx cap sync ios >/dev/null

echo "2/3  Construction et signature (version n° $BUILD_NUMBER)…"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  -packageAuthorizationProvider netrc "${AUTH[@]}" archive > "$BUILD_DIR/construction.log" 2>&1 \
  || { echo "✗ Construction impossible. Détail : $BUILD_DIR/construction.log"; grep -E "error:" "$BUILD_DIR/construction.log" | head -5; exit 1; }

cat > "$BUILD_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

echo "3/3  Envoi à App Store Connect…"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
  -exportPath "$BUILD_DIR/export" "${AUTH[@]}" > "$BUILD_DIR/envoi.log" 2>&1 \
  || { echo "✗ Envoi refusé. Détail : $BUILD_DIR/envoi.log"; grep -iE "error" "$BUILD_DIR/envoi.log" | head -5; exit 1; }

echo "✓ Envoyée. Dans 10 à 30 minutes, elle apparaît dans App Store Connect › PharmaBoost › TestFlight."
