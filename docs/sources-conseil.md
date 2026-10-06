# D'où vient ce que PharmaBoost propose au comptoir

PharmaBoost ne « connaît » pas les médicaments par magie : il s'appuie sur des
sources officielles françaises, chargées dans la base ou écrites dans des
règles relues, et sur le stock réel de l'officine. Ce document dit lesquelles,
ce qu'elles apportent, et ce qui n'est pas utilisé.

## 1. Le catalogue national des médicaments — BDPM (ANSM)

**Base de données publique des médicaments**, publiée par l'ANSM, chargée
dans PharmaBoost par `scripts/bdpm-sync.ts` (tables `drug_specialties`,
`drug_presentations`, compositions, conditions de prescription).

Elle donne, pour chaque spécialité vendue en France : le nom, le CIP 13 de
chaque boîte, les substances actives, la forme, la voie, les conditions de
délivrance (liste I, liste II, stupéfiant, ou rien = vente libre), et les
liens vers le RCP et la notice.

Ce qu'elle permet : rattacher chaque ligne d'ordonnance à une spécialité
vérifiable, savoir si un médicament du stock peut être conseillé sans
ordonnance, et ne jamais proposer une substance déjà prescrite.

Ce qu'elle ne dit pas : le code ATC (classe pharmacologique) n'y figure pas.
Il vient de la couche de compréhension (modèle Anthropic, classe + ATC
proposés, puis validés par le domaine) ou de fiches éditoriales.

## 2. Les règles de conseil — écrites, sourcées, versionnées

`src/core/ai/engines/advice.ts`. Chaque règle nomme la classe qui la
déclenche (ATC, classe thérapeutique, ou besoin compris par le modèle), la
question à poser au patient s'il y en a une, ce que dit le pharmacien, ce que
lit le patient, les précautions, et sa source clinique. Le modèle ne rédige
jamais une justification médicale : il identifie un contexte, la règle parle.

Sources utilisées pour les écrire :

- **RCP et notices ANSM** (via la BDPM) : effets indésirables fréquents
  (constipation des opioïdes, sécheresse de l'isotrétinoïne, hypomagnésémie
  des IPP au long cours, chéilite…).
- **Thésaurus des interactions médicamenteuses (ANSM)** : prises à distance et
  associations déconseillées (lévothyroxine et minéraux, cyclines et cations,
  potassium et hyperkaliémiants, millepertuis et anticoagulants). Il alimente
  les vigilances de `src/core/ai/engines/vigilance.ts`.
- **Cespharm (Ordre national des pharmaciens) — fiches conseil à l'officine** :
  herpès labial, zona, hygiène des mains, soins du pied diabétique.
- **HAS** : automesure tensionnelle (HTA de l'adulte, 2016), prévention de la
  constipation sous opioïdes, pied diabétique (avec la SFD).
- **Liste des médicaments de médication officinale (ANSM)** : ce qui peut être
  proposé en accès direct — dans PharmaBoost, la règle est plus stricte encore :
  aucune condition de prescription dans la BDPM, sinon jamais proposé.
- **Assurance Maladie (ameli.fr)** : poux (peigne à poux), hypoglycémie du
  patient diabétique (sucre rapide). Voir le § 6.
- **SFR / GRIO** : prévention de l'ostéoporose cortico-induite (actualisation
  2014, méthode HAS). Voir le § 6.
- **Code de la santé publique et Ministère de la Transition écologique** : collecte
  des déchets perforants des patients en autotraitement. Voir le § 6.

## 3. Le stock de l'officine

Une proposition vient toujours du rayon : import du logiciel (CSV, Excel, PDF
d'inventaire LGPI) ou agent PharmaBoost Connect. Chaque référence est rangée
dans le vocabulaire des règles par un dictionnaire de noms
(`src/core/catalog/product-vocabulary.ts`) puis, si besoin, par le modèle, dans
un vocabulaire fermé : un produit ne reçoit jamais une étiquette que les règles
ne connaissent pas.

Après toute évolution du dictionnaire : `scripts/rafraichir-etiquettes.ts`.

## 4. Ce qui n'est pas utilisé, et pourquoi

- **Vidal, Thériaque, Claude Bernard** : bases privées, sous licence. Elles
  apporteraient les indications et les posologies structurées ; une licence
  est nécessaire pour les intégrer. Rien n'en est extrait sans accord.
- **Pages web, forums, sites de laboratoires** : jamais. Une allégation
  commerciale n'est pas une raison médicale.

## 5. Quand rien n'est proposé

Le comptoir dit pourquoi : aucune règle pour cette classe, stock non
configuré, références en rupture, conseil écarté par sécurité. Le test
`src/core/ai/__tests__/coverage.test.ts` vérifie que les classes les plus
prescrites en ville déclenchent toutes au moins une règle ; y ajouter une classe
sans règle fait échouer la suite.

## 6. Les règles du « conseil complet par ordonnance »

Cinq règles ajoutées le 6 octobre 2026, pour qu'une ordonnance appelle des
conseils de plusieurs familles (médicament conseil, complément alimentaire,
produit de parapharmacie) sans jamais en inventer. Elles sont courtes, écrites
au conditionnel, marquées « à relire » (`PENDING`, relecture pharmacien à
venir), et aucune n'est un conseil de sécurité. Sources consultées le
6 octobre 2026. Le déclencheur est une classe ATC (jamais un nom de marque) ;
quand l'ordonnance ne dit pas si le besoin existe, la règle pose sa question et
la proposition attend la réponse.

- `inhaler-spacer-chamber` — chambre d'inhalation, avec un aérosol-doseur.
  - Déclencheur : bêta-2 mimétiques inhalés (R03AC) et corticoïdes inhalés
    (R03BA). L'ATC ne distingue pas l'aérosol-doseur de la poudre à inhaler :
    la question (« aérosol-doseur, et non poudre ? ») le fait.
  - Famille : produit de parapharmacie (dispositif). Pour choisir la référence,
    le moteur préfère un modèle à masque avant 6 ans et écarte une chambre de
    nourrisson à partir de 12 ans (seuils du moteur, à valider par le
    pharmacien : la source dit « nourrissons et jeunes enfants »).
  - Source : RCP VENTOLINE 100 µg/dose, suspension pour inhalation en flacon
    pressurisé (BDPM / ANSM, § 4.2 et § 4.4, page mise à jour le 31 août 2026) :
    chambre d'inhalation indiquée en cas de mauvaise synchronisation main/poumon,
    chambre munie d'un masque facial pour les nourrissons et jeunes enfants,
    inhalation immédiate après chaque déclenchement. RCP FLIXOTIDE 250 µg/dose
    (ANSM, § 4.2) : même indication.
  - Aucune contre-indication de population n'est citée.
- `head-lice-comb` — peigne à poux avec un traitement antipoux.
  - Déclencheur : antiparasitaires externes (P03A). Cette famille regroupe aussi
    les traitements de la gale : la question (« poux de tête, et non gale ? »)
    les écarte.
  - Famille : produit de parapharmacie (dispositif). Ni lotion ni coffret (le
    traitement est déjà prescrit), ni peigne électrique.
  - Source : Assurance Maladie, « Poux : comment s'en débarrasser ? »
    (ameli.fr) : lavage au shampoing doux après le temps de pose, peigne à poux
    sur cheveux mouillés et démêlés, seconde application 7 à 10 jours plus
    tard, pas de traitement préventif.
  - Aucune contre-indication de population n'est citée.
- `self-injection-sharps-container` — collecteur d'aiguilles pour les
  injections à domicile.
  - Déclencheur : insulines (A10A), analogues du GLP-1 (A10BJ), héparines de bas
    poids moléculaire (B01AB). Un GLP-1 existe aussi en comprimé et une héparine
    peut être injectée par un infirmier : la question (« le patient
    s'injecte-t-il lui-même ? ») décide.
  - Famille : produit de parapharmacie (dispositif). Classée « tolérance », pas
    « sécurité » : c'est une obligation de collecte des déchets, pas un risque
    du traitement.
  - Source : Code de la santé publique, articles R. 1335-8-1 à R. 1335-8-7
    (déchets perforants des patients en autotraitement) ; loi n° 2008-1425 du
    27 décembre 2008, article 30 (collecte gratuite en officine) ; Ministère de
    la Transition écologique, « Dispositifs médicaux perforants utilisés par les
    patients en auto-traitement » (page publiée le 17 février 2017) ;
    éco-organisme DASTRI. Les collecteurs DASTRI sont remis sans frais et ne
    sont pas toujours une référence du stock : la règle ne propose que ce qui
    est en rayon.
  - Aucune contre-indication de population n'est citée.
- `corticosteroid-oral-calcium` — calcium sous corticothérapie orale prolongée.
  - Déclencheur : glucocorticoïdes (H02AB), sous la question « corticoïde
    prévu pour plus de 3 mois, avec une alimentation pauvre en calcium ? ».
  - Famille : complément alimentaire (calcium, y compris associé à la vitamine
    D3). La vitamine D seule reste servie par la règle « Statut vitaminique D »
    (`vitamin-d-elderly`) : aucun doublon.
  - Source : SFR / GRIO, « Actualisation 2014 des recommandations pour la
    prévention et le traitement de l'ostéoporose cortico-induite » (méthode
    HAS ; remplace Afssaps 2003) : corticothérapie orale prévue pour plus de
    3 mois ou reçue depuis au moins 3 mois, supplémentation calcique si les
    apports calciques sont insuffisants, vitamine D si taux bas. RCP OROCAL
    500 mg (BDPM, page mise à jour le 3 août 2026, § 4.3 et § 4.4) :
    contre-indiqué en cas d'hypercalcémie, d'hypercalciurie avec lithiase
    calcique, de calcifications tissulaires ; insuffisance rénale : calcémie et
    calciurie à contrôler.
  - Écartée par la sécurité : insuffisance rénale, lithiase calcique ou
    hypercalcémie déclarées, patient de moins de 18 ans (les recommandations
    sont écrites pour l'adulte).
  - Durée : quand l'ordonnance donne une durée de traitement connue et
    inférieure à 90 jours, la règle (et la vitamine D sous corticoïde de
    `vitamin-d-elderly`, pour le préfixe H02 seulement) n'est pas proposée : une
    cure courte ne relève pas de ces recommandations. Durée inconnue : la
    question reste. La durée d'une boîte de biphosphonate n'est jamais prise
    pour celle du traitement (M05B et H05 ne sont pas concernés).
- `hypoglycemia-fast-sugar` — sucre rapide en cas d'hypoglycémie.
  - Déclencheur : insulines (A10A), sulfamides hypoglycémiants (A10BB),
    répaglinide (A10BX02), natéglinide (A10BX03) et les associations qui
    contiennent un sulfamide (A10BD02, A10BD04, A10BD06) — les traitements que
    la source cite ; la metformine seule (A10BA) ne déclenche rien. Les autres
    antidiabétiques ne déclenchent rien. Question : « le patient souhaite-t-il
    garder une source de sucre rapide sur lui ? ».
  - Famille : rangée en nutrition, donc comptée avec les compléments
    alimentaires (le glucose en comprimés n'en est pas un au sens strict).
    Ni glucagon, ni soluté, ni sirop.
  - Source : Assurance Maladie, « Diabète : hypoglycémie, hyperglycémie et
    acidocétose » (ameli.fr) : risque surtout sous sulfamides, glinides et
    insuline ; resucrage avec l'équivalent de 15 g de sucre (3 morceaux) ;
    sources de sucre rapide à garder sur soi ; les fruits et le chocolat ne
    sont pas efficaces.
  - Aucune contre-indication de population n'est citée.

Pistes examinées et non retenues :

- **Associations bêta-2 + corticoïde inhalés (R03AK) pour la chambre
  d'inhalation** : la mention n'a pas été vérifiée dans un RCP de cette
  famille. La règle de rinçage de bouche les couvre déjà.
- **Vitamine D sous corticoïde** : déjà couverte par `vitamin-d-elderly` (H02).
  Seul le calcium, qui manquait, est ajouté.
- **Calcium sous bisphosphonate** : la question utile n'est pas la même (pas de
  seuil de 3 mois) ; à examiner avec le pharmacien relecteur.
- **Vitamine B12 sous metformine** : aucune source officielle d'un conseil de
  supplémentation au comptoir n'a été confirmée.
- **Pilulier selon le nombre de médicaments** : le moteur se déclenche par
  médicament, pas par nombre de lignes d'ordonnance.

Après toute évolution du dictionnaire : `scripts/rafraichir-etiquettes.ts` (à
lancer par le chef de lot, pas par la règle).
