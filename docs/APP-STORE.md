# PharmaBoost Mobile sur l'App Store

L'application iPhone est l'application `/m` de pharmaboost.app dans une coque native (Capacitor, dossier
`application-mobile/`). Le contenu vient du site : une mise à jour publiée sur pharmaboost.app est aussitôt dans
l'application, sans renvoyer de version à Apple. On ne renvoie une version que si la coque change (icône, nom,
écran de lancement, réglages iPhone, futures notifications).

## Une fois pour toutes

1. **Clé d'API App Store Connect** — appstoreconnect.apple.com › Utilisateurs et accès › Intégrations ›
   Clés de l'API App Store Connect › « + » ; nom « Terminal », accès **Admin** ; télécharger le fichier
   `AuthKey_XXXXXXXXXX.p8` (une seule fois possible) ; noter le Key ID et l'Issuer ID affichés sur la page.
2. **Team ID** — developer.apple.com › Account › Membership details.
3. `cd application-mobile && ./app-store.sh --configurer` (enregistre le tout dans `~/.pharmaboost-apple.env`,
   la clé dans `~/.appstoreconnect/private_keys/`).
4. **Fiche de l'application** — App Store Connect › Apps › « + » › Nouvelle app : plateforme iOS, nom
   « PharmaBoost », langue Français, identifiant de lot `app.pharmaboost.mobile` (il apparaît dans la liste
   après le premier `./app-store.sh` ; sinon developer.apple.com › Identifiers › « + »), référence `pharmaboost-mobile`.

## Chaque version

```
cd application-mobile && ./app-store.sh
```

Construit, signe (certificat et profil créés automatiquement par la clé d'API) et envoie. La version apparaît
dans TestFlight 10 à 30 minutes plus tard. Rien n'est public tant que « Soumettre pour vérification » n'a pas été cliqué.

## Fiche App Store (à copier)

- **Nom** : PharmaBoost
- **Sous-titre** (30) : Formations et défis d'officine
- **Catégorie** : Éducation (secondaire : Médecine)
- **Mots-clés** (100) : pharmacie,officine,pharmacien,préparateur,formation,conseil,parapharmacie,challenge,équipe,comptoir
- **URL d'assistance** : https://pharmaboost.app/decouvrir
- **URL de confidentialité** : https://pharmaboost.app/decouvrir/confidentialite
- **Âge** : 4+ (aucun contenu sensible) ; « Contenu médical » : informations de formation professionnelle, pas de diagnostic.
- **Description** :

> PharmaBoost Mobile accompagne les équipes officinales au quotidien.
>
> • Formations courtes : des modules de quelques minutes pour réviser le conseil associé, la dermatologie, les gammes du moment.
> • Nouveautés des laboratoires : les lancements utiles à l'officine, toujours signalés comme contenus partenaires quand ils sont sponsorisés.
> • Challenges d'équipe : objectifs, classement et progression de votre officine.
> • Mon espace : vos résultats, vos accords, votre profil.
>
> Gratuit pour tous les professionnels de l'officine : pharmaciens, préparateurs, étudiants. Les officines clientes de PharmaBoost retrouvent en plus leurs résultats au comptoir.
>
> PharmaBoost ne collecte aucune donnée patient dans l'application.

## Confidentialité de l'app (questionnaire App Store Connect)

Données collectées, **liées à l'identité**, **non utilisées pour le suivi** :
- Coordonnées : nom, adresse e-mail (fonctionnalité de l'app, gestion du compte)
- Identifiants : identifiant utilisateur (fonctionnalité de l'app)
- Contenu utilisateur : autre (réponses aux formations, participations aux challenges)
- Utilisation : interactions avec le produit (progression, résultats)

Aucune donnée de santé, aucune localisation, aucun suivi publicitaire.

## Vérification d'Apple

- **Compte de démonstration exigé** : `revue-apple@pharmaboost.app`, pharmacien adjoint de l'officine de démonstration
  (données fictives, aucun accès d'administration). Créé par `npm run revue-apple` (production :
  `--confirmer-production`, après publication) ; mot de passe gardé dans `~/.pharmaboost-revue-apple.txt`. Il survit à
  « Réinitialiser la démo », qui remet aussi ses exemples (challenge, objectif, prime).
- La suppression de compte n'est pas possible sur ce compte (mode démo) : la note invite à la tester sur un compte
  gratuit créé depuis l'écran de connexion.
- **Suppression du compte** : Mon espace › Supprimer mon compte (mot de passe + SUPPRIMER). Exigence 5.1.1(v).
- Note pour le vérificateur : « Application professionnelle pour les équipes de pharmacie. Le compte fourni appartient à
  une pharmacie de démonstration (données fictives). Pour tester la suppression de compte (Mon espace › Supprimer mon
  compte), créez un compte gratuit depuis l'écran de connexion : le compte de démonstration est protégé. »
- Risque connu : Apple refuse parfois une application qui n'est « qu'un site » (règle 4.2). Les arguments : compte,
  formations, challenges, écran hors connexion natif ; si refus, ajouter les notifications natives.

## Captures d'écran

iPhone 6,9 pouces (1320 × 2868) obligatoires, 3 à 10. Les faire depuis le simulateur :
`xcrun simctl io booted screenshot capture.png` sur un iPhone 17 Pro Max.
