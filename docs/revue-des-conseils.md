# La revue des conseils par la pharmacienne

Le moteur compte 46 règles de conseil (`ADVICE_RULES`, `src/core/ai/engines/advice.ts`). **Aucune n'avait été relue par un
pharmacien** (`validation.status: "PENDING"`). Le premier vrai passage au comptoir les a exposées : certaines étaient trop
larges, d'où des conseils jugés mauvais. La revue remet la décision à la pharmacienne, règle par règle, pour SON officine.

## Où cliquer

Paramètres → **Règles de conseil** → onglet **Revue des conseils** (l'onglet qui s'ouvre par défaut).

Chaque règle est dite en clair : *quand elle se déclenche*, *ce qu'elle propose*, *ce que vous diriez* (et, dans « Voir le
détail », la raison affichée, la question au patient et les précautions). Trois boutons :

| Bouton | Effet |
| --- | --- |
| **Valider** | la règle peut parler dans la fenêtre du poste de caisse |
| **Refuser** | la règle ne se déclenche **plus jamais** dans l'officine (ni sur l'écran de la vente, ni au poste) |
| **Remettre à relire** | efface la décision |

Qui a décidé et quand est affiché sur la carte et gardé dans le journal d'audit (`advice_rule.reviewed`). Permission :
`RECOMMENDATION_RULES_MANAGE` (titulaire, pharmacien).

## Ce que cela change

| État de la règle | Écran complet de la vente | Fenêtre du poste de caisse |
| --- | --- | --- |
| À relire (par défaut) | oui | **non** |
| Validée | oui | oui |
| Refusée | non | non |

Les **associations de l'officine** (« Mes associations », origine `RULE`) et les ajouts manuels parlent toujours : ils
viennent déjà d'une décision de la pharmacienne.

Une règle **modifiée** depuis sa relecture (sa `version` change) repasse « à relire » et le dit (« Modifiée depuis votre
relecture ») : on ne garde pas un accord donné pour un texte qui n'existe plus.

## Où c'est branché

- `src/core/ai/rule-review.ts` — états, `disabledRuleKeys` (règles refusées), `mayShowAtCounter` (règle validée ou non).
- `src/server/services/advice-rule-reviews.ts` + `src/server/actions/advice-rules.ts` — lecture / décision, par officine.
- `src/core/ai/pipeline.ts`, `engines/advice.ts` — les règles refusées ne sont pas évaluées.
- `src/server/services/analysis.ts` — charge les décisions de l'officine avant l'analyse.
- `src/app/api/agent/conseil/route.ts` + `src/core/counter/notice.ts` — le champ `trusted` : un conseil du moteur (origine
  `AI`) dont la règle n'est pas validée n'entre pas dans l'avis du poste.
- Table `AdviceRuleReview` (migration `20261018090000_revue_des_regles_de_conseil`, additive), vidée par la réinitialisation
  de l'officine de démonstration.

## Vérifié

Essai de bout en bout sur le parcours du poste (scan d'amoxicilline) : aucune règle relue → avis vide ; règle
« Tolérance digestive pendant l'antibiothérapie » validée → « Flore Équilibre 10 milliards » ; refusée → plus rien.
Tests : `rule-review.test.ts`, `advice-rule-reviews.test.ts`, `notice.test.ts`.

## Reste à faire

La **relecture clinique elle-même** : lire les 46 règles et décider. La règle « Hygiène bucco-dentaire / bouche sèche »
(`dry-mouth-hygiene`) reste trop large (le libellé générique « hygiène bucco-dentaire » la déclenche) : à resserrer sur
« bouche sèche » / « salive » avec l'accord du pharmacien.
