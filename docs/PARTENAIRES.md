# PharmaBoost Partenaires

Des laboratoires et des marques référencent leurs gammes auprès des officines
qui utilisent PharmaBoost. Les officines éligibles les découvrent, peuvent les
masquer ou les refuser, contacter la marque ou commander quand l'intégration
le permet ; PharmaBoost attribue chaque prise de contact et chaque commande.

## Le principe qui ne se négocie pas

**Un partenaire n'achète jamais une recommandation.**

- Le moteur de conseil (`src/core/ai/**`) ne lit aucune donnée partenaire.
  Un test le vérifie à chaque passage
  (`src/core/partners/__tests__/partenaires-independance.test.ts`) : aucun
  import de module ou de modèle partenaire dans le moteur.
- La carte « Gamme partenaire » se calcule **après** le moteur, à partir des
  conseils qu'il a déjà rendus (`src/core/partners/counter-card.ts`). Elle ne
  fait entrer aucun produit, ne change aucun score, ne remplace aucune
  proposition et ne s'ajoute pas à la délivrance.
- Elle ne s'affiche pas pour un besoin bloqué par la sécurité, une proposition
  contre-indiquée pour ce patient, un besoin écarté par le patient ou un
  conseil refusé. Elle se signale comme telle : « À découvrir · gamme
  partenaire », jamais « recommandée ».
- Un produit de marque partenaire présent dans le stock de l'officine concourt
  comme n'importe quel autre : la clinique d'abord, les préférences de
  l'officine seulement entre équivalents (voir `pipeline.ts`). Le contrat du
  partenaire n'existe que dans la console.

## Parcours

1. **Candidature** — `/decouvrir/partenaires` : formulaire public, consentement
   obligatoire, enregistrement en base (`PartnerApplication`), notification de
   l'équipe, accusé de réception. Rien n'est activé automatiquement.
2. **Étude** — console `/admin/partenaires/candidatures` : Nouveau → En étude →
   Contacté → Négociation → Accepté / Refusé → Partenaire actif, notes
   internes et historique (`PartnerApplicationEvent`).
3. **Fiche partenaire** — créée depuis une candidature acceptée ou à la main :
   contacts, contrat interne, intégration.
4. **Marques, gammes, catalogue, documents, offres** — données centrales, une
   seule fiche par marque, jamais copiées dans les officines.
5. **Diffusion** — statuts Brouillon → Test → Actif → Suspendu → Archivé ;
   audiences : toutes les officines, officines sélectionnées, groupe pilote
   (`Pharmacy.partnerPilot`), critères futurs (`audienceCriteria`, non
   interprétés aujourd'hui). En Test, seul le groupe pilote voit la marque.
   Suspendre ou archiver un partenaire retire toutes ses marques.
6. **Officine** — `/partenaires` (titulaire) et `/partenaires/[marque]` :
   présentation, gammes et produits, ce que l'officine a déjà en stock,
   conditions professionnelles, documentation, formations liées
   (`TrainingContent.brandKey`), prise de contact, commande selon le mode.
   Masquer (absente du comptoir) ou refuser (absente partout), réversible.
7. **Comptoir** — au plus deux cartes « Gamme partenaire », sous les conseils.

La règle de diffusion tient en une fonction pure : `brandVisibility`
(`src/core/partners/visibility.ts`).

## Connecteurs

Contrat commun : `PartnerConnector` (`src/core/partners/connector.ts`) —
catalogue, disponibilité, prix professionnel, création de commande, statut,
attribution. Chaque opération est optionnelle ; une capacité absente renvoie
`unsupported`, jamais une réponse inventée.

| Mode | Ce qui fonctionne aujourd'hui | Ce qui attend le partenaire |
| --- | --- | --- |
| API | rien n'est échangé | l'API du partenaire (catalogue, disponibilité, prix, commande, statut) |
| Lien B2B attribué | ouverture du portail avec l'identifiant d'attribution | confirmation des commandes passées sur le portail |
| Formulaire | ouverture du formulaire, identifiant à reporter | idem |
| E-mail | commande envoyée au contact commandes, avec l'identifiant | confirmation par le partenaire (saisie en console) |
| Import / export | commande enregistrée, export CSV en console | import automatique chez le partenaire |
| Manuel | commande enregistrée, transmise et suivie par l'équipe | — |

Aucune clé d'API n'est stockée en base : elle vivra dans le coffre de secrets
de l'hébergement, référencée par l'intégration.

## Attribution et contrats

- Chaque consultation depuis le comptoir, prise de contact ou commande reçoit
  un identifiant unique `PB-XXXX-XXXX` (`PartnerAttribution`). Il ne contient
  ni l'officine, ni l'utilisateur, ni rien du patient.
- Commandes conservées : officine, partenaire, produits, quantités, montant,
  date, mode, référence partenaire, statut, identifiant d'attribution.
- Contrats internes : forfait, commission, hybride, pilote, gratuit ; dates,
  montant fixe, pourcentage, par unité, minimum, notes. L'estimation
  (`estimateCommission`) est **indicative** : aucune facturation n'est faite.

## Confidentialité

- Aucune donnée patient ni d'ordonnance dans les tables partenaires, dans un
  e-mail de commande ou dans une statistique. L'attribution garde seulement
  l'univers du besoin (« compléments alimentaires »), jamais le besoin
  lui-même.
- Ce qui part chez un partenaire : nom de l'officine, ville, FINESS,
  coordonnées de l'officine, lignes commandées, montant, identifiant
  d'attribution, note libre.
- Statistiques agrégées par marque et par partenaire, officines de
  démonstration exclues.
- Une officine ne lit jamais la sélection, les préférences ni les commandes
  d'une autre (`npm run lot:isolation-partenaires`).

## Futur espace partenaire (architecture, non construit)

Un espace `/partenaire` distinct de l'application officine et de la console,
avec sa propre session (comme la console : jamais de `TenantScope`, donc
aucun chemin vers les données d'une officine ou d'un patient).

- **Compte** : `PartnerContact` invité par l'équipe PharmaBoost, rôle
  « lecture » ou « catalogue ».
- **Ce qu'il verra** : sa fiche, ses marques, gammes, catalogue, documents,
  offres ; ses leads et commandes attribués (officine cliente, lignes,
  statut) ; des statistiques agrégées (officines où la marque est visible,
  ouvertures depuis le comptoir, leads, commandes) avec un seuil minimal pour
  qu'aucune officine ne soit reconnaissable.
- **Ce qu'il ne verra jamais** : un patient, une ordonnance, un conseil, la
  marge ou le stock détaillé d'une officine, une autre marque.
- **Ce qu'il pourra modifier** : proposer des mises à jour de catalogue, de
  documents et d'offres, toujours validées par PharmaBoost avant diffusion
  (statut Brouillon → Test → Actif inchangé).
- **API sortante** : webhooks de commande et de lead signés, pour remplacer
  l'e-mail quand le partenaire le souhaite.

## Fichiers

- Schéma : fin de `prisma/schema.prisma`, migration
  `20261004090000_pharmaboost_partenaires` (additive).
- Règles pures : `src/core/partners/`.
- Services : `src/server/services/partners/`.
- Console : `src/app/(admin)/admin/partenaires/`.
- Officine : `src/app/(app)/partenaires/`, carte du comptoir
  `src/app/(app)/vente/[id]/partner-cards.tsx`.
- Site public : `src/app/(public)/decouvrir/partenaires/`.
