# Pharma.ai

**Le copilote intelligent de l'officine.**

Pharma.ai transforme chaque ordonnance en opportunités de conseil pertinentes,
disponibles immédiatement dans votre stock, puis transforme chaque vente en
relation patient.

Trois choses, et rien d'autre :

1. **Mieux conseiller** — scanner une ordonnance, voir trois conseils au
   maximum, avec pour chacun le produit, pourquoi lui, le prix, le stock réel et
   **la phrase à dire au patient**.
2. **Vendre juste** — enregistrer la vente et attribuer le chiffre d'affaires à
   ce qui en découle réellement, jamais au reste.
3. **Faire revenir** — programmer un suivi adossé à un fait de la vente, le
   retrouver dans une liste de travail datée, l'envoyer d'un clic.

Le tout en moins d'une minute au comptoir — un chiffre vérifiable :
`npm run demo:comptoir` le mesure dans un vrai navigateur.

Le pharmacien reste systématiquement décisionnaire. Pharma.ai est un copilote,
pas un prescripteur.

---

## ⚠️ À lire avant tout

Cette version fonctionne sur un **jeu de données entièrement fictif** et avec
des **fournisseurs simulés**. Concrètement :

- L'extraction d'ordonnance **n'analyse aucune image par défaut** — elle
  restitue un scénario fictif prédéfini, et l'interface l'indique
  explicitement. La lecture réelle par modèle de vision existe mais exige
  **trois conditions distinctes**, dont une autorisation explicite de
  transmettre l'image à un tiers : une ordonnance photographiée est une donnée
  de santé. Voir [`docs/EXTRACTION.md`](docs/EXTRACTION.md).
- Le référentiel médicamenteux livré est **fictif** (12 fiches marquées
  `isDemoData`). **Un modèle de langage n'est pas une base médicamenteuse.**
- L'envoi d'e-mails est **réel dès qu'un fournisseur est configuré**
  (`EMAIL_PROVIDER="resend"` ou `"smtp"`). Tant qu'il ne l'est pas, l'application
  enregistre les envois — fiche patient comme suivis — en `SIMULATED` et
  n'affirme jamais qu'un message a été transmis. Un envoi refusé par le
  prestataire est enregistré `FAILED` avec son motif, jamais en succès.
- Aucun fournisseur **SMS** n'est branché : ce canal est refusé explicitement.
- Le socle de règles de conseil **n'a pas été validé par un pharmacien**.
- **Aucun référentiel d'interactions n'est livré.** Tant que l'officine n'en
  charge pas un, l'application affiche « les interactions entre médicaments
  prescrits ne sont pas analysées » — elle ne se contente pas de ne rien
  trouver. Voir [`docs/INTERACTIONS.md`](docs/INTERACTIONS.md).

👉 **Ne pas utiliser avec des patients réels.** Les prérequis à une utilisation
réelle sont listés dans [`docs/CONFORMITE.md`](docs/CONFORMITE.md).

---

## Démarrage rapide

### Prérequis

- Node.js 20 ou plus
- PostgreSQL 15 ou plus

### Installation

```bash
git clone <url-du-dépôt>
cd pharma-ai
npm install

cp .env.example .env
# Renseigner DATABASE_URL, puis générer les deux secrets :
#   openssl rand -base64 48   → AUTH_SESSION_SECRET
#   openssl rand -base64 32   → DATA_ENCRYPTION_KEY

npm run setup      # migrations + génération du client + données de démonstration
npm run doctor     # vérifie que tout est en place
npm run dev
```

L'application est disponible sur <http://localhost:3000>.

> **La connexion échoue ?** Lancez `npm run doctor`. Le diagnostic vérifie le
> fichier `.env`, l'accès à PostgreSQL, l'application des migrations et la
> présence des comptes — et affiche la commande exacte qui corrige le problème.
> Voir [Dépannage](#dépannage) plus bas.

### Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Titulaire | `titulaire@pharma.ai` | `Demo2026!Pharma` |
| Pharmacien | `pharmacien@pharma.ai` | `Demo2026!Pharma` |
| Préparateur | `preparateur@pharma.ai` | `Demo2026!Pharma` |
| Étudiante | `etudiante@pharma.ai` | `Demo2026!Pharma` |
| Admin plateforme | `superadmin@pharma.ai` | `Demo2026!Pharma` — sur `/admin-connexion` |

Chaque profil ouvre une interface différente : c'est le RBAC à l'œuvre.
Le préparateur n'accède pas au profil de santé ; l'étudiante ne peut pas valider
un conseil.

**Vous n'avez pas besoin de taper le mot de passe** : sur l'écran de connexion,
les profils de démonstration sont cliquables. Un clic vous connecte.

---

## Le parcours à dérouler

Cinq entrées dans le menu, et rien d'autre : **Nouvelle vente · Patients ·
Stock · Suivis · Paramètres**. Tout le reste est rangé derrière, atteignable
mais hors du chemin.

Le jeu de démonstration laisse **une ordonnance en attente de vérification**,
pour parcourir la chaîne complète en direct :

1. **Accueil** → un seul bouton : *Nouveau patient · Scanner une ordonnance*.
   Les chiffres sont en bas, en petit, et mènent à la page Performance.
2. **Scanner** → choisir un scénario de démonstration (chacun illustre un
   comportement précis du moteur).
3. **L'écran de vente** → une seule page, trois zones, jamais quittée :
   - *Le traitement* — chaque champ affiche sa confiance ; un champ illisible
     reste **vide**, jamais deviné. Les lignes se corrigent sur place.
   - *La sécurité* — elle parle avant les conseils. Une alerte portant sur le
     traitement ferme la zone suivante jusqu'à acquittement.
   - *Les conseils* — trois au maximum, chacun avec sa phrase à dire au patient
     et trois décisions : **Proposé · Ajouter à la vente · Refusé**. Ouvrir
     « Pourquoi ce produit ? » pour voir le score décomposé.
4. **Terminer la vente** → le CA est attribué aux seules lignes issues d'un
   conseil.
5. **Fin de vente** → la fiche patient (imprimée, QR code, page sécurisée) et le
   suivi à programmer.
6. **Suivis** → le rappel réapparaît à échéance dans une liste de travail. Rien
   ne part sans un clic ; chaque ligne affiche pourquoi elle n'est pas
   envoyable, s'il y a lieu.
7. **Performance** → le chiffre d'affaires additionnel se met à jour.

Les scénarios disponibles illustrent chacun un point :

| Scénario | Ce qu'il montre |
|---|---|
| Antibiothérapie | Conseil de tolérance digestive + posologie illisible |
| Dermatologie | Accompagnement cutané d'un dermocorticoïde |
| Cycline | Un conseil de **sécurité** prioritaire sur un conseil de confort |
| Supplémentation martiale | Accompagnement du transit + dosage non lu |
| Anti-inflammatoire | Confort gastrique |

Testez aussi les **garde-fous** : le patient *Sophie Nguyen* est déclaré
enceinte, *Marc Delaunay* en insuffisance rénale, *Camille Berthier* allergique
à la pénicilline. Le moteur écarte les conseils concernés et affiche pourquoi.

---

## Ce qui distingue ce produit

### La sécurité passe structurellement avant le commercial

Le pipeline est un enchaînement de données, pas une convention :

```
SÉCURITÉ → COMPRÉHENSION → PERTINENCE → STOCK → SCORE → COMMERCIAL
```

L'étape « pertinence » ne reçoit **pas** le catalogue en paramètre : il est
matériellement impossible qu'un prix influence la détermination de ce qui serait
utile au patient. La dimension commerciale pèse **2 %** du score et ne peut que
départager des références déjà jugées équivalentes.

Trois tests vérifient cette garantie, dont celui-ci : une marge maximale ne
renverse jamais un écart de pertinence.

### Rien n'est inventé

| Situation | Comportement |
|---|---|
| Champ d'ordonnance illisible | Reste **vide**, signalé, à saisir par un professionnel |
| Médicament absent du référentiel | **Aucune explication produite** |
| Donnée du jeu fictif | Signalée à chaque analyse |
| Aucun service e-mail | « n'a **PAS** été transmis » |
| Envoi refusé par le prestataire | « Échec — aucun message n'est parti » + motif |
| Moteur vidéo absent | « bientôt disponible » — jamais une vidéo qui n'existe pas |

### Le score est explicable

Chaque recommandation conserve la décomposition de son score : dimension,
valeur, poids, et le détail textuel qui l'a produite (« 24 unités en stock »,
« allergie déclarée : arachide »). Pas de boîte noire pour le professionnel.

### Tout est auditable

Chaque analyse conserve la version du moteur, les fournisseurs utilisés, un
instantané des entrées et la trace complète du pipeline. Chaque recommandation a
son journal : proposée → acceptée → présentée → achetée, avec auteur et
horodatage. La fiche patient est un instantané figé.

---

## Stack

| Couche | Choix |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Langage | TypeScript strict |
| Interface | React 19 · Tailwind CSS v4 · système de design maison |
| Base de données | PostgreSQL 16 |
| ORM | Prisma 7 (adaptateur `pg`) |
| Authentification | Sessions en base, scrypt, cookies `httpOnly` |
| Graphiques | SVG rendus côté serveur, sans bibliothèque tierce |
| Tests | Vitest |

Les justifications de ces choix figurent dans
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) § 10.

---

## Structure

```
src/
├── core/          Domaine PUR — ni Prisma, ni Next.js. Testable seul.
│   ├── ai/        ports · providers · engines · pipeline · garde-fou comptoir
│   ├── followup/  Gabarits de suivi figés · droit d'envoyer
│   ├── documents/ Contenu figé de la fiche patient
│   └── analytics/ Périodes d'analyse
├── server/        db · security · auth · rbac · audit · services · actions
├── components/    ui · charts · app · document
├── app/           Routes (App Router)
├── config/        Environnement validé, constantes, navigation
└── lib/           Formatage français, QR code, utilitaires
```

**Règle de dépendance** : `core/` n'importe que `core/` et `config/`.

---

## Commandes

```bash
npm run dev            # développement
npm run build          # build de production
npm run start          # serveur de production
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm test               # tests (100)

npm run db:migrate     # créer et appliquer une migration
npm run db:deploy      # appliquer les migrations (production)
npm run db:seed        # (ré)installer le jeu de démonstration
npm run db:reset       # réinitialiser complètement
npm run db:studio      # explorateur de base

npm run demo:parcours  # dérouler le parcours complet en ligne de commande
npm run demo:comptoir  # mesurer le parcours comptoir dans un vrai navigateur
npm run setup          # migrations + client + démonstration
```

`npm run demo:parcours` exécute la chaîne complète contre la base réelle —
extraction, vérification, analyse, conseil, fiche, vente, suivi — et affiche la
trace du pipeline étape par étape, sans passer par l'interface.

`npm run demo:comptoir` mesure le parcours du pharmacien dans un navigateur,
étape par étape, et échoue si le budget d'une minute est dépassé. L'application
doit tourner à côté (`npm run dev` ou `npm run start`). C'est ce script qui a
mis au jour un défaut invisible autrement : une confirmation qui recouvrait le
bouton « Terminer la vente » pendant six secondes.

---

## Dépannage

Une seule commande diagnostique l'installation :

```bash
npm run doctor
```

Elle contrôle, dans l'ordre où les choses cassent en pratique :

| Vérification | Si ça échoue |
|---|---|
| Fichier `.env` présent | `cp .env.example .env` |
| `DATABASE_URL`, secrets renseignés | La commande `openssl` à lancer est affichée |
| PostgreSQL joignable | La commande de démarrage selon votre système |
| Migrations appliquées | `npm run db:deploy` |
| Comptes présents | `npm run db:seed` |

### « Identifiants incorrects » alors que le mot de passe est bon

C'est presque toujours une base sans données. **L'écran de connexion vous le dit
désormais lui-même** : au lieu du formulaire, il affiche la cause exacte — base
vide, schéma absent ou PostgreSQL injoignable — avec la commande à lancer.

Si le formulaire s'affiche normalement et que la connexion échoue, c'est bien le
mot de passe : utilisez les boutons de profil, qui ne demandent aucune saisie.

### Pas de PostgreSQL installé ?

Le plus rapide est Docker :

```bash
docker run -d --name pharma-db \
  -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

Puis dans `.env` :

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
```

---

## Documentation

| Document | Contenu |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Choix retenus et **pourquoi**, découpage, isolation, moteur IA |
| [`docs/CONFORMITE.md`](docs/CONFORMITE.md) | Ce qui est implémenté vs **ce qui reste à valider juridiquement** |
| [`docs/RGPD.md`](docs/RGPD.md) | Synthèse opérationnelle : consentements, droits, conservation |
| [`docs/SECURITE.md`](docs/SECURITE.md) | Mots de passe, sessions, chiffrement, isolation |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ce qui est livré, ce qui bloque, les phases suivantes |

---

## Brancher un fournisseur réel

Le moteur ne connaît que des interfaces. Pour brancher un OCR, un modèle ou une
base médicamenteuse :

1. Écrire un adaptateur dans `src/core/ai/providers/` implémentant le port
   correspondant (`OCRProvider`, `AIProvider`, `DrugKnowledgeProvider`, …).
2. Ajouter un `case` dans `src/server/ai/registry.ts`.
3. Renseigner la variable d'environnement correspondante.

**Aucune règle métier n'est touchée.** Le fournisseur déclare sa `capability`
(`SIMULATED` ou `LIVE`) ; l'application affiche l'information à l'utilisateur et
la consigne dans chaque analyse.

---

## Licence et responsabilité

Pharma.ai est un outil d'assistance au conseil officinal. Il **ne prescrit
pas**, ne pose aucun diagnostic, et ne se substitue à aucun avis médical ou
pharmaceutique. La responsabilité professionnelle du conseil délivré au patient
appartient au pharmacien.
