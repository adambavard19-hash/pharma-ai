# Les quatre vidéos de présentation — consigne commune (fondateur, 6 nov. 2026)

## Ce que veut le fondateur (ses mots, résumés)
Quatre vidéos de présentation de PharmaBoost, **complètement différentes** les unes des autres et du film actuel
(`src/iso/Film.tsx`), mais dans **le même univers visuel**. Chacune doit être **animée du début à la fin, captivante,
impressionnante**, tenir le spectateur (un pharmacien titulaire) jusqu'au bout, et faire comprendre **tout le système** :

1. on **scanne les médicaments de l'ordonnance** (la boîte passe sous la douchette, bip) ;
2. PharmaBoost propose **un ou plusieurs conseils** (produits) pris dans le stock ;
3. puis **la routine** complète qui accompagne le traitement ;
4. derrière, PharmaBoost **accompagne l'équipe** : il pense à la **date courte**, au **challenge laboratoire**, au
   **laboratoire préféré du titulaire** → chaque conseil donne **tout son potentiel** ;
5. le **bilan conseil par QR code** sur le téléphone du patient, avec le **rappel avant la fin de cure** ;
6. les **offres / campagnes** de la pharmacie → le patient **revient** ;
7. le **chiffre d'affaires monte**, la pharmacie **se démarque**, c'est **professionnel**, l'**équipe est soulagée**.

## Règles fermes
- **Aucune marque** de produit ou de laboratoire (« Laboratoire partenaire », produits dessinés sans nom de marque).
- Jamais « PharmaBoost pense pour vous » ni rien qui rabaisse le pharmacien : PharmaBoost **accompagne** et **fait gagner du temps**.
- Jamais de marge affichée **sur la bannière du comptoir**. (Le tableau du titulaire peut montrer le chiffre d'affaires.)
- Jamais « l'application arrive bientôt » : on la montre, elle existe.
- Pas de nom de vraie pharmacie : « Pharmacie du Centre ».
- Les voix sont **déjà enregistrées et figées** : n'ajoute, ne modifie, ne régénère AUCUNE voix (aucun appel ElevenLabs).

## Fichiers
- Le texte de chaque réplique : `src/promo/script.ts` (ids A1–A8 film 1, B1–B7 film 2, C1–C8 film 3, D1–D6 film 4).
- Les voix : `public/promo/voix/<id>.wav` → `staticFile(\`promo/voix/${id}.wav\`)`.
- Les temps de chaque mot : `src/promo/mots.json`, lus par `src/promo/kit.ts` (`timeline()` → `VAT`, `end(id)`, `w(id, mot, n)`).
  Cale chaque apparition sur le mot prononcé.
- Ton film : **uniquement** `src/promo/filmN/` (tu peux y créer plusieurs fichiers). Il exporte
  `export const FILM = { Film, TOTAL_FRAMES }` (60 i/s, 1920 × 1080). Ne modifie AUCUN autre fichier du dépôt (lecture libre).
- Référence de style et briques réutilisables, à lire d'abord : `src/iso/Film.tsx` (Title, Rise, Card, Pill, Abs, Scene, pop,
  prog, ressort, Ring, Sparkle, Flash, Confetti, PBLogo, Phone, Cross, Shop, PASSANTS, MINT, PB, JAKARTA, DupeTile/Dupe/DUPES,
  AdnBackdrop, Grain, Vignette, Cues/cue, la musique `rembobine/music/musique.wav` baissée sous les voix, les sous-titres
  `Captions`), puis `src/rembobine/kit` (BannerHead, BannerCard, MedBox — kinds : isotretinoine, amoxicilline, probiotique,
  cetirizine, eaudemer, hydratant…, Douchette, Ordonnance avec `lines`, Phone, MailBilan…) et les scènes
  `src/rembobine/iso/s01…s08` (le comptoir dessiné, la pharmacienne, le patient : exportent `Scene` et `cues`).
  Produits dessinés sans marque : DupeKind `iso-nettoyant`, `iso-hydratant`, `iso-levres`, `iso-solaire`. Pour les autres
  conseils (probiotique, lavage nasal…) utilise MedBox ou dessine une boîte sobre sans marque.
- Bruitages : `public/rembobine/sfx/*.wav` via `cue(nom, t, volume, rate?)` (noms = fichiers sans .wav).

## Exigences de fabrication
- **Sous-titres** en bas sur toutes les voix (comme `Captions` du film iso), lisibles, jamais masqués.
- **Musique** du film iso, baissée sous la voix ; un **bruitage sur chaque temps fort**.
- **Fin** : logo PharmaBoost, « Le copilote IA du comptoir de votre pharmacie », bouton « Réserver une démonstration »,
  « pharmaboost.app » — environ 3 s après la dernière voix, pas plus de 4 s.
- **Rien ne se chevauche** : aucun texte coupé, aucune carte qui en cache une autre, rien sous les sous-titres (y ≥ 960).
- **Ça bouge tout le temps** : jamais plus de ~1,5 s sans un mouvement, une apparition ou un changement de plan.

## Vérification (obligatoire avant de rendre la main)
1. `cd video && npx tsc --noEmit -p .` sans erreur.
2. Au moins 12 images fixes à des moments clés, en demi-taille :
   `npx remotion still src/promo/index.ts PresentationN out/promo/stills/N-<sec>.png --frame=<sec*60> --scale=0.5 --log=error`
   puis **regarde chaque image** (outil Read sur le .png) et corrige tout chevauchement, texte coupé ou vide.
3. **Ne lance PAS de rendu complet** (`remotion render`) : la machine fabrique déjà une autre vidéo en 4K.
4. Ne fais aucun commit Git.

Rends en fin : la durée totale, la liste des scènes avec leurs temps, et les images vérifiées (chemins).
