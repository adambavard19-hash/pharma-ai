# Stripe et la tarification PharmaBoost

Règles du fondateur (11 oct. 2026) :
- paiement par **prélèvement SEPA ou carte** ;
- **mise en service (290 € HT) payée avec le premier mois** : première facture 290 + 126 € HT (499,20 € TTC), puis 126 € HT par mois ;
- TVA 20 % ajoutée aux montants HT ;
- souscription par le **lien envoyé par l'équipe** (console › Abonnements › officine › « Envoyer le lien ») et en **libre-service** sur le site (`/decouvrir/abonnement`).

## Ce que fait le code

- **Checkout** (`src/core/billing/checkout.ts`, `buildSubscriptionCheckout`) :
  - ligne mensuelle au tarif contractuel ;
  - ligne unique « Mise en service » (produit Stripe `pharmaboost_mise_en_service`, prix de l'offre dans `plans.stripeSetupPriceId`) ;
  - taux de TVA 20 % exclusif (marque `pharmaboost_vat_fr_20`), assuré une fois ;
  - adresse de facturation et n° de TVA demandés.
- **Engagement de 12 mois** :
  - `subscriptions.commitmentEndsAt` est fixé à la naissance (métadonnée `commitmentMonths`) ;
  - « Programmer la fin » pendant l'engagement pose `cancel_at` à cette date, sans prorata, jamais avant ;
  - le portail client ne permet pas de résilier (configuration marquée `pharmaboost_portal_v1`).
- **Parrainage** (`src/server/billing/referral-discount.ts`) :
  - la remise de `referralState` devient un coupon permanent `pb-parrainage-<centimes>` sur l'abonnement du parrain ;
  - la remise est resynchronisée à chaque démarrage, paiement, impayé ou résiliation d'un filleul, à la suspension d'un accès, puis chaque nuit (cron `relances-contrats`) ;
  - un filleul compte quand son premier paiement est reçu (un SEPA « en cours » ne compte pas).
- **Libre-service** (`src/server/billing/self-service.ts`) :
  - il n'est ouvert que si Stripe est configuré **et** si une offre par défaut complète est publiée (console › Offres & tarifs › « Publier l'offre officielle ») ;
  - les conditions acceptées (`/decouvrir/conditions`) sont horodatées sur le dossier, avec leur version ;
  - l'espace se crée au `checkout.session.completed`, une seule fois.
- **Règle SEPA** :
  - l'espace est ouvert dès que Stripe confirme la souscription (mandat signé), et la mise en service passe « à planifier » ;
  - rien n'est compté comme payé avant `invoice.paid` : paiement, commission du commercial, remise du parrain ;
  - un rejet suit le chemin des impayés.
- **Mise en service** : console › Abonnements (liste « Mises en service ») et fiche officine › « Mise en service » (à planifier, planifiée, faite).

## À faire par le fondateur

1. **Clé de test.** dashboard.stripe.com › Développeurs › Clés API : copier la clé secrète `sk_test_…`. Dans `.env` en local, poser :
   - `STRIPE_SECRET_KEY` ;
   - `STRIPE_MODE=test`.
2. **Prélèvement SEPA.** Paramètres › Moyens de paiement : activer « Prélèvement SEPA » (et Carte).
3. **Webhook.** Développeurs › Webhooks › Ajouter un endpoint :
   - URL : `https://pharmaboost.app/api/stripe/webhook` ;
   - événements :
     - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` ;
     - `customer.subscription.created/updated/deleted/trial_will_end` ;
     - `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.upcoming` ;
     - `customer.updated`, `customer.deleted`.

   Copier le secret de signature `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
4. **Production** (avec accord) :
   - mêmes variables sur Vercel, avec la clé `sk_live_…` et `STRIPE_MODE=live` ;
   - un endpoint de webhook en mode live ;
   - la migration `20261101090000_stripe_tarification` ;
   - « Publier l'offre officielle » dans la console de production.
