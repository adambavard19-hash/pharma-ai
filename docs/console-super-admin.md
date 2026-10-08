# La console super admin — cinq rubriques

*Refonte du 9 octobre 2026 : phase 1 (navigation, fiche officine 360°, accueil) et phase 2 (commercial, finances, communication, officines à surveiller, téléphone).*

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

## Phase 2 — un espace de travail par sujet

- **Suivi commercial** (Commercial → Suivi commercial) : un seul en-tête pour le tableau, la liste, les démonstrations et les
  relances (`_commercial/workspace-header.tsx`) — sélecteur de vues avec ce qui attend (« 1 en retard », « 2 aujourd'hui »), et
  les trois gestes de tous les jours partout : nouveau dossier, programmer une démo, fixer une relance. Les vues gardent leurs
  adresses, leurs filtres et leurs liens `?nouveau=…`, `?vue=…`.
- **Paiements** (Finances → Paiements) : les factures Stripe et les impayés à relancer sont **une seule page** à deux vues
  (`?vue=impayes`) ; `/admin/impayes` y redirige. Le bouton de navigation « Impayés » et les boutons croisés des pages
  Abonnements et Offres, devenus redondants avec les onglets, sont retirés.
- **Communication** (Gestion → Communication) : campagnes, historique, modèles d'e-mails et relances automatiques partagent un
  même sélecteur de vues (`_communication/views.tsx`) ; les échanges d'une officine sont aussi dans sa fiche.
- **Officines à surveiller** : sur la liste des officines, trois pastilles — connecteur à vérifier, inactives depuis 14 jours,
  stock à rafraîchir (`?surveiller=technique|inactives|stock`, `core/admin/clients.ts`, `WATCH_FILTERS`) — avec les mêmes règles
  que l'accueil (hors démonstrations et officines suspendues). Elles remplacent les listes transversales État technique, Activité
  et Stocks reçus, qui restent à leur adresse.
- **Téléphone** : les cinq rubriques tiennent sur une ligne, les onglets et les vues défilent, les boutons s'empilent.

Composants communs : `components/admin/view-switch.tsx` (`ViewSwitch`) pour tout sélecteur de vues ; `AdminNavGroup.ownViewSwitcher`
masque les pastilles de la navigation quand la page a son propre sélecteur.

## Reste à faire

- Design : étendre la même hiérarchie (moins de bordures, boutons cohérents) aux pages des autres rubriques — les tuiles de
  chiffres et les cartes des pages d'origine n'ont pas été reprises une à une.
- Abonnements, contrats, résiliations : les trois restent trois pages (chacune a sa structure) ; leurs chiffres communs
  pourraient être réunis dans un même bandeau.
- Fiche officine : modifier le tarif contractuel sans quitter la fiche (aujourd'hui « Modifier l'abonnement » ouvre la page de
  facturation de l'officine).
