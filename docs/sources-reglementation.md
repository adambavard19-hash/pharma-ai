# Réglementation au comptoir — sources et méthode

L'onglet Réglementation et le bloc « Réglementation avant facturation » de
l'écran de vente ne disent que ce que deux sources officielles publient.

## Sources

| Information | Source | Comment on la lit |
| --- | --- | --- |
| Conditions de prescription et de délivrance (« stupéfiants », « liste I », « prescription initiale hospitalière annuelle », « prescription réservée aux spécialistes… », « prescription limitée à 4 semaines », « délivrance fractionnée de 7 jours »…) | Base de données publique des médicaments, fichier `CIS_CPD_bdpm.txt` (ANSM) | `npm run bdpm:sync`. Libellés repris mot pour mot dans `DrugPrescriptionCondition`. |
| Statut « médicament d'exception », homologation aux assurés sociaux (dates de début et de fin, motif) | Base des médicaments et informations tarifaires (BdM_IT), Assurance Maladie — fiche par code CIP | `npm run reglementation:sync`. Le module de téléchargement CIP de la base « n'est pas opérationnel à ce jour » : on lit la fiche de chaque boîte remboursable (`DrugCoverageStatus`), à quelques requêtes par seconde. |
| Règles de droit commun citées dans les alertes | Code de la santé publique (R. 5132-5, R. 5132-21, R. 5132-22, R. 5132-29, R. 5132-30, R. 5132-33 ; R. 5121-77 et suivants), Code de la sécurité sociale (R. 163-2), arrêté du 17 juillet 2012 (Cerfa 12708*02) | Citées à chaque alerte, avec le lien Légifrance. |

## Traduction en gestes de comptoir

`src/core/regulation/rules.ts` traduit chaque libellé en une alerte à trois
niveaux :

- **Rejet sans cela** : ordonnance de médicament d'exception, ordonnance
  sécurisée, médicament réservé à l'hôpital, durée prescrite au-delà du maximum
  publié.
- **À vérifier** : prescription initiale hospitalière (et sa durée de validité),
  qualification du prescripteur, surveillance particulière, document patient
  (accord de soins, attestation, carnet), dépistage DPD, durée limitée,
  délivrance fractionnée, fin de prise en charge annoncée.
- **Bon à savoir** : listes I et II, conditions publiées sans geste associé
  (montrées telles quelles).

Une condition inconnue n'est jamais tue : elle s'affiche mot pour mot.

## Journal des évolutions

`DrugRegulationChange` enregistre ce qui change entre deux lectures :
statut d'exception qui bascule, fin d'homologation qui change, condition de
prescription ajoutée ou retirée. Le premier import d'une boîte n'est pas une
évolution.

## Ce que l'on ne fait pas

- Aucune règle déduite d'un nom de molécule : si l'ANSM ou l'Assurance Maladie
  ne le publie pas, PharmaBoost ne le dit pas.
- Aucun texte d'arrêté recopié de mémoire : les alertes citent l'article, pas
  son contenu supposé.
- La synchronisation de la base tarifaire se relance à la main (`npm run
  reglementation:sync`) ; elle n'est pas encore planifiée en production.
