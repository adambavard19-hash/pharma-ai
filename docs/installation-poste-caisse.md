# Installer un poste de caisse (agent 0.5.x)

## Par le titulaire lui-même : un lien, un fichier, un double-clic

Dans PharmaBoost → Stock → Connecter mon logiciel → **Ajouter un poste** (ou
Mise en service → étape 3) : un lien s'affiche, valable sept jours pour un
poste. Il s'ouvre sur l'ordinateur où la douchette est branchée — ou il part
par e-mail à la personne qui s'y trouve :

```
https://pharmaboost.app/installer/<jeton>
```

La page (`/installer/[token]`) donne le bouton « Télécharger l'installateur » :
`PharmaBoost-Installation-<jeton>.exe`. Double-clic, une minute, rien à taper,
aucun mot de passe administrateur. Ensuite l'icône PharmaBoost est près de
l'horloge (point vert : le poste est relié) et le poste apparaît « En ligne »
dans PharmaBoost.

Ce que fait l'installateur, dans la session de la personne qui utilise le LGPI :

1. arrête une éventuelle ancienne installation (tâche « PharmaBoost Connect
   (poste) » de l'installation en une ligne comprise) ;
2. copie l'icône (`PharmaBoost.exe`) et l'agent (`pharmaboost-connect.js`) dans
   `%LOCALAPPDATA%\PharmaBoost\Poste` ;
3. télécharge Node.js (version épinglée, empreinte SHA-256 vérifiée avant
   d'ouvrir l'archive) ;
4. relie le poste avec le jeton lu dans le **nom du fichier** (le même
   installateur sert toutes les officines) ; un fichier renommé demande le
   code à six chiffres ou le lien ;
5. démarre avec Windows (clé Run de l'utilisateur), pose un raccourci sur le
   Bureau et dans le menu Démarrer, et s'inscrit dans « Applications
   installées » (désinstallation propre).

L'icône supervise l'agent (relance), le **met à jour toute seule** (elle
compare l'empreinte annoncée par `/api/agent/version` à celle du fichier
local, vérifie l'empreinte du fichier téléchargé, garde l'ancienne version et
y revient si la nouvelle ne tient pas), et dit l'état du poste. Clic droit :
ouvrir PharmaBoost, essayer l'affichage d'un avis, voir le journal.

Un technicien sous AnyDesk garde la **ligne de commande** (même lien, même
poste), décrite ci-dessous. Construction, signature et essai sur Windows de
l'installateur : `installateur/README.md`.

## En une ligne (technicien, ou prise en main à distance)

Dans PharmaBoost → Stock → Connecter mon logiciel → **Ajouter un poste**, le
détail « Technicien… » affiche une commande. Sur le poste, clic droit sur le
bouton Windows → Terminal, coller, Entrée :

```
powershell -ExecutionPolicy Bypass -Command "irm https://pharmaboost.app/api/agent/installer/<jeton> | iex"
```

Le script (`/api/agent/installer/[token]`) vérifie le jeton, télécharge le
programme et l'installateur (`/api/agent/fichiers/…`), installe Node.js s'il
manque, appaire le poste avec le jeton et crée la tâche à l'ouverture de
session. « Le poste est relié » s'affiche à la fin. Cette installation n'a
pas l'icône ni la mise à jour automatique : un poste installé ainsi peut être
réinstallé avec l'installateur, qui reprend la place de la tâche.

## L'autre méthode : code à six chiffres et archive


Objectif : chaque boîte scannée dans le LGPI apparaît dans PharmaBoost à
l'instant du bip, sans second scan. Le LGPI n'est ni modifié ni interrogé.

## Ce qu'il faut

- Le poste de caisse Windows où la douchette est branchée (pas le serveur).
- Être connecté à Windows avec la session qui affiche le LGPI.
- Un accès Internet depuis ce poste.
- Dix minutes.

## Étape 0 — vérifier la douchette (une minute)

1. Ouvrir le Bloc-notes de Windows.
2. Passer une boîte à la douchette.
3. Les 13 chiffres du code-barres doivent s'écrire dans le Bloc-notes.

Si oui, la douchette est une douchette « clavier » : c'est le cas attendu.
Si rien ne s'écrit, la douchette est branchée sur un autre appareil ou dans
un autre mode : ne pas aller plus loin, envoyer une photo du branchement.

## Étape 1 — le code du poste (dans PharmaBoost)

Stock → Connecter mon logiciel → « Postes de caisse » → « Ajouter un poste »
(nom : « Caisse 1 »). Un code à six chiffres s'affiche, valable une heure.

## Étape 2 — installer sur le poste

1. Sur le poste, ouvrir PharmaBoost, Stock → Connecter mon logiciel, cliquer
   « Télécharger PharmaBoost Connect », puis décompresser l'archive (clic
   droit → Extraire tout).
2. Dans le dossier décompressé : clic droit → « Ouvrir dans le Terminal ».
3. Coller la commande affichée sous le code, qui ressemble à :

```
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -Code 123456 -Serveur https://pharmaboost.app
```

4. Attendre « Le poste est relié ». Si Node.js manque, le script l'installe
   (une minute de plus).

## Étape 3 — vérifier

1. Sur un second écran ou une tablette, ouvrir PharmaBoost → Nouvelle vente.
2. Dans le LGPI, faire une vente normale : passer une boîte à la douchette.
3. Dans PharmaBoost, la vente apparaît dans « Douchette : ventes en cours »
   et s'ouvre d'elle-même ; six secondes après le dernier bip, les conseils
   et les alertes s'affichent.

Pour tester la douchette sans rien envoyer : ajouter `-Test` à la commande
de l'étape 2. Chaque bip s'affiche dans la fenêtre.

## Si ça ne marche pas

- « Appairage impossible » : le code a plus d'une heure, en générer un
  nouveau ; ou le poste n'a pas Internet.
- Rien n'apparaît dans PharmaBoost : dans PharmaBoost, Stock → Connecter mon
  logiciel, la ligne du poste doit être « En ligne ». Si elle est « Muette »,
  le journal est dans `%LOCALAPPDATA%\PharmaBoost\Poste\pharmaboost-connect.log`.
- Le LGPI est affiché dans une fenêtre de bureau à distance (session
  secondaire) : l'agent doit être installé sur le poste physique, celui où la
  douchette est branchée, pas sur le serveur distant.

## Ce que l'agent du poste transmet, et rien d'autre

Les codes-barres de boîtes (rafales de chiffres d'une douchette), le nom de
la machine et un signe de vie par minute. Aucune lettre tapée au clavier
n'est conservée ni envoyée.

## Le stock

Chaque bip retire une boîte du stock PharmaBoost. L'export de stock du LGPI
(serveur, agent « serveur ») remet le compte exact quand il arrive.

## Un patient, une vente

Les bips d'un même poste forment UNE vente — donc une seule ordonnance, sur
laquelle PharmaBoost construit le conseil — tant que deux bips se suivent à
moins d'une minute. Au-delà d'une minute sans bip, le suivant ouvre la vente
d'un nouveau patient.

L'écart se mesure entre deux BIPS du poste, à l'heure où la douchette les a lus
(l'agent date chaque bip) : le décompte repart à chaque bip. Un patient qui
passe dix boîtes, une toutes les quarante secondes, reste une seule vente. Ni
l'analyse ni l'écran ne prolongent la minute : un bip 70 secondes après le
dernier ouvre toujours une nouvelle vente, même si l'analyse de la précédente
vient de se terminer. Après une coupure Internet, les bips en attente repartent
dans l'ordre avec leur heure de lecture : deux bips lus à cinq minutes
d'écart restent deux ventes, même reçus ensemble. Un horodatage dans le futur
ou vieux de plus de six heures est ignoré (l'heure de réception est retenue).

Entre deux patients très rapprochés, le bouton « Nouveau patient » de
PharmaBoost remet l'écran à zéro sans attendre.

## L'avis en coin d'écran (agent 0.4.x)

Dès que l'analyse d'une vente bipée est prête, le poste affiche un petit
encart en bas à droite de l'écran, par-dessus le LGO, sans lui prendre le
clavier : les boîtes bipées, les alertes s'il y en a, puis jusqu'à trois
conseils avec le prix. Il s'efface seul après quinze secondes ; un clic
l'ouvre dans PharmaBoost.

- C'est le poste qui déclenche l'analyse, en interrogeant le serveur après
  chaque bip (`GET /api/agent/conseil`). Six secondes après le dernier bip,
  la vente passe « vérifiée » et l'analyse tourne côté serveur : aucun écran
  PharmaBoost n'a besoin d'être ouvert.
- Une boîte de plus sur la même vente relance l'analyse et réaffiche l'avis.
- Les avertissements de couverture (référentiel d'interactions absent…)
  restent sur l'écran complet ; ils n'encombrent pas l'encart.

Mettre à jour un poste déjà relié, puis voir un avis d'exemple :

```
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -MiseAJour
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -TestAffichage
```

## Le stock relu par le poste (agent 0.4.1)

Si le dossier où le LGO enregistre son édition de stock est visible depuis
un poste (un partage du serveur, par exemple `\\SERVEUR\PharmaBoost\Export`),
on l'indique dans PharmaBoost → Stock → Connecter mon logiciel → Postes de
caisse, sous le poste. Le poste le relit à chaque nouvel export (vérification
toutes les trente secondes) et PharmaBoost remet le stock d'aplomb. Le bouton
« Mettre à jour le stock maintenant » force une relecture dans la minute.
Le serveur, lui, n'a besoin ni d'Internet ni d'un programme.

