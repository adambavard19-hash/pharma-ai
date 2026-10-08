# Conseil vétérinaire — antiparasitaires chien et chat

État : **en développement seulement.** Règles écrites et testées, **relecture par un
pharmacien en attente**. Aucune migration, aucune variable d'environnement.

## Ce que fait PharmaBoost

Un produit pour animaux bipé ou saisi au comptoir (« SPOT ON CHIEN 10-25KG 4 PIP »,
« SHAMPOOING ANTIPUCES CHAT »…) est reconnu à son **libellé**. Le comptoir affiche alors
des cartes de vigilance sourcées, au lieu d'un avertissement « absent du référentiel ».

| Carte | Quand | Ce qu'elle dit |
|---|---|---|
| **Danger pour le chat** (alerte sécurité) | antiparasitaire cutané pour **chien** (sans « chat » dans le libellé) | les produits pour chiens à base de perméthrine sont toxiques pour le chat ; la question du chat au foyer ; l'écart entre animaux jusqu'au séchage ; le geste en cas d'exposition |
| Bon usage — espèce, poids, âge | tout antiparasitaire cutané | un produit pour chien ne va pas à un chat ni à un lapin (fipronil) ; mésusage = cause fréquente des effets graves |
| Bon usage — éviter le léchage | pipette / spot-on | appliquer au site prévu, séparer les animaux traités |
| Bon usage — risque de surdosage | spray, poudre, shampooing | formes non unidoses, respecter les conditions d'emploi |
| Bon usage — protéger la famille | tout antiparasitaire cutané | ne pas manipuler l'animal plusieurs heures, ne pas le laisser dormir avec les enfants |

## Sources (lues en entier)

- ANSES, « Ne traitez pas votre chat avec un antiparasitaire pour chien » (mise à jour du 05/05/2021).
- ANSES-ANMV, « Effets indésirables des antiparasitaires externes en application cutanée
  chez les animaux domestiques : respecter les précautions d'usage » (septembre 2022).

## Ce qui n'est PAS fait, et pourquoi

- **Aucune association « conseillée »** (shampooing, spray habitat, vermifuge avec l'antipuces) :
  aucune de ces deux publications n'en recommande, et le texte d'un RCP de produit n'a pas été lu
  (le site européen bloque la lecture automatique, l'index ANMV ne retrouve pas « Deltatic »
  par son nom). L'écran dit « Aucun complément pertinent identifié » — c'est vrai.
- **Aucune vigilance sur les vermifuges en comprimé** : les publications portent sur
  l'application cutanée. Ils sont reconnus (plus d'avertissement « absent du référentiel »,
  plus de classement par l'IA parmi les médicaments humains), sans carte.
- **Rien n'est déduit d'une marque.** « ADVANTIX 25-40 kg » ou « FRONTLINE COMBO » sans espèce ni
  mot d'antiparasitaire ne sont pas reconnus. Ajouter une marque suppose de lire son RCP.

## Garde-fous

- Une espèce **écrite** dans le libellé est indispensable : la perméthrine existe aussi dans un
  produit humain (gale) qui ne doit jamais déclencher ces cartes.
- Croquettes, shampooing ordinaire, tire-tique, collier élisabéthain : jamais reconnus.
- Un produit vétérinaire n'est jamais envoyé à l'IA de compréhension, ne reçoit aucune
  explication « patient » et ne déclenche aucune règle de conseil du médicament humain
  (le conseil anti-poux, par exemple) : sa fiche est vide (ni ATC, ni classe).
- Une ligne rattachée au catalogue national (CIP) ou dotée d'une fiche n'est jamais vétérinaire.

## Où est le code

- `src/core/ai/engines/veterinary.ts` — lecture du libellé (espèce, forme, substances).
- `src/core/ai/engines/vigilance-veterinaire.ts` — les cinq règles et leurs sources.
- `src/core/ai/engines/vigilance.ts` — critère `veterinary` des règles, séparation stricte des deux mondes.
- `src/server/services/analysis.ts` — reconnaissance avant la compréhension.
- `src/core/ai/__tests__/veterinaire.test.ts` — 18 tests, dont l'analyse complète.

## Pour aller plus loin

Il faut le **texte des RCP** (ou la liste d'associations du pharmacien) : pour chaque produit,
substance, espèces, contre-indications. Sans lui, on n'écrit pas de conseil. Une association
« déconseillée » ou « conseillée » vétérinaire suit la même règle que les autres : sourcée,
versionnée, `PENDING` jusqu'à validation.
