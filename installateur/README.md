# Installateur Windows d'un poste de comptoir

Le titulaire reçoit un lien, télécharge **un fichier**, le double-clique : le poste est
installé et relié. Aucun terminal, aucun mot de passe administrateur.

```
https://pharmaboost.app/installer/<jeton>            la page du lien (public, daté, un seul poste)
        └─ /api/agent/installateur/<jeton>           le fichier : PharmaBoost-Installation-<jeton>.exe
```

Le jeton voyage dans le **nom du fichier** : les octets sont les mêmes pour toutes les officines, donc
signables une fois pour toutes. L'installateur lit son propre nom (`$EXEFILE`), l'agent le décode
(`agent/src/installer.ts`, tolère « (1) » et « - Copie »). Fichier renommé : l'installateur demande le
code à six chiffres ou le lien.

## Ce qu'il y a dedans

| Dossier / fichier | Rôle |
| --- | --- |
| `installer.nsi` | L'assistant (NSIS 3, UTF-8 **avec BOM**, sans droits d'administrateur). |
| `Tray/` | `PharmaBoost.exe` : l'icône près de l'horloge (.NET Framework 4.8). Supervise l'agent, le met à jour, montre l'état. |
| `Setup/` | `PharmaBoostPreparation.exe` : télécharge Node.js (version épinglée, SHA-256 vérifié), n'en extrait que `node.exe`, vérifie qu'il démarre. |
| `installateur.json` | La version de l'installateur et **la version + l'empreinte de Node** épinglées. |
| `assets/` | L'icône (générée depuis `src/app/icon.png`). |
| `tests/serveur-factice.mjs` | Un faux PharmaBoost pour essayer sans donnée réelle. |

Le binaire livré est `agent/installateur/PharmaBoost-Installation.exe` (≈ 320 Ko, **committé** : la
fonction qui le sert le lit sur disque) avec sa fiche `installateur.json` (empreinte, taille, version).
Le moteur Node.js n'est pas embarqué (37 Mo > limite de réponse d'une fonction) : il est téléchargé à
l'installation, depuis nodejs.org.

## Reconstruire

```
brew install makensis dotnet        # une fois (macOS ; Linux : apt install nsis + SDK .NET)
npm run installateur:construire
```

Se construit sans Windows. Le script recompile l'agent, l'icône et l'outil de préparation, assemble
l'installateur et réécrit la fiche. Les tests (`npx vitest run agent/src`) vérifient que la fiche dit
vrai et que les trois langages (NSIS, C#, TypeScript) s'accordent sur le nom du fichier, les codes de
sortie, le fichier d'état et l'empreinte de mise à jour.

**Changer de version de Node.** Prendre la version dans https://nodejs.org/dist/index.json, copier la
ligne `node-vX.Y.Z-win-x64.zip` de `https://nodejs.org/dist/vX.Y.Z/SHASUMS256.txt` dans
`installateur.json`, reconstruire. Un poste déjà installé garde son Node tant qu'on ne le réinstalle pas.

**Changer l'agent seul** (`agent/src`) : `npm run agent:build`, déployer. Les postes installés avec
l'installateur se mettent à jour d'eux-mêmes (`/api/agent/version`, vérification toutes les 6 h). Pas
besoin de reconstruire l'installateur.

## Signer (à faire avant de l'envoyer à une officine)

Sans signature, Windows affiche « Windows a protégé votre ordinateur » (SmartScreen). Le titulaire peut
passer outre (la page du lien l'explique), mais ce n'est pas la première impression voulue.

- Un certificat de **signature de code** (OV ou EV, environ 200 à 400 € par an) ou Azure Trusted Signing
  (environ 10 $ par mois). L'EV supprime l'avertissement d'emblée ; l'OV le supprime après quelques
  centaines de téléchargements.
- Avec un PFX : `brew install osslsigncode`, puis

  ```
  INSTALLATEUR_PFX=/chemin/certificat.pfx INSTALLATEUR_PFX_MOT_DE_PASSE=… npm run installateur:construire
  ```

  Le mot de passe n'est lu que dans l'environnement. Signer `PharmaBoost.exe` (l'icône) en plus de
  l'installateur réduit encore les alertes de l'antivirus : à ajouter quand le certificat existe.

## Essayer sur un vrai Windows

Rien de ceci n'a pu être lancé depuis un Mac : voir le workflow manuel `.github/workflows/installateur-windows.yml`
(Actions → « Installateur Windows (essai) » → Run workflow). Il installe en silence contre le faux serveur,
vérifie les fichiers, l'icône, le fichier d'état, la réinstallation et la désinstallation.

À la main sur un poste de test :

```
PharmaBoost-Installation-<jeton>.exe /S /SERVEUR=http://serveur-d-essai:8787
```

Options : `/S` silencieux (codes de sortie : 0 ok, 2 pas de code, 3 lien refusé, 4 PharmaBoost injoignable,
5 Windows trop ancien, 6 autre, 10 à 14 la préparation de Node), `/CODE=<code ou lien>`, `/SERVEUR=<url>`.

Fichiers sur le poste, dans `%LOCALAPPDATA%\PharmaBoost\Poste` : `pharmaboost-connect.log` (agent),
`pharmaboost-icone.log` (icône), `pharmaboost-statut.json` (état lu par l'icône), `pharmaboost-connect.json`
(configuration, contient la clé du poste : ne pas la copier).

## Ce qui n'est pas dedans

- **Le serveur de l'officine** (dossier d'export du stock, partage réseau, tâche système) reste installé
  par la ligne de commande (`/api/agent/installer-serveur/<code>`), sous AnyDesk : il demande des droits
  d'administrateur, donc une élévation (UAC) à gérer dans l'installateur.
- ARM64 : Windows l'émule, rien de particulier ; Windows 7 / 8 : refusé (Node 24 demande Windows 10).
