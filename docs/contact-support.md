# Contact support — discussions entre une officine et PharmaBoost

État : **en développement seulement.** Une migration (additive) à passer sur la base de production avant publication :
`20261015090000_contact_support` (deux tables, trois types). Les écrans de la **console** n'ont pas été vus dans le
navigateur (pas de session administrateur locale, par règle) : ils sont compilés (build complet) et leur logique est
testée. Le côté **officine** et l'**e-mail d'alerte** ont été essayés pour de vrai.

## Ce que ça fait

**Dans PharmaBoost** (toute l'équipe de l'officine) — lien **« Contact support »**, toujours visible en bas du menu, avec
un point chiffré quand une réponse n'est pas lue :
- **Nouvelle question** : un type (question, problème, abonnement et facture, idée), un sujet facultatif, le message.
  Un rappel est affiché : *n'écrivez aucune donnée de patient*.
- **Mes discussions** : la liste, avec l'état (« En attente de réponse », « PharmaBoost a répondu », « Terminée »).
- **La discussion** : les messages, un champ de réponse, « C'est réglé, terminer » (écrire de nouveau la rouvre). La page se
  rafraîchit seule (8 s) : une réponse apparaît sans recharger.

**Dans la console** — menu **Clients → Support** (compteur orange des questions à répondre) :
- **La boîte de réception** : onglets *À répondre* (la plus ancienne en tête) · *En attente de la pharmacie* · *Fermées* · *Toutes*,
  recherche (officine, ville, sujet), pastille « pas encore lue ».
- **La discussion** : la conversation, la réponse, « Fermer / Rouvrir », et un encadré sur l'officine (titulaire principal avec
  e-mail et téléphone, abonnement, accès) avec le lien vers sa fiche.

## Qui est prévenu, et comment

| Événement | Console | E-mail |
|---|---|---|
| Une officine ouvre une discussion | alerte dans la **cloche** (« *Pharmacie X vous a posé une question* »), lien direct | **e-mail** à l'adresse de la société (*Société exploitante*), à défaut `contact@pharmaboost.app` |
| L'officine répond à l'équipe | idem (« …vous a répondu ») | idem |
| L'officine écrit plusieurs messages d'affilée | **une seule** alerte par dix minutes et par discussion | idem |
| L'équipe répond | — | l'officine reçoit une **notification** (cloche de PharmaBoost, lien vers la discussion) et un **e-mail** à celui qui a écrit en dernier |

Un envoi qui échoue ne fait **jamais** perdre un message : il est enregistré d'abord ; l'alerte vient ensuite et son échec se
lit dans *Communication → Historique* (types « Alerte support » et « Réponse du support »).

## Garde-fous

- Une discussion n'est lisible que par **son officine** et par la console ; une autre adresse donne « introuvable ».
- **Aucune donnée de santé** : rappel avant d'écrire (la base de production est hébergée hors UE tant que la migration HDS n'est pas faite).
- Une officine de **démonstration** n'écrit pas au vrai support (le geste est refusé).
- **Anti-abus** : 15 messages par heure et par personne ; 4 000 caractères au plus ; texte affiché tel quel (jamais interprété).
- Une discussion est supprimée **avec son officine** (voir `docs/equipe-et-suppressions.md`).

## À savoir

- L'adresse qui reçoit les alertes est celle de **Administration → Société exploitante** (représentant). Pour la changer, la
  modifier là.
- Pas encore : pièces jointes (captures d'écran), réponse par e-mail directement, plusieurs destinataires d'alerte, indicateur
  « en train d'écrire ». À décider selon l'usage.

## Où est le code

- `src/core/support/` — règles (états, anti-rafale, nettoyage) et e-mails ; `src/server/services/support.ts` — le parcours.
- `src/server/actions/support.ts` (officine), `admin-support.ts` (console).
- `src/app/(app)/support/` — l'écran de l'officine ; `src/app/(admin)/admin/support/` — la console.
- `src/components/app/auto-refresh.tsx` — le rafraîchissement automatique.
- Tests : `src/core/support/__tests__`, `src/server/services/__tests__/support.test.ts`.
