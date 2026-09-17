# Abonnements et contrats — architecture et mise en service

Tout se pilote depuis la console Super Admin (« Abonnements & Contrats »).
Le pharmacien ne configure rien : il reçoit un contrat à signer, puis un lien
d'activation qui ouvre un Checkout Stripe déjà rattaché à son officine.

## Parcours

```
Officine créée dans la console
  → Préparer le contrat        (offre, engagement, date d'effet ; PDF généré)
  → Envoyer pour signature     (lien sécurisé + Yousign si configuré)
  → Contrat signé              (webhook Yousign, ou statut relu, ou papier)
  → Envoyer l'abonnement       (lien d'activation PharmaBoost, jeton daté)
  → Le titulaire ouvre le lien (récapitulatif : offre, prix, mois offert)
  → Checkout Stripe            (client Stripe de l'officine, prix de l'offre,
                                essai, métadonnées officine/offre/contrat)
  → Webhooks Stripe            (abonnement, essai, factures, échecs, résiliation)
  → Espace titulaire           (Paramètres → Mon abonnement, portail Stripe)
```

## Modèle de données

- `Plan` : l'offre (code libre, nom, prix mensuel HT, jours d'essai, prix
  Stripe). Modifiable depuis la console ; un changement de tarif crée un
  nouveau prix Stripe, les abonnements en cours gardent l'ancien.
- `Contract` : rattaché au dossier (`Prospect`), à l'officine (`pharmacyId`),
  à l'offre (`planId`), avec `trialDays`, version, statut, dates.
- `SubscriptionInvite` : le lien d'activation (empreinte du jeton, envois,
  ouverture, client Stripe, session Checkout, activation).
- `Subscription` : l'état de l'abonnement, synchronisé depuis Stripe
  (statut, essai, période, résiliation programmée, prochain prélèvement,
  dernier paiement, suspension console).
- `BillingPayment` : chaque facture Stripe (payée, échouée, ouverte…).
- `BillingEvent` : chaque webhook reçu, une fois (`stripeEventId` unique).

## Stripe

- Client : `src/server/billing/stripe-client.ts`. En `STRIPE_MODE=test`, une
  clé de production est refusée.
- Checkout : mode `subscription`, `trial_period_days` = jours d'essai de
  l'offre, `payment_method_collection: "always"` (la carte est prise pendant
  l'essai, rien n'est débité), `trial_settings.end_behavior.missing_payment_method = cancel`
  (sans moyen de paiement valide à la fin de l'essai, l'abonnement est
  annulé, jamais facturé en impayé), texte explicite « Premier mois offert,
  puis X €/mois à partir du JJ/MM/AAAA ».
- Webhooks : `POST /api/stripe/webhook`, signature vérifiée avec
  `STRIPE_WEBHOOK_SECRET`, corps lu brut, idempotence par identifiant
  d'événement. Événements traités : `checkout.session.completed`,
  `customer.subscription.{created,updated,deleted,trial_will_end,paused,resumed}`,
  `invoice.{paid,payment_succeeded,payment_failed,payment_action_required,upcoming}`,
  `customer.{updated,deleted}`.
- Portail client : « Gérer mon abonnement » crée une session de portail pour
  le client Stripe de l'organisation de la session.

## Isolation multi-officines

- Le titulaire n'atteint que l'abonnement, le contrat et le portail de SON
  organisation : `session.scope.organizationId` et `pharmacyId`, jamais un
  identifiant venu du navigateur.
- Les identifiants Stripe servent à retrouver nos lignes depuis un webhook,
  jamais à autoriser une lecture.
- Le PDF du contrat côté officine : `GET /api/abonnement/contrat/[id]` filtre
  par la pharmacie de la session ; un autre contrat répond « introuvable ».

## Variables d'environnement (jamais dans le code)

| Variable | Où la trouver | Où la mettre |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Dashboard Stripe → mode Test → Développeurs → Clés API → Clé secrète (`sk_test_…`) | `.env` en local ; Vercel → Settings → Environment Variables (Production + Preview) |
| `STRIPE_WEBHOOK_SECRET` | Dashboard Stripe → Développeurs → Webhooks → endpoint `https://pharmaboost.app/api/stripe/webhook` → « Signing secret » (`whsec_…`). En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook` affiche le secret | idem |
| `STRIPE_MODE` | `test` (défaut) | idem |
| `STRIPE_PORTAL_CONFIGURATION_ID` | facultatif : Dashboard → Paramètres → Portail client | idem |

Vérifier sans afficher la valeur : la console Abonnements & Contrats affiche
« Stripe n'est pas configuré » tant que la clé manque, et « Webhook non
configuré » tant que le secret manque ; en local,
`node --env-file=.env -p "Boolean(process.env.STRIPE_SECRET_KEY)"`.

## Ce qui reste à décider (métier)

- Le prix mensuel de l'offre PharmaBoost : à saisir dans Offres.
- Les règles de résiliation (préavis, engagement) : le contrat mentionne
  aujourd'hui la durée d'engagement choisie à la préparation ; le portail
  Stripe n'autorise pas la résiliation en libre-service tant que ces règles
  ne sont pas arrêtées (configuration du portail dans Stripe).
- Le secret de webhook Yousign (`YOUSIGN_WEBHOOK_SECRET`) pour les statuts de
  signature en temps réel ; sans lui, « Relire le statut » interroge Yousign.
