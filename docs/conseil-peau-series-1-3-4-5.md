# « Conseil peau » — séries 1, 3, 4 et 5 (7 et 8 octobre 2026)

Quatre documents de la pharmacienne, même principe que la Série 2 (voir `conseil-peau-serie-2.md`) : pour chaque médicament
déclencheur, la **question** à poser, le **produit conseil**, les **conditions et précautions**, et **ce qu'on n'associe pas ni ne fait**.
Le document est la source des CHOIX ; le **RCP** (Base de données publique des médicaments, ou PDF de l'EMA pour les médicaments à
autorisation centralisée) est la source des FAITS — chaque fait a été relu le 10 octobre 2026. Vidal, Claude Bernard et les
fabricants ne sont pas accessibles : ce qui n'en vient que est étiqueté « référence du document, non relue ».

Où c'est : `src/core/ai/engines/conseil-peau-serie-{1,3,4,5}.ts` (règles), `conseil-peau-motifs.ts` (ce que les séries ont en commun),
`conseil-peau-couverture.ts` (la table « ligne → règles » et le contrôle « aucune ligne ne disparaît »), tests
`__tests__/conseil-peau-series-1-3-4-5.test.ts`. Toutes les règles sont **à valider (PENDING)**. Les marques sont des **exemples**.

## Ce que ça change pour le comptoir

- **27 règles de conseil** et **49 vigilances** de plus (24 lignes des séries 3 à 5 et 5 lignes de la première série ; la sixième, le
  probiotique, existait déjà), chaque conseil précédé de sa question.
- Quatre niveaux, que la carte distingue (la console Super Admin → Conseils → **« À ne pas associer »** les liste tous, avec leur
  source) : **contre-indiqué** (ce que le RCP interdit), **à éviter** (déconseillé en ajout, sans interdiction nominative — la carte le
  dit), **à espacer**, **bon usage** ; plus **surveillance** (INR sous éconazole).
- Les produits concernés sont **écartés de toutes les propositions** (`blockTags`) : exfoliants (sous la plupart des traitements cutanés),
  vitamine A (Soriatane, Toctino), millepertuis (Néoral : contre-indiqué ; Otezla : « pas recommandé »), autre antipelliculaire
  (Clobex). Calcium, vitamine D et potassium restent en **précaution** (Silkis, Néoral), pas en interdiction.

## Ce que la relecture des RCP a ajouté au document (étiqueté « RCP »)

Série 3 : Daivobet **contre-indiqué** dans la rosacée, l'acné, les infections fongiques, bactériennes, virales et parasitaires (gale
comprise) ; Daivonex contre-indiqué en cas de troubles du métabolisme calcique (plafond 5 mg/semaine) ; Rozex : effet antabuse avec
l'alcool, potentialisation de la warfarine ; Topiscab : latex (préservatifs), interruption des dermocorticoïdes, linge à 60 °C ;
Diprosone contre-indiqué sur une mycose.
Série 4 : Mirvaso **contre-indiqué** avec IMAO et antidépresseurs tricycliques ou tétracycliques ; Dermoval contre-indiqué dans l'acné et la
rosacée ; Soriatane : méthotrexate, alcool dans les médicaments, don du sang ; Toctino : vitamine A, allergie au soja/arachide ; Clobex :
teintures capillaires (rincer à fond) ; Dupixent : vaccins vivants.
Série 5 : Otezla **contre-indiqué** pendant la grossesse ; Efudix : grossesse et allaitement, déficit en DPD, brivudine, fièvre jaune ;
Néoral : pamplemousse, AINS, potassium ; Silkis : insuffisance rénale, hypercalcémie.
Première série : cyclines et autres rétinoïdes avec l'isotrétinoïne ; dermabrasions, lasers (5 à 6 mois après) et épilation à la cire
(6 mois) ; soleil et cabines à UV ; Differine : grossesse, yeux et lèvres, exposition solaire exceptionnelle.

## Ce que la relecture a corrigé ou nuancé dans le document

- **Topiscab** : les « 8 heures » sont le temps de pose AVANT le rinçage, pas un délai après le lavage.
- **Finacea** : la restriction sur les abrasifs et les alcools est écrite pour la **rosacée** (pas pour l'acné).
- **Aklief** : le RCP dit « avec précaution », pas « déconseillé » ; **Néoral** : UVB/PUVA « ne doivent pas être reçus en même temps » ;
  **Silkis** : calcium/vitamine D « ne doivent pas être administrés » (plus strict que « vérifier »).
- **Efudix** : l'érosion est une réponse thérapeutique **normale** (RCP) : la question sur la peau érodée sert à choisir le moment du solaire.
- **Isotrétinoïne orale** : le RCP conseille les **lunettes** si l'œil est sec avec des lentilles ; la « larme adaptée aux lentilles » n'y est pas.
- **Erythrogel** déconseille le savon **alcalin**, l'éconazole en candidose le savon **acide** : aucune règle de « lavant » commune.
- Phrases du document absentes du RCP, gardées comme **consignes du document** : Rozex « éviter les frottements », Terbinafine
  « séchage des plis, diabète », Soolantra/Rozex « réévaluation », Efudix et Zyclara « avis du dermatologue avant tout ajout », Zyclara
  « pas de mélange ».

## Moteur : ce qui a été ajouté

- **`nameGate`** (règle de conseil et vigilance) : porte sur le NOM du médicament quand l'ATC ne suffit pas — Dermoval (crème) et Clobex
  (shampooing) sont tous deux D07AD01 ; Kétoderm crème / shampooing ; Topiscab / perméthrine antipoux ; Efudix / fluorouracile injectable ;
  Zyclara / Aldara.
- Une règle précise remplace la générale (`excludeAtcPrefixes`) : acide azélaïque, érythromycine cutanée, calcipotriol, calcitriol, acitrétine ;
  la question « eczéma atopique » de la Série 2 ne se pose plus pour le clobétasol.
- Console : onglet **« À ne pas associer »** dans Conseils & associations (lecture seule : ces vigilances sont écrites dans le code, sourcées
  et versionnées ; on les relit, on ne les supprime pas d'ici).

## Défauts trouvés au passage et corrigés

- Le dictionnaire ne reconnaissait pas Toleriane Dermallergo (aucune étiquette) ni Cicaplast Lèvres (rangé comme crème, donc jamais proposé comme baume).
- Dans la routine sous isotrétinoïne, « cicaplast » sauvait « Cicaplast Mains » et « Cicaplast Lèvres » que l'étape écartait (un motif préféré lève
  une exclusion) ; et « unidose » sauvait Azyter (collyre antibiotique) dans « yeux irrités en contexte allergique ».
- Les autres rétinoïdes oraux (acitrétine, alitrétinoïne) reçoivent leur règle précise, plus la routine de visage de l'isotrétinoïne.

## Ce qui n'est pas fait

- Les cartes « à éviter » se lisent dans l'écran de vente ; la fenêtre du poste Windows ne les montre pas encore.
- Vidal, Claude Bernard et les fabricants : non relus. Rien n'est validé par un pharmacien : tout est « à relire » dans la console.
- Procuta et les autres dosages d'Acnetrait/Curacné : supposés identiques, non lus.
