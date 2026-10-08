# « Conseil peau — Série 2 » : acné, photoprotection, eczéma, cuir chevelu

Document reçu le 7 octobre 2026 (« PharmaBoost | Conseil peau — Série 2 », 3 pages). Pour chaque médicament
déclencheur : la **question au patient**, le **produit conseil**, les **conditions et précautions**, et **ce qu'on
n'associe pas** ni ne fait. C'est cette dernière colonne qui distingue PharmaBoost d'un poussoir de produits.

Où c'est dans le code : `src/core/ai/engines/conseil-peau-serie-2.ts` (8 règles de conseil, 12 vigilances) ;
la table de correspondance et le contrôle « aucune ligne ne disparaît » : `conseil-peau-couverture.ts` et
`src/core/ai/__tests__/conseil-peau-serie-2.test.ts`. Elles se lisent dans l'application : *Paramètres → Règles
du moteur de conseil*. Toutes sont **à valider (PENDING)** par le pharmacien signataire.

## Les lignes du document et ce qu'elles sont devenues

| # | Déclencheur (ATC) | Question au patient | Règle de conseil | Vigilances (niveau) |
| --- | --- | --- | --- | --- |
| 1 | Peroxyde de benzoyle — Cutacnyl 2,5 % (D10AE) | Peau qui tiraille ou pèle ? Déjà un hydratant ? | `skin-bpo-moisturizer` | `skin-bpo-avoid` (À ÉVITER) |
| 2 | Adapalène + peroxyde — Epiduo (D10AD53) | Sécheresse ou irritation sous le gel ? | `skin-adapalene-bpo-moisturizer` | `skin-adapalene-bpo-contraindications` (CONTRE-INDIQUÉ), `skin-adapalene-bpo-avoid` (À ÉVITER) |
| 3 | Trétinoïne cutanée — Effederm (D10AD01) | Peau sèche ? Gommages ou acides ? | `skin-tretinoin-moisturizer` | `skin-tretinoin-pregnancy` (CONTRE-INDIQUÉ), `skin-tretinoin-avoid` (À ÉVITER) |
| 4 | Doxycycline orale (J01AA02) | Exposé au soleil (travail, déplacements) ? | `skin-doxycycline-photoprotection` (SÉCURITÉ) | `skin-doxycycline-contraindications` (CONTRE-INDIQUÉ), `skin-doxycycline-sun-avoid` (À ÉVITER), + `cycline-quinolone-chelation` existante (zinc à espacer) |
| 5 | Dermocorticoïde cutané, si eczéma atopique confirmé (D07A) | Pour quelle affection ? Un émollient quotidien ? | `skin-corticoid-atopic-emollient` | `skin-corticoid-atopic-avoid` (À ÉVITER) |
| 6 | Idem — hygiène (D07A) | Avec quoi se laver ? Est-ce que cela dessèche ? | `skin-corticoid-atopic-cleanser` | `skin-corticoid-atopic-avoid` |
| 7 | Tacrolimus cutané — Protopic (D11AH01) | Un émollient ? À quel moment par rapport à Protopic ? | `skin-tacrolimus-emollient` | `skin-tacrolimus-usage` (BON USAGE), `skin-tacrolimus-avoid` (À ÉVITER) |
| 8 | Ciclopirox 1,5 % shampooing — Gerda (D01AE14) | Quel shampooing entre les applications ? | `skin-ciclopirox-shampoo` | `skin-ciclopirox-usage` (BON USAGE), `skin-ciclopirox-check-addition` (À VÉRIFIER) |

Chaque règle de conseil **pose sa question avant de proposer** : le nom d'un dermocorticoïde ne dit pas que la peau
est atopique (le RCP de Locoid cite l'eczéma de contact, la dermatite atopique, le psoriasis, la dermite
séborrhéique…). La question est écrite avec les mots du document, suivie du sens du « Oui ».

## Les trois niveaux de « ne pas associer »

Le document distingue des degrés ; la carte du comptoir aussi, pour ne jamais présenter comme contre-indiqué ce qui
ne l'est pas :

- **CONTRE-INDIQUÉ** (carte rouge « Alerte sécurité ») : ce que le RCP interdit — grossesse et projet de grossesse
  sous Epiduo et Effederm ; autre rétinoïde ou peroxyde de benzoyle avec Epiduo ; isotrétinoïne orale (Curacné) et
  vitamine A ≥ 10 000 UI/jour avec la doxycycline. Le conseil d'hydratant est retiré quand la patiente est enceinte.
- **À ESPACER** : le zinc (Effizinc 15 mg), le fer, les antiacides avec la doxycycline, « plus de 2 heures si
  possible », pas interdit. Déjà porté par `cycline-quinolone-chelation`.
- **À ÉVITER** (nouvelle carte orange, `VigilanceKind = "AVOID"`) : déconseillé en ajout pour la tolérance et la
  pertinence, **sans interdiction nominative du RCP** — la carte dit « le RCP ne cite aucun produit nommément ».
  Les exfoliants (gommage, peeling, acides) sont écartés de toute proposition sous peroxyde de benzoyle, adapalène,
  trétinoïne et dermocorticoïde (étiquette `exfoliant`, `blockTags`) ; un autre antipelliculaire n'est pas ajouté
  d'office sous ciclopirox (« ajout à vérifier, pas contre-indication »).

Les marques du document (Eucerin DermoPure Clinical Hydra Repair, Peeling 10, Gommage Purifiant, Sun Oil Control ;
La Roche-Posay Lipikar AP+M, Syndet AP+, Effaclar Sérum ; Bioderma Nodé ; Ducray Kelual) sont des **exemples** : elles
servent de préférence d'ordre (la première citée passe en tête) et d'exclusion, jamais d'obligation.
« Association à une catégorie ≠ preuve d'une combinaison commerciale » (document, page 3).

## Ce qui a été vérifié, et dans quelle source (7 octobre 2026)

Sources **françaises et officielles** uniquement : le RCP de chaque spécialité dans la Base de données publique des
médicaments (ANSM). Chaque fait de la colonne « à ne pas associer » a été relu dans le RCP :

| Fait | Source relue |
| --- | --- |
| Cutacnyl : « éviter, en règle générale, l'emploi concomitant avec d'autres thérapeutiques locales kératolytiques ou détersives » ; prudence avec les préparations qui font desquamer ; pas d'exposition répétée au soleil/UV ; grossesse : « que si clairement nécessaire » (pas une contre-indication) | RCP, BDPM, CIS 60809088 |
| Epiduo : « en cas d'irritation, recommander au patient d'appliquer un produit hydratant non-comédogène, d'espacer les applications » ; pas d'autre rétinoïde ni peroxyde de benzoyle en même temps ; cosmétiques astringents/irritants/desséchants « avec précaution » ; **grossesse et projet de grossesse : contre-indiqués (rubrique 4.3)** | RCP, BDPM, CIS 60972530 |
| Effederm : cosmétiques nettoyants astringents et agents desséchants ou irritants (parfumés, alcoolisés) « à éviter » ; **grossesse et projet de grossesse : contre-indiqués** ; le RCP ne mentionne pas les émollients | RCP, BDPM, CIS 67020138 |
| Doxycycline : « éviter toute exposition directe au soleil et aux U.V. » (4.4) ; **contre-indiquée avec les rétinoïdes par voie générale** et avec un apport de vitamine A ≥ 10 000 UI/j (4.3) ; sels de zinc et de fer « à distance, plus de 2 heures si possible » (4.5) | RCP, BDPM, CIS 60982364 |
| Protopic : « un délai de 2 heures doit être respecté en cas d'application de préparations émollientes sur la même zone » ; pas de pansement occlusif (non étudié, non recommandé) ; réduire le soleil, pas de solarium ; signe d'infection : traitement préalable (4.2, 4.4) | RCP (texte lié par la BDPM), CIS 63213392 |
| Locoid : indications privilégiées eczéma de contact et dermatite atopique, mais aussi dermite de stase, psoriasis, dermite séborrhéique, piqûres : **le nom seul ne suffit pas** ; aucune mention des émollients | RCP, BDPM, CIS 66841235 |
| Ciclopirox Gerda 1,5 % : 2 à 3 fois par semaine, 4 semaines ; « un shampooing doux peut être utilisé entre les applications » ; rien sur un autre antipelliculaire | RCP, BDPM, CIS 60655327 |

**Ce que le document avance et que je n'ai pas pu relire** : les pages Vidal (réf. 5, 6, 7, 12) et celles des
fabricants (Eucerin, La Roche-Posay, Bioderma, Ducray : réf. 8 à 11, 13 à 16, 19). Vidal et la base Claude Bernard sont
sous licence : PharmaBoost ne les interroge pas et je n'y ai pas accès. Le choix des produits (quel émollient, quel
shampooing) et le fait qu'un émollient accompagne un dermocorticoïde en dermatite atopique viennent donc **du
document**, pas d'un RCP : les règles le disent (« référence du document »). C'est au pharmacien qui signe de les
confirmer.

## Ce que ce lot a changé dans le moteur (et pourquoi)

1. **Une règle précise remplace la règle générale** pour ses déclencheurs (`excludeAtcPrefixes`) : sans cela, deux
   règles auraient proposé deux hydratants, dont une sans la question du document. `hydration-dermato-topical`
   s'efface pour D07A, D10AD, D10AE ; `sun-photosensitivity` pour la doxycycline (J01AA02). Les autres cyclines, les
   diurétiques et les autres traitements de la peau gardent la règle générale. Deux tests de scénario qui figeaient
   l'ancien comportement ont été mis à jour (même produit, nouvelle règle, score + 0,1 de préférence).
2. **Deux anomalies existantes corrigées** (`systemicOnly`) : la crème de bétaméthasone (Diprosone) ou
   d'hydrocortisone (Locoid) déclenchait le « bon usage d'un corticoïde par voie orale — le matin, pendant le repas »
   et la prévention osseuse ; la pommade de tacrolimus (Protopic) déclenchait « immunosuppresseur de greffe —
   millepertuis écarté ». Quand le code ATC est connu, il décide seul pour ces trois vigilances ; sans code, la
   substance décide encore.
3. **La raison confirmée** (`confirmedReasonTemplate`) s'affichait avec « {drug} » tel quel : le nom du médicament
   est maintenant substitué (valable pour toutes les règles qui l'utilisent).
4. **Dictionnaire** : étiquettes `exfoliant` (y compris « MICROPEELING », nom de stock réel), `antipelliculaire`
   (lit « A/PELLIC », « ANTI PEL » ; ne confond pas le sélénium d'un complément), `shampooing` (lit « SH », « SHP » ;
   exclut animal et anti-poux), et « Hydra Repair » reconnu comme hydratant. **Après ce lot, relancer
   `scripts/rafraichir-etiquettes.ts --toutes`** (fait en local sur « Pharmacie Test LGPI » ; en production, avec accord).

## Preuve sur un stock réel (7-8 octobre 2026, « Pharmacie Test LGPI », 2 373 références)

Scans réels de CIP13 (Epiduo, Doxycycline Sandoz, Locoid, Protopic, Gerda, Cutacnyl, Effederm) par l'endpoint de
l'agent, lus dans l'application :

- Sous Epiduo/Cutacnyl/Effederm : « EUCERIN DERMOPURE HYDRA REPAIR APAISANT 40ML » ; sous doxycycline : « EUCERIN
  SUN OIL CONTROL SPF50+ ACNE 50ML » ; sous Locoid : « LIPIKAR BAUME AP+ MAX 200ML » et « LIPIKAR SYNDET AP + Cr
  lavante T/200ml » ; sous Gerda : « NODE SHP FLUID FL PLAST 400ML » — les produits du document, trouvés dans les
  libellés abrégés du stock.
- Sept exfoliants du stock écartés (Peeling, Gommage, Micropeeling, Effaclar Sérum, gommages corps…), trois
  antipelliculaires écartés sous Gerda.
- Aucune fausse alerte de corticoïde oral sous Locoid, ni d'immunosuppresseur sous Protopic.

Les ordonnances et le poste d'essai créés pour cette preuve ont été supprimés.

## Ajouter la série suivante

1. Un fichier par série (`conseil-<nom>-serie-N.ts`) : les règles de conseil et les vigilances, avec
   `documentRows: { document: "<id>", rows: [...] }`.
2. Les brancher à la fin de `CORE_ADVICE_RULES` et de `VIGILANCE_RULES`.
3. Ajouter le document à la table de correspondance (`conseil-peau-couverture.ts`) et son test.
4. Relire chaque fait dans le RCP (BDPM) ; marquer ce qui vient d'ailleurs « référence du document ».
5. Dictionnaire si besoin, puis `rafraichir-etiquettes.ts`.
