# « REMBOBINONS » — direction du film

C'est le nouveau film de présentation de **PharmaBoost** (25 oct. 2026), pour le site et les démos. Il s'adresse à **tout le monde** : le pharmacien doit se dire « c'est incroyable », le patient « c'est trop bien », une marque ou un laboratoire « il faut que je travaille avec eux ». Le fondateur veut un film **original, qui choque un peu, clair, vivant du début à la fin**, avec le maximum d'animation, de bruitages et de musique.

Le niveau attendu est celui d'une agence de motion design :
- composition soignée ;
- profondeur (plans à des vitesses différentes) ;
- accélérations franches (`SNAP`, `POP`, `WHIP`) ;
- secousses de caméra sur les impacts ;
- un son pour chaque geste ;
- **rien d'immobile plus de 0,4 s**.

Avant d'écrire une ligne, regarder deux scènes du film précédent, pour le niveau d'animation (courbes, secousses, profondeur, flou de mouvement ponctuel) :
- `src/presentation/motion/scene-05-revelation.tsx` ;
- `src/presentation/motion/scene-08-vendu.tsx`.

## 0. L'idée — une seule phrase

On montre la scène que tout le monde connaît : « Il vous fallait autre chose ? » — « Non merci. » Le patient repart avec son antibiotique, et rien pour sa flore intestinale. **On REMBOBINE la bande**, et la même scène se rejoue avec PharmaBoost au comptoir : le bon conseil apparaît, le patient dit « Ah oui, je veux bien ! ». Puis on montre ce que chacun y gagne, et on finit sur le clin d'œil : « Il vous fallait autre chose ? ».

**Le film est construit en miroirs.** Chaque scène de l'acte 2 répond à une scène de l'acte 1.

| Acte 1 (gris, froid) | Acte 2 (PharmaBoost) |
|---|---|
| S1 : le carillon de la porte, le patient repart les mains vides | S8 : le même carillon, joyeux, le patient repart avec ses deux boîtes |
| S3 : une carte de France de points **rouges** « Non merci » | S12 : la même carte, en points **verts** « vendu » |
| S1 : « Il vous fallait autre chose ? » (lassé) | S13 : la même question, avec le sourire |

## 1. Le temps — tout est en secondes du FILM

`src/rembobine/timeline.ts` (60 i/s, 75 s) donne les repères suivants.

- **`DROP` = 20 :** la bande a fini de rembobiner. La couleur et la musique explosent, et le monde PharmaBoost commence.
- **`FINAL_HIT` = 72 :** le dernier claquement du logo, avec le pharmaboost.app.
- **La musique** (`public/rembobine/music/musique.wav`, déjà montée) :
  - **0 → 8 :** tic-tac discret, la routine ;
  - **8,0 :** un coup sourd, la tension commence ;
  - **16,5 :** la montée s'arrête NET. « Alors… rembobinons. » tombe dans le **silence**, et la bande rembobine dans le silence ;
  - **20,0 :** le groove (120 BPM, les temps tombent à 20 + 0,5·n, une mesure = 2 s) ;
  - **35 → 40 :** la musique passe « derrière une porte », assourdie, pendant le dialogue ;
  - **40,0 :** retour plein pot, sur VENDU ;
  - **≈ 43 :** une petite cassure ;
  - **70,0 :** le groove s'arrête, et sa queue s'éteint sous « Il vous fallait autre chose ? » ;
  - **72,0 :** l'accord final, que fait la scène S13 avec ses bruitages.
- **Les mots :** les temps de tous les mots dits sont dans `src/rembobine/mots.json` (`words[].at`). **Le mot dit et l'image qui le montre arrivent ensemble**, à ±2 images près.
- **Les fenêtres :** chaque scène déborde de 0,5 s sur la suivante. Pendant ce chevauchement, la scène qui sort est dessinée **au-dessus** : **c'est elle qui fait la transition** (balayage, sortie, zoom, découpe…). La scène qui entre est déjà là en dessous, **fond opaque compris, dès son début**.

| Scène | Fenêtre | Ce qui est dit (mot@temps du film) |
|---|---|---|
| S1 Le comptoir | 0 → 6,5 | D1 (pharmacienne) : Et@1.40 avec@1.57 ceci,@1.81 il@2.22 vous@2.36 fallait@2.49 autre@2.78 chose ?@3.10 (fin 3,78) · D2 (patient) : Non@4.30 merci.@4.52 (fin 5,04) |
| S2 Et rien d'autre | 6,0 → 13,1 | N1 : Il@6.00 repart@6.27 avec@6.84 son@7.63 antibiotique…@8.02 et@9.29 rien@9.73 pour@10.20 sa@10.47 flore@10.67 intestinale.@11.07 (fin 12,38) |
| S3 Chaque jour, partout | 12,6 → 17,2 | N2 : Cette@12.75 scène@13.04 se@13.39 répète@13.56 chaque@14.00 jour,@14.33 dans@14.72 toute@15.02 la@15.39 France.@15.54 (fin 16,34) |
| S4 Rembobinons | 16,7 → 20,5 | N3 : Alors…@16.82 rembobinons.@17.80 (fin 18,82) |
| S5 Même ordonnance | 20,0 → 26,4 | N4 : Même@20.45 patient.@20.76 Même@21.53 ordonnance.@21.95 Mais@22.85 cette@23.10 fois,@23.32 PharmaBoost@23.76 est@24.55 au@24.79 comptoir.@24.89 (fin 25,59) |
| S6 Le bon conseil | 25,9 → 30,5 | N5 : À@26.00 chaque@26.17 boîte@26.45 scannée,@26.66 le@27.05 bon@27.22 conseil@27.44 s'affiche,@27.87 pris@28.40 dans@28.72 votre@28.90 stock.@29.22 (fin 29,76) |
| S7 Les questions, les mots | 30,0 → 35,8 | N6 : Les@30.15 questions@30.36 à@30.77 poser.@30.85 Les@31.30 mots@31.46 à@31.66 dire.@31.73 La@32.56 marge,@32.77 le@33.35 challenge,@33.54 la@34.27 date@34.42 courte.@34.61 (fin 35,07) |
| S8 Je veux bien | 35,3 → 45,3 | D3 (pharmacienne) : Avec@35.49 votre@35.77 antibiotique,@36.01 je@36.80 vous@36.93 conseille@37.06 un@37.46 probiotique.@37.60 (fin 38,48) · D4 (patient) : Ah@38.79 oui,@38.95 je@39.22 veux@39.35 bien !@39.48 (fin 40,01) · N7 : Le@40.55 pharmacien@40.78 décide.@41.36 Le@42.30 patient@42.52 repart@43.01 mieux@43.53 conseillé.@43.81 (fin 44,53) |
| S9 L'équipe | 44,8 → 49,0 | N8 : Pour@44.99 l'équipe :@45.22 chaque@46.02 conseil@46.31 vendu@46.70 se@47.00 compte,@47.15 en@47.50 direct.@47.74 (fin 48,32) |
| S10 Le patient | 48,5 → 53,8 | N9 : Pour@48.69 le@48.86 patient :@48.97 son@49.62 bilan@49.91 par@50.20 e-mail,@50.40 et@50.86 un@51.15 rappel@51.27 avant@51.66 la@51.88 fin@52.01 de@52.19 sa@52.31 cure.@52.45 (fin 53,12) |
| S11 L'application | 53,3 → 60,1 | N10 : Et@53.47 bientôt,@53.64 l'application@54.31 PharmaBoost :@55.01 scanner@56.09 ses@56.50 boîtes,@56.65 suivre@57.14 ses@57.62 cures,@57.78 profiter@58.28 d'offres.@58.78 (fin 59,37) |
| S12 Les marques | 59,6 → 66,0 | N11 : Pour@59.80 les@60.02 marques :@60.15 leurs@60.74 challenges@60.95 sur@61.42 l'écran@61.55 du@61.88 comptoir,@62.02 au@62.55 bon@62.82 moment.@63.01 Et@63.47 chaque@63.67 vente,@63.94 comptée.@64.40 (fin 65,13) |
| S13 La signature | 65,5 → 75,0 | N12 : PharmaBoost.@65.75 Le@66.60 copilote@66.80 IA@67.39 du@67.68 comptoir@67.84 de@68.28 votre@68.39 pharmacie.@68.65 (fin 69,44) · D5 (pharmacienne) : Il@69.98 vous@70.12 fallait@70.25 autre@70.55 chose ?@70.91 (fin 71,51) · accord final 72,0 |

## 2. Le cadre et les sous-titres

- **Le cadre :** 16:9, 1920 × 1080. Le rendu 4K se fait à l'échelle 2 : **tout doit être net en 4K**, donc du vectoriel (SVG, CSS, texte) et aucune image matricielle agrandie au-delà de sa taille.
- **Les sous-titres :** le film les pose en bas, à partir de `L.capY` = 930. **Rien d'important sous y = 930.**
  - La vidéo démarre sans le son sur le site, donc les sous-titres comptent.
  - Les répliques de la pharmacienne et du patient y portent leur étiquette.
  - Une bulle de dialogue dans l'image peut donc reprendre la réplique en **plus court** et en plus gros. Par exemple « Autre chose ? », « Non merci. », « Je veux bien ! ».
- **Grain et vignette :** le film les pose déjà par-dessus.
- **La mention « Illustration · exemples » :** composant `<Mention t from to/>` de `src/presentation/motion/kit/mention.tsx`, en haut à droite. Elle est **obligatoire** dans toute scène qui montre un prix, une marge, un stock, un compteur ou un nombre de ventes (S6, S7, S8, S9, S12).

## 3. Les deux mondes (kit `brand.ts`)

- **ACTE 1 (S1 → S4), `A1.*` :** la pharmacie de tous les jours.
  - Lumière de **néon froid**, couleurs **désaturées** (gris-bleu), un peu documentaire.
  - La croix verte de pharmacie est terne et grésille.
  - **Le rouge `A1.alarm` n'existe que dans l'acte 1.** C'est le choc : « RIEN », la carte de France rouge.
- **PHARMABOOST (dès 20,0), `PB.*` :** les couleurs du site et de la bannière du comptoir.
  - **Couleurs de base :**
    - vert profond `PB.green` #0F2F2A ;
    - **citron `PB.citron` #E8FF9C**, l'accent de la bannière ;
    - sarcelle `PB.brand`, et le dégradé sarcelle → cyan du titre du site (`BRAND_GRAD`) ;
    - papier clair `PB.paper` ;
    - menthe `PB.mint`.
  - **Couleurs réservées :**
    - **or `PB.gold` = challenge seulement** ;
    - **rouge brique `PB.date` = date courte seulement**.
  - **Le fond de la bannière** est l'hélice d'ADN : `public/rembobine/images/adn-helice.jpg`, 1920 px, à ne pas agrandir au-delà, avec une carte en verre givré par-dessus.
- **Polices :** Plus Jakarta Sans (`JAKARTA`, 800 pour les mots qui claquent) et JetBrains Mono (`MONO`, chiffres vivants). `<Word/>` du kit utilise Jakarta par défaut.
- **Logos :** `public/rembobine/images/logo.svg`, `logo-robot.svg` et `logo-robot-1080.png`. Il y a aussi le robot animé, `Mascot` de `src/presentation/mascot.tsx` (lire son en-tête : une « piste » d'évènements).
- **Typographie française :**
  - espace insécable ` ` avant `: ; ! ?` ;
  - guillemets « » ;
  - accents justes : É, À, Ç ;
  - « e-mail ».

## 4. La vérité — non négociable

Tout ce qui est montré existe dans PharmaBoost **et est en ligne**, sauf l'application patients, qui est **« BIENTÔT »**. Cette étiquette est obligatoire en S11.

1. **Aucune marque réelle, aucun laboratoire réel.**
   - Les boîtes sont génériques : « Amoxicilline 1 g » (c'est une molécule, ce n'est pas une marque), « Paracétamol 1 g », « Probiotique », « Pastilles gorge ».
   - En S12, la marque est « Votre marque », un pictogramme générique.
2. **Aucun chiffre présenté comme réel.** Les montants, marges, compteurs et stocks sont des **exemples**, avec la mention « Illustration · exemples ».
   - Les valeurs : marge « +4,20 € », stock « 12 en stock », compteur des conseils vendus 127 → 128, challenge « +1 € par boîte pour l'équipe ».
   - Aucun pourcentage de hausse, aucune statistique nationale.
3. **Ce qu'on ne dit pas :**
   - On ne dit jamais que l'IA choisit à la place du pharmacien. **« Le pharmacien décide. »**
   - Rien de « gratuit ».
   - Aucune promesse de santé (« guérit », « protège »).
   - Le discours du comptoir reste prudent : « Avec un antibiotique, la flore intestinale peut être perturbée. »
4. **La vraie bannière du comptoir** (S6, S7) suit le dessin réel de `src/components/island/mix-island.tsx` et des couleurs `MIX_PAPER` / `PHARMABOOST_GREEN` (`src/components/island/island-theme.ts`) :
   - **une ligne par boîte scannée, dans l'ordre du scan :**
     - pastille numérotée 1, 2 ;
     - « pour Amoxicilline 1 g » ;
     - le produit conseillé, en gras ;
     - des pastilles : stock, marge, challenge (or), date courte (rouge brique) ;
   - **un clic déplie la grande carte,** avec les onglets **Questions · Discours · Fiche**.
5. **Les autres écrans :**
   - **Le compteur des conseils vendus** suit `src/components/performance/sold-counter.tsx` : carte en dégradé sarcelle, grand nombre qui défile, « conseils vendus », périodes, chiffre d'affaires ajouté, objectif 10 % des ventes.
   - **L'appli patients** suit la maquette `src/app/(public)/robot-apercu/appli-patient/patient-app.tsx`.

## 5. Les scènes

Pour chaque scène : l'intention, les images, les sons. **Ce sont des pistes fortes, pas une camisole**, mais l'histoire, les miroirs et la vérité ne bougent pas. Les bruitages : voir §6, les noms sont les clés de `src/rembobine/kit/sfx-durees.json`.

### S1 — Le comptoir (0 → 6,5)

C'est l'ouverture, la scène de tous les jours, presque documentaire.

- **Le décor :** le comptoir vu de trois quarts, dans le décor de `kit/decor.tsx`, ambiance acte 1. La pharmacienne est derrière, en blouse, l'air lassé de la routine. Le patient est devant. Son ordonnance et la boîte « Amoxicilline 1 g » sont sur le comptoir. L'écran du logiciel est gris et sans vie. Dehors, la croix verte grésille.
- **0 → 1,2 :** le noir. Le néon s'allume en clignotant (`neon`), puis la caméra avance lentement.
- **≈ 0,7 :** le bip de la douchette (`scanner-bip`) sur la boîte.
- **D1 (1,4 → 3,8) :** une bulle de la pharmacienne : « Autre chose ? ».
- **D2 (4,3 → 5,0) :** la bulle du patient : « Non merci. ». Il prend son sac, se retourne et sort.
- **≈ 5,3 :** le carillon de la porte (`porte-carillon`). À 5,8, la porte se ferme (`porte-ferme`).
- **La sortie (6,0 → 6,5) :** le cadre se fige et se désature d'un coup (`arret-image`), et l'on passe à S2.
- **L'ambiance :** la pharmacie (`pharmacie-ambiance`) est déjà posée par le film.

### S2 — Et rien d'autre (6,0 → 13,1)

**C'est le CHOC.**

- **6,0 → 8,0 :** on suit le patient dans la rue, et le sac de pharmacie au bout de son bras, avec des battements de cœur (`coeur`) vers 6,2 et 7,2.
- **« antibiotique… » (8,02) :** la musique frappe (8,0, avec `sub-boom`). Le sac devient **transparent, façon radio**, et l'on voit qu'il ne contient QU'UNE boîte : « Amoxicilline 1 g ». Une étiquette apparaît : « Antibiotique · 7 jours ».
- **« rien » (9,73) :**
  - `disque-raye` à 9,70, puis l'image se FIGE (`arret-image`) ;
  - à côté de la boîte, une **place vide en pointillés rouges** (`A1.alarm`) en forme de boîte, avec « ? » ;
  - le mot **« RIEN. »** claque en rouge, énorme (enter punch, secousse de caméra) ;
  - `tampon` ou `sub-boom`.
- **« flore intestinale » (10,67 → 11,9) :** la place vide affiche « pour sa flore intestinale », et « RIEN » reste en rouge.
- **La sortie (12,6 → 13,1) :** l'image se réduit en vignette au centre. C'est la première vignette de S3.

### S3 — Chaque jour, partout (12,6 → 17,2)

- **12,6 → 13,6 :** la vignette de la scène (le comptoir, « Non merci. ») est au centre.
- **« répète » (13,56) :** elle se **démultiplie** (`multiplication`) en 4, puis 16, puis des centaines de petites vignettes, chacune avec sa bulle « Non merci. » qui pope (`pop-leger` en rafale, et `foule-non-merci` ≈ 0,35 dessous).
- **« chaque jour » (14,0 → 14,6) :** une horloge ou un calendrier qui défile en coin, les jours qui passent.
- **« France » (15,54) :** les vignettes se rétractent en **points rouges qui dessinent la carte de France** (`FranceMap` du kit), et chaque point pulse.
- **16,5 :** la musique s'arrête net. On coupe au noir, ou l'image s'éteint comme une vieille télé (`tele-off`). Il reste 0,2 s de noir avant S4.

### S4 — Rembobinons (16,7 → 20,5)

C'est la bande vidéo, dans le **silence**.

- **16,7 → 17,8 :** l'écran noir, puis l'image figée de S2 qui revient, et un affichage de magnétoscope à l'écran : « ⏸ PAUSE » en haut à gauche, en police MONO, blanc avec ombre, façon VHS des années 90, avec le compteur « 00:00:12 ».
- **« rembobinons » (17,80) :**
  - « ◀◀ REMBOBINAGE » remplace « PAUSE » ;
  - **tout repart À L'ENVERS, de plus en plus vite** : la carte rouge → les vignettes → le sac → le patient qui marche à reculons et rentre dans la pharmacie, et la porte qui se rouvre ;
  - les bulles « Non merci. » rentrent dans les bouches ;
  - **les effets :** bandes de défilement VHS, décalage des couleurs (RVB), tremblement vertical, neige ;
  - **les sons :** `vhs-rembobine` à 17,9 (gain ≈ 0,8), puis `bande-ralentit` vers 19,4.
- **19,6 :** « ▶ LECTURE » et le claquement de la touche (`vhs-lecture`).
- **20,0 (DROP), la transition vers S5, faite par S4 dans 20,0 → 20,5 :**
  - un éclair blanc ;
  - la COULEUR envahit tout, avec une onde citron ;
  - `impact-revelation` + `sub-boom` ;
  - une secousse de caméra.

### S5 — Même ordonnance (20,0 → 26,4)

**Le même comptoir, rejoué,** mais en couleurs PharmaBoost : lumineux, papier clair, vert profond, citron.

- **« Même patient » (20,45) :** le patient apparaît au comptoir (`attrape`), avec une étiquette « MÊME PATIENT » qui pope.
- **« Même ordonnance » (21,53) :** l'ordonnance glisse sur le comptoir (`papier`), avec une étiquette « MÊME ORDONNANCE ».
- **« Mais cette fois » (22,85 → 23,6) :** un petit suspense. La caméra glisse vers l'écran du comptoir, qui est encore éteint.
- **« PharmaBoost » (23,76) :**
  - l'écran du comptoir s'allume en citron et vert (`robot-allume`) ;
  - le logo PharmaBoost et le robot (`Mascot`) jaillissent ;
  - le mot géant **PharmaBoost** claque, avec le dégradé du site (`impact-net`, `scintillement`) ;
  - une onde de choc et des étincelles citron.
- **« au comptoir » (24,9) :** le logo se range dans l'écran du comptoir.
- **La sortie (25,9 → 26,4) :** la caméra plonge dans l'écran (zoom). C'est la transition vers S6.

### S6 — Le bon conseil (25,9 → 30,5)

C'est l'écran du comptoir **en gros plan**, sur le fond de l'hélice d'ADN, avec la vraie bannière (§4).

- **« boîte » (26,45) :** la boîte « Amoxicilline 1 g » passe sous la douchette, avec le laser (`scan-laser` + `scanner-bip`). La **ligne 1** de la bannière glisse : « ① pour Amoxicilline 1 g → **Probiotique** » (`ui-pop`).
- **≈ 27,2 :** une 2e boîte, « Paracétamol 1 g », est bipée, et la **ligne 2** arrive : « ② pour Paracétamol 1 g → **Pastilles gorge** ».
- **« bon conseil » (27,22 → 27,9) :** la ligne 1 s'illumine, avec un surlignage citron et `scintillement`.
- **« pris dans votre stock » (28,4 → 29,4) :** la pastille « 12 en stock » (vert) pope, avec la photo stylisée d'un rayon ou une flèche de stock (`verrou-hud`).
- **La mention :** « Illustration · exemples ».
- **La sortie :** la ligne 1 est « cliquée ». Un curseur clique (`ui-clic`) et la grande carte se déplie. C'est la transition vers S7.

### S7 — Les questions, les mots (30,0 → 35,8)

La grande carte de la bannière est dépliée sur le Probiotique, avec les onglets **Questions · Discours · Fiche**.

- **« questions » (30,36) :** l'onglet Questions s'allume (`ui-clic`), et deux questions arrivent l'une après l'autre (`ui-pop`) :
  - « Avez-vous déjà eu des troubles digestifs avec un antibiotique ? » ;
  - « Prenez-vous déjà un probiotique ? ».
- **« mots » (31,46) :** l'onglet Discours. La phrase s'écrit (`laser-ecrit` ou `touche`) : « Avec un antibiotique, la flore intestinale peut être perturbée. Je vous conseille un probiotique pendant le traitement. »
- **« marge » (32,77) :** la pastille **Marge +4,20 €** claque (`piece`).
- **« challenge » (33,54) :** la pastille **or** « Challenge · +1 € par boîte pour l'équipe », avec des pièces (`Coins`) et `caisse` léger.
- **« date courte » (34,42) :** la pastille **rouge brique** « Date courte » (`jauge` ou `pop-sec`).
- **Les trois pastilles** se rangent en ligne, comme sur la vraie carte.
- **La mention :** « Illustration · exemples ».
- **La sortie (35,3 → 35,8) :** dézoom rapide vers le comptoir (`whoosh-pb`).

### S8 — Je veux bien (35,3 → 45,3)

Le comptoir, en grand, couleurs PharmaBoost. **Le miroir de S1.**

- **D3 (35,5 → 38,5) :** la pharmacienne sourit. Une bulle : « Je vous conseille un probiotique. » Elle pose la boîte « Probiotique » sur le comptoir, à côté de l'antibiotique (`boite-posee` vers 37,6). La musique est assourdie : c'est voulu.
- **D4 (38,8 → 40,0) :** le patient, souriant. Une bulle : « Ah oui, je veux bien ! » (`bulle`).
- **40,0, VENDU :** la musique revient en plein.
  - Un grand tampon **VENDU** en citron et vert (`tampon-vendu` + `caisse`).
  - Des confettis (`Confetti`, `canon-confettis` ≈ 0,5).
  - Un « +1 conseil vendu » qui monte.
  - Une secousse de caméra.
- **« Le pharmacien décide » (40,55 → 41,9) :** un gros plan sur le bouton « Vendu » de la bannière, que la main du pharmacien a validé. Une étiquette dit : « Le pharmacien décide ».
- **« Le patient repart mieux conseillé » (42,3 → 44,5) :** le patient sort avec son sac, qui contient cette fois **deux** boîtes. Le carillon de la porte sonne, joyeux (`porte-carillon`, avec une légère montée de hauteur : `rate` 1,06). Il fait même un petit signe de la main.
- **La sortie (44,8 → 45,3) :** un balayage citron (`WipeBar`, `whoosh-rapide`).

### S9 — L'équipe (44,8 → 49,0)

- **« Pour l'équipe » (44,99 → 45,8) :** un grand titre-chapitre « POUR L'ÉQUIPE », sur fond vert profond. Les trois chapitres (S9, S10 et S12) ont **le même gabarit** : petit numéro « 1/3 » à « 3/3 », étiquette citron.
- **« conseil vendu » (46,3 → 47,0) :** la **carte du compteur des conseils vendus** (§4) arrive. Le grand nombre défile de 127 à **128** (`compteur`, `machine-a-sous`). Les onglets de période sont « Aujourd'hui · Cette semaine · Ce mois-ci ». On voit aussi le chiffre d'affaires ajouté et la barre d'objectif « 10 % des ventes ».
- **« en direct » (47,5 → 48,3) :** un point rouge « EN DIRECT » qui pulse, et un mini-classement de l'équipe : trois avatars à initiales, dont un qui monte d'une place (`orbite` ou `ui-ding`).
- **La mention :** « Illustration · exemples ».

### S10 — Le patient (48,5 → 53,8)

- **« Pour le patient » (48,7) :** le chapitre « 2/3 · POUR LE PATIENT ».
- **« bilan par e-mail » (49,9 → 50,4) :** un téléphone arrive et vibre (`telephone-vibre`), avec une notification `mail`. On voit l'e-mail « Votre bilan conseil » de la pharmacie (sans nom de patient), et la fiche du produit : « Probiotique · Pourquoi avec votre traitement · 3 points clés ».
- **« rappel avant la fin de sa cure » (51,27 → 52,9) :** un calendrier où les jours se cochent (`tic` sur chaque jour), puis la notification « Rappel : votre cure se termine bientôt » (`notif-douce`).

### S11 — L'application (53,3 → 60,1)

- **« Et bientôt » (53,64) :** une pastille **« BIENTÔT »** en citron, bien visible, qui reste pendant toute la scène.
- **« l'application PharmaBoost » (54,31 → 55,6) :** un téléphone de héros, en légère 3D, qui tourne, avec l'écran d'accueil de l'appli (d'après la maquette).
- **« scanner ses boîtes » (56,09) :** le viseur de l'appareil photo sur une boîte, et le laser (`scan-laser`, `verrou-hud`).
- **« suivre ses cures » (57,14) :** l'écran « Mes cures » et ses anneaux de progression qui se remplissent (`laser-ecrit` léger, `ui-pop`).
- **« profiter d'offres » (58,28) :** une carte d'offre, « Offre partenaire · −2 € sur votre prochaine cure », qui jaillit (`swipe-tel`, `etincelle`). Aucune marque.

### S12 — Les marques (59,6 → 66,0)

- **« Pour les marques » (60,15) :** le chapitre « 3/3 · POUR LES MARQUES ».
- **« challenges » (60,95) :** une carte « Votre marque · Challenge » (pictogramme générique, or) part comme un avion en papier (`avion-papier`). Elle se démultiplie vers **une grille d'écrans de comptoir** (6 à 12 bannières miniatures).
- **« au bon moment » (62,55) :** chaque bannière s'allume de sa pastille or, **au moment où une boîte est bipée** : `scanner-bip` en petite rafale, et `ui-ding`.
- **« Et chaque vente, comptée » (63,47 → 64,9) :**
  - **LE MIROIR DE S3 :** la carte de France revient, mais ses points s'allument en **VERT** un par un (`carte-ping` en rafale) ;
  - un compteur « ventes » défile (exemple) ;
  - `machine-a-sous`.
- **La mention :** « Illustration · exemples ».
- **La sortie :** les points convergent vers le centre (`Converge`). C'est la transition vers S13.

### S13 — La signature (65,5 → 75,0)

- **« PharmaBoost. » (65,75) :** le logo PharmaBoost **claque** au centre, avec `impact-epique`, `sub-boom`, une onde de choc, des étincelles et une secousse. Le robot (`Mascot`) fait coucou.
- **66,6 → 69,4 :** la phrase du site, en deux lignes : « Le copilote IA du comptoir » / « *de votre pharmacie.* ». La 2e ligne porte le dégradé sarcelle → cyan (`BRAND_GRAD`), mot à mot sur la voix.
- **D5, « Il vous fallait autre chose ? » (69,98 → 71,5) :** **LE CLIN D'ŒIL.**
  - La musique s'éteint.
  - La bulle de la pharmacienne (souriante) revient, comme dans l'ouverture, mais lumineuse.
  - Le robot fait un clin d'œil.
- **72,0, l'accord final :**
  - « **pharmaboost.app** » et un bouton « Réserver une démo », comme sur le site ;
  - le logo reclaque ;
  - les sons : `impact-epique` + `sub-boom` + `scintillement` + `etincelle-magique` + `applaudissements` (≈ 0,3) ;
  - des confettis citron et menthe.
- **74,4 → 75,0 :** on tient l'image, puis fondu au vert profond.

## 6. Les bruitages

```ts
export const cues: Cue[] = [cue("scanner-bip", 26.45, 0.6), …]
```

- **Où sont les sons :** les noms sont les clés de `src/rembobine/kit/sfx-durees.json`. La description de chaque son neuf se trouve dans `tools/sons.mjs` (tableau `NEW`).
- **Les niveaux :**
  - environ 0,25 : discret ;
  - environ 0,5 : bien présent ;
  - de 0,7 à 0,9 : un impact.
- **La voix passe toujours au-dessus.** Sous un mot important, pas d'impact fort : on le met juste avant, ou entre deux mots.
- **Un son pour chaque geste visible,** mais pas de bouillie : 2 à 4 sons par seconde au plus, sauf rafale voulue (S3, S12).
- **L'ambiance de la pharmacie** est déjà posée par le film (0 → 7,6, puis sous l'acte 2, à 20,2 → 29,7).

## 7. Les règles du code

- **Le contrat d'une scène :**
  - un fichier par scène, `src/rembobine/scenes/sNN-*.tsx` (le nom est dans `timeline.ts`) ;
  - il exporte `Scene({ t })` et `cues` ;
  - `t` est le temps du **film**, et tout se calcule depuis `t`.
- **Ce qui est interdit dans une scène :** `<Sequence>`, `Math.random`, `Date`. Pour le hasard, utiliser `hash` / `rnd` du kit.
- **Le kit :** `import { … } from "../kit"`. Lire l'en-tête des modules : `kit/*.ts(x)` et, pour les modules repris, `src/presentation/motion/kit/*.ts(x)`.
  - **Ne pas modifier le kit ni les fichiers des autres scènes.** Un utilitaire propre à la scène s'écrit dans le fichier de la scène.
  - Si le kit a vraiment un défaut, le contourner dans la scène et le signaler dans le compte rendu.
- **Les images :** `<Img src={staticFile("rembobine/images/…")}/>` de Remotion.
- **Les performances :**
  - pas plus d'environ 12 éléments flous (`filter: blur`) à la fois ;
  - `<MotionBlur>` seulement sur des plages courtes (≤ 0,3 s) ;
  - le rendu 4K multiplie le coût par 4 ;
  - **pas de milliers de nœuds DOM :** pour « des centaines de vignettes » (S3), dessiner des formes simples (SVG `<rect>`/`<circle>` ou une seule `<svg>`), pas des centaines de composants complets.

## 8. Vérifier — obligatoire, plusieurs fois

Depuis `video/` :

```
node src/rembobine/tools/planche.mjs S3                 # 8 images de la scène (scène seule)
node src/rembobine/tools/planche.mjs S3 13.5 13.6 15.6  # ces temps précis
node src/rembobine/tools/planche.mjs S3 --film          # dans le film entier (voisines, transitions) — à la fin seulement
node src/rembobine/tools/types.mjs S3                   # zéro erreur de type dans SON fichier
```

- **À tour de rôle :** les planches et tsc passent deux à la fois au plus sur la machine. Si l'outil dit qu'il attend sa place, c'est normal.
- **Le disque est presque plein :** aucun gros fichier (pas de rendu vidéo), et rien d'effacé hors de ta scène.
- **Les planches :** `out/rembobine/planches/<scène>.jpg`. **On les regarde** avec l'outil Read : le temps du film est écrit en haut à gauche de chaque image.
- **Pour vérifier le mouvement :** une planche serrée, par exemple 8 temps espacés de 0,05 s autour d'une arrivée.
- **Ce qu'on contrôle :**
  - lisibilité ;
  - rien de coupé par le bord ni sous y = 930 ;
  - textes exacts (accents, insécables) ;
  - harmonie de couleurs ;
  - cohérence avec le décor partagé ;
  - aucune image vide ou noire pendant la fenêtre, sauf effet voulu (fin de S3) ;
  - la transition de sortie ;
  - **le mot dit = l'image montrée**.
