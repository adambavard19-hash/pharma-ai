# Nouvelle vente — le tableau de bord du comptoir

État : **en développement seulement.** Aucune migration, aucune variable d'environnement.

## Pourquoi

Le pharmacien travaille dans son logiciel de pharmacie, bipe ses boîtes, et PharmaBoost intervient
au bon moment. « Nouvelle vente » n'est donc plus un formulaire à remplir : c'est le **second écran
du comptoir**. Il dit si le poste est branché, attend la prochaine délivrance, et montre ce que la
journée a donné. La saisie à la main reste, derrière le bouton **Saisie manuelle**.

## Ce que l'écran montre

| Zone | Contenu | D'où ça vient |
|---|---|---|
| Titre + pastille | « Votre comptoir est prêt. » + **Connecté**, ou « …ne répond plus. » + **Hors ligne**, ou « …pas encore connecté. » + **Non connecté** | les postes de caisse (`connection-overview.ts`) |
| Carte centrale | « En attente d'une délivrance » + les postes (« Poste comptoir 1 ✓ »), ou « Délivrance en cours » dès un bip | `listLiveCounterSales` |
| Trois chiffres | Délivrances détectées · Conseils acceptés (« 3 / 5 ») · Ventes additionnelles | base, depuis minuit à Paris ; « — » tant qu'il n'y a rien |
| Activité récente | les 6 dernières ventes (aujourd'hui + ce qui est resté ouvert 48 h), avec où elle en est | base |
| Pied | **Saisie manuelle** · « Conseils soumis à validation » | — |

## Honnêteté

- **« Connecté »** ne se dit que d'un poste **appairé** qui a donné signe de vie il y a moins de dix
  minutes. Sans poste : « Non connecté » et « Connecter mon comptoir » (pour qui peut configurer).
- Un poste qui répond mais n'a **jamais reçu de bip** le dit : « Aucun bip reçu pour l'instant ».
  Un poste qui répond ne prouve pas que les bips arrivent.
- Une délivrance « détectée » est une vente ouverte par un **bip de douchette**, même clôturée depuis.
  Une vente saisie à la main n'y compte pas.
- Pas de zéro trompeur : « — » veut dire « rien à compter », « 0,00 € » veut dire « des ventes, sans
  vente additionnelle ».

## Comportement en direct

- Les ventes de la douchette : relues **toutes les 2,5 s** (comme avant).
- L'état du comptoir et les chiffres : toutes les **15 s**, et tout de suite quand une vente apparaît
  ou change d'état.
- Un bip qui ouvre une vente « à confirmer » **l'ouvre d'elle-même** (une fois par vente).
- « Nouveau patient » clôt les ventes en cours et ramène à l'attente.
- Une ordonnance **glissée** sur l'écran ouvre la saisie manuelle (le formulaire sait la recevoir).
- `?patient=…` et `?demande=…` (démonstration) ouvrent la saisie manuelle d'emblée.

## Où est le code

- `src/core/counter/dashboard.ts` — état du comptoir, chiffres, étapes, heure à Paris (pur, testé).
- `src/server/services/counter-dashboard.ts` + `src/app/api/comptoir/tableau/route.ts` — lecture.
- `src/app/(app)/vente/nouvelle/counter-dashboard.tsx` — l'écran ; `page.tsx` — chargement.
- Tests : `src/core/counter/__tests__/dashboard.test.ts`, `src/server/services/__tests__/counter-dashboard.test.ts`.

## Ce qui a changé de place

L'ancien en-tête (« un patient au comptoir ? »), la pastille d'état du stock, « À reprendre » et
« Aujourd'hui » sont remplacés par la carte. Le rappel de stock (titulaire) et le bloc de
démonstration restent au-dessus. Ordonnance, médicament et demande sans ordonnance sont dans
**Saisie manuelle**. Le lien vers « Pilotage » n'est plus sur cet écran : il reste atteignable
depuis « Mes résultats ».
