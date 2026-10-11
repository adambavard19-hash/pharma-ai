# PharmaBoost — les films (16:9, 60 images/s)

Le pharmacien travaille comme d'habitude ; PharmaBoost travaille à côté et
l'aide au bon moment. Films fabriqués en code (Remotion) avec l'identité réelle
(`src/app/globals.css` d'octobre 2026, logo `public/logo.png`, police Plus
Jakarta Sans, titres en 700) et les écrans redessinés à l'identique (textes pris
dans le code). Deux fonds seulement : le fond clair de l'application (#f9fbfb)
et le bleu-vert profond de la bannière du comptoir (`agent/src/banner-design.ts`,
cardTop → cardBottom, lueur menthe) — jamais un aplat de vert foncé.

Les scènes sont écrites en « images de scène » (30/s à 100 BPM, une mesure =
72) ; chaque film les joue plus ou moins vite (`speed` du film) pour tomber sur
le tempo de sa musique : changer le rythme ne touche à aucune scène.

Les mots des films sont ceux du site (`src/app/(public)/decouvrir/page.tsx`) :
les trois étapes (« Vous scannez les boîtes », « La bannière propose », « Le
patient repart avec ses conseils »), les exemples (« Le conseil qui va avec le
traitement »), les cases de la sécurité, le départage (« À conseil égal, après
vos laboratoires préférés : la date courte, puis le challenge en cours »), « Un
comptoir, une personne ». Quand le site change, les films suivent.

## La bannière dans les films

`src/ui/banner.tsx` redessine la bannière du poste de caisse image par image,
d'après l'aperçu `agent/src/banner-preview.ts` : couleurs, cotes et phrases lues
dans `agent/src/banner-design.ts` (la source que la bannière Windows lit aussi),
robot recalculé à chaque image (Remotion exige un rendu déterministe). Ce
qu'elle affiche passe par le code de l'application, jamais par une phrase
écrite pour le film :

- l'avis : le vrai constructeur (`src/core/counter/notice.ts`) — titre
  « Médicament détecté », ce qui a été scanné, alertes (deux au plus), conseils ;
- les alertes : TOUTES celles que le moteur de vigilances
  (`src/core/ai/engines/vigilance.ts`) lève sur la vente montrée, comme au
  comptoir — une vente qui en cacherait une n'est pas montrée ;
- la raison sous chaque produit : la raison courte de sa règle
  (`src/core/ai/engines/advice.ts`), calculée par le moteur pour CETTE vente
  (« Antibiothérapie (AMOXICILLINE) : la flore intestinale… », coupée en bout
  de ligne comme sur Windows). Si la règle d'un produit montré ne se déclenche
  pas sur la vente, le rendu échoue ;
- les questions : l'arbre du comptoir (`src/core/counter/question-tree.ts`).

C'est une illustration, pas une capture de Windows (la bannière Windows écrit
en Segoe UI) : chaque plan porte la mention « Illustration de la bannière du
poste de caisse · produits et prix : exemples ». Elle est agrandie 1,3 à 1,8
fois pour se lire en 1080p.

Les ventes montrées (`SALES`, `src/ui/banner.tsx`) :

| Vente | Lignes | Ce que la bannière montre |
|---|---|---|
| `ordonnance` | AMOXICILLINE 1 g + VALACICLOVIR 500 mg | Aucune mise en garde. « 2 conseils disponibles » : PROBIOTIQUE 30 gélules (14,90 €, Challenge, Date courte 30/11/26, En stock · 12) et ANTISEPTIQUE CUTANÉ 100 ml (5,20 €, Stock faible · 3) — les deux conseils de la démonstration du site |
| `douleur` | DOLIPRANE 1000 mg | Aucune mise en garde. « Pourquoi le patient prend-il DOLIPRANE 1000 mg ? » → Douleur localisée → « Où le patient a-t-il mal ? » → Dos → POCHE CHAUD/FROID DOS |
| `rhume` | AMOXICILLINE 1 g + FERVEX ADULTES | La mise en garde « Paracétamol : 3 g par jour au maximum » (texte du moteur), puis le probiotique |
| `antibiotique` | AMOXICILLINE 1 g | Aucune mise en garde. « 1 conseil disponible » : PROBIOTIQUE 30 gélules, En stock · 18 |

Les états montrés : « En attente de scan… » → « Scan détecté ! » / « Analyse en
cours… » → « 2 conseils disponibles » + « Voir les conseils » → la liste (« Pour :
médicament », raison, prix, pastilles Challenge / Date courte / En stock · N /
Stock faible · N, Vendu / Non vendu puis « Modifier ») → la carte « E-mail du
patient » avec la case de consentement → « Vente terminée ! ».

## Présentation — `Presentation`, 48 s, 120 BPM (24 mesures)

En haut de l'accueil du site (« Voir la présentation »).

| Temps | Image | Texte à l'écran | Son |
|---|---|---|---|
| 0–12 | Fond bleu-vert de la bannière, trois questions puis la réponse | « Et si chaque délivrance révélait tout son potentiel de conseil ? » · « Comment ne manquer aucune opportunité de conseil au comptoir ? » · « Votre équipe officinale peut-elle penser à tout le potentiel de conseil à chaque délivrance ? » · « PharmaBoost, **oui.** » | Impacts, tics |
| 12–16 | Logiciel de gestion générique (« Logiciel de gestion · Comptoir 1 ») ; AMOXICILLINE 1 g puis VALACICLOVIR 500 mg passent au lecteur, une ligne s'ajoute à chaque scan ; la bannière, en haut à droite, passe de « En attente de scan… » à « Scan détecté ! » | « Vous scannez. **Comme d'habitude.** » | Scan 13 s · 14 s |
| 16–17 | « 2 conseils disponibles » · « Voir les conseils » | « Une bannière, à côté **de votre logiciel.** » | Pop |
| 17–19 | La bannière s'ouvre ; le logiciel passe au second plan ; les pastilles du probiotique s'entourent | « Choisi **dans votre stock.** » · « Uniquement ce que vous avez en rayon, avec le prix et le stock. » | Swish |
| 19–22 | Le pointeur clique « Vendu » (probiotique), « Non vendu » (antiseptique cutané) | « Le pharmacien et le préparateur **gardent la décision.** » · « Vendu ou non vendu : un clic, au comptoir. » | Clics |
| 22–28 | « Ajouter l'e-mail du patient » → carte « E-mail du patient », adresse d'exemple tapée, case « Le patient accepte de recevoir son bilan par e-mail », « Enregistrer l'e-mail » → « E-mail enregistré » ; « Vente terminée » | « Son bilan par e-mail, **avec son accord.** » · « L'adresse e-mail du bilan est effacée après l'envoi. » | Frappe, clics |
| 28–30 | « Vente terminée ! » · « 1 vendu · 1 non vendu · 0 sans réponse » · « ✓ Bilan envoyé au patient. » ; le logiciel revient | « Une vente suivie **jusqu'au bout.** » | Pop, notification |
| 30–36 | Le téléphone du patient : le plan conseil de la MÊME ordonnance (AMOXICILLINE 1 g matin et soir 6 jours, VALACICLOVIR 500 mg matin et soir 5 jours, conseil « PROBIOTIQUE 30 gélules : à distance de l'antibiotique, pendant toute la cure. »), rappel « Matin — traitement · AMOXICILLINE 1 g — 1 comprimé » | « Ou, depuis l'écran de vente : » · « Son plan **conseil complet.** » · « Posologie, indication, rappels : sur son téléphone, par e-mail ou imprimé. » | Notification |
| 36–42 | Quatre des six cases du site | « La sécurité **avant la suggestion.** » · Mises en garde · Posologie (3 g de paracétamol par jour au maximum) · Décision · Données : « Aucune fiche patient. L'e-mail du bilan est effacé après l'envoi. » | Pops |
| 42–48 | Carte de fin | « Scan. Conseil. **Bilan.** » → symbole, **PharmaBoost**, « Le copilote du comptoir officinal. », « Réserver une démo → », pharmaboost.app | Impact, accord tenu |

## Comment ça marche — `CommentCaMarche`, 44 s, 136 BPM (25 mesures)

Section « Comment ça marche » du site. Les trois étapes du site, mêmes titres,
annoncées une à une sur le fond bleu-vert.

| Temps | Image | Texte à l'écran |
|---|---|---|
| 0–2,2 | Étape | « Comment ça marche » · **01** « Vous scannez les boîtes » |
| 2,2–6,6 | Logiciel de gestion, deux scans (AMOXICILLINE 1 g, VALACICLOVIR 500 mg) ; bannière « En attente de scan… » → « Scan détecté ! » / « Analyse en cours… » | « Vous scannez. **Comme d'habitude.** » · « La bannière réagit **dès le premier scan.** » |
| 6,6–8,8 | Étape | **02** « La bannière propose » |
| 8,8–15,9 | « 2 conseils disponibles » → la liste : PROBIOTIQUE 30 gélules · Pour : AMOXICILLINE 1 g · Challenge · Date courte 30/11/26 · En stock · 12 ; ANTISEPTIQUE CUTANÉ 100 ml · Pour : VALACICLOVIR 500 mg · Stock faible · 3 ; puis Vendu / Non vendu | « Les conseils arrivent **sur la bannière.** » · « Choisis **dans votre stock.** » (Challenge, date courte, stock) · « Vendu ou non vendu : **un clic.** » |
| 15,9–21,2 | DOLIPRANE 1000 mg seul : « Une question à poser » → « Pourquoi le patient prend-il DOLIPRANE 1000 mg ? » → Douleur localisée → « Où le patient a-t-il mal ? » → Dos → « POCHE CHAUD/FROID DOS » apparaît | « Parfois, d'abord **une question.** » · « Pourquoi ? Où ? **Puis le bon produit.** » |
| 21,2–24,7 | AMOXICILLINE 1 g + FERVEX ADULTES : la mise en garde « Paracétamol : 3 g par jour au maximum », texte du moteur, au-dessus du conseil | « Les mises en garde **passent avant.** » · « Ici : 3 g de paracétamol par jour au maximum, tous produits confondus. » |
| 24,7–27,8 | Le tableau des exemples du site, colonnes « Au scan » · « PharmaBoost vous montre » · « Pourquoi » : DOXYCYCLINE → + Protection solaire SPF 50+ ; ISOTRÉTINOÏNE → + Routine : nettoyer, hydrater, protéger (« À éviter : gommages et peelings ») ; ANTIPARASITAIRE CHIEN → ⚠ Danger pour le chat (ANSES) | « Le conseil qui va **avec le traitement.** » |
| 27,8–30 | Étape | **03** « Le patient repart avec ses conseils » |
| 30–34,4 | Carte « E-mail du patient », consentement, « Vente terminée ! » (1 vendu · 1 non vendu) | « Son bilan par e-mail, **avec son accord.** » · « Seulement les produits vendus. L'adresse e-mail du bilan est effacée après l'envoi. » |
| 34,4–38,8 | Le plan conseil de la même ordonnance (AMOXICILLINE 1 g + VALACICLOVIR 500 mg), rappel « Matin — traitement » | « Ou, depuis l'écran de vente : » · « Son plan **conseil complet.** » · « Posologie, indication, rappels : sur son téléphone, par e-mail ou imprimé. » |
| 38,8–44 | Carte de fin | « Du scan au conseil, **en trois étapes.** » → « Le copilote du comptoir officinal. » · « Réserver une démo → » · pharmaboost.app |

## Pourquoi PharmaBoost — `Pourquoi`, 34 s, 120 BPM (17 mesures)

Page « Pourquoi PharmaBoost » du site (« Voir en vidéo »). Les deux problèmes de
la page, chacun en « Sans PharmaBoost » / « Avec PharmaBoost » (l'interrupteur
du site, au même endroit dans les deux).

| Temps | Image | Texte à l'écran |
|---|---|---|
| 0–4 | Fond bleu-vert de la bannière | « Et si chaque délivrance révélait tout son potentiel **de conseil ?** » |
| 4–10 | Sans : la file de patients, le pharmacien seul, trois questions qui s'empilent | « Problème 1 · Au comptoir » · « Des milliers de produits. **Un patient à la fois.** » · « Impossible de tout avoir en tête : le bon conseil passe parfois à la trappe. » · « Quel conseil avec cet antibiotique ? » · « Un probiotique en rayon ? Lequel ? » · « Une précaution à rappeler ? » · « Le patient repart sans conseil. » |
| 10–16 | Avec : la bannière du poste de caisse, « Scan détecté ! » (10,1 s) → « 1 conseil disponible » · AMOXICILLINE 1 g (11,1 s) → ouverte (12,2 s) : PROBIOTIQUE 30 gélules · 14,90 € · Pour : AMOXICILLINE 1 g · raison du moteur · En stock · 18 ; le pointeur clique « Vendu » (14,3 s) | « PharmaBoost **y pense avec vous.** » · « Au moment du scan, ce qui accompagne le traitement, pris dans votre rayon. Vous décidez. » · « Le patient repart avec le bon conseil. » |
| 16–22 | Sans : trois boîtes en vrac (AMOXICILLINE 1 g, PARACÉTAMOL 1000 mg, PROBIOTIQUE), trois questions | « Problème 2 · À la maison » · « Plusieurs boîtes. Et beaucoup **de questions.** » |
| 22–28 | Avec : le plan conseil sur le téléphone (AMOXICILLINE 1 g matin et soir, PARACÉTAMOL 1000 mg si besoin, conseil probiotique), le rappel « Matin — traitement » (23,6 s) | « Il repart avec son plan conseil, **et ses rappels.** » · « La posologie, l'indication de chaque médicament et vos conseils. Sur son téléphone via un QR code, par e-mail ou en version imprimée, avec des rappels. » |
| 28–34 | Carte de fin | « Un conseil au bon moment. **Un patient qui sait quoi prendre.** » → « Le copilote du comptoir officinal. » · « Réserver une démo → » · pharmaboost.app |

Retirés exprès : « Et un signe de la pharmacie le dernier jour. » et le rappel
de fin de traitement (« votre pharmacien prend de vos nouvelles ») — des
promesses ; « les meilleures références de votre officine » — un jugement de
qualité que rien ne mesure. La doxycycline a quitté ce film : sur elle, le
moteur de vigilances affiche deux mises en garde (compléments minéraux,
rétinoïdes) que le plan aurait dû montrer, et la crème solaire attend une
question sur l'exposition au soleil. L'amoxicilline n'a aucune mise en garde et
son probiotique est proposé dès le scan.

## Les avantages — `Avantages`, 37,5 s, 128 BPM (20 mesures)

Section « Stock et marge » du site (« Voir les avantages »). Huit avantages de
deux mesures (3,75 s), coupés sur le temps ; à gauche le numéro (« 01 / 08 »),
le titre et une phrase, à droite l'écran qui le prouve.

| Temps | Écran | Texte à l'écran |
|---|---|---|
| 0–1,9 | Fond bleu-vert | « **8 avantages** pour votre comptoir. » |
| 1,9–5,6 | 01 · Le logiciel de gestion, une ligne scannée ; la bannière à côté passe de « En attente de scan… » à « Scan détecté ! » | « Votre logiciel **ne change pas.** » · « Même scan, même comptoir. PharmaBoost travaille à côté. » |
| 5,6–9,4 | 02 · Un écran de comptoir : le logiciel en plein écran, la bannière en haut à droite, « 2 conseils disponibles » · « Voir les conseils » | « Le conseil arrive **au scan.** » · « En haut à droite de votre écran, il reste là jusqu'à la fin de la vente. » |
| 9,4–13,1 | 03 · DOLIPRANE 1000 mg : « Pourquoi le patient prend-il DOLIPRANE 1000 mg ? » → Douleur localisée → « Où le patient a-t-il mal ? » → Dos → POCHE CHAUD/FROID DOS | « Une question, **puis le conseil.** » · « Pourquoi ? Où ? Le produit de la bonne zone n'arrive qu'après la réponse. » |
| 13,1–16,9 | 04 · Le rayon (12 vignettes) : ce qui n'est pas en stock s'efface, la crème solaire s'entoure ; dessous, « Crème solaire SPF 50+ · 16,90 € · En stock · 18 » et « Probiotique · 14,90 € · Stock faible · 3 » (pastilles de la bannière) | « Choisi **dans votre stock.** » · « Uniquement ce que vous avez en rayon, avec le prix et le stock. » · « Produits, prix et stocks : exemples » |
| 16,9–20,6 | 05 · La bannière ouverte sur deux conseils : « Vendu » (probiotique), « Non vendu » (antiseptique cutané), puis « ✓ Vendu » + « Modifier » | « Le pharmacien et le préparateur **gardent la décision.** » · « Vendu ou non vendu : un clic, au comptoir. » |
| 20,6–24,4 | 06 · Laboratoires (« Mettre en avant » → « ✓ Mise en avant », « Écarter ») ; « Au comptoir, sur la bannière : » Challenge · Date courte 30/11/26 · En stock · 12 | « Vos laboratoires préférés **passent en premier.** » · « Quand deux produits répondent aussi bien au besoin, le vôtre est proposé en premier. » · « À conseil égal, après vos laboratoires préférés : la date courte, puis le challenge en cours. » |
| 24,4–28,1 | 07 · Le plan conseil sur le téléphone (DOXYCYCLINE 100 mg, crème solaire SPF 50+), rappel « Matin — traitement » | « Un plan conseil, **quand vous le remettez.** » · « QR code, e-mail ou papier. Les rappels dans son agenda. » |
| 28,1–31,9 | 08 · « Mon équipe » : Aujourd'hui / Cette semaine / **Ce mois** / Cette année ; Classement (rang, proposés, validés, taux : Camille Martin 22 · 15 · 68 %…) ; « Challenges en cours » : Laboratoire A, Challenge probiotiques, 34 sur 50 unités | « Un comptoir, une personne. **Les résultats de chacun.** » · « Proposés, validés, taux. Et la progression de chaque challenge. » |
| 31,9–37,5 | Carte de fin | « Le bon conseil, au bon moment. **Vous gardez la main.** » → « Réserver une démo → » |

Chaque plan de la bannière porte la mention d'illustration ; le rayon dit
« Produits, prix et stocks : exemples » ; Laboratoires et Mon équipe portent
« exemple ». Les laboratoires ne passent jamais devant un produit plus adapté
(`src/core/ai/engines/tiebreak.ts` : la formule de la règle, puis la préférence
déclarée et la gamme préférée, puis la date courte, puis le challenge). La
marge n'est pas montrée : la bannière ne l'affiche pas (seulement l'écran de
vente). « Par collaborateur » est devenu « Un comptoir, une personne » : le
logiciel de gestion ne dit pas qui a scanné, un résultat revient à la personne
attribuée au comptoir.

## Sans ordonnance — `SansOrdonnance`, 25 s, 124 BPM (13 mesures)

Section « Sans ordonnance » du site (« Voir en vidéo »). La carte « Demande sans
ordonnance » de Nouvelle vente (`vente/nouvelle/counter-request.tsx`), au
dessin de l'application : rayons 12 à 16 px, bouton « Conseiller » en dégradé.

| Temps | Image | Texte à l'écran |
|---|---|---|
| 0–3,9 | Fond bleu-vert | « Pas **d'ordonnance** ? » → « Le client **décrit.** » |
| 3,9–9,7 | La carte : description de l'application, « Nez bouché et mal à la gorge depuis hier, adulte. » tapé au clavier, Âge 34, Enceinte / Allaite, le pointeur clique « Conseiller » ; dessous, le champ « Traitements en cours, séparés par des virgules (facultatif) » | « Vous tapez **ce que dit le client.** » |
| 9,7–15,5 | La demande et l'âge ; les besoins reconnus en pastilles (« Nez bouché ou qui coule », « Gorge irritée ») ; « À vérifier avant de proposer » (grossesse ou allaitement, durée et fièvre) ; deux produits en rayon : Spray nasal eau de mer isotonique 6,90 € · 36 en stock, Pastilles gorge miel-citron 5,90 € · 58 en stock | « Besoin reconnu. **Questions à poser.** Produits en rayon. » · « exemple · produits et prix de démonstration » |
| 15,5–19,4 | « Toux et gêne pour respirer depuis ce matin. » → « Orienter vers le médecin » · « Gêne respiratoire signalée. » | « Quand il le faut, **le médecin d'abord.** » |
| 19,4–25,2 | Carte de fin | « Le pharmacien et le préparateur **gardent la décision.** » → « Réserver une démo → » |

Les besoins, questions et signaux d'alerte sont ceux de
`src/core/understanding/needs.ts` et `src/core/counter/request.ts`.

## Partenaires — `Partenaires`, 44 s, 120 BPM (22 mesures)

Pour les laboratoires et les marques. Sur le site : page
`decouvrir/partenaires`, bouton « Voir la vidéo » de l'accueil de la page
(`FILMS.partenaires`, `public/video/pharmaboost-partenaires.mp4`, affiche image
880). La promesse, décidée par le fondateur : de la **visibilité**, le conseil
**intact**. Ce que la carte montre passe par le code de l'application : le
besoin vient du moteur de conseil (`advice.ts`) sur la vente `antibiotique`, la
carte du sélecteur `selectCounterCards` (`src/core/partners/counter-card.ts`),
calculée APRÈS le moteur ; son texte par `universeLabel`
(`src/config/universes.ts`). Si le sélecteur ne la montrait pas, le rendu
échouerait. Les écrans (`src/ui/partner.tsx`) sont redessinés d'après
`vente/[id]/partner-cards.tsx`, `advice-zone.tsx`, `delivery-zone.tsx`,
`partenaires/[slug]/page.tsx`, `partner-actions.tsx` et les statistiques
agrégées (`stats.ts`).

| Temps | Image | Texte à l'écran |
|---|---|---|
| 0–4 | Fond bleu-vert | « Votre marque, **au comptoir des pharmacies.** » · « Pour les laboratoires et les marques. » |
| 4–10 | Logiciel de gestion, AMOXICILLINE 1 g au scan ; la bannière « En attente de scan… » → « 1 conseil disponible » → ouverte : PROBIOTIQUE 30 gélules, raison du moteur ; le pointeur clique « Voir le détail » (qui ouvre la vente dans PharmaBoost). Aucune gamme partenaire sur la bannière : elle n'en montre jamais | « À chaque scan, le moteur **cherche un besoin.** » (aucune promesse de fréquence) · « Le moteur retient **le besoin.** » · « Ici : la flore intestinale, pendant l'antibiotique. » |
| 10–18 | L'écran de vente sur ~700 px (une colonne, comme l'application sous 1 280 px) : la carte du conseil (« Conseil associé », PROBIOTIQUE 30 gélules 14,90 €, Proposer / Autre produit / Ignorer), « Délivrance », puis à part la carte « À découvrir · gamme partenaire » : « Marque A · Laboratoire A », « Une alternative existe dans cet univers : compléments alimentaires. », « Voir la gamme », la mention « …Elle n'entre jamais dans le choix des conseils. » ; le pointeur clique « Voir la gamme » | « Votre gamme **peut** apparaître, **au bon moment.** » · « Quand le besoin retenu entre dans votre univers, si l'officine ne l'a pas masquée : à part, sous les conseils. » |
| 18–24 | La page de la marque : Gamme Ferments (3 produits, prix pro HT, prix public conseillé), Conditions professionnelles (Offre d'implantation), Formations | « Votre **vitrine.** » · Gammes et produits · Conditions professionnelles · Formations |
| 24–29 | « Contacter ou commander » (lien B2B) : « Ouvrir le portail B2B » → « Portail ouvert dans un nouvel onglet, avec cet identifiant : PB-7K3M-Q9TD » ; à gauche : Lien B2B attribué, Formulaire, E-mail | « Commander, **simplement.** » |
| 29–33 | « Bilan · Marque A », « Communiqué par l'équipe PharmaBoost. » (aucun espace partenaire n'existe), « Agrégats uniquement » ; les quatre compteurs réels SANS chiffre (une pastille à la place de chaque valeur, même largeur pour tous) | Surtitre « Ce que vous recevez » · « Des chiffres **d'ensemble.** » · « Rien sur les patients. Une demande ou une commande ne vous parvient que si l'officine la passe. » |
| 33–38 | Fond bleu-vert, quatre cases courtes | « Ce qui fait votre crédibilité : le conseil reste **indépendant.** » · Votre gamme, à part, signalée comme partenaire · Une gamme ne remplace jamais un conseil · Le titulaire peut masquer une marque · Rien sur un patient n'est transmis |
| 38–44 | Carte de fin | « Votre marque, visible. **Le conseil, indépendant.** » → « Devenir partenaire → » · pharmaboost.app |

Ce qu'il ne faut pas promettre, et pourquoi :

- **« peut » apparaître.** Le sélecteur garde UNE marque par besoin (la
  première par ordre alphabétique) et deux cartes au plus par vente ; il n'en
  montre pas pour une marque masquée ou refusée par l'officine, ni quand le
  produit conseillé est déjà de cette marque.
- **Aucun chiffre de statistiques.** Aucun partenaire n'existe encore ; des
  nombres, même dits « exemple », se liraient comme des résultats.
- **« aucune officine nommée » vaut pour les compteurs seulement** : une
  demande de contact ou une commande transmet au laboratoire le nom, la ville,
  le FINESS, l'e-mail et le téléphone de l'officine qui la passe
  (`partner-actions.tsx`).

Aucun partenaire réel : « Marque A », « Laboratoire A », produits, prix,
conditions et formations d'exemple, dits à l'écran sur chaque plan. Jamais
« recommandée », jamais « comme conseil », aucune promesse de ventes, aucun
témoignage. Le produit conseillé (PROBIOTIQUE, sans marque) n'est pas de la
marque partenaire : sinon la carte ne s'afficherait pas. Entre deux plans
clairs, le plan qui sort s'efface dans son fond (`Veil`) avant que le suivant
n'entre : jamais deux écrans ni deux mentions lisibles l'un sur l'autre. Les
modules de l'application lus par ce film importent leurs types par « @/ » :
d'où le `paths` de `tsconfig.json`.

## Tarif — `Tarif`, ≈ 39 s, voix off (Yann, ElevenLabs)

Section tarif du site : pourquoi PharmaBoost vaut son abonnement, avec LE calcul
du simulateur (`src/core/pricing/revenue-estimate.ts`) et l'offre officielle
(`src/core/pricing/official-offer.ts`), importés : aucun chiffre n'est écrit
dans le film. Le texte est dans `src/tarif/script.ts` (une seule source : ce qui
s'affiche en chiffres, ce que dit la voix en toutes lettres, les sous-titres) ;
la voix, `npm run tarif:voix` (ElevenLabs, voix « Yann », clé lue dans
`~/.pharmaboost-voix.env`, seules les phrases nouvelles ou changées sont
demandées) → `public/voix/tarif/T1…T7.mp3` + `voix.json`. Comme le reel, le
montage se cale sur la voix mesurée (`calculateMetadata`) ; le film refuse de
se rendre si la voix ne dit plus le script (un chiffre du site a changé).

| Voix | Image | Texte à l'écran |
|---|---|---|
| T1 « Combien PharmaBoost peut-il vous rapporter ? Faisons le calcul, simplement. » | Le robot du logo, les symboles du calcul autour ; ils plongent dans les quatre étapes (« ? ») | Les étapes du simulateur : Clients par jour · Clients conseillés (10 %) · × 7 € par produit en moyenne · × 25 jours d'ouverture |
| T2 « …200 clients par jour. » | La croix de pharmacie, puis 200 clients qui se remplissent en vague, le compteur monte à 200 | Les étapes montent en haut de l'image et se remplissent au fil de la voix |
| T3 « Si seulement 10 %… 20 clients par jour. » | « × 10 % » en grand, la foule s'assombrit, un client sur dix s'allume (+), le compteur passe à 20 | « clients conseillés par jour » |
| T4 « À 7 € le produit en moyenne : 140 € par jour. » | Les 20 se rangent, chacun reçoit une pièce de 7 €, les pièces montent dans le compteur | « 20 × 7 € = 140 € » |
| T5 « Sur 25 jours d'ouverture : 3 500 €… chaque mois. » | Un calendrier de 25 jours qui se remplit (+140 € chacun), le cumul « après N jours », puis « 3 500 € par mois » | « Chiffre d'affaires, pas une marge. » |
| T6 « Pour un abonnement de 126 € HT par mois. » | Le résultat du simulateur : deux barres à la même échelle, 3 500 € et 126 € HT (entourée) | « À la même échelle » |
| T7 « Faites le calcul avec votre propre nombre de clients, juste en dessous. » | Le simulateur du site (mêmes libellés) ; le pointeur mène le curseur de 200 à 300, tout se recalcule (5 250 €) ; deux flèches vers le bas | La note du site, mot pour mot |
| — | Carte de fin, le robot à la place du symbole (`EndCard mark="robot"`) | « Un seul abonnement. Tout est inclus. » · « Réserver une démo → » · pharmaboost.app |

Honnêteté, en bas de l'image de T2 à T6 : « Estimation indicative : ce n'est pas
une promesse de résultat. Chiffre d'affaires, pas une marge. » ; les trois
hypothèses restent écrites en haut pendant tout le calcul. C'est le seul film
qui donne un chiffre commercial : celui du simulateur du site, avec ses
hypothèses, jamais présenté comme un résultat. Le « 300 » du simulateur est un
exemple de saisie, pas une hypothèse. Sur le site, le bouton « Voir le calcul
en vidéo » (39 s) est posé sous le mot de réassurance, au-dessus du simulateur
de la section tarif : « juste en dessous » le suppose.

## Les règles des films

- **Ce qu'une vente montre, le moteur le ferait.** Chaque conseil d'une vente
  suit une règle qui propose son produit dès le scan, sans question (probiotique
  sous antibiotique, antiseptique cutané sous antiviral) ; ceux d'une question
  n'arrivent qu'après la réponse (poche chaud/froid du dos). Pas de vitamines
  « de convalescence » au scan (la règle attend que le patient se dise
  fatigué), pas de sérum sous cétirizine (la règle demande d'abord si le nez
  est bouché).
- **Toutes les mises en garde d'une vente sont montrées** (deux au plus, comme
  la bannière) ; sinon la vente change. Jamais deux antihistaminiques H1 dans
  une même vente (cétirizine et la phéniramine du Fervex : le moteur ne le
  signale pas, un pharmacien le verrait).
- La décision au comptoir est **déclarée** : « Vendu » / « Non vendu » dans la
  bannière (avec « Modifier »). Le pharmacien et le préparateur décident ; rien
  ne s'ajoute tout seul à la délivrance.
- Deux choses différentes, jamais confondues : le **bilan e-mail** de la
  bannière (seulement les produits marqués Vendu, ni médicament ni posologie,
  avec l'accord du patient, adresse effacée après l'envoi) et le **plan
  conseil** de l'écran de vente (posologie, indication, QR code, e-mail ou
  papier, rappels), toujours introduit par « Ou, depuis l'écran de vente : » et
  toujours sur l'ordonnance que la scène précédente vient de montrer.
- Données : « Aucune fiche patient », « L'e-mail du bilan est effacé après
  l'envoi ». Jamais « aucune donnée patient conservée » sans nuance, jamais
  d'hébergement « en Europe ».
- Pas de « stock en temps réel » : la bannière montre le stock connu (« En
  stock · 12 », « Stock faible · 3 »).
- Pas de « bip » ni de « douchette » à l'écran : on dit « scan ». Pas
  d'« interactions » : la mise en garde parle de posologie.
- Aucune promesse de résultat ni de délai (« Plus de conseils proposés » est
  retiré), aucun chiffre commercial, aucun témoignage, aucun logiciel d'éditeur
  nommé (fenêtre générique), aucun « validé par un pharmacien » (les règles
  sont en cours de relecture).
- Médicaments réels comme exemples (AMOXICILLINE, VALACICLOVIR, DOLIPRANE,
  FERVEX ; DOXYCYCLINE et ISOTRÉTINOÏNE dans les exemples et le plan des
  avantages) ; produits conseillés sous des noms génériques (PROBIOTIQUE,
  ANTISEPTIQUE CUTANÉ, POCHE CHAUD/FROID DOS, Crème solaire SPF 50+), prix et
  stocks d'exemple.
- « Mon équipe » montre ce que l'écran du titulaire montre : rang, proposés,
  validés, taux, challenges en cours. Noms et chiffres d'exemple.
- Pas de robot, de partenaires, de formations ni de nouvelles des patients
  (sauf le film `Partenaires`, qui en parle aux laboratoires).
- Bouton principal : « Réserver une démo » (« Devenir partenaire » pour `Partenaires`).

## Affiches du site

Une image de chaque film (`POSTERS`, `scripts/export.mjs`, en images à 60/s),
toujours sur un écran du produit : Presentation 1103 (la bannière ouverte sur
les deux conseils, « Choisi dans votre stock. »), CommentCaMarche 574 (« 2
conseils disponibles »), Pourquoi 910 (la bannière sur l'amoxicilline,
probiotique « Vendu », « Le patient repart avec le bon conseil. »), Avantages
1213 (05, Vendu / Non vendu et les pastilles), SansOrdonnance 800 (la demande
comprise et les deux produits), Partenaires 880 (l'écran de vente : le conseil
du moteur, « Délivrance », puis la carte « À découvrir · gamme partenaire »
entourée), Tarif 1600 (les deux barres à la même échelle, 3 500 € et 126 € HT
entourée ; la durée suit la voix : revérifier l'image après une nouvelle voix).

Le film de lancement (`Lancement`, 50 s, 1er octobre 2026) est archivé : il
date d'avant la bannière (avis en coin d'écran, « bip ») et n'est plus sur le
site. Le mode `web` ne le rend pas.

## Fabrication

```
cd video
npm run sons                         # effets et musiques (générés par code, aucun droit)
npm run studio                       # aperçu en direct sur http://localhost:3123
npm run brouillon -- CommentCaMarche # 960×540 → out/brouillons/…-540p.mp4, pour relire le montage
npm run web -- Presentation          # un film du site → ../public/video/<film>.mp4 + affiche <film>.jpg (≈ 2 min 30)
npm run web                          # les films du site et Partenaires, à la suite (sans Lancement)
npm run final -- Presentation        # master 4K, puis out/…-4k.mp4 et out/…-1080p.mp4 (archives)
npm run tarif:voix                   # la voix du film Tarif (ElevenLabs, Yann) : seulement les phrases changées
```

Une image fixe pour vérifier un plan : `npx remotion still src/index.ts
CommentCaMarche out/verif/comment-574.png --frame=574 --scale=0.5`.

Mode `web` : rendu direct en 1920×1080 (JPEG qualité 100, CRF 12, gardé dans
`out/web/`), puis le fichier du site en H.264 High, CRF 26, yuv420p, bt709, AAC
128 kb/s à 48 kHz, `+faststart`, son normalisé en deux passes à −16 LUFS
(crête −1,5 dBTP). L'affiche (1280×720) est une image précise du film, choisie
dans `POSTERS` (`scripts/export.mjs`) sur un écran du produit, jamais sur un
titre. Quand une durée change, la mettre à jour dans la liste des films du site
(`src/app/(public)/decouvrir/_components/video-dialog.tsx`).

Le mode `final` calcule en 4K (images JPEG qualité 100) puis réduit en 1080p au
filtre Lanczos ; H.264 High, CRF 16, bt709.

Musique : une piste par film (`scripts/musique.mjs`), tempo et nombre de
mesures calés sur la durée du film ; si un film change de longueur, changer ses
mesures puis `npm run sons`.

Remotion est gratuit jusqu'à 3 salariés ; au-delà, licence entreprise.
