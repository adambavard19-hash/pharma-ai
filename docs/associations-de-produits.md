# Associations de produits — un produit conseil en appelle un autre

État : la première version (déclencheur = un produit du stock) est **en ligne** depuis le 8 octobre 2026. La suite — le
déclencheur peut aussi être **un médicament du catalogue national** (Coryzalia, Oscillococcinum…) — est **en développement
seulement** : une migration (`20261017090000_associations_depuis_un_medicament`, additive : une colonne, deux index, une
contrainte) est à passer sur la base de production avec la publication. Essayé pour de vrai en local avec le code CIP réel
de Coryzalia ; jamais sur le poste de caisse Windows.

## Les deux axes du conseil

| Axe | Qui décide | Exemple |
|---|---|---|
| **1. Un médicament déclenche un produit conseil** | le moteur (règles de conseil, sources officielles) | amoxicilline → spray nasal |
| **2. Un produit conseil en appelle un autre** | **le pharmacien** (cet écran) | spray nasal → Olioseptil Bronche |

Le second axe marche **sans médicament** : une vente spontanée (un produit bipé au comptoir, sans ordonnance) suffit.

**Le déclencheur** est au choix : **un produit de mon stock** (spray nasal, Olioseptil…), ou **un médicament** du catalogue
national. Un médicament conseil comme Coryzalia ou Oscillococcinum se lit par son **code CIP** : il est au catalogue
national, pas dans le stock de l'officine, donc il fallait pouvoir partir de lui. L'association vaut pour **toutes les
formes** du même nom (« CORYZALIA, comprimé orodispersible » et « CORYZALIA, solution buvable ») ; le dosage, lui, fait partie
du nom (DOLIPRANE 500 mg ≠ DOLIPRANE 1000 mg).

## Où cliquer

Menu **Ma pharmacie → Mes associations** (pharmacien et titulaire). On choisit :
1. *Quand ce produit / ce médicament est dans la vente* — le déclencheur : onglet **« Un produit de mon stock »** (recherche
   par nom, marque, référence, EAN) ou onglet **« Un médicament »** (recherche au catalogue national, par nom ou substance) ;
2. *PharmaBoost propose ce produit* — le produit conseillé ;
3. facultatif : *Ce que vous dites au patient* (240 caractères) — vos mots, repris tels quels sur la carte.

La liste est groupée par produit déclencheur. Chaque association se **suspend** (interrupteur), se **modifie** (phrase) ou
se **supprime**. On enchaîne souvent plusieurs conseils pour un même déclencheur : le déclencheur reste choisi.

## Ce qui se passe à la vente

Au bip d'un déclencheur (produit du stock ou médicament, dès qu'il est une ligne confirmée de la vente), l'analyse ajoute à la trace une étape
**« Associations de l'officine »** (visible dans « Comment l'analyse s'est déroulée ») et une carte **« Conseil associé »**
apparaît sous le produit : « À proposer avec ce produit », la phrase du pharmacien, le prix, la marge, le stock, et les mêmes
gestes que tout conseil (proposer, changer de référence, ignorer). Accepté, il passe en **Délivrance** et compte comme
conseil PharmaBoost dans le suivi de performance (origine « règle de l'officine »).

## Les garde-fous : une association ne contourne rien

Le produit conseillé n'est **pas proposé** — et la raison est écrite dans la trace — quand :
- il est **en rupture** de stock ;
- le **moteur de sécurité l'a écarté pour ce patient** (contre-indication déclarée sur la fiche, vigilance, interaction) ;
- c'est un **médicament à prescription obligatoire** ou un produit du catalogue national : jamais en vente additionnelle ;
- il est **déjà dans la vente**, ou **déjà proposé** par le moteur : pas deux cartes pour la même référence ;
- il n'est plus au catalogue de l'officine ou a été désactivé.

Rien n'est généré : sans phrase du pharmacien, la carte dit « Avec « X », je peux aussi vous proposer « Y ». », sans aucune
allégation de santé. Les précautions et vigilances de la **fiche produit** restent affichées sur la carte. Au plus **3
associations par vente**. Les associations passent en dernier : un besoin clinique garde toujours la priorité.

## Comment le produit de la vente est reconnu

Un bip de parapharmacie garde l'EAN de la ligne : on retrouve le produit par son code appris au comptoir, par son EAN, à
défaut par son **nom exact** (sans casse ni accents). Seuls les produits déclencheurs d'une association sont cherchés.

## La fenêtre du poste de caisse et les produits « écartés »

L'analyse écarte, pour chaque vente, des produits du catalogue qu'elle ne proposera pas (substance déjà dans la vente,
allergie, grossesse, ordonnance obligatoire…) et note pourquoi. Ces notes restent sur l'écran complet de la vente ; elles
**n'apparaissent plus dans la fenêtre du poste** : elles ne parlent pas de ce que le client emporte. Et leur texte dit
désormais « déjà présent dans cette délivrance » (une vente bipée n'a pas d'ordonnance).

## Pas encore (à décider)

- **Chaîner depuis un conseil accepté** : amoxicilline → spray (proposé par le moteur) → Olioseptil. Aujourd'hui seul un
  produit **dans la vente** (bipé) déclenche une association ; un conseil simplement proposé ou accepté ne le fait pas.
- Choisir l'**ordre** des conseils d'un même déclencheur (c'est l'ordre de création) ; importer des associations en lot ;
  une association dans les deux sens en un geste ; des associations propres à un patient.
- La carte sur le **poste de caisse** (notification Windows) reprend les conseils de la vente, dont les associations : non
  vérifié sur un vrai poste.

## Où est le code

- `src/core/ai/engines/associations.ts` — le moteur pur (`buildAssociationAdvice`) ; branché dans `src/core/ai/pipeline.ts`
  (étape `PRODUCT_ASSOCIATIONS`, après l'optimisation commerciale).
- `src/core/associations/rules.ts` — ce qu'on peut écrire (phrase, produit ≠ lui-même).
- `src/server/services/product-associations.ts` — lecture pour le moteur, création, modification, suppression (toujours dans
  l'officine du demandeur) ; `src/server/actions/associations.ts` — les gestes, permission « règles de conseil ».
- `src/app/(app)/associations/` — l'écran ; table `product_associations` (`ProductAssociation`).
- Tests : `src/core/ai/__tests__/associations.test.ts`, `src/core/associations/__tests__`, `src/server/services/__tests__/product-associations.test.ts`.
