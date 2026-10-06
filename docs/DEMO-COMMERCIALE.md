# Démonstration commerciale

Un compte de démonstration pour les rendez-vous en partage d'écran : une pharmacie fictive complète, des
scénarios de délivrance à lancer d'un clic, et un bouton pour tout remettre à zéro. C'est **la vraie
application** : aucun écran, aucune règle ni aucun moteur n'est dupliqué.

## Accès

| | |
|---|---|
| Adresse | `demo@pharmaboost.test` |
| Mot de passe | celui donné à l'installation (voir ci-dessous) |
| Officine | Pharmacie des Lilas (Lyon), groupe « Groupe Pharmacie des Lilas (démonstration) » |
| Équipe | Camille Moreau (titulaire), Julien Bernard (pharmacien), Sarah Lambert et Lucas Petit (préparateurs) |

Les adresses de l'équipe (`…@pharmaboost.test`) sont dans un domaine **réservé** (RFC 2606) : aucun courrier ne peut
les atteindre.

## Installer, remettre à zéro

```
npm run demo:commercial                         installe ou remet l'officine à l'état initial
npm run demo:commercial -- --mot-de-passe XXXX  fixe le mot de passe du compte
npm run demo:commercial -- --confirmer-production   obligatoire quand l'environnement est la production
npm run demo:verifier                           passe chaque scénario dans le vrai moteur et dit ce qu'il en sort
```

Hors production, le mot de passe par défaut est celui des comptes de démonstration. En production, il est tiré au hasard
et affiché **une seule fois**. Aucune migration n'est nécessaire : l'officine est une ligne ordinaire marquée `isDemo`.
Le script ne touche qu'à cette officine et à son groupe.

Dans l'application, le bouton **Réinitialiser la démo** (page « Simuler une délivrance ») fait la même chose : les ventes
simulées pendant le rendez-vous disparaissent, le stock et l'historique reviennent à l'état initial **datés d'aujourd'hui**.

## Ce que le présentateur voit

- Un badge discret **Mode démo** dans la barre du haut, et le bouton **Simuler une délivrance**.
- La page `/demo` : les scénarios, rangés par situation, chacun avec son « déroulé » (ce qu'on peut montrer).
- Sur « Nouvelle vente », un rappel : pas de douchette dans cette démonstration.

## Les scénarios

| Scénario | Ce qu'il montre |
|---|---|
| Angine : l'ordonnance classique | Antibiotique + paracétamol : flore, vitamines, confort intime, thermomètre. Trois familles de conseils. |
| Antibiotique et anti-inflammatoire | Deux besoins différents ; la question avant le confort gastrique. |
| Douleur : lombalgie | Confort gastrique, poche chaud-froid, transit sous opioïde. |
| Allergie saisonnière | Yeux (collyre en médicament conseil), nez, bouche sèche. |
| Patient senior, traitement chronique | Cinq boîtes : automesure de la tension, magnésium sous IPP, soin des pieds. Pas de conseil « pour la forme ». |
| Ordonnance chargée : sept boîtes | Regroupement en une ordonnance, huit conseils au plus. |
| Peau : isotrétinoïne | Une routine en trois gestes (nettoyer, hydrater, protéger) + lèvres. |
| Herpès : un produit en rupture | Patch, antiseptique, réparation ; la lysine est à zéro : le besoin remonte dans « Assortiment ». |
| Asthme : deux inhalateurs | Chambre d'inhalation, bain de bouche sans alcool. |
| Diabète et injections | Collecteur d'aiguilles, sucre rapide, soin des pieds. |
| Corticoïde par voie orale | Calcium et vitamine D, stock bas. |
| Anticoagulant : vigilance et boîte en rupture | La carte de vigilance, la ligne « Stock à zéro ». |
| Vente sans ordonnance : gorge et nez | La demande est déjà saisie ; on clique sur « Conseiller ». |
| Un enfant : diarrhée depuis ce matin | L'âge change la réponse (réhydratation, orientation médicale). |
| Vigilance : patiente enceinte | Les huiles essentielles sont écartées ; les vigilances déclarées s'affichent. |

Chaque bip passe par le **même service** que l'agent du poste de caisse : identification par le code CIP, regroupement des
bips d'une même minute en une seule ordonnance, baisse du stock. Le présentateur déroule ensuite le parcours normal :
analyse → conseils → « Pourquoi ce conseil ? » → stock → accepter ou refuser → plan patient.

## Les tableaux de bord

Cinq semaines de comptoir environ (65 jours), de l'ordre de 800 passages, 400 ventes et 1 100 conseils : **Pilotage**
(jour, semaine, mois, par collaborateur), **Ce que ça rapporte** (comparaison au mois dernier), **Ventes**, **Assortiment**,
**Stock**, **Équipe**, **Règles de conseil**. Tous les chiffres sont fictifs, réglés pour une histoire crédible (de l'ordre de
deux conseils sur trois acceptés). En tout début de mois, la vue « Ce mois » est mince : choisir « Période personnalisée »
ou « 7 derniers jours ».

## L'isolation

- L'officine est marquée `isDemo` et vit dans **son propre groupe**. Toute ligne qu'elle écrit est marquée démonstration :
  les statistiques réelles (site public, console, portefeuille) l'excluent déjà.
- Les vraies officines ne voient jamais son activité ; elle ne voit que la sienne.
- **Aucun e-mail** ne part : la messagerie de la démonstration ne transmet rien, même vers une vraie adresse. Les adresses
  réservées ne sont jamais confiées au prestataire, pour personne.
- **Aucun modèle externe, aucune lecture d'image** : le moteur tourne sur ses règles et le référentiel ; ce qu'il sait de
  chaque boîte est posé une fois dans le cache de classification.
- **Aucune recherche sur Internet** (bases ouvertes, photos), **aucune commande** à un partenaire, **aucun message** à
  l'équipe PharmaBoost, **aucun portail de paiement**, aucun changement de mot de passe : ces gestes sont refusés avec
  « Mode démo : … » avant tout effet.
- Aucun abonnement n'est créé : le chiffre d'affaires récurrent n'en est pas touché.

## Limites connues

- Le référentiel d'**interactions médicamenteuses** n'est pas chargé dans cette base : l'écran le dit (« analyse indisponible »).
  PharmaBoost ne fabrique jamais de données de sécurité ; charger un référentiel (`npm run interactions:sync`) le corrige.
- Le catalogue national (BDPM) doit être chargé : les boîtes sont de vraies références cherchées par leur nom.
- Pas de patients : l'application tourne en mode sans patient ; les pages Patients et Suivis n'ont rien à montrer.
