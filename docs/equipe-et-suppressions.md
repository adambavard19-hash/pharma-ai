# Équipe d'une officine, et suppressions depuis l'espace administrateur

État : **en développement seulement.** Une migration (additive) à passer sur la base de production avant publication :
`20261014090000_equipe_principal_et_ordre`. Les écrans de l'espace administrateur n'ont pas été vus dans le navigateur
(pas de session administrateur locale) : ils sont compilés (build complet) et leurs règles sont testées.

## 1. L'équipe : poste, titulaire principal, ordre

Trois notions distinctes, sur l'écran **Équipe** du titulaire et dans la fiche d'officine de l'administrateur :

| Notion | Ce que c'est |
|---|---|
| **Poste** | Titulaire · Pharmacien · Préparateur · Étudiant · Consultation. Ce que la personne peut faire. |
| **Titulaire principal** | Parmi les titulaires (il peut y en avoir plusieurs, des associés), celui que PharmaBoost **contacte** : contrat, facture, e-mails d'accès, campagnes. Un seul par officine. |
| **Place** | L'ordre de la liste, choisi par le titulaire (flèches ▲ ▼). |

**Depuis son espace** (Équipe), le titulaire peut, pour chaque collaborateur :
- **Modifier** : prénom, nom, adresse e-mail, téléphone, RPPS, poste, titulaire principal — en un seul enregistrement
  (si une règle refuse l'un des changements, aucun n'est écrit) ;
- changer le **poste** d'un geste dans la liste ; monter ou descendre ; suspendre ; définir un mot de passe.

**Règles** (`src/core/team/rules.ts`, appliquées par le serveur) :
- une officine garde **toujours un titulaire actif** et **un titulaire principal** ;
- le titulaire principal ne change pas de poste : on en **désigne un autre**, il lui passe la main (un seul geste :
  « Titulaire » + « Titulaire principal » sur la nouvelle personne) ;
- seul un titulaire (ou PharmaBoost) nomme ou retire un titulaire, ou désigne le principal ;
- le nom, l'adresse et les coordonnées sont ceux d'un **compte** : un compte qui travaille aussi dans une autre officine
  ne se renomme pas depuis celle-ci (seul son poste change) ; PharmaBoost, lui, peut le corriger ;
- on ne change pas **sa propre** adresse de connexion depuis l'équipe (la session en cours serait fermée) ;
- changer l'adresse d'un collaborateur ferme ses sessions et annule son lien « mot de passe » en attente ;
- un nouveau collaborateur arrive en dernier ; si le principal part, le titulaire suivant le devient.

**Depuis l'espace administrateur** (fiche d'une officine → Utilisateurs) : colonne **Poste** + badge « Titulaire
principal », bouton **Modifier** (même fenêtre, plus : corriger l'identité d'un compte multi-officines, changer l'adresse
d'un titulaire). Mêmes règles. Le geste est tracé sous le nom de l'administrateur.

**Contact** : les requêtes « le titulaire de l'officine » (contrat, facturation, e-mails d'accès, campagnes, dossier
commercial, agent) prennent maintenant le **titulaire principal d'abord**.

## 2. Supprimer, depuis l'espace administrateur

### Un compte
- **Utilisateurs** (liste de tous les comptes) → **Supprimer** : supprime le compte **partout**. Il devient anonyme :
  adresse, téléphone, RPPS et mot de passe sont effacés (**l'adresse est de nouveau disponible**), les sessions sont
  fermées. Son **nom reste** sur l'historique (qui a vérifié telle ordonnance). Confirmation : taper `SUPPRIMER`.
- **Fiche d'officine → Utilisateurs → Supprimer** : si le compte n'a que cette officine, il est supprimé comme ci-dessus ;
  s'il travaille aussi ailleurs, il est **seulement retiré d'ici** (l'ancien geste le supprimait partout).
- **Refusé** si le compte est le **seul titulaire** d'une officine (le bouton s'éteint et dit pourquoi).
- `npm run comptes:liberer-adresses` (lecture seule) compte les comptes supprimés **avant** ce correctif qui gardent
  leur adresse ; `-- --appliquer` les anonymise (`--confirmer-production` en production).

### Une officine
- **Fiche d'officine → Aperçu → « Zone sensible » → Supprimer l'officine…** Fenêtre : le récapitulatif de ce qui part
  (comptes, patients, ordonnances, ventes, produits…), un **motif** obligatoire (consigné), et le **nom de l'officine à
  retaper** (sans casse ni accents) — le serveur revérifie les deux.
- **Emporte** : patients, ordonnances, ventes, stock, équipe, réglages, notifications. Les comptes qui n'ont que cette
  officine disparaissent ; ceux qui travaillent ailleurs en sont retirés. Si c'était la dernière officine de son
  organisation, l'organisation et son abonnement partent aussi. **Il n'y a pas de corbeille.**
- **Reste** : le journal d'audit (avec ce geste, le nom, le motif et les chiffres), les contrats signés, les prospects et
  commissions de l'extranet.
- **Interdit** (avec la raison à l'écran) : l'officine de **démonstration commerciale** ; un **abonnement encore en cours
  chez Stripe** (supprimer l'officine ne l'arrêterait pas : résiliez d'abord) ; des **paiements enregistrés** (la
  facturation se conserve — obligation comptable : suspendez plutôt).
- Une **seule transaction** : jamais une officine à moitié supprimée.

## Où est le code

- `src/core/team/rules.ts`, `src/core/admin/deletion.ts` — règles, sans base.
- `src/server/services/team-management.ts`, `src/server/services/admin/deletion.ts` — exécution.
- `src/server/actions/team.ts`, `admin-team.ts`, `admin-deletion.ts`, `platform-pharmacies.ts` — actions.
- `src/components/team/member-edit-modal.tsx` — la fenêtre « Modifier », partagée.
- `src/app/(app)/equipe/` — l'écran du titulaire ; `src/app/(admin)/admin/pharmacies/[id]/delete-pharmacy.tsx`,
  `src/app/(admin)/admin/utilisateurs/delete-user-button.tsx`, `…/pharmacies/edit-member-button.tsx` — l'administrateur.
- Tests : `src/core/team`, `src/core/admin/__tests__/deletion.test.ts`, `src/server/services/__tests__/team-management.test.ts`,
  `src/server/services/admin/__tests__/deletion.test.ts`.
