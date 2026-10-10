# Installer un poste de caisse (agent 0.5.x)

## Par le titulaire lui-même : un bouton, un fichier, un double-clic

Sur l'ordinateur du comptoir, dans PharmaBoost → **Mes connexions** → étape 1, un seul bouton :
**« Télécharger PharmaBoost »**. Aucun lien n'est montré, copié ni envoyé : le clic prépare le comptoir
(« Comptoir 2 », « Comptoir 3 »… un jeton à usage unique, sept jours) et télécharge directement l'installateur
Windows, `PharmaBoost-Installation-<jeton>.exe` (route `POST /api/connexion/installateur`). Double-clic, une
minute, rien à taper, aucun mot de passe administrateur : au premier lancement, le poste s'associe à son officine
avec le jeton porté par le nom du fichier. Le comptoir apparaît « Connecté » dans la petite liste dès qu'il s'est
présenté ET qu'il donne signe de vie ; l'icône PharmaBoost est près de l'horloge (point vert).

Le bouton n'existe que si l'installateur livré est **vérifié** (présent, exécutable Windows, taille et SHA-256 du
manifeste `agent/installateur/installateur.json` : `src/server/services/installer-file.ts`). Sinon la page le dit
et ne propose rien. Garde-fous de la route : session de l'officine avec la permission d'importer le stock, requête
venue de PharmaBoost lui-même (en-tête Origin), vingt téléchargements par heure au plus, rien n'est préparé si
l'installateur n'est pas disponible. Un fichier ne s'associe qu'**une fois** : un deuxième ordinateur doit
télécharger de son côté.

Les liens `/installer/<jeton>` et `/api/agent/installateur/<jeton>` existent toujours, pour l'assistance (console)
et les liens déjà envoyés.

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

Dans PharmaBoost → Mes connexions, le détail « Pour un technicien »
affiche une commande. Sur le poste, clic droit sur le
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

Mes connexions → « Configuration avancée » → « Postes de comptoir » → « Ajouter un poste »
(nom : « Caisse 1 »). Un code à six chiffres s'affiche, valable une heure.

## Étape 2 — installer sur le poste

1. Sur le poste, ouvrir PharmaBoost, Mes connexions, cliquer
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
   La page dit « Votre comptoir est prêt » avec la pastille « Connecté » et le
   poste (« Poste comptoir 1 ») ; tant qu'aucun bip n'est arrivé, elle ajoute
   « Aucun bip reçu pour l'instant » : le suivi n'est pas encore prouvé.
2. Dans le LGPI, faire une vente normale : passer une boîte à la douchette.
3. Dans PharmaBoost, la vente apparaît dans la carte « Délivrance en cours »
   et s'ouvre d'elle-même ; six secondes après le dernier bip, les conseils
   et les alertes s'affichent. Le compteur « Délivrances détectées » passe à 1.

Voir `docs/comptoir-tableau-de-bord.md`.

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

## L'avis sur le poste de caisse (agent 0.6.0)

État : **en développement seulement.** Le code Windows compile (C# 5, .NET Framework 4.8) et sa logique est testée, mais
la fenêtre n'a **jamais été dessinée sur un vrai Windows**. Premier essai à faire au poste : icône PharmaBoost près de
l'horloge → clic droit → « Essayer l'affichage d'un avis ».

Dès que l'analyse d'une vente bipée est prête, le poste affiche une fenêtre d'après la maquette : fond blanc, bordure
verte, « PharmaBoost · Conseil disponible », la disponibilité du produit (« En stock », « Stock faible », « Rupture »,
« Stock à vérifier »), ce qui a été détecté (« Médicament détecté » ou « Produit détecté »), les alertes s'il y en a, puis
le produit conseillé avec sa **photo** (un flacon gris à défaut), son **prix** quand le stock est fiable, la raison, et
« Suggestion à vérifier par le pharmacien ». Deux gestes : **« Voir le conseil »** (ouvre la vente dans PharmaBoost) et
**« Ignorer »**.

Les cinq améliorations demandées :
1. **Le conseil ne se perd plus** : 30 secondes à l'écran, puis la fenêtre se range près de l'horloge, où une petite
   icône verte porte le **nombre de conseils en attente**. Un clic rouvre le dernier ; clic droit : la liste, et « Tout
   ignorer ». L'icône disparaît quand plus rien n'attend. (Windows 11 range d'abord les nouvelles icônes sous la flèche
   « ^ » : la glisser une fois sur la barre pour l'y garder.)
2. **Le produit et sa disponibilité** : nom, photo, badge de stock, prix de vente. Le prix et « En stock » ne
   s'affichent que si le stock a été mis à jour il y a moins de trois jours ; sinon : « Stock à vérifier », sans prix.
3. **Deux gestes simples**, et le clic ouvre la vente concernée.
4. **Pas de répétition** : une vente n'a qu'**une** fenêtre, mise à jour sur place ; plusieurs produits bipés se
   regroupent (le premier conseil en grand, les autres sur une ligne). Ce que le pharmacien a vu ou écarté ne revient
   pas : seule une information nouvelle (un autre produit, une autre alerte) rouvre la fenêtre.
5. **Elle ne gêne jamais le logiciel de gestion** : elle ne prend ni le clavier ni le focus (même quand on clique
   dessus), n'apparaît ni dans la barre des tâches ni dans Alt+Tab, et se pose **à droite à mi-hauteur** — le bas de
   l'écran porte les boutons de facturation du LGO (« Valider »…) que l'ancienne fenêtre masquait. On peut la
   **déplacer à la souris** ; l'endroit est retenu (`pharmaboost-avis-position.txt`).

Réglages (facultatifs) dans `pharmaboost-connect.json` : `"affichage": { "position": "milieu-droite" | "bas-droite" |
"haut-droite", "secondes": 30, "ancienne": false }` (de 5 à 120 secondes). `"ancienne": true` remet l'ancienne
fenêtre de texte sur ce poste — l'interrupteur de secours, sans attendre un correctif.

- C'est le poste qui déclenche l'analyse, en interrogeant le serveur après chaque bip (`GET /api/agent/conseil`). **Trois**
  secondes après le dernier bip (six jusqu'au 8 octobre : trop long), la vente passe « vérifiée » et l'analyse tourne côté
  serveur : aucun écran PharmaBoost n'a besoin d'être ouvert. La réponse qui déclenche l'analyse **porte déjà son
  résultat** (le poste n'attend plus un tour d'interrogation de deux secondes), et la fenêtre se **prépare au premier bip**,
  pendant que le serveur analyse (agent 0.6.1) : sa compilation ne retarde plus le premier conseil. Mesuré en production
  le 8 octobre 2026 sur un premier Dulcolax : vingt secondes du scan à la fenêtre — sept d'attente, cinq d'analyse (le
  médicament n'était pas encore connu du moteur : classé une fois, retenu ensuite), deux de relecture, le reste, la
  préparation de la fenêtre. Le serveur répond avec les conseils **structurés** (photo, stock, prix) ; un serveur plus
  ancien répond par des lignes de texte, que la fenêtre montre telles quelles.
- Les photos viennent des bases ouvertes du catalogue (`images.open{beauty,food,products}facts.org`) ou de PharmaBoost,
  en https, jpeg ou png seulement, 600 Ko au plus, quatre secondes d'attente : elles se téléchargent **après** l'affichage
  et complètent la fenêtre sur place. Sans photo (ou en SVG), un flacon gris prend sa place.
- Un conseil rangé près de l'horloge est retiré dès que sa vente est close (le poste interroge le serveur toutes les
  trente secondes), ou après deux heures.
- **Secours** : si la nouvelle fenêtre ne démarre pas (erreur de compilation, trente secondes sans « PRET »), le poste
  retombe sur l'ancienne fenêtre de texte et le dit dans le journal : un avis n'est jamais perdu.
- Les avertissements de couverture (référentiel d'interactions absent…) restent sur l'écran complet.
- Pas encore : l'icône de compteur ne fait pas partie de l'icône PharmaBoost principale (il faudrait un nouvel
  installateur) ; « Ignorer » n'est pas remonté au serveur ; la photo n'est pas sur la carte « Rien à ajouter ».

Mettre à jour un poste déjà relié, puis voir un avis d'exemple :

```
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -MiseAJour
powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -TestAffichage
```

## Plusieurs boîtes : une seule vente, un avis qui s'affine

Les bips d'un même poste séparés de moins d'une minute forment UNE vente (`counter-scan.ts`, `SAME_SALE_WINDOW_MS`).
Après 3 secondes sans nouveau bip, la vente est analysée avec toutes ses boîtes : un premier avis arrive vite pour la
première boîte. Un bip de plus, même cinq secondes plus tard, remet la vente « à confirmer », relance l'analyse sur
**l'ensemble des boîtes** et la même fenêtre se met à jour sur place avec les meilleurs conseils pour l'ordonnance entière
(essai du 8 oct. 2026 : amoxicilline → probiotique, vitamine C ; + ibuprofène → confort gastrique ; + Doliprane → pastilles
gorge ; à chaque bip, 4 à 5 s entre le bip et l'avis).

## La mise à jour automatique (agent 0.6.1)

Avant : l'icône ne vérifiait les nouvelles versions qu'à son démarrage, puis toutes les six heures. Après chaque
publication, il fallait quitter l'icône et la rouvrir pour voir le changement.

Désormais l'agent, qui tourne en permanence, demande à PharmaBoost toutes les deux minutes (`/api/agent/version`) si une
version plus récente existe. Si oui il la télécharge, vérifie son empreinte SHA-256, remplace son propre fichier (même
protocole que l'icône : copie de secours `.previous`, marqueur `pharmaboost-maj.txt`) puis s'arrête ; l'icône le relance
aussitôt avec le nouveau fichier. Trois arrêts de suite : retour à l'ancienne version, qui n'est plus réinstallée
(`pharmaboost-refusee.txt`).

Garde-fous (`agent/src/self-update.ts`) : jamais depuis un serveur en clair (https, ou le poste de développement) ;
jamais un fichier dont l'empreinte diffère de celle annoncée ; **jamais pendant une vente** (vente suivie, bip en file ou
de moins de 30 s, avis en attente) — la nouvelle version est alors posée sur le disque et prend effet au premier moment
calme ; jamais hors d'un poste installé par l'installateur (à côté de sa configuration). Réglage :
`affichage.miseAJourAuto: false` dans la configuration pour la couper.

**Une dernière fois à la main** : un poste qui exécute encore une version antérieure à 0.6.1 doit être quitté puis
relancé (ou le PC redémarré) pour recevoir cet agent. Ensuite, plus jamais.

## Le stock relu par le poste (agent 0.4.1)

Si le dossier où le LGO enregistre son édition de stock est visible depuis
un poste (un partage du serveur, par exemple `\\SERVEUR\PharmaBoost\Export`),
on l'indique dans PharmaBoost → Mes connexions → Configuration avancée → Postes de
caisse, sous le poste. Le poste le relit à chaque nouvel export (vérification
toutes les trente secondes) et PharmaBoost remet le stock d'aplomb. Le bouton
« Mettre à jour le stock maintenant » force une relecture dans la minute.
Le serveur, lui, n'a besoin ni d'Internet ni d'un programme.


## L'écran « Mes connexions »

Depuis le 8 octobre 2026, « Mise en service », « Stock → Connecter mon logiciel » et l'assistant d'accueil
sont **une seule page**, `/connexion` (les anciennes adresses y renvoient) : « Installer PharmaBoost », **trois
blocs** et rien d'autre.

1. **Installer sur mes comptoirs** : « Télécharger PharmaBoost », la petite liste des comptoirs (« Connecté » =
   appairé ET signe de vie de moins de dix minutes, sinon « Ne répond plus »), « Retirer » (avec confirmation) pour
   un ordinateur volé ou remplacé.
2. **Envoyer mon stock** : l'état du dernier import (produits, date, lignes illisibles, fichier non appliqué), un petit
   guide LGPI, et un bouton qui ouvre le parcours « Mettre à jour mon stock » en trois étapes (choisir, vérifier, confirmer) :
   voir `docs/ecran-stock.md`. Les protections du serveur restent entières.
3. **Connecter mon robot** (facultatif) : fabricant et modèle seulement ; « Intégration non disponible ».

Tout le technique a quitté l'écran du pharmacien et vit dans l'**espace d'assistance** de la console (fiche officine,
onglet Technique, `src/app/(admin)/admin/pharmacies/[id]/assistance/`), réservé aux administrateurs de la plateforme
(chaque action commence par `requirePlatformSession`, l'audit nomme l'administrateur) : état détaillé, test de
connexion (`src/core/stock/connection-test.ts`), dossiers d'export et relecture du stock par poste, retrait d'un
poste, code à six chiffres, réglages et déconnexion du serveur, paramètres techniques et diagnostic du robot, état de
l'installateur Windows. Les statuts se calculent une seule fois (`src/core/stock/connection-overview.ts`).

## La fenêtre de la vente (agent 0.7.0)

La fenêtre du poste n'est plus un message de 30 secondes : elle **reste ouverte pendant toute la vente**, se met à jour à chaque
bip, et ne se ferme qu'à « Vente terminée ».

- **Conseils** (3 au plus, sans doublon ; un seul s'il n'y en a qu'un de pertinent) : produit, médicament concerné (« Pour : … »), photo, phrase courte, prix et stock quand
  le stock est à jour. Pastille orange **Challenge** quand le produit est dans un challenge laboratoire actif ; pastille rouge
  **Date courte** avec la vraie date du lot le plus proche. Jamais inventées : le serveur ne les envoie que si elles existent.
- **Vendu / Non vendu** : une *déclaration* du pharmacien, enregistrée `COUNTER_DECLARED` avec le poste. Elle n'est jamais mêlée
  aux « ventes confirmées » (ventes enregistrées dans PharmaBoost). Un conseil affiché n'est jamais compté vendu. Le logiciel de
  gestion (LGPI) ne permet pas de lire de façon fiable les produits encaissés : la valeur `LGO_CONFIRMED` est réservée.
- **Collaborateur** : le poste ne sait pas qui est au comptoir. On enregistre le poste (« Comptoir 2 »), pas un nom deviné.
- **E-mail du patient** (facultatif) : saisi à la main, avec la case « Le patient accepte de recevoir son bilan par e-mail »,
  chiffré. C'est le *seul* moment où la fenêtre prend le clavier : sur un clic dans le champ, puis elle le rend au logiciel de
  gestion (Enregistrer, Plus tard, Échap, clic ailleurs, 40 s sans rien taper). Un code-barres tombé dans le champ est effacé.
- **Vente terminée** : enregistre vendu / non vendu / sans réponse, envoie le **bilan au patient** s'il a donné son accord et
  qu'au moins un produit est déclaré vendu (noms des produits ; la phrase « patient » seulement si la règle est validée ; jamais de
  médicament ni de posologie), puis affiche « Vente terminée — résultats enregistrés » et, si un conseil a été vendu dans cette
  vente, « 18e conseil vendu aujourd'hui ». La fenêtre s'efface après 7 s et attend la vente suivante.
- **Résultats** : page « Ce que PharmaBoost vous rapporte » → section « Au comptoir » (proposés, vendus, non vendus, sans réponse,
  par poste, produits, challenges, dates courtes). Bilan mensuel par e-mail au titulaire, une fois par officine et par mois,
  envoyé par la tâche quotidienne (`/api/cron/automatisations`, rejouable sans double envoi ; `/api/cron/bilan-comptoir-mensuel` reste une porte manuelle).

Migration : `20261020090000_suivi_de_vente_au_comptoir`. Les postes passent en 0.7.0 par la mise à jour automatique (une fois la
vente en cours terminée) ; la fenêtre n'a jamais été dessinée sur un vrai Windows à ce jour.

## La bannière PharmaBoost (agent 0.8.0)

La fenêtre à bordure est remplacée par une **bannière** permanente, en haut à droite de l'écran du pharmacien (sous la barre de titre du
logiciel de gestion : ses boutons Réduire / Fermer restent libres). Le dessin vient de `agent/src/banner-design.ts` (couleurs, cotes,
durées, phrases) ; le code Windows est `agent/src/notice-host.ts`.

- **Toujours là** : elle apparaît à l'ouverture de session Windows (l'agent démarre à ce moment-là), « En attente de scan… », au-dessus
  du logiciel de gestion, sans jamais prendre le clavier ni le focus. Une icône PharmaBoost reste près de l'horloge (menu : afficher,
  réduire, masquer, verrouiller la position, Vente terminée) : c'est le moyen de retrouver une bannière masquée.
- **Elle réagit** : au bip, « Scan détecté ! Analyse en cours… » (avant même la réponse du serveur) ; puis « 3 conseils disponibles »
  et, au bout d'une seconde, elle s'agrandit toute seule. Pendant la vente : conseils avec pastilles Challenge / Date courte / En stock,
  Vendu / Non vendu, « Pendant la vente 2/3 », e-mail du patient (avec accord), « Voir le détail », « Vente terminée ». Elle reste
  ouverte jusqu'à « Vente terminée » (« Vente terminée ! » : coche verte animée, bilan, rang du jour), puis redevient « en attente ».
- **Le patient ne la voit pas gêner** : on la déplace à la souris (l'endroit est retenu : `pharmaboost-banniere-position.txt`), on la
  verrouille (épingle), on la réduit en pastille, on la masque (elle revient pour la prochaine vente qui porte un conseil).
- **Dessin** : fenêtre « à calque » (transparence par pixel), coins arrondis, ombre douce, reflet de verre, mascotte vectorielle animée,
  GDI+ anticrénelé, à l'échelle de l'affichage (100 %, 125 %, 150 %…) sur Windows 10 et 11.
- **Secours en cascade** : si la bannière ne compile pas ou n'arrive pas à se dessiner, le poste passe tout seul à l'ancienne fenêtre à
  bordure (`notice-host-classique.ts`) avec la même vente, puis à la notification Windows ; chaque étape est dite dans le journal. Pour
  forcer l'ancienne fenêtre sur un poste : `affichage.fenetre = "classique"` dans `pharmaboost-connect.json`. Si la bannière s'arrête
  en pleine vente, elle repart toute seule (5 fois au plus) et retrouve sa vente.
- **Aperçu sans Windows** : `npm run apercu:banniere` écrit et ouvre `agent/apercu/banniere.html` — les six états de la maquette, un
  scénario complet, les gestes (Vendu, e-mail, Vente terminée…), réglable à 100/125/150 %. C'est une reproduction fidèle du dessin
  (mêmes valeurs), **pas une capture de Windows** : police, ombre et lissage y sont ceux du navigateur.
- **Vérifié** : le code compile (C# 5, .NET Framework 4.8 : `PB_CSHARP_CHECK=1 npx vitest run agent/src/__tests__/notice-host.test.ts`) et
  les garde-fous sont testés. La bannière n'a **jamais été dessinée sur un vrai Windows** : premier essai à faire au poste (icône près de
  l'horloge → clic droit → « Essayer l'affichage d'un avis »).

**Sur le site public** : la page d'accueil (`/decouvrir`, section « Une petite bannière, à côté de votre logiciel ») montre la même bannière VIVANTE, qui rejoue toute seule
le scénario complet (en attente → scan détecté → conseils → Vendu / Non vendu → e-mail → « Vente terminée ! », puis recommence), avec les six étapes cliquables. Même design que
la bannière Windows. C'est `public/site/banniere-demo.html` (page identique à l'aperçu, ouverte en iframe avec `?integre=1`) ; `npm run apercu:banniere` régénère les deux copies,
un test les garde à jour.
