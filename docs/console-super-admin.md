# La console super admin — cinq rubriques

*Refonte du 9 octobre 2026, phase 1 (navigation, fiche officine 360°, accueil).*

Objectif : piloter PharmaBoost sans chercher. Cinq rubriques, sous chacune des onglets (jamais de menu déroulant), et une fiche
par officine où tout se gère. **Aucune adresse n'a changé** : ce qui était un menu est devenu un onglet, rien n'a été supprimé ni
migré, aucune donnée ni règle métier n'a bougé.

## Les rubriques

| Rubrique | Onglets (vues) | Adresses d'origine |
| --- | --- | --- |
| **Accueil** | cockpit : À traiter, Aujourd'hui, chiffres clés, accès rapides, tendance | `/admin` (+ cloche : `/admin/notifications`) |
| **Officines** | Mes officines · Support · Performance (Performance, Activité) | `/admin/pharmacies`, `/admin/support`, `/admin/performance`, `/admin/activite` |
| **Commercial** | Prospects (Pipeline, Liste, Démonstrations, Relances) · Équipe commerciale (Commerciaux, Candidatures, Directeur commercial) | `/admin/pipeline`, `/prospects`, `/dossiers`, `/demonstrations`, `/relances-commerciales`, `/commerciaux`, `/candidatures-commerciales`, `/directeur-commercial` |
| **Finances** | Abonnements (Abonnements, Offres & tarifs) · Contrats · Paiements (Paiements, Impayés) · Résiliations | `/admin/abonnements`, `/abonnements/offres`, `/contrats`, `/paiements`, `/impayes`, `/resiliations` |
| **Gestion** | Conseils · Communication (Campagnes, Historique, Modèles d'e-mails, Relances automatiques) · Partenaires · Formations & challenges · Équipe & société · Paramètres (Paramètres, Journal d'audit) | `/admin/conseils`, `/campagnes`, `/communications`, `/emails/modeles`, `/relances`, `/partenaires`, `/formations`, `/challenges`, `/equipe`, `/societe`, `/parametres`, `/journal` |

Ce qui n'est plus une rubrique — **Utilisateurs, Accès, État technique, Stocks reçus** — est dans la fiche de chaque officine
(onglets « Équipe & accès » et « Technique & stock »). Leurs anciennes adresses répondent toujours (listes transversales,
rangées sous « Officines ») et sont ouvertes par les tuiles et les alertes de l'accueil. Les **notifications** sont la cloche en
haut de l'écran.

La navigation vit dans `src/core/admin/nav.ts` (`ADMIN_NAV`, `activeNavItem`) ; elle est testée adresse par adresse
(`foundations.test.ts` : « aucune adresse n'a disparu »). Le rendu : `admin-nav.tsx` (`AdminNav` : les cinq rubriques,
`AdminSectionNav` : onglets puis pastilles de la rubrique ouverte).

## La fiche officine 360°

Sept onglets au lieu de onze. Chaque ancien onglet est une section du nouveau : **`?onglet=paiements`, `?onglet=notes`, etc.
fonctionnent toujours** (l'onglet qui contient la section s'ouvre, et la page descend à la section).

| Onglet | Contient |
| --- | --- |
| Aperçu | identité, titulaire, abonnement, dernier contrat, paiements, technique, notes épinglées, dernière activité, zone sensible |
| Équipe & accès | accès du titulaire, comptes, invitations, rôles, suspension |
| Technique & stock | installation sous AnyDesk, connecteur LGPI, postes de comptoir, incidents, assistance, **stock reçu** (fraîcheur, derniers fichiers, déposer le stock, décisions sur un fichier) |
| Facturation | abonnement et tarif contractuel (+ historique), **demande de résiliation**, contrats et signatures, paiements |
| Communication | e-mails, campagnes reçues, notifications, **discussions de support** |
| Commercial & notes | dossier commercial, parrainage, tâches, notes internes |
| Activité | performance de l'officine, historique complet |

Code : `pharmacies/[id]/shared.tsx` (`TAB_GROUPS`, `tabGroupOf`, `sectionToOpen` — les anciennes clés restent valides),
`page.tsx`, `tab-stock.tsx`, `tab-support.tsx`, `scroll-to-section.tsx`. Les lignes de fichiers de stock sont partagées avec la
page « Stocks reçus » (`depots-stock/_components/deposit-file-row.tsx`).

## L'accueil

Un cockpit qui dit quoi faire : **À traiter** (seulement ce qui demande quelque chose, le rouge devant ; les sujets à zéro tiennent en
une ligne discrète, nommables au clic), **Aujourd'hui** (démos, relances, fins d'essai, factures, liens de signature — une
journée vide tient en une ligne), **Le parc en chiffres** (revenu mensuel récurrent, officines, essais, abonnements actifs),
**Accès rapides**, et la **tendance** seulement quand il y a de quoi la tracer. S'y ajoutent deux files qui n'y étaient pas :
les questions des officines à répondre (support) et les fichiers de stock à trancher. Aucune donnée médicale n'est lue.

## Reste à faire (phases suivantes)

- Commercial : une seule interface « Suivi commercial » (tableau, liste, démos, relances) avec filtres et actions rapides,
  au lieu de quatre pages liées par des onglets.
- Finances : paiements et impayés dans une seule page à statuts ; moins de doublons entre abonnements, contrats et résiliations.
- Communication : un espace unique (campagnes, modèles, historique, automatisations).
- Officines : filtres « à surveiller » (technique, stock, accès) sur la liste, pour remplacer les listes transversales.
- Design : passer la même hiérarchie (moins de bordures, boutons cohérents) aux pages des autres rubriques.
