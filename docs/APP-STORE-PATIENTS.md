# PharmaBoost — l'appli des patients sur l'App Store

Coque native : `application-patients/` (Capacitor 8, bundle `app.pharmaboost.patients`, nom « PharmaBoost »), qui ouvre
`https://pharmaboost.app/app`. L'appli des pharmaciens (`application-mobile/`, bundle `app.pharmaboost.mobile`) s'affiche
désormais « PharmaBoost Pro » sur l'écran d'accueil ; son nom sur l'App Store devient « PharmaBoost Professionnel »
(App Store Connect).

## Ce qu'il faut au fondateur (une seule fois)

1. Le compte Apple Developer (99 €/an) au nom de la société, s'il n'existe pas encore.
2. Dans App Store Connect › Utilisateurs et accès › Intégrations : une clé d'API (rôle « App Manager ») →
   Team ID, Key ID, Issuer ID et le fichier `AuthKey_….p8` (téléchargeable une seule fois).
3. Dans App Store Connect › Apps › « + » : une nouvelle app « PharmaBoost », bundle `app.pharmaboost.patients`,
   catégorie Médecine (ou Santé et forme), langue française.
4. Une adresse publique de politique de confidentialité (page du site) et une adresse d'assistance.
5. Les captures d'écran iPhone 6,9" (prises dans le simulateur) et la description de la fiche.
6. Le questionnaire de confidentialité : phase 1 = aucune donnée collectée (le scan n'est pas enregistré) ; la caméra
   ne sert qu'à lire le code-barres.

## Envoi

```
cd application-patients
npm install            # une fois (≈ 30 Mo)
./app-store.sh --configurer   # si pas déjà fait pour l'appli des pharmaciens : la configuration est partagée
./app-store.sh
```

La version arrive dans TestFlight ; la soumission à la vérification d'Apple reste un clic dans App Store Connect.

## Avant de soumettre (Apple, règle 1.4.1 et 5.1.1)

- La fiche montre seulement des données officielles sourcées (BDPM, Open Medic) et « ne remplace pas l'avis de votre
  pharmacien » : pas de diagnostic, pas de note sur un médicament.
- Le compte patient (phase 2 : bilan, cures) demandera « Supprimer mon compte » dans l'appli et l'hébergement de
  données de santé agréé (HDS) avant toute mise en ligne.
