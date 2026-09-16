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
