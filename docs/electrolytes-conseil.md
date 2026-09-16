# Électrolytes de réhydratation — ce que le moteur applique

D'après le document de travail du pharmacien associé « Médicaments et
électrolytes — associations possibles, conditions de conseil et situations
nécessitant une validation pharmaceutique » et sa note de synthèse (17
septembre 2026). Sources citées par le document : VIDAL (Tiorfan et
réhydratation ; hydrochlorothiazide), Réseau français des centres de
pharmacovigilance (Médicaments et potassium).

**Principe** : les électrolytes se proposent devant des pertes hydriques
réelles. Le traitement seul ne déclenche jamais la vente.

| Situation du document | Niveau | Dans le moteur |
| --- | --- | --- |
| Racécadotril, lopéramide, diosmectite, S. boulardii, charbon (diarrhée) | 🟢/🟡 | Règle de conseil `rehydration-digestive` : question « pertes réelles ? », consignes lopéramide (ni fièvre ni sang), diosmectite et charbon (2 h d'écart) |
| Nourrisson, jeune enfant, personne âgée | 🔴 pour Hydratis/Hydrafizz | Même règle : avant 6 ans ou à partir de 75 ans, préférence pour un vrai soluté de réhydratation orale (Adiaril, Fanolyte, Viatol) et exclusion des pastilles de confort (`productPreferFor` / `productExcludeFor`) |
| GLP-1, metformine, amoxicilline-acide clavulanique, azithromycine, laxatifs (seulement s'ils provoquent réellement des pertes) | 🟡 | Même règle, déclenchée par la classe mais retenue par la question ; note « vérifier la glycémie et les sucres du produit » sous antidiabétique |
| Clindamycine (diarrhée importante) | 🟡 avis médical | Vigilance `clindamycin-diarrhea` : pas d'électrolytes ni d'antidiarrhéique en réponse |
| Colchicine (diarrhée, vomissements = surdosage) | 🟡 avis médical | Vigilance `colchicine-gi-overdose` |
| Inhibiteurs du SGLT2 | 🟠 | Vigilance `sglt2-dehydration` : rechercher soif, hypotension, pertes ; déshydratation réelle = avis médical |
| Diurétiques de l'anse et thiazidiques, acétazolamide | 🟠 | Vigilance `loop-thiazide-monitoring` : ionogramme et fonction rénale avant de compenser |
| IPP au long cours | 🟠 | Vigilance `ppi-longterm-b12-iron` : magnésémie plutôt qu'électrolytes d'office ; conseil magnésium avec question (`magnesium-ppi-longterm`) |
| Lithium | 🟠/🔴 | Vigilance `lithium-calcium` : sodium et hydratation modifient la lithémie, avis avant de proposer |
| Digoxine, antiarythmiques | 🟠 | Vigilance `digoxin-antiarrhythmic-electrolytes` : pas de correction empirique |
| AINS pendant diarrhée, vomissements ou forte chaleur | 🟠 | Rappel de bon usage `usage-nsaid-with-food` enrichi : risque rénal, hydrater et réévaluer l'AINS |
| IEC, ARA II, spironolactone, éplérénone, amiloride, drospirénone, chlorure de potassium | 🔴 | Vigilance `potassium-hyperkaliemia` : les produits étiquetés « réhydratation » (Hydratis, Hydrafizz, SRO contiennent du potassium) ne sont jamais proposés automatiquement ; validation pharmaceutique (fonction rénale, kaliémie, autres traitements, quantité de potassium) |

## Ce que le moteur ne fait pas

- Il ne vend pas d'électrolytes sur la seule présence d'un médicament : la
  question sur les pertes réelles conditionne la proposition.
- Il ne corrige pas un trouble électrolytique : sous diurétique, digoxine ou
  lithium, la carte renvoie au bilan et au prescripteur.
- Il ne masque pas un signal : sous colchicine ou clindamycine, les troubles
  digestifs sont d'abord un motif d'avis médical.

## Reconnaissance des produits

Le vocabulaire reconnaît Hydratis, Hydrafizz, Adiaril, Fanolyte, Viatol,
Hydranova, « SRO », « électrolytes », « sels de réhydratation » sous
l'étiquette `réhydratation`. Après tout ajout : `npm run` du script
`rafraichir-etiquettes --toutes`, en local et en production.
