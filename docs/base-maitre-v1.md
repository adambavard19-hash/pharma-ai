# Connecteur Pharma — Base maître V1 — correspondance avec le moteur

Classeur reçu le 2026-09-17, 100 règles. Chaque ligne du classeur est portée par une ou plusieurs règles du moteur (`src/core/ai/engines/vigilance-base-maitre.ts`, `vigilance.ts`, `advice.ts`). Le test `src/core/ai/__tests__/base-maitre.test.ts` interdit qu'une ligne disparaisse.

Lecture des niveaux du classeur dans le moteur : 🔴 BLOCAGE → référence jamais proposée (`blockTags`) ; 🔴 INTERACTION → proposée avec la consigne d'espacement (`cautionTags`) ; 🟠 SURVEILLANCE → carte de surveillance ; 🟡 DÉPISTAGE → carte de dépistage, sans proposition automatique ; 🟢 CONSEIL → règle de conseil.

| # | Déclencheur | Conseil / complément | Niveau classeur | Statut classeur | Règle(s) du moteur |
| --- | --- | --- | --- | --- | --- |
| 1 | Amoxicilline | Probiotique à souche documentée | 🟢 CONSEIL | À paramétrer | `digestive-tolerance-antibiotics` (conseil) |
| 2 | Amoxicilline + acide clavulanique | Probiotique à souche documentée | 🟢 CONSEIL | À paramétrer | `digestive-tolerance-antibiotics` (conseil) |
| 3 | Antibiothérapie prolongée | Vitamine K / alimentation | 🟠 SURVEILLANCE | À valider | `anticoagulant-millepertuis` |
| 4 | Ésomprazole | Magnésium | 🟠 SURVEILLANCE | Validé source | `magnesium-ppi-longterm` (conseil) |
| 5 | Oméprazole | Magnésium | 🟠 SURVEILLANCE | Validé source | `magnesium-ppi-longterm` (conseil) |
| 6 | Pantoprazole | Magnésium | 🟠 SURVEILLANCE | Validé classe | `magnesium-ppi-longterm` (conseil) |
| 7 | Lansoprazole | Magnésium | 🟠 SURVEILLANCE | Validé source | `magnesium-ppi-longterm` (conseil) |
| 8 | IPP au long cours | Vitamine B12 | 🟡 DÉPISTAGE | Validé source | `ppi-longterm-b12-iron` |
| 9 | IPP + carence martiale connue | Fer | 🟠 SURVEILLANCE | Validé source | `ppi-longterm-b12-iron` |
| 10 | Metformine | Vitamine B12 | 🟡 DÉPISTAGE | Validé source | `metformin-b12` |
| 11 | Furosémide | Magnésium | 🟠 SURVEILLANCE | Validé source | `loop-thiazide-monitoring` |
| 12 | Furosémide | Potassium | 🔴 SÉCURITÉ | Validé source | `loop-thiazide-monitoring` |
| 13 | Hydrochlorothiazide | Magnésium | 🟠 SURVEILLANCE | Validé source | `loop-thiazide-monitoring` |
| 14 | Thiazidiques | Potassium | 🔴 SÉCURITÉ | Validé source | `loop-thiazide-monitoring` |
| 15 | Thiazidiques au long cours | Zinc | 🟠 SURVEILLANCE | Validé source | `loop-thiazide-monitoring` |
| 16 | Spironolactone | Potassium | 🔴 BLOCAGE | Validé source | `potassium-hyperkaliemia` |
| 17 | Amiloride | Potassium | 🔴 BLOCAGE | Validé source | `potassium-hyperkaliemia` |
| 18 | IEC (ramipril, périndopril, énalapril…) | Potassium | 🔴 BLOCAGE | Validé source | `potassium-hyperkaliemia` |
| 19 | ARA2 (losartan, candésartan, valsartan…) | Potassium | 🔴 BLOCAGE | Validé source | `potassium-hyperkaliemia` |
| 20 | Prednisone / prednisolone au long cours | Vitamine D / santé osseuse | 🟡 DÉPISTAGE | Validé source | `systemic-corticosteroid-bone-licorice`, `vitamin-d-elderly` (conseil) |
| 21 | Corticothérapie systémique prolongée | Calcium / vitamine D | 🟡 DÉPISTAGE | Validé source | `systemic-corticosteroid-bone-licorice`, `vitamin-d-elderly` (conseil) |
| 22 | Carbamazépine au long cours | Vitamine D | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 23 | Phénytoïne au long cours | Vitamine D | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 24 | Phénobarbital au long cours | Vitamine D | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 25 | Primidone au long cours | Vitamine D | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 26 | Valproate au long cours | Vitamine D / santé osseuse | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 27 | Orlistat | Multivitamines A-D-E-K | 🟢 CONSEIL | Validé source | `orlistat-fat-soluble-vitamins` (conseil) |
| 28 | Cholestyramine | A-D-E-K | 🟠 SURVEILLANCE | Validé source | `bile-acid-sequestrant-vitamins` |
| 29 | Colestipol | A-D-E-K | 🟠 SURVEILLANCE | Validé source | `bile-acid-sequestrant-vitamins` |
| 30 | Sulfasalazine | Folates / B9 | 🟡 DÉPISTAGE | Validé source | `sulfasalazine-folate` |
| 31 | Méthotrexate faible dose hebdomadaire | Acide folique | 🟢 CONTRÔLE | Validé source | `methotrexate-folate-protocol` |
| 32 | Méthotrexate oncologique | Folates | 🔴 BLOCAGE | Validé source | `methotrexate-folate-protocol` |
| 33 | Phénytoïne | Folates | 🔴 SÉCURITÉ | Validé source | `antiepileptic-nutrition-and-inducers` |
| 34 | Carbamazépine | Folates | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 35 | Valproate | Folates | 🟠 SURVEILLANCE | Validé source | `antiepileptic-nutrition-and-inducers` |
| 36 | Lévothyroxine | Calcium | 🔴 INTERACTION | Validé source | `levothyroxine-mineral-spacing` |
| 37 | Lévothyroxine | Fer | 🔴 INTERACTION | Validé source | `levothyroxine-mineral-spacing` |
| 38 | Lévodopa | Fer | 🔴 INTERACTION | Validé source | `levodopa-iron-spacing` |
| 39 | Ciprofloxacine / fluoroquinolones | Magnésium | 🔴 INTERACTION | Validé source | `cycline-quinolone-chelation` |
| 40 | Doxycycline / tétracyclines | Magnésium | 🔴 INTERACTION | Validé source | `cycline-quinolone-chelation` |
| 41 | Fluoroquinolones | Calcium | 🔴 INTERACTION | Validé source | `cycline-quinolone-chelation` |
| 42 | Quinolones / tétracyclines | Zinc | 🔴 INTERACTION | Validé source | `cycline-quinolone-chelation` |
| 43 | Bisphosphonates oraux | Magnésium | 🔴 INTERACTION | Validé source | `bisphosphonate-spacing` |
| 44 | Dolutégravir | Calcium | 🔴 INTERACTION | Validé source | `antiretroviral-cations-and-inducers` |
| 45 | Warfarine / AVK | Vitamine K | 🔴 BLOCAGE | Validé source | `anticoagulant-millepertuis` |
| 46 | Acénocoumarol | Vitamine K | 🔴 BLOCAGE | Validé source | `anticoagulant-millepertuis` |
| 47 | Acitrétine / rétinoïdes systémiques | Vitamine A | 🔴 BLOCAGE | Validé source | `isotretinoin-vigilance`, `acitretin-vitamin-a` |
| 48 | Lithium | Calcium | 🔴 SÉCURITÉ | Validé source | `lithium-calcium` |
| 49 | Thiazidique + vitamine D/calcium | Vitamine D / calcium | 🟠 SURVEILLANCE | Validé source | `loop-thiazide-monitoring` |
| 50 | Pénicillamine | Zinc | 🔴 INTERACTION | Validé source | `penicillamine-zinc-spacing` |
| 51 | Contraception hormonale systémique | Millepertuis | 🔴 BLOCAGE | À valider | `hormonal-contraception-millepertuis` |
| 52 | Ciclosporine / tacrolimus | Millepertuis | 🔴 BLOCAGE | À valider | `immunosuppressant-supplements` |
| 53 | Warfarine / AVK | Millepertuis | 🔴 BLOCAGE | À valider | `anticoagulant-millepertuis` |
| 54 | Digoxine / ivabradine | Millepertuis | 🔴 BLOCAGE | À valider | `cardiac-narrow-margin-millepertuis` |
| 55 | ISRS / IRSNa / tricycliques / IMAO | Millepertuis | 🔴 BLOCAGE | À valider | `serotonergic-antidepressant-millepertuis` |
| 56 | Phénytoïne / carbamazépine | Millepertuis | 🔴 BLOCAGE | À valider | `antiepileptic-nutrition-and-inducers` |
| 57 | Antirétroviraux sensibles aux inducteurs | Millepertuis | 🔴 BLOCAGE | À valider | `antiretroviral-cations-and-inducers` |
| 58 | Irinotécan / imatinib / docétaxel | Millepertuis | 🔴 BLOCAGE | À valider | `anticancer-supplements` |
| 59 | Simvastatine | Millepertuis | 🔴 INTERACTION | À valider | `statin-red-yeast-rice` |
| 60 | Warfarine / anticoagulants | Ginkgo biloba | 🔴 INTERACTION | À valider | `anticoagulant-millepertuis` |
| 61 | Anticoagulants oraux | Ail concentré | 🟠 SURVEILLANCE | À valider | `anticoagulant-millepertuis` |
| 62 | Aspirine / antiagrégants plaquettaires | Ail concentré | 🟠 SURVEILLANCE | À valider | `antiplatelet-bleeding-supplements` |
| 63 | Warfarine et anticoagulants similaires | Oméga-3 EPA/DHA | 🟠 SURVEILLANCE | À valider | `anticoagulant-millepertuis` |
| 64 | Anticoagulants / antiagrégants | Vitamine E forte dose | 🔴 INTERACTION | À valider | `anticoagulant-millepertuis`, `antiplatelet-bleeding-supplements` |
| 65 | Chimiothérapie / radiothérapie | Vitamine E / antioxydants | 🔴 BLOCAGE | À valider | `anticancer-supplements` |
| 66 | Chimiothérapie / radiothérapie | Vitamine C forte dose | 🔴 BLOCAGE | À valider | `anticancer-supplements` |
| 67 | Simvastatine + niacine | Vitamine E + C + sélénium + bêta-carotène | 🟠 SURVEILLANCE | À valider | `statin-red-yeast-rice` |
| 68 | Warfarine / AVK | Coenzyme Q10 | 🟠 SURVEILLANCE | À valider | `anticoagulant-millepertuis` |
| 69 | Insuline | Coenzyme Q10 | 🟠 SURVEILLANCE | À valider | `antidiabetic-glycemia-supplements` |
| 70 | Statines avec douleurs musculaires | Coenzyme Q10 | 🟡 DÉPISTAGE | À valider | `statin-red-yeast-rice` |
| 71 | Statines | Levure de riz rouge | 🔴 BLOCAGE | À valider | `statin-red-yeast-rice` |
| 72 | Metformine | Hydraste du Canada / goldenseal | 🔴 INTERACTION | À valider | `metformin-b12` |
| 73 | Insuline | Chrome | 🟠 SURVEILLANCE | À valider | `antidiabetic-glycemia-supplements` |
| 74 | Metformine / sulfamides / glinides | Chrome | 🟠 SURVEILLANCE | À valider | `antidiabetic-glycemia-supplements` |
| 75 | Lévothyroxine | Chrome | 🔴 INTERACTION | À valider | `levothyroxine-mineral-spacing` |
| 76 | Antidiabétiques | Niacine / acide nicotinique forte dose | 🟠 SURVEILLANCE | À valider | `antidiabetic-glycemia-supplements` |
| 77 | Lévothyroxine ou suivi thyroïdien | Biotine | 🟡 DÉPISTAGE | À valider | `levothyroxine-mineral-spacing` |
| 78 | Carbamazépine / phénytoïne / phénobarbital / primidone | Biotine | 🟡 DÉPISTAGE | À valider | `antiepileptic-nutrition-and-inducers` |
| 79 | Méthimazole / carbimazole | Iode / kelp | 🔴 BLOCAGE | À valider | `antithyroid-iodine` |
| 80 | IEC | Iodure de potassium | 🔴 BLOCAGE | À valider | `potassium-hyperkaliemia` |
| 81 | Spironolactone / amiloride | Iodure de potassium | 🔴 BLOCAGE | À valider | `potassium-hyperkaliemia` |
| 82 | Corticostéroïdes systémiques | Réglisse non déglycyrrhizinée | 🟠 SURVEILLANCE | À valider | `systemic-corticosteroid-bone-licorice` |
| 83 | Nadolol | Thé vert / extrait de thé vert | 🔴 INTERACTION | À valider | `green-tea-extract-interactions` |
| 84 | Atorvastatine | Extrait de thé vert | 🟠 SURVEILLANCE | À valider | `green-tea-extract-interactions` |
| 85 | Raloxifène | Extrait de thé vert | 🔴 INTERACTION | À valider | `green-tea-extract-interactions` |
| 86 | Benzodiazépines / apparentés sédatifs | Kava | 🔴 BLOCAGE | À valider | `sedative-kava` |
| 87 | Médicaments potentiellement hépatotoxiques | Kava | 🔴 BLOCAGE | À valider | `hepatotoxic-drug-supplements` |
| 88 | Ciclosporine / tacrolimus / autres immunosuppresseurs | Échinacée | 🔴 BLOCAGE | À valider | `immunosuppressant-supplements` |
| 89 | Insuline / antidiabétiques | Ginseng asiatique | 🟠 SURVEILLANCE | À valider | `antidiabetic-glycemia-supplements` |
| 90 | Anticoagulants / antiagrégants | Ginseng asiatique | 🟠 SURVEILLANCE | À valider | `anticoagulant-millepertuis`, `antiplatelet-bleeding-supplements` |
| 91 | Cyclosérine | Vitamine B6 | 🟢 CONSEIL | À valider | `usage-cycloserine-b6` |
| 92 | Phénytoïne / phénobarbital / carbamazépine / valproate | Vitamine B6 | 🟠 SURVEILLANCE | À valider | `antiepileptic-nutrition-and-inducers` |
| 93 | Théophylline | Vitamine B6 | 🟡 DÉPISTAGE | À valider | `theophylline-b6` |
| 94 | Gabapentine | Antiacide Mg/Al | 🔴 INTERACTION | À valider | `gabapentin-antacid-spacing` |
| 95 | Mycophénolate mofétil | Antiacide Mg/Al | 🔴 INTERACTION | À valider | `immunosuppressant-supplements` |
| 96 | Dolutégravir | Calcium / fer / magnésium | 🔴 INTERACTION | À valider | `antiretroviral-cations-and-inducers` |
| 97 | Drospirénone | Potassium | 🔴 BLOCAGE | À valider | `potassium-hyperkaliemia` |
| 98 | Valaciclovir | L-lysine | 🟢 CONSEIL | À valider | `herpes-lysine` (conseil) |
| 99 | Médicaments potentiellement hépatotoxiques | Extrait de thé vert | 🟠 SURVEILLANCE | À valider | `hepatotoxic-drug-supplements` |
| 100 | Médicaments potentiellement hépatotoxiques | Curcuma / curcumine biodisponible | 🟠 SURVEILLANCE | À valider | `hepatotoxic-drug-supplements` |

## Sources primaires du classeur

- **PROBIOTIQUES** — Diarrhée associée aux antibiotiques : https://pubmed.ncbi.nlm.nih.gov/40191517/
- **PROBIOTIQUES-SOUCHE** — Efficacité souche-spécifique : https://pubmed.ncbi.nlm.nih.gov/33844181/
- **MAGNESIUM** — IPP, diurétiques, antibiotiques, bisphosphonates : https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/
- **B12** — IPP et metformine : https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/
- **METFORMINE-B12** — Avis sécurité metformine/B12 : https://www.gov.uk/drug-safety-update/metformin-and-reduced-vitamin-b12-levels-new-advice-for-monitoring-patients-at-risk
- **POTASSIUM** — IEC, ARA2, diurétiques : https://ods.od.nih.gov/factsheets/Potassium-HealthProfessional/
- **VITAMINE D** — Orlistat, corticoïdes, thiazidiques : https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/
- **ANTIÉPILEPTIQUES** — Santé osseuse / vitamine D : https://www.gov.uk/drug-safety-update/antiepileptics-adverse-effects-on-bone
- **FOLATES** — Méthotrexate, antiépileptiques, sulfasalazine : https://ods.od.nih.gov/factsheets/Folate-HealthProfessional/
- **CALCIUM** — Lévothyroxine, dolutégravir, lithium, quinolones : https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/
- **FER** — Lévothyroxine, lévodopa, IPP : https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/
- **ZINC** — Antibiotiques, pénicillamine, thiazidiques : https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/
- **VITAMINE K** — AVK, antibiotiques, séquestrants biliaires : https://ods.od.nih.gov/factsheets/VitaminK-HealthProfessional/
- **VITAMINE A** — Orlistat, rétinoïdes : https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/
- **MILLEPERTUIS** — Interactions multiples: contraception, immunosuppresseurs, AVK, sérotoninergiques : https://www.nccih.nih.gov/health/st-johns-wort
- **GINKGO** — Risque de saignement avec anticoagulants : https://www.nccih.nih.gov/health/ginkgo
- **AIL** — Risque de saignement avec anticoagulants et aspirine : https://www.nccih.nih.gov/health/garlic
- **OMEGA3** — Warfarine et anticoagulants : https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/
- **VITAMINE E** — Antithrombotiques, anticancéreux et antioxydants : https://ods.od.nih.gov/factsheets/VitaminE-HealthProfessional/
- **VITAMINE C** — Chimiothérapie, radiothérapie et statines : https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/
- **COQ10** — Warfarine, insuline et données sur myalgies sous statine : https://www.nccih.nih.gov/health/coenzyme-q10
- **LEVURE RIZ ROUGE** — Monacoline K et risques de type statine : https://www.nccih.nih.gov/health/red-yeast-rice
- **HYDRASTE** — Interaction avec la metformine : https://www.nccih.nih.gov/health/goldenseal
- **CHROME** — Insuline, antidiabétiques et lévothyroxine : https://ods.od.nih.gov/factsheets/Chromium-HealthProfessional/
- **NIACINE** — Antidiabétiques et fortes doses : https://ods.od.nih.gov/factsheets/Niacin-HealthProfessional/
- **BIOTINE** — Interférences analytiques et antiépileptiques : https://ods.od.nih.gov/factsheets/Biotin-HealthProfessional/
- **IODE** — Antithyroïdiens, IEC et diurétiques épargneurs de potassium : https://ods.od.nih.gov/factsheets/Iodine-HealthProfessional/
- **RÉGLISSE** — Corticostéroïdes et glycyrrhizine : https://www.nccih.nih.gov/health/licorice-root
- **THÉ VERT** — Nadolol, atorvastatine, raloxifène et risque hépatique : https://www.nccih.nih.gov/health/green-tea
- **KAVA** — Sédatifs et risque hépatique : https://www.nccih.nih.gov/health/kava
- **ÉCHINACÉE** — Immunosuppresseurs : https://www.nccih.nih.gov/health/echinacea
- **GINSENG** — Glycémie et coagulation : https://www.nccih.nih.gov/health/asian-ginseng
- **VITAMINE B6** — Cyclosérine, antiépileptiques et théophylline : https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/
- **GABAPENTINE** — Antiacides aluminium/magnésium : https://www.accessdata.fda.gov/drugsatfda_docs/label/2017/020235s064_020882s047_021129s046lbl.pdf
- **MYCOPHÉNOLATE** — Antiacides aluminium/magnésium : https://www.mayoclinic.org/drugs-supplements/mycophenolate-mofetil-oral-route/description/drg-20073191
- **DOLUTÉGRAVIR** — Calcium, fer et magnésium : https://pubmed.ncbi.nlm.nih.gov/25449994/
- **DROSPIRENONE** — Potassium et hyperkaliémie : https://www.accessdata.fda.gov/drugsatfda_docs/label/2022/211367s004lbl.pdf
- **LYSINE** — Herpès simplex: bénéfice incertain : https://pubmed.ncbi.nlm.nih.gov/30881246/
- **CURCUMA** — Formulations biodisponibles et atteinte hépatique : https://www.nccih.nih.gov/health/turmeric

## Ce que le moteur ajoute au classeur

- Une règle par famille de médicaments plutôt qu'une par ligne : le patient sous AVK lit une carte, pas huit.
- Les formulations restent au conditionnel (« peut »), citent la source, et ne diagnostiquent rien.
- Les compléments nommés sont reconnus dans les noms de produits du stock (`product-vocabulary.ts`), homéopathie exclue.
- Les lignes marquées « À valider » dans le classeur restent à relire par un pharmacien : le moteur les applique avec prudence, l'administration les montre comme telles.
