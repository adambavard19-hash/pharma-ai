# La revue des conseils (facultative)

Le moteur compte 46 règles de conseil (`ADVICE_RULES`, `src/core/ai/engines/advice.ts`). Elles vivent **dans le code** : toute
officine, dès que son stock est envoyé, en bénéficie sans rien régler (le stock importé est étiqueté et classé
automatiquement, voir `stock-import.ts`). **Aucune pharmacienne n'a de prérequis à remplir.**

Aucune règle n'a encore été relue par un pharmacien (`validation.status: "PENDING"`). La qualité des règles se corrige donc
**au centre, dans le code, pour toutes les officines à la fois** (règle resserrée, règle retirée, classe mal lue…). La revue
décrite ici n'est qu'un outil en plus, pour qu'une officine ajuste SES réglages.

## Où cliquer

Paramètres → **Règles de conseil** → onglet **Revue des conseils**.

Chaque règle est dite en clair : *quand elle se déclenche*, *ce qu'elle propose*, *ce que vous diriez* (et, dans « Voir le
détail », la raison affichée, la question au patient et les précautions). Trois gestes :

| Bouton | Effet |
| --- | --- |
| **Refuser** | la règle ne se déclenche **plus jamais** dans cette officine (ni à l'écran, ni au poste) |
| **Valider** | une trace signée et datée : « je cautionne cette règle » — aucun effet sur ce qui s'affiche |
| **Annuler ma décision** | efface la décision : la règle fonctionne comme pour toutes les officines |

Qui a décidé et quand est affiché sur la carte et gardé dans le journal d'audit (`advice_rule.reviewed`). Permission :
`RECOMMENDATION_RULES_MANAGE` (titulaire, pharmacien).

## Ce que cela change

| Décision de l'officine | Écran complet de la vente | Fenêtre du poste de caisse |
| --- | --- | --- |
| Aucune (par défaut) | oui | oui |
| Validée | oui | oui |
| Refusée | non | non |

Les **associations de l'officine** (« Mes associations », origine `RULE`) et les ajouts manuels s'ajoutent toujours.

Une règle **modifiée** depuis la décision (sa `version` change) redevient « pas relue » et le dit (« Modifiée depuis votre
relecture ») : on ne garde pas un accord donné pour un texte qui n'existe plus.

> Piège évité le 8 oct. 2026 : une première version faisait taire la fenêtre du poste tant que la pharmacienne n'avait pas
> validé les règles — une nouvelle officine aurait eu une fenêtre vide. Corrigé : le refus est l'exception, pas la validation.

## Où c'est branché

- `src/core/ai/rule-review.ts` — états, `disabledRuleKeys` (règles refusées), `mayShowAtCounter` (vrai sauf règle refusée ou inconnue).
- `src/server/services/advice-rule-reviews.ts` + `src/server/actions/advice-rules.ts` — lecture / décision, par officine.
- `src/core/ai/pipeline.ts`, `engines/advice.ts` — les règles refusées ne sont pas évaluées.
- `src/server/services/analysis.ts` — charge les décisions de l'officine avant l'analyse.
- `src/app/api/agent/conseil/route.ts` + `src/core/counter/notice.ts` — le champ `trusted` : un conseil du moteur (origine
  `AI`) dont la règle est refusée ou inconnue n'entre pas dans l'avis du poste.
- Table `AdviceRuleReview` (migration `20261018090000_revue_des_regles_de_conseil`, additive), vidée par la réinitialisation
  de l'officine de démonstration.

## Vérifié

Essai de bout en bout sur le parcours du poste (scan d'amoxicilline) : sans aucune décision → « Flore Équilibre 10 milliards » ;
règle antibiotique refusée → plus rien ; remise à zéro → il revient. Tests : `rule-review.test.ts`,
`advice-rule-reviews.test.ts`, `notice.test.ts`.

## Reste à faire — au centre

- Relire les 46 règles avec un pharmacien et les marquer `VALIDATED` dans le code (ou les resserrer / retirer).
- La règle « Hygiène bucco-dentaire / bouche sèche » (`dry-mouth-hygiene`) est trop large (le libellé générique « hygiène
  bucco-dentaire » la déclenche) : à resserrer sur « bouche sèche » / « salive ».
- Bug trouvé et corrigé le 8 oct. 2026 : une classe « Antalgique antipyrétique **non** opioïde » (écrite par le modèle pour le
  Doliprane 100 mg) déclenchait la règle de constipation sous opioïde. `classNames` (advice.ts) ignore désormais un terme
  précédé de « non », « sans », « pas d' », « aucun » ; test `class-negation.test.ts`.
