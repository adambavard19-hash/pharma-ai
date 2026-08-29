# Architecture de Pharma.ai

> Ce document décrit les choix retenus et **pourquoi**. Il est destiné à rester
> exact : toute modification structurelle doit s'y refléter.

---

## 1. Le principe fondateur

Pharma.ai transforme la délivrance d'une ordonnance en parcours de conseil.
L'ensemble de l'architecture découle d'une seule règle, non négociable :

> **La sécurité et la pertinence clinique déterminent ce qui peut être proposé.
> La considération commerciale n'intervient qu'ensuite, sur un ensemble déjà
> filtré, et ne peut jamais réintroduire ce qui a été écarté.**

Cette règle n'est pas une intention affichée dans une documentation : elle est
**structurelle**. Trois mécanismes la rendent impossible à contourner par
inadvertance.

### 1.1 L'ordre du pipeline est un enchaînement de données

`src/core/ai/pipeline.ts` exécute les étapes en séquence, chacune ne recevant
que la sortie de la précédente :

```
SÉCURITÉ
   ↓ (lignes confirmées, signaux)
COMPRÉHENSION DU TRAITEMENT
   ↓ (explications sourcées)
PERTINENCE — opportunités de conseil          ← aucun accès au catalogue
   ↓ (opportunités non bloquées)
SÉCURITÉ (2e passe) — filtrage patient/produit
   ↓ (opportunités et produits éligibles)
APPARIEMENT STOCK                              ← le catalogue entre ici
   ↓ (références candidates)
CLASSEMENT EXPLICABLE
   ↓ (candidates scorées)
OPTIMISATION COMMERCIALE AUTORISÉE             ← périmètre restreint
```

L'étape « pertinence » ne reçoit **pas** le catalogue en paramètre. Il est donc
matériellement impossible qu'un prix ou une marge influence la détermination de
ce qui serait utile au patient.

### 1.2 Le score s'annule en cas de signal de sécurité

`computeTotalScore` (`src/core/ai/engines/scoring.ts`) renvoie `0` dès que la
dimension `safety` ou `patientFit` vaut `0` — avant toute somme pondérée. Un
produit écarté n'est pas *rétrogradé*, il est *éliminé*.

### 1.3 La dimension commerciale est plafonnée

| Dimension | Poids |
|---|---|
| Pertinence du conseil | 34 % |
| Sécurité | 22 % |
| Adéquation au patient | 16 % |
| Disponibilité | 14 % |
| Préférence de l'officine | 8 % |
| Historique de validation | 4 % |
| **Optimisation commerciale** | **2 %** |

L'étape commerciale finale ne peut faire que deux choses : départager des
références dont les scores diffèrent de moins de 2 % (donc cliniquement
équivalentes), et limiter le nombre de propositions affichées.

**Trois tests vérifient cette garantie** (`src/core/ai/__tests__/`) :
une marge maximale ne renverse pas un écart de pertinence ; elle ne compense pas
une rupture de stock ; et l'ordre des étapes est asserté explicitement.

---

## 2. Découpage en couches

```
src/
├── core/                    DOMAINE PUR — aucune dépendance à Prisma ni à Next
│   ├── ai/
│   │   ├── types.ts         Types du domaine
│   │   ├── ports/           Interfaces (OCRProvider, AIProvider, …)
│   │   ├── providers/       Adaptateurs concrets
│   │   ├── engines/         safety · advice · matching · scoring
│   │   └── pipeline.ts      Orchestrateur — fonction pure et testable
│   ├── documents/           Contenu figé de la fiche patient
│   └── analytics/           Calcul des périodes
│
├── server/                  COUCHE SERVEUR — accès données, session, actions
│   ├── db/                  Client Prisma + garde-fou multi-tenant
│   ├── security/            Mots de passe, jetons, chiffrement
│   ├── auth/                Sessions officine et plateforme
│   ├── rbac/                Permissions
│   ├── audit/               Journal d'audit
│   ├── ai/registry.ts       Choix des fournisseurs
│   ├── services/            Logique applicative (analyse, ventes, documents…)
│   └── actions/             Actions serveur appelées par l'interface
│
├── components/              INTERFACE — primitives, graphiques, document
├── app/                     ROUTES Next.js (App Router)
├── config/                  Constantes, environnement validé, navigation
└── lib/                     Utilitaires (formatage français, QR code)
```

**Règle de dépendance** : `core/` ne peut importer que `core/` et `config/`.
Il ne connaît ni Prisma, ni Next.js, ni la base de données. C'est ce qui permet
de tester le moteur de recommandation sans démarrer quoi que ce soit.

---

## 3. Multi-tenant

### Modèle

```
Organization  (un groupe)
   └── Pharmacy  (une officine)
         ├── Patient, Product, StockItem, Prescription, Sale, …
         └── Membership → User
```

Chaque table métier porte `pharmacyId`. `Organization` existe dès le premier
jour, ce qui rend le passage d'une officine à un groupe sans migration
structurelle.

### Isolation

Trois barrières successives :

1. **L'officine active vient exclusivement de la session serveur.** Aucun
   `pharmacyId` n'est jamais accepté depuis une URL, un formulaire ou un
   en-tête. `SessionContext.scope` est la seule source.
2. **Chaque requête est filtrée.** Les services reçoivent un `TenantScope` et
   filtrent sur `pharmacyId`.
3. **Chaque entité récupérée par identifiant est revérifiée.** Après un
   `findUnique` sur un identifiant venu du client, on compare `pharmacyId` avec
   celui de la session — sinon `TenantIsolationError`.

Le fichier `src/server/db/tenant.ts` centralise ces garde-fous.

---

## 4. Contrôle d'accès

RBAC par **permissions**, jamais par rôle. Les écrans testent
`session.permissions.has(PERMISSIONS.X)`, jamais `session.role === "OWNER"`.

```
permissions effectives = permissions du rôle
                       + Membership.grantedPermissions
                       − Membership.revokedPermissions
```

Ajouter un rôle = ajouter une entrée dans `ROLE_PERMISSIONS`. Aucun autre
fichier n'est touché. Le besoin « permissions du préparateur configurables par
l'administrateur » est couvert par les deux listes du `Membership`.

Une permission distincte protège les **données de santé**
(`patient:health:view`) : un préparateur peut gérer une fiche patient sans
accéder au profil médical.

---

## 5. Architecture IA — ports et adaptateurs

Le moteur métier ne connaît que des interfaces (`src/core/ai/ports/`) :

| Port | Rôle | Implémentation actuelle |
|---|---|---|
| `OCRProvider` | Extraction d'ordonnance | `MockOCRProvider` — **simulé** |
| `AIProvider` | Reformulation | `RuleBasedAIProvider` — déterministe |
| `DrugKnowledgeProvider` | Référentiel médicamenteux | `LocalDrugKnowledgeProvider` — **jeu fictif** |
| `StorageProvider` | Fichiers | `LocalStorageProvider` — développement |
| `MessagingProvider` | E-mail / SMS | `NotConfiguredMessagingProvider` — **n'envoie rien** |
| `VideoProvider` | Vidéo patient | `UnavailableVideoProvider` — port prêt, moteur absent |

Le registre (`src/server/ai/registry.ts`) est le **seul** endroit qui décide
quel adaptateur est utilisé. Brancher un nouveau fournisseur = écrire un fichier
dans `providers/` + un `case` dans le registre. Aucune règle métier ne bouge.

Chaque `ProviderInfo` porte une `capability` (`SIMULATED` ou `LIVE`).
L'application **affiche systématiquement** quand un maillon est simulé — voir
§ 8.

---

## 6. Le moteur de conseil

### Opportunités, puis produits

Une **opportunité de conseil** (`AdviceOpportunity`) est un besoin, pas un
produit. Elle est déterminée sans accéder au catalogue.

Chaque règle (`src/core/ai/engines/advice.ts`) déclare :

- **`kind`** — `SAFETY`, `TOLERANCE` ou `COMFORT`. Des bornes de priorité
  (`PRIORITY_FLOOR` / `PRIORITY_CEILING`) garantissent qu'un conseil de sécurité
  ne peut jamais être classé derrière un conseil de confort, quels que soient
  les ajustements de contexte.
- **`triggerMode`** — `CLASS_ONLY` ou `CLASS_OR_SIDE_EFFECT`. Une règle dont la
  justification affirme quelque chose sur la *classe* du médicament
  (« ce traitement est un anti-inflammatoire ») ne peut se déclencher que sur
  une correspondance de classe. Un effet indésirable partagé — « troubles
  digestifs » est fréquent — ne suffit pas, sous peine de produire une
  affirmation fausse. Un test de régression le vérifie.
- **`counterScriptTemplate`** — *la phrase à dire au patient*, écrite dans la
  règle, relue et versionnée. Elle n'est jamais rédigée à la volée : c'est ce
  qui garantit qu'aucune justification médicale ne peut être improvisée pour
  vendre davantage. Deux substitutions seulement, et à deux moments distincts :
  `{drug}` à l'étape des opportunités, `{product}` au scoring — l'étape qui juge
  de la pertinence ne voit toujours pas le catalogue. Des tests vérifient
  qu'aucune phrase ne promet d'effet thérapeutique et qu'une règle déclenchable
  sur un simple effet indésirable n'affirme pas la classe du médicament.
- **`blockedFor`** — condition patient qui bloque définitivement la règle.
- **`safetyNotes`**, **`clinicalContext`** — ce qui est affiché au pharmacien.

La phrase de comptoir et la fiche patient ne disent pas la même chose et ne
viennent pas du même endroit : `counterScript` provient de la règle de conseil
et se dit à l'oral ; `patientReason` provient de l'argumentaire du produit et
s'écrit sur le document remis. Confondre les deux reviendrait à faire prononcer
au pharmacien une accroche commerciale.

**Aucune règle n'est mécanique.** « Antibiotique ⇒ probiotique » n'existe pas :
la règle `digestive-tolerance-antibiotics` évalue la classe ATC, module la
priorité selon l'âge, et se bloque en cas d'immunodépression déclarée.

### Le score est explicable

Chaque recommandation conserve, dans `scoreBreakdown.explanation`, la liste
ordonnée des contributions : dimension, valeur, poids, et **le détail textuel**
qui l'a produite (« 24 unités en stock », « allergie déclarée : arachide »).
L'écran « Pourquoi ce produit ? » les affiche telles quelles.

---

## 7. Auditabilité

Pour chaque analyse, `AnalysisRun` conserve :

- la **version du moteur** (`ENGINE_VERSION`) ;
- les **fournisseurs** utilisés et s'ils étaient simulés ;
- un **instantané des entrées** (nombre de lignes, taille du catalogue, …) ;
- la **trace complète du pipeline** : étape, statut, durée, entrées/sorties,
  notes ;
- les **raisons de blocage**.

Chaque recommandation a son journal (`RecommendationEvent`) : proposée,
acceptée, modifiée, remplacée, retirée, présentée, achetée, refusée — avec
auteur et horodatage.

La fiche patient est un **instantané figé** (`PatientDocument.contentJson`) :
un changement de prix ou de stock ne modifie jamais un document déjà remis.

---

## 8. Ne jamais simuler ce qui n'existe pas

Règle produit appliquée systématiquement :

| Situation | Comportement |
|---|---|
| OCR simulé | Bandeau explicite sur l'écran de vérification, `isSimulated: true`, mention dans la trace |
| Médicament absent du référentiel | `source: UNAVAILABLE`, aucune explication produite |
| Donnée du jeu de démonstration | `isDemoData: true` → signal `DEMO_REFERENTIAL` |
| Aucun service e-mail configuré | `DeliveryStatus.SIMULATED` + message : « n'a PAS été transmis » |
| Moteur vidéo absent | « Vidéo personnalisée — bientôt disponible », statut `NOT_CONFIGURED` |
| Champ d'ordonnance illisible | Champ laissé **vide**, jamais deviné |

---

## 9. Sécurité applicative

- **Mots de passe** : scrypt (N=2¹⁵, r=8, p=1), sel aléatoire, comparaison à
  temps constant. Aucune dépendance native.
- **Sessions** : jeton opaque de 32 octets ; seule l'empreinte SHA-256 est
  stockée. Révocables, expirantes, cookie `httpOnly` + `sameSite=lax`.
- **Données de santé** : champs libres chiffrés en AES-256-GCM au niveau
  applicatif, dans une table séparée. Le chiffrement s'ajoute à celui de
  l'hébergeur : un accès en lecture à la base ne suffit pas.
- **Clés d'API** : `src/config/env.ts` importe `server-only` — toute tentative
  d'import depuis un composant client fait échouer la compilation.
- **Fichiers** : la route `/api/files/[...key]` vérifie que la clé commence par
  l'identifiant de l'officine de la session.
- **Validation** : Zod sur toutes les entrées d'action serveur.
- **Audit** : `metadata` ne contient jamais de donnée de santé en clair.

---

## 10. Choix techniques et justifications

| Choix | Pourquoi |
|---|---|
| **Next.js 16 (App Router)** | Rendu serveur par défaut : les pages du comptoir arrivent complètes, sans attente de chargement de données côté client. Les Server Actions suppriment une couche d'API à maintenir. |
| **PostgreSQL + Prisma 7** | Migrations versionnées, typage de bout en bout, contraintes relationnelles réelles (l'attribution du CA repose sur des clés étrangères, pas sur des jointures applicatives). |
| **Sessions en base plutôt que JWT** | Révocation immédiate. Sur des données de santé, pouvoir couper un accès sans attendre l'expiration d'un jeton est un prérequis. |
| **scrypt (Node) plutôt qu'une bibliothèque** | Aucune dépendance native, donc aucun échec de build selon la plateforme. Résistance mémoire équivalente à argon2 pour cet usage. |
| **Graphiques SVG maison** | Rendus côté serveur, sans JavaScript client, cohérents avec le système de design et le mode sombre, et corrects à l'impression. Une bibliothèque aurait ajouté ~150 ko et un point de rupture au rechargement. |
| **QR code implémenté en interne** | Une seule fonction (encoder une URL) sur le chemin critique du comptoir. Rendu vectoriel, donc net à l'impression. |
| **PDF via l'impression navigateur** | Le CSS `@media print` produit un A4 fidèle sans moteur PDF côté serveur. `DocumentRenderer` reste branchable si un rendu serveur devient nécessaire. |

---

## 11. Intégrations préparées (non développées)

Les interfaces existent ; aucune n'est branchée.

- **Logiciel de gestion officinale / caisse** — `StorageProvider` et les
  services de stock sont conçus pour recevoir une synchronisation.
- **Catalogues fournisseurs** — l'import CSV constitue le premier niveau ;
  `ImportJob` porte déjà `kind` pour d'autres sources.
- **E-mail / SMS** — port `MessagingProvider`, adaptateur « non configuré ».
- **Paiement** — `Subscription.externalCustomerId` prévu, aucun prestataire
  branché.
- **Référentiel médicamenteux** — port `DrugKnowledgeProvider`, table
  `drug_references` alimentable par une source sous licence.

---

## 12. Ce qui reste à faire avant une utilisation réelle

Voir `docs/CONFORMITE.md` et `docs/ROADMAP.md`. En résumé, aucun de ces points
n'est résolu par le code seul :

1. Remplacer le référentiel médicamenteux fictif par une base validée.
2. Faire valider le socle de règles de conseil par un pharmacien.
3. Héberger chez un hébergeur agréé HDS.
4. Conduire une analyse d'impact relative à la protection des données.
5. Faire réaliser une revue de sécurité indépendante.
