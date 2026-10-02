# PharmaBoost — film de 50 s (16:9)

Le pharmacien travaille comme d'habitude ; PharmaBoost travaille à côté et
l'aide au bon moment. Film fabriqué en code (Remotion) avec l'identité réelle
(`src/app/globals.css`, logo `public/logo.png`) et les écrans redessinés à
l'identique (textes pris dans le code). 60 images/s, musique à 120 BPM : une
mesure = 2 s ; chaque scène commence sur une mesure. Les scènes sont écrites
en « images de scène » (30/s à 100 BPM) et jouées 1,2 fois plus vite
(`SPEED` dans `src/theme.ts`) : changer le rythme ne touche à aucune scène.

| Temps | Image | Mouvement | Texte à l'écran | Son |
|---|---|---|---|---|
| 0–1 | Gros plan sur fond brand-900 : boîte AMOXICILLINE 1 g, douchette, faisceau menthe qui balaie le code-barres | Caméra serrée, légère dérive | — | Nappe sourde |
| 1 | Le code-barres s'allume, une onde part | Coup de zoom (punch) | — | **Bip** + impact grave |
| 1,2–4 | La caméra recule, la question s'écrit à gauche | Recul, mots qui montent | « Et si chaque **bip** pouvait déclencher le **bon conseil** ? » | |
| 4 | Ouverture en iris depuis le code-barres vers le comptoir (fond clair) | Iris | | Whoosh |
| 4–7 | Logiciel de gestion générique (« Poste comptoir 1 ») ; deux boîtes passent à la douchette ; une ligne s'ajoute à chaque bip, puce « bip » | | « Vous scannez. Comme d'habitude. » | **Bip** 5 s · **Bip** 6 s |
| 6,7–10 | La fenêtre se range à gauche ; le panneau PharmaBoost monte ; deux tracés lumineux portent les lignes jusqu'à « VENTE ORD-0042 » : chaque boîte « reçue » | Parallaxe, flou → net | « Chaque boîte scannée arrive dans **PharmaBoost**. » · « Vous restez sur votre logiciel de gestion. » | Montée |
| 10–12 | « Analyse dans quelques secondes… » puis poussée dans le panneau | Zoom à travers | | Whoosh |
| 12–14,2 | Fond sombre | Titre qui se range en haut | « Un **bip.** PharmaBoost analyse. » | La pulsation démarre |
| 14,2–15,8 | Étape MÉDICAMENT : AMOXICILLINE 1 g (Antibiotique), PARACÉTAMOL 1000 mg (Antalgique) | La ligne de progression avance | | Clic |
| 15,8–17,9 | Étape TRAITEMENT : « Besoin repéré · Tolérance digestive sous antibiotique » · « Contrôles de sécurité ✓ » | | | Clic |
| 17,9–20 | Étape VOTRE STOCK : 9 vignettes produits ; les hors-sujet s'éteignent, une référence à 0 s'éteint, la bonne s'entoure d'ambre · « En stock : 34 » | | | Clic |
| 20–24 | Étape CONSEIL : Flore Équilibre 10 milliards · « Conseil associé » · « Tolérance digestive pendant l'antibiothérapie » | Légère dérive de caméra | « Le **bon conseil.** Au bon moment. » | Clic |
| 24–27 | Retour au comptoir : l'avis apparaît en coin d'écran (fond #18211F, textes exacts de l'agent) ; zoom sur l'avis ; le pointeur clique | Zoom intelligent | « Le conseil s'affiche **au comptoir.** » | Clic d'apparition, clic |
| 27–31 | L'avis s'ouvre en carte de conseil (écran de vente) : raison, produit, 14,90 €, « marge 8,70 € », « En stock : 34 », « À dire au patient », trois boutons — mention « exemple » | Morphing avis → carte, blocs en cascade | « Choisi **dans votre stock.** » | |
| 31 | Le pointeur passe sur « Ignorer », « Autre produit », puis clique « Proposer ce produit » → carte verte « ✓ Ajouté à la délivrance » | Micro-interaction | « Vous gardez **la décision.** » | Clic (sur le temps) |
| 34–36,5 | SUIVI : téléphone avec le plan (AMOXICILLINE 1 g matin et soir, 6 jours ; conseil du pharmacien), QR code, deux rappels d'agenda dont « Fin du traitement — votre pharmacien prend de vos nouvelles » | Glissé latéral | « Un plan **pour le patient.** » · « QR code, e-mail ou papier. Les rappels de prise dans son agenda. » | Whoosh, 2 clics |
| 36,5–39 | STOCK : « Stock à jour · il y a 3 min », « Mettre à jour maintenant », un bip retire une boîte (34 → 33) | Glissé latéral | « Votre stock, **relié.** » · « Chaque bip décompte. Chaque export de votre logiciel remet à jour. » | Whoosh, petit bip |
| 39–42 | PILOTAGE : Aujourd'hui → Cette semaine → Ce mois ; proposés / acceptés / refusés ; par collaborateur — mention « exemple » | Compteurs, barres | « Votre **pilotage.** » · « Par collaborateur. Par jour, par semaine, par mois. » | Montée |
| 42–43,3 | Éclair, onde, le symbole arrive en ressort | Impact | | Impact + accord tenu |
| 42,5–44,2 | Le nom sort de derrière le symbole | Glissé masqué | **PharmaBoost** | |
| 44,2–46,7 | | Mots qui montent | « Le copilote intelligent du comptoir. » | |
| 46,7–50 | Bouton blanc avec reflet, adresse | Ressort, reflet | « Découvrez PharmaBoost → » · pharmaboost.app | Résolution, fondu |

## Ce que le film ne montre pas, exprès

- Aucune donnée patient conservée, aucun nom de patient (production en mode sans patient).
- Pas de « stock en temps réel » : le stock est relié par l'export du logiciel, chaque bip décompte.
- Pas de bouton Accepter sur l'avis en coin d'écran : la décision se prend dans PharmaBoost (« Proposer ce produit » / « Autre produit » / « Ignorer »).
- Aucun logiciel d'éditeur nommé (fenêtre générique), aucun chiffre commercial, aucun témoignage.
- Produit, prix et marge sont ceux du catalogue de démonstration, signalés « exemple ». La règle montrée est la ligne 1 de la base maître (amoxicilline → probiotique).

## Fabrication

```
cd video
npm run sons        # bip, whoosh, clic et musique (générés par code, aucun droit)
npm run studio      # aperçu en direct sur http://localhost:3123
npm run brouillon   # 960×540 → out/pharmaboost-brouillon-540p.mp4 (relecture du montage)
npm run final       # calcul en 4K, puis out/pharmaboost-4k.mp4 et out/pharmaboost-1080p.mp4
```
Netteté : le final est calculé en 4K (images JPEG qualité 100) puis réduit en
1080p au filtre Lanczos ; H.264 High, CRF 16, bt709. Son normalisé en deux
passes à −16 LUFS, crête −1,5 dBTP.

Remotion est gratuit jusqu'à 3 salariés ; au-delà, licence entreprise.

---

# La série : quatre films courts (16:9, 60 images/s)

Chaque film a sa musique (générée par code, `scripts/musique.mjs`), ses effets
posés à côté des animations (`<Sfx>`, `<Typing>`), une pastille de thème au
début et la même carte de fin (symbole, nom, « Le copilote intelligent du
comptoir. », « Découvrez PharmaBoost »).

| Film | Identifiant | Durée | Tempo | Ce qu'il raconte |
|---|---|---|---|---|
| Comment ça marche | `CommentCaMarche` | 35 s | 136 BPM | Le bip → les boîtes arrivent dans PharmaBoost → l'analyse en 4 étapes → l'avis en coin d'écran → la carte de conseil → « Proposer ce produit ». Fin : « Un bip. Un conseil. Votre décision. » |
| Pourquoi PharmaBoost | `Pourquoi` | 34 s | 120 BPM | « Deux problèmes. De tous les jours. » Problème 1 au comptoir (sans / avec : le doute, puis la réponse au bip). Problème 2 à la maison (les boîtes en vrac, puis le plan et les rappels). Fin : « Un conseil au bon moment. Un patient qui sait quoi prendre. » |
| Les avantages | `Avantages` | 34 s | 128 BPM | « 7 avantages pour votre comptoir. » 01 Votre logiciel ne change pas · 02 Le conseil arrive au bip · 03 Choisi dans votre stock · 04 Vous gardez la décision · 05 Vos laboratoires en avant · 06 Un plan pour chaque patient · 07 Vos résultats, par collaborateur. Fin : « Plus de conseils proposés. Vous gardez la main. » |
| Sans ordonnance | `SansOrdonnance` | 25 s | 124 BPM | « Pas d'ordonnance ? Le client décrit. » Saisie au clavier, besoins reconnus (liste fermée du code), questions à poser, produits en rayon ; puis « gêne pour respirer » → « Orienter vers le médecin ». Fin : « Sans ordonnance aussi, vous gardez la décision. » |

Véracité (même règles que le film de lancement) : produits, prix, marges et
chiffres de pilotage sont ceux du catalogue de démonstration, marqués
« exemple » ; les besoins, questions et signaux d'alerte de « Sans ordonnance »
sont ceux de `src/core/understanding/needs.ts` et `src/core/counter/request.ts` ;
« Laboratoire A / B / C » remplace des marques réelles.

```
npm run brouillon -- Pourquoi          # un film, 540p, pour relire
npm run final -- Avantages             # un film, 4K puis 1080p
npm run final                          # toute la série (≈ 10 min par minute de film)
```
