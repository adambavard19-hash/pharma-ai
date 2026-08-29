# Conformité, RGPD et données de santé

> **Avertissement essentiel.**
> Le fait qu'une fonctionnalité soit codée ne la rend pas juridiquement
> conforme. Ce document distingue ce qui est **implémenté** de ce qui reste
> **à valider par un conseil juridique** et, le cas échéant, par un délégué à la
> protection des données. Aucun élément ci-dessous ne constitue un avis
> juridique.

---

## 1. Nature des données traitées

Pharma.ai traite, dans son usage cible :

| Catégorie | Exemples | Qualification |
|---|---|---|
| Identification | nom, prénom, date de naissance, coordonnées | Données personnelles |
| Ordonnance | médicaments, posologies, prescripteur | **Données de santé** |
| Profil médical | allergies, pathologies, grossesse | **Données de santé** |
| Commercial | achats, conseils acceptés | Données personnelles |
| Équipe | activité par collaborateur | Données personnelles — suivi salarié |

La présence de données de santé déclenche des obligations renforcées : base
légale spécifique, hébergement agréé, analyse d'impact.

---

## 2. Ce qui est implémenté

### Minimisation et séparation

- Le profil de santé vit dans une table dédiée (`patient_health_profiles`),
  distincte des données commerciales.
- Les champs libres sensibles (allergies, pathologies, traitements, notes) sont
  chiffrés en **AES-256-GCM au niveau applicatif**
  (`src/server/security/encryption.ts`), en sus du chiffrement de l'hébergeur.
- Le journal d'audit ne contient **jamais** de donnée de santé en clair : on y
  consigne des identifiants et des compteurs, jamais un contenu.
- La console d'administration de l'éditeur n'a **structurellement** aucun accès
  aux données patients : elle utilise une session distincte
  (`PlatformAdminSession`) qui ne produit aucun `TenantScope`.

### Consentement

- Six consentements distincts et indépendants : traitement des données
  personnelles, traitement des données de santé, réception de la fiche conseil,
  réception des suivis de traitement, communications e-mail, communications SMS.
- Chacun est **horodaté**, porte la méthode de recueil, l'auteur du recueil et
  la version du texte d'information présenté.
- Chacun est **révocable** à tout moment depuis la fiche patient.
- L'application **refuse** l'envoi de la fiche conseil sans consentement
  `ADVICE_SHARING` — le bouton est désactivé et le motif affiché.
- Elle **refuse** de même tout suivi sans consentement `FOLLOW_UP_MESSAGE`, ou
  après désinscription du patient. La règle est évaluée côté serveur au moment
  de l'envoi, pas seulement à l'affichage de la liste : une désinscription
  arrivée entre-temps est respectée.

### Droits des personnes

- **Effacement** : `deletePatientAction` supprime le profil de santé et
  anonymise les données identifiantes (`anonymizedAt`). L'historique commercial
  agrégé subsiste sans rattachement nominatif, ce qui préserve la cohérence
  comptable sans conserver la personne.
- **Accès** : la fiche patient rassemble ordonnances, conseils, documents et
  interactions.
- **Traçabilité** : toute consultation du profil de santé est journalisée
  (`patient.health_viewed`).

### Sécurité

- Isolation multi-tenant à trois barrières (voir `docs/ARCHITECTURE.md` § 3).
- Contrôle par permission sur chaque écran et chaque action serveur.
- Permission distincte pour les données de santé — principe du moindre
  privilège.
- Sessions révocables, jetons stockés sous forme d'empreinte SHA-256.
- Validation Zod de toutes les entrées serveur.
- Aucune clé d'API accessible côté client (`server-only`).
- Accès aux fichiers d'ordonnance restreint par l'identifiant d'officine.

### Loyauté commerciale

- Aucun faux compte à rebours, fausse pénurie ou fausse urgence.
- La disponibilité affichée est la disponibilité réelle.
- Les allégations affichées au patient proviennent exclusivement des fiches
  produit validées par l'officine — le moteur n'en invente aucune.
- La fiche patient porte des mentions explicites : document d'accompagnement,
  ne remplace ni l'ordonnance ni l'avis médical, conseils facultatifs.

---

## 3. Ce qui reste à faire — bloquant avant production

### 3.1 Référentiel médicamenteux

> **Un modèle de langage n'est pas une base médicamenteuse.**

Le jeu livré (`prisma/seed-data/drugs.ts`, 12 fiches) est **entièrement
fictif** et porte `isDemoData: true`. L'application le signale à chaque analyse
via le signal `DEMO_REFERENTIAL`.

**À faire** : souscrire à un référentiel pharmaceutique validé et tenu à jour
(base publique des médicaments, base éditeur sous licence), et écrire
l'adaptateur `DrugKnowledgeProvider` correspondant. Tant que ce n'est pas fait,
**l'application ne doit pas être utilisée avec des patients réels.**

### 3.2 Validation professionnelle des règles de conseil

Le socle de 8 règles (`src/core/ai/engines/advice.ts`) est structuré et
documenté, mais **n'a pas été validé par un pharmacien**. Il doit l'être, et
idéalement être adossé à des recommandations professionnelles référencées.

### 3.3 Hébergement de données de santé (HDS)

L'hébergement de données de santé à caractère personnel pour le compte de tiers
requiert en France une **certification HDS**. Le stockage local
(`LocalStorageProvider`) est un outil de développement et ne convient pas.

**À faire** : contractualiser avec un hébergeur certifié HDS pour la base de
données **et** le stockage des fichiers d'ordonnance.

### 3.4 Formalités et documentation

- **Analyse d'impact relative à la protection des données (AIPD)** — probable
  au vu du traitement de données de santé à grande échelle.
- **Registre des traitements**.
- **Politique de conservation** : les durées ne sont pas encore arrêtées ni
  automatisées. Voir § 4.
- **Base légale** à déterminer pour chaque finalité (le consentement n'est pas
  nécessairement la base la plus appropriée pour un professionnel de santé).
- **Information des personnes** : mentions à rédiger et à faire valider.
- **Sous-traitance** : contrats à établir avec chaque prestataire (hébergeur,
  fournisseur d'IA, service d'envoi).

### 3.5 bis Messages de suivi patient — à faire valider

Le module de suivi est construit et ses garde-fous sont appliqués par le code
(consentement dédié, aucune donnée de santé dans le message, plafond de
sollicitation, désinscription, envoi manuel signé). Cela ne rend pas la pratique
conforme pour autant. Trois points relèvent d'un avis juridique :

1. **Qualification du message.** Un suivi de traitement adressé par une officine
   doit être qualifié au regard des règles encadrant la publicité relative aux
   produits de santé et la prospection. La frontière entre accompagnement
   thérapeutique et sollicitation commerciale doit être tranchée par écrit, et le
   contenu des gabarits validé en conséquence.
2. **Fournisseur d'envoi.** Aucun n'est branché à ce jour ; tout envoi est
   journalisé `SIMULATED`. Le choix d'un prestataire suppose un contrat de
   sous-traitance, un hébergement dans l'Union européenne et une analyse des
   destinataires des journaux d'envoi.
3. **Conservation.** La durée de vie des rappels envoyés et des traces d'envoi
   doit être arrêtée avec le reste des durées (§ 4).

### 3.5 Transferts et fournisseurs d'IA

Si un fournisseur d'IA est branché, il devient sous-traitant. Points à traiter
avant toute activation :

- localisation du traitement (transfert hors UE ?) ;
- garanties contractuelles ;
- **absence de réutilisation des données pour l'entraînement** ;
- durée de conservation chez le sous-traitant ;
- pseudonymisation avant transmission.

L'architecture le permet : le moteur n'envoie au `AIProvider` que le contenu
strictement nécessaire (`ExplanationRequest`), sans identité du patient.

### 3.6 Suivi de l'activité des salariés

L'écran Analytics propose des indicateurs **nominatifs** par collaborateur
(ordonnances traitées, conseils validés, chiffre d'affaires généré). Ce
traitement relève du suivi de l'activité professionnelle.

Il est protégé par une permission distincte
(`analytics:team-performance:view`) et accompagné d'un avertissement dans
l'interface. Sa mise en œuvre suppose néanmoins :

- l'information préalable et individuelle des personnes concernées ;
- la consultation des représentants du personnel lorsque cela s'applique ;
- la proportionnalité — pas de surveillance permanente ni de classement
  systématique ;
- une durée de conservation limitée ;
- l'inscription au registre des traitements.

**À faire valider avant toute exploitation managériale.**

---

## 4. Durées de conservation — à arrêter

Le modèle prévoit les champs nécessaires (`deletedAt`, `anonymizedAt`,
`tokenExpiresAt`). **Les durées ne sont pas encore définies ni automatisées.**

| Donnée | Champ | Durée à définir |
|---|---|---|
| Fichier d'ordonnance | `Prescription.fileKey` | ⚠️ à arrêter |
| Profil de santé | `PatientHealthProfile` | ⚠️ à arrêter |
| Fiche patient publiée | `PatientDocument` | 90 jours (jeton) — contenu ⚠️ |
| Journal d'audit | `AuditLog` | ⚠️ à arrêter |
| Sessions | `Session.expiresAt` | 12 h ✅ |
| Historique commercial | `Sale` | Obligations comptables |

**À faire** : arrêter chaque durée, l'inscrire au registre, et implémenter une
purge automatique.

---

## 5. Chiffrement — rotation des clés

`DATA_ENCRYPTION_KEY` chiffre les champs de santé. Le format de stockage porte
un préfixe versionné (`enc:v1:`), ce qui rend une rotation possible sans perte.

**À faire** : écrire la procédure de rotation (déchiffrement/rechiffrement de
l'existant) et définir la gestion du secret (coffre-fort, jamais dans le dépôt).

---

## 6. Ce que Pharma.ai n'est pas

À rappeler dans toute communication commerciale :

- Pharma.ai **ne prescrit pas** et ne pose aucun diagnostic.
- Pharma.ai **ne valide pas** une ordonnance : c'est l'acte du pharmacien.
- Pharma.ai **n'est pas un dispositif médical** dans son périmètre actuel. Si
  le produit évoluait vers une aide à la décision thérapeutique, cette
  qualification devrait être réexaminée — avec des conséquences réglementaires
  importantes.
- Les conseils affichés au patient sont ceux **validés par un professionnel de
  l'officine**, pas ceux produits par le moteur.
