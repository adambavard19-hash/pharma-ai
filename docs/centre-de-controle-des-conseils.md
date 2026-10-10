# Le centre de contrôle des conseils

**Une seule fois, pour toutes les pharmacies.** Les règles de conseil, les conseils ajoutés et les associations de
PharmaBoost se gèrent à un seul endroit : la console super admin → **Conseils** (`/admin/conseils`). La pharmacienne qui
relit (Donna) y **valide**, **supprime** ou **ajoute**. Chaque geste vaut pour les pharmacies qui existent et celles à venir,
à la vente suivante : l'analyse relit la décision à chaque passage, rien n'est mis en mémoire.

## Ce qu'une pharmacie reçoit, sans rien régler

Une pharmacie est opérationnelle dès l'envoi de son stock : le stock importé est étiqueté et classé automatiquement
(`stock-import.ts`), les règles du moteur vivent dans le code (`ADVICE_RULES`, 46), les décisions centrales s'y ajoutent. Le
titulaire n'a **aucun** écran de règles : son espace garde ce qu'il écrit lui-même — « Mes associations » et « Paramètres →
Mes préférences » (privilégier ou ne plus proposer une référence, une catégorie, un laboratoire).

## Les trois états

| État | Sens | Effet |
| --- | --- | --- |
| **En ligne · à relire** | l'état de départ de toute règle | elle parle déjà, partout |
| **Validé** | relu et validé : nom, date, version de la règle | idem ; une règle réécrite depuis (version) redevient « à relire » |
| **Supprimé** | décision explicite | elle n'existe plus dans PharmaBoost, nulle part (écran de la vente comme fenêtre du poste). « Rétablir » la remet en ligne |

Les règles du code ne sont **pas** marquées « validées par Donna » tant qu'elle ne l'a pas fait : « en ligne » veut dire « elle
parle », pas « un pharmacien l'a relue » — c'est ce que dit l'état « à relire ».

## Ajouter

- **Un conseil** : nom, type (tolérance ou confort — jamais sécurité, qui reste dans le code), codes ATC et/ou classes
  thérapeutiques des médicaments concernés, catégorie et étiquettes du produit à conseiller (prises dans le vocabulaire que
  les règles connaissent : impossible d'en inventer), question facultative, raison en une ligne (`{drug}`), phrase à dire
  (`{product}` obligatoire), texte du patient, source, précautions. Il suit les mêmes garde-fous qu'une règle du code : stock,
  sécurité, ordonnance, règle plus précise. Validation : `parseCustomRuleDefinition` (`core/ai/central-advice.ts`).
- **Une association** : un médicament (catalogue national, reconnu par son nom sans la forme) ou un produit (code-barres) en
  appelle un autre produit (code-barres), avec une phrase facultative. Chaque pharmacie retrouve le produit conseillé dans
  SON stock par le code-barres et ne le propose que si elle l'a ; les associations de l'officine passent avant les communes ;
  la carte dit « Association PharmaBoost avec … ».

## Où c'est branché

- Tables `central_advice_rules` (décisions + conseils ajoutés) et `central_associations` — migration
  `20261019090000_centre_de_controle_des_conseils` (additive ; elle supprime aussi la table provisoire
  `advice_rule_reviews` de la migration `20261018090000`, jamais publiée, donc vide).
- `src/core/ai/central-advice.ts` (pur : états, validation, conversion en règle du moteur), `central-advice-constants.ts`
  (constantes lues par l'écran), `src/server/services/central-advice.ts` (décisions, ajouts, recherches),
  `src/server/actions/admin-central-advice.ts` (barrière `requirePlatformSession`, vérifiée par
  `admin-actions-session.test.ts`), `src/app/(admin)/admin/conseils/`.
- Moteur : `detectAdviceOpportunities({ disabledRuleKeys, extraRules })` ; `analysis.ts` charge `loadCentralAdvice()` ;
  `product-associations.ts` (`loadCentralRules`) pose les associations communes sur le stock de l'officine ;
  `/api/agent/conseil` n'affiche pas, dans la fenêtre du poste, un conseil de règle supprimée (`trusted`).
- Traçabilité : journal d'audit `central_advice.rule_decided | rule_created | association_created | association_decided`,
  avec l'identifiant de l'administrateur.

## Vérifié (8-9 oct. 2026)

Dans l'aperçu, avec un compte super admin temporaire (supprimé ensuite) : valider, supprimer (avec confirmation), rétablir,
ajouter un conseil, ajouter une association. Sur le parcours du poste : la règle « confort gastrique sous anti-inflammatoire »
supprimée n'a plus parlé pour l'ibuprofène ; le conseil ajouté a parlé pour l'amoxicilline ; l'association Coryzalia → sirop a
atteint une vraie officine par un bip. Espace titulaire : plus aucun écran de règles.

## Reste à faire

- Relire les 46 règles avec Donna et les valider ou les supprimer (la plus urgente : « bouche sèche / hygiène
  bucco-dentaire », `dry-mouth-hygiene`, trop large).
- Modifier un conseil ajouté : pour l'instant on le supprime et on en écrit un autre.
- Créer le compte super admin de Donna en production (équipe PharmaBoost).
- Les vigilances de sécurité (contre-indications, interactions) restent écrites dans le code : elles ne se suppriment pas depuis
  la console.

## Ce qu'on déconseille, au même endroit (10 oct. 2026)

L'onglet **« À ne pas associer »** de Conseils & associations liste toutes les vigilances du moteur (contre-indiqué, à éviter, à espacer, surveillance, bon
usage), avec leur source et les produits qu'elles écartent des propositions. Lecture seule : elles sont écrites dans le code. Voir `conseil-peau-series-1-3-4-5.md`.
