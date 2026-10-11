# L'arbre de questions du comptoir (agent 0.9.2)

Retour d'officine du 10 octobre 2026 : un Fervex bipé avait déclenché « Thérapearl dos », sans rapport. Deux causes : le Fervex
contient du paracétamol, donc le moteur le prenait pour un antalgique ; et la règle « chaud/froid » proposait une poche ciblée sans
avoir demandé OÙ le patient avait mal.

## Ce que fait PharmaBoost maintenant

**Un médicament ne dit pas, à lui seul, ce que le patient a.** Pour un paracétamol (seul), de l'aspirine, un anti-inflammatoire ou un
myorelaxant, la bannière du poste (et l'écran de la vente) pose d'abord :

> Pourquoi le patient prend-il DOLIPRANE 1000 mg ? — **Fièvre** · **Mal de tête** · **Douleur localisée** · **Autre raison**

Les choix se cochent plusieurs fois : la fièvre et la douleur sont deux branches **indépendantes**.

- **Douleur localisée** → « Où le patient a-t-il mal ? » : Dos · Nuque · Épaule · Genou · Hanche · Cheville · Ailleurs. Chaque zone propose
  **sa** poche chaud/froid (Thérapearl dos, genou, hanche, cheville… la gamme existe par zone) ; « Ailleurs » une poche multi-zones. Aucune
  poche n'est proposée avant la zone, jamais celle d'une autre zone, jamais un masque pour les yeux ni un produit enfant.
- **Fièvre** → « Le patient a-t-il un thermomètre ? » (non : un thermomètre est proposé) et « Depuis combien de temps ? » (3 jours ou plus :
  « orienter vers le médecin », une phrase, jamais un produit).
- **Mal de tête** → une phrase d'orientation (« inhabituel, brutal ou répété : médecin »), pas de produit.

Décocher « douleur localisée » referme « où » et efface la zone. Les réponses se donnent dans la bannière **ou** sur l'écran de la vente : même
arbre, même état.

Un Fervex (ou Dolirhume, Humex, Actifed) n'ouvre **pas** cet arbre : c'est un traitement du rhume, pas un antalgique.

## Le paracétamol : 3 g par jour au maximum

Sur la bannière, en alerte (pas seulement sur l'écran de la vente) :

- **Fervex** : « contient déjà du paracétamol (500 mg par sachet, 3 sachets au plus). Si le patient ajoute un autre produit au paracétamol
  (Doliprane, Dafalgan, Efferalgan…), le total ne doit pas dépasser **3 g par jour** chez l'adulte : 1 g par prise au plus, une prise toutes
  les 6 heures environ (4 heures au minimum, selon la notice). »
- **Fervex ET Doliprane dans la même vente** : une alerte « les doses s'additionnent », avec les deux noms.
- **Paracétamol seul** : le même plafond, en rappel (information, pas alerte).

Les RCP disent 4 heures au minimum entre deux prises (Doliprane 1000 mg : 1 g par prise, 3 g par jour ; Fervex adultes : 3 sachets au plus) ;
la consigne du pharmacien est 6 heures : la phrase garde les deux.

## Comment c'est construit

- `src/core/counter/question-tree.ts` : l'arbre (questions, choix, ce que chaque choix ouvre ou débloque), pur, testé. `tree-state.ts` : ce
  qui est visible pour une vente.
- `src/core/ai/engines/pain-zones.ts` : les conseils du bout des branches (une règle par zone, + « ailleurs », + le thermomètre). Ils sont
  appariés au stock dès le bip mais **cachés** tant que la question n'est pas répondue ; ils passent après les conseils visibles.
- Base : table `counter_question_answers` (une ligne par vente et par question, des clés de choix — jamais de texte libre). Un conseil
  débloqué est aussi marqué « oui » sur l'écran de la vente.
- Poste : le mot `REPONSE vente question:choix` ; la bannière dessine les questions (un bouton par choix, le choix coché est plein) et se
  met à jour tout de suite ; l'ancienne fenêtre de secours ne dessine pas les questions (donc ne montre aucun produit ciblé).
- Aperçu pour Mac et page du site : l'étape « 7 · Une question à poser » (un DOLIPRANE seul). Sur le site, le scénario la joue tout
  seul : « Douleur localisée », puis « Dos », et la poche du dos apparaît (nom générique, « POCHE CHAUD/FROID DOS », jamais une marque).
  Les phrases d'orientation (mal de tête, fièvre), encore à relire, ne s'affichent que si le visiteur touche ces choix lui-même.
  Les poches et le thermomètre de la démonstration sont ceux que la vraie analyse apparie au bip sur un rayon d'exemple, avec la
  raison écrite par leur règle (« Antalgique ou anti-inflammatoire (PARACETAMOL) : pour une douleur au dos… ») : rien n'est tapé à
  la main (`demoSales()` dans `agent/src/banner-preview.ts`). Avec « réduire les animations » sur l'appareil du visiteur, rien ne
  joue tout seul : la vente sur ordonnance est montrée ouverte, et « Scénario complet » la fait jouer une fois.

## Prouvé / pas prouvé

Prouvé sur la vraie base locale (`npm run essai:arbre`) : un Doliprane bipé ne montre aucune poche ; « douleur localisée » puis « dos » fait apparaître
la poche du dos seule ; décocher la referme ; une autre officine ne peut pas répondre ; un Fervex réel ne montre aucune poche et porte l'alerte des 3 g.
Vu dans le navigateur : l'écran de la vente (question → zone → poche du dos), l'aperçu de la bannière et la démonstration du site (navigateur sans
fenêtre, cadres de 1112, 700 et 350 px : rien de rogné, aucune barre de défilement dans le cadre).
**Pas prouvé** : le dessin des questions sur un vrai Windows (la bannière n'a jamais été vue sur Windows) ; la phrase du mal de tête et celle de la fièvre
sont à relire par la pharmacienne (toutes les règles restent « à relire »).

## Défaut corrigé au passage

La recherche d'un médicament dans la couche éditoriale lisait « FERVEX » comme du **fer** (« fervex » commence par « fer », la DCI du fumarate de fer) :
plus de conseil sur le fer pour un Fervex, et les mises en garde du paracétamol se déclenchent. Un début de nom doit faire six lettres au moins.
