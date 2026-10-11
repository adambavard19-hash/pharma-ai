# PharmaBoost Mobile

Application mobile d'abord (et confortable sur tablette et ordinateur) pour les pharmaciens, préparateurs,
titulaires et étudiants. Cinq onglets : **Accueil, Formations, Découvertes, Challenges, Mon espace**. Deux
expériences dans **une seule application et un seul système de comptes** :

- les **comptes gratuits** (professionnels sans officine cliente) ;
- les **équipes des officines clientes**, qui ont tout ce qu'ont les comptes gratuits, plus les fonctions d'officine.

Ce document décrit les fondations (étape 1) et ce que chaque étape suivante construit dessus.

## Architecture

| Élément | Où |
| --- | --- |
| Racine de l'application (métadonnées, `viewport-fit=cover`, icône Apple) | `src/app/(mobile)/m/layout.tsx` |
| Écrans d'entrée sans onglets : `/m/connexion`, `/m/inscription`, `/m/bienvenue` | `src/app/(mobile)/m/(compte)/…` |
| Écrans à onglets (session + « Bienvenue » faite exigées) | `src/app/(mobile)/m/(onglets)/layout.tsx` |
| Transition d'écran (CSS, coupée par « réduire les animations ») | `(onglets)/template.tsx`, classes `m-page`, `m-rise` dans `globals.css` |
| Pièces partagées (cartes, titres, états vides, barre du haut, onglets, champs) | `src/app/(mobile)/m/_components/` |
| Pièces propres à un onglet | `src/app/(mobile)/m/(onglets)/<onglet>/_components/` |
| Manifeste (installable, portée `/m` seulement) | `src/app/manifest.ts`, icônes `public/mobile/*` (`npx tsx scripts/logo-robot.ts --pwa`) |

L'application **n'importe aucun composant de mise en page du comptoir** (barre latérale, en-tête) : une
modification d'un côté ne casse pas l'autre. Elle réutilise les jetons de `globals.css`, Plus Jakarta Sans, le robot
(`public/logo-robot.svg`, `FloatingRobot` de `src/app/(public)/decouvrir/_components/floating-robot.tsx`).

Mise en page : barre d'onglets en bas jusqu'à 1023 px (cibles ≥ 44 px, zone sûre de l'iPhone), rail à gauche à
partir de 1024 px, colonne de contenu centrée. Champs en 16 px (pas de zoom de Safari). Pas de classes `dark:` : le
mode sombre n'est pas branché.

Pas de service worker pour l'instant : rien n'est mis en cache. S'il en vient un, il ne doit mettre en cache que
des fichiers statiques, **jamais** une page authentifiée ni une réponse d'API.

## Routes

| Route | Écran |
| --- | --- |
| `/m/connexion` | Connexion (même mot de passe que le comptoir) |
| `/m/inscription` | Compte gratuit : prénom, nom, e-mail, mot de passe, métier, RPPS facultatif (« non vérifié »), officine facultative, deux accords **décochés** |
| `/m/bienvenue` | Premier passage : profil + accords, puis `mobileOnboardedAt` |
| `/m` | Accueil : bonjour + robot, « Continuer ma formation », « Nouveautés partenaires », « Mes challenges » (équipes), « Découvrir PharmaBoost » (comptes gratuits) |
| `/m/formations` | Onglet en préparation (étape Formations) |
| `/m/decouvertes` | Onglet en préparation (étape Découvertes) |
| `/m/challenges` | Challenges en cours de l'officine active (réels) + bloc en préparation (étape Challenges) |
| `/m/moi` | Mon espace : profil, officine, rôle, accords + historique, mot de passe, déconnexion, demande de suppression |
| `/m/officine` | Choix de l'officine active (personnes rattachées à plusieurs officines) |

## Comptes et sessions

**Un seul système.** Même table `users`, même table `sessions`, même cookie `pharma_session`, même vérification du
mot de passe (`authenticateUser`, `src/server/auth/credentials.ts`, utilisée par la connexion du comptoir ET par
celle de l'application).

- **Comptes gratuits** : ils appartiennent à l'organisation unique **« Communauté PharmaBoost »**
  (`Organization.kind = COMMUNITY`, slug `communaute-pharmaboost`, créée par la migration et recréée au besoin par
  `ensureCommunityOrganization()`, `src/server/services/mobile/community.ts`). Ils n'ont **aucun** `Membership`.
- **Comptoir** : `getSession` / `requireSession` n'ont pas changé ; sans rattachement actif, pas de session. La
  connexion du comptoir refuse ces comptes avec : « Votre compte n'est rattaché à aucune officine cliente : ouvrez
  PharmaBoost Mobile… » et un lien vers `/m/connexion`.
- **Application** : `getUserSession()` / `requireUser()` / `requireClientScope()`
  (`src/server/auth/user-session.ts`) acceptent une session sans officine (`Session.pharmacyId` vide) et rendent
  `{ user, organization, memberships, activePharmacy | null, role | null, permissions, isClientStaff, isCommunity, scope | null }`.
- **Isolement** : toute lecture d'officine passe par `session.scope` (ou `requireClientScope()`), qui vient de la
  session — jamais d'un paramètre. Un compte gratuit n'a pas de scope. Le choix de l'officine réutilise
  `switchPharmacy` du comptoir.
- **Rejoindre une officine** : un titulaire peut inviter un compte gratuit (la règle « autre organisation =
  indisponible » ne s'ouvre qu'aux comptes de la Communauté, `canJoinOrganization`). À l'acceptation, le compte est
  déplacé vers l'organisation de l'officine dans la même transaction, à condition d'être encore dans la Communauté et
  sans aucun rattachement. La demande « Rejoindre mon officine » (`/rejoindre`) n'a pas changé : pour un compte
  existant, elle envoie toujours l'e-mail « vous avez déjà un compte » (à adapter par une étape suivante si besoin).
- **Freins** : connexion 10/min par IP et 6/min par adresse ; inscription 5 / 10 min par IP et 3 / 10 min par adresse.
- **Adresse déjà connue à l'inscription** : l'écran le dit (une inscription ne peut pas aboutir en silence), sans
  rien dire d'autre, derrière les freins.
- **Mot de passe oublié** : la page existante `/login/oubli` ; après le nouveau mot de passe, un compte sans
  officine est renvoyé vers `/m/connexion`.
- **Accords** : journal `UserConsent`, une ligne par décision (jamais modifiée), avec date, origine et version du
  texte (`CONSENT_TEXTS`, `src/core/mobile/profile.ts`). L'état courant = la dernière ligne. À l'inscription, les
  deux décisions sont consignées, « non » compris.

## Données (migration `20261027090000_mobile_fondations`, additive)

Toutes les tables des étapes suivantes existent déjà : **aucune étape suivante ne modifie `prisma/schema.prisma`**.

| Domaine | Modèles et champs |
| --- | --- |
| Comptes | `Organization.kind` ; `User.profession`, `rppsDeclared`, `declaredPharmacyName`, `mobileOnboardedAt` ; `UserConsent` |
| Académie | `TrainingContent` + `MICRO_VIDEO`, `orientation`, `videoAssetKey`, `posterUrl`, `durationSeconds`, `authorName`, `authorRole`, `partnerId`, `isSponsored`, `isFreeAccess`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `publishedAt`, `validUntil` ; `TrainingModule`, `TrainingModuleItem` ; `QuizQuestion`, `QuizAttempt` ; `SkillBadge` (passeport, `dedupeKey` unique) ; `TrainingProgress.pharmacyId` facultatif |
| Découvertes | `UserFavorite`, `PartnerInfoRequest` (texte + date du consentement), `PartnerLaunch` (catégorie réglementaire, validation), `SponsoredCampaign`, `SponsoredCampaignDailyStat` (compteurs par jour et emplacement, sans personne) |
| Challenges & coach | `PersonalObjective`, `BonusAuthorization` (le collaborateur ne voit que `VALIDATED` / `PAID`), `Recommendation.declineReason` (`CounterRefusalReason`), `TrainingRecommendation` (agrégats seulement), `ClinicalReviewFlag` |

Points d'attention :

- **Relecture** : l'application ne montre un contenu que `reviewStatus = APPROVED`, actif, non échu
  (`mobileVisibleTrainingWhere`, `src/server/services/mobile/home.ts`). Les contenus existants ont été passés à
  `APPROVED` par la migration ; les nouveaux naissent `DRAFT` (le comptoir, lui, ne regarde pas ce champ).
- **Progression hors officine** : `TrainingProgress` avec `pharmacyId = null`. Unicité par un index unique PARTIEL
  écrit dans la migration (`training_progress_content_user_personal_key`), que Prisma ne sait pas décrire : écrire
  par `findFirst` puis `create`/`update`, pas par `upsert` sur la clé composée.
- **Nouveautés partenaires** : montrées seulement si relues, validées sur le plan réglementaire
  (`regulatoryValidatedAt`), publiées, non échues, marque et partenaire actifs.
- **Réinitialisation de la démo** : les nouvelles tables d'activité sont dans `WIPED_MODELS`
  (`src/server/services/demo/provision.ts`).
- La console des utilisateurs d'officine (`/admin`) exclut les comptes de la Communauté (`userBaseWhere`).

## Ce que construit chaque étape suivante

1. **Formations (Académie)** — `(onglets)/formations/` : fil « Pour vous » de micro-vidéos verticales, lecteur,
   quiz (`QuizQuestion`/`QuizAttempt`), parcours (`TrainingModule`), passeport (`SkillBadge`), progression hors
   officine. Lien de la carte « Continuer ma formation » vers le détail.
2. **Découvertes & partenaires** — `(onglets)/decouvertes/` : nouveautés, fiches marques, favoris, « Être
   recontacté » avec consentement explicite (`PartnerInfoRequest` + `UserConsent PARTNER_INFO_REQUEST`),
   emplacements sponsorisés signalés, compteurs agrégés.
3. **Challenges, résultats, coach** — `(onglets)/challenges/` : objectifs personnels, primes validées par le
   titulaire, résultats, suggestions de formation d'après des agrégats, saisie du motif de refus au comptoir,
   remontée `ClinicalReviewFlag`.
4. **Consoles d'administration** — dans `src/app/(admin)/admin` (navigation `src/core/admin/nav.ts`) : Académie
   (relecture, publication), partenaires et campagnes (validation réglementaire, rapports), communauté (liste des
   comptes gratuits, demandes de suppression), signalements cliniques.

## Ouvrir l'application

- Sur le Mac : `npm run live`, puis http://localhost:3000/m.
- Sur un téléphone du même Wi-Fi : `npm run live -- --reseau` affiche l'adresse (http://<IP-du-Mac>:3000/m) et
  vérifie qu'elle répond. `next dev` écoute déjà sur toutes les interfaces ; `allowedDevOrigins` (next.config.ts)
  autorise les réseaux privés pour le rechargement à chaud. Le cookie de session n'est « Secure » qu'en
  production : la connexion marche en http sur le réseau local.
- Installer : Safari → Partager → « Sur l'écran d'accueil » (iPhone) ; menu → « Installer l'application » (Android).
- Comptes de l'aperçu local : `npm run mobile:demo` (compte gratuit `etudiant.demo@pharmaboost.test`, mot de passe
  affiché ; `-- --supprimer` le retire) ; équipes : `pharmacien@`, `titulaire@` (deux officines), `preparateur@pharma.ai`,
  mot de passe `Demo2026!Pharma`.

## Stores (App Store, Google Play)

Une PWA seule **n'est pas garantie d'être acceptée** dans les stores ; elle est en revanche installable dès
aujourd'hui depuis le navigateur. Pour une version publiée dans les stores :

- **Enveloppe native** autour du même serveur : Capacitor (le plus direct : il charge l'application web existante)
  ou Expo/React Native (écrans natifs, plus de travail). Le serveur, les comptes et les données restent les mêmes.
- **Notifications push** : APNs (Apple) et FCM (Google). Il faudra une table d'appareils à ajouter alors
  (`Device` : userId, plateforme, jeton push, dernière vue, révoqué le) et un envoi côté serveur.
- **Authentification native** : la même API de session, plus un flux par jeton pour l'application native (le
  cookie d'un WebView est fragile) : jeton court + jeton de renouvellement, stockés dans le trousseau.
- **Liens profonds** : Universal Links (iOS, fichier `apple-app-site-association`) et App Links (Android,
  `assetlinks.json`) pour ouvrir `/m/...` dans l'application.
- **App Store, règle 4.2 (« fonctionnalité minimale »)** : Apple refuse une simple page web emballée. Il faut des
  apports natifs réels (notifications, lecture vidéo hors ligne, partage, widgets…) et une expérience complète
  pour un compte gratuit (les relecteurs d'Apple doivent pouvoir tout essayer : prévoir un compte de démonstration).
- **Étiquettes de confidentialité** (App Store « Privacy Nutrition Labels », Google « Data safety ») : déclarer
  e-mail, nom, métier, RPPS déclaré, progression, accords, journaux ; aucune donnée de santé de patient n'est
  traitée par l'application mobile. Suppression de compte accessible depuis l'application (exigence Apple) : le lien
  « Demander la suppression de mon compte » existe ; un parcours de suppression en libre-service sera à prévoir.
