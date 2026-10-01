# Hébergement de données de santé (HDS) — le plan

*Rédigé le 1er octobre 2026. État de départ, obligation, choix de l'hébergeur,
migration, et ce qui reste hors du périmètre HDS.*

## 1. Pourquoi c'est obligatoire pour nous, et pas pour tout le monde

En France, héberger des données de santé à caractère personnel pour le compte
d'un tiers (ici : des officines) impose de passer par un **hébergeur certifié
HDS** (art. L.1111-8 du Code de la santé publique). PharmaBoost conserve des
ordonnances, des noms de patients, des traitements : on est dedans, sans
discussion. Un outil qui ne garde que des ventes et du stock (Kontoir, d'après
ses CGUV) n'y est pas tenu.

Ce que la certification impose, concrètement :

- l'hébergeur est certifié, pour les activités qu'il exerce (1 à 6 : site
  physique, matériel, plateforme d'hébergement, infrastructure virtuelle,
  administration, sauvegarde externalisée) ;
- un **contrat HDS** spécifique entre PharmaBoost et l'hébergeur, avec les
  clauses prévues par le référentiel (depuis le décret 2026-209 du 24 mars
  2026, applicables fin septembre 2026) ;
- de notre côté : registre des traitements, AIPD, contrat de sous-traitance
  avec chaque officine, information des patients (docs/CONFORMITE.md § 3.4).

La certification porte sur l'hébergeur. Elle ne rend pas PharmaBoost conforme
à elle seule : c'est une condition nécessaire, pas suffisante.

## 2. Où nous en sommes (vérifié le 1er octobre 2026)

| Brique | Aujourd'hui | HDS ? |
|---|---|---|
| Application Next.js | Vercel (fonctions serverless) | Non |
| Base de données | Neon, PostgreSQL 18, **région us-east-1 (États-Unis)**, 90 Mo, 71 tables | Non, et hors UE |
| Fichiers d'ordonnance | Dans la base (`stored_files`, 14 fichiers, 3,5 Mo) | Migrent avec la base |
| Lecture d'ordonnance et classement | API Anthropic (traitement aux États-Unis) | Hors périmètre HDS, voir § 6 |
| E-mails | Resend (envoi possible depuis l'Irlande, journaux stockés aux États-Unis) | Hors périmètre HDS, voir § 6 |
| Signature | Yousign (France) | Pas de donnée de santé |
| Paiement | Stripe | Pas de donnée de santé |

Le code est déjà prêt à partir : `Dockerfile` (image avec Chromium pour les
PDF), `deploy/entrypoint.sh` (migrations Prisma au démarrage),
`deploy/docker-compose.prod.yml`, sonde `/api/sante`, stockage objet
S3-compatible (`STORAGE_PROVIDER=s3` avec `S3_ENDPOINT`). Aucune dépendance à
Vercel dans le code applicatif.

## 3. Le choix de l'hébergeur

Trois candidats sérieux en France. Vérifié sur leurs pages et documentations
le 1er octobre 2026 ; la liste officielle fait foi :
<https://esante.gouv.fr/labels-certifications/hds/liste-des-herbergeurs-certifies>.

| | Clever Cloud | OVHcloud | Scaleway |
|---|---|---|---|
| Certification | HDS v2 (référentiel 2024), **six activités**, Bureau Veritas, valable jusqu'au 19 déc. 2027 | HDS v2018, nouvelle version en cours de mise en œuvre | HDS v2, activités **1 à 4 seulement** (pas d'administration ni de sauvegarde externalisée) |
| Ce qu'on y met | Appli Docker + PostgreSQL managé + Cellar (S3), régions HDS Paris, Gravelines, Roubaix | Instance Public Cloud + Managed PostgreSQL + Object Storage, option HDS à activer | Instances + base managée, périmètre produit à confirmer |
| Conditions | Contrat HDS spécifique, chargé de compte sous 48 h ouvrées ; prix sur devis (un retour public cite 200 € HT/mois + ressources ×1,4, à confirmer) | Support Business ou Enterprise obligatoire + addendum Healthcare ; prix sur devis | Sur devis |
| Travail pour nous | Le plus proche de Vercel : on pousse l'image, l'hébergeur gère le reste | Une machine à administrer (Caddy, Docker, mises à jour système) : c'est notre `docker-compose.prod.yml` | Idem OVH, avec deux activités HDS en moins |

**Recommandation : Clever Cloud.** Six activités certifiées sous le
référentiel actuel, une plateforme qui prend notre `Dockerfile` tel quel, la
base et les fichiers chez le même hébergeur, et personne à payer pour
administrer un serveur. **OVHcloud en second choix**, si Clever Cloud est trop
cher ou trop lent à répondre : notre `docker-compose.prod.yml` y tourne sans
changement, au prix d'une machine à tenir à jour.

## 4. Ce qu'il faut demander (le mail de devis)

À envoyer aux deux, en parallèle. Rien de confidentiel dedans.

> Objet : demande de devis — hébergement HDS d'un logiciel d'aide au conseil officinal
>
> Bonjour,
>
> PharmaBoost SAS édite un logiciel d'aide au conseil pour les pharmacies d'officine. Il traite des données de santé à caractère personnel (ordonnances, traitements) pour le compte des officines clientes, et doit être hébergé chez un hébergeur certifié HDS, avec le contrat HDS correspondant.
>
> Besoin :
> - une application Node.js livrée sous forme d'image Docker (Next.js, un conteneur, 2 Go de RAM suffisent au départ), exposée en HTTPS sur notre domaine ;
> - une base PostgreSQL managée (version 16 ou plus, 1 Go au départ, sauvegardes quotidiennes avec rétention d'au moins 30 jours, restauration à une date) ;
> - un stockage objet compatible S3, privé, de quelques Go, pour les documents ;
> - une tâche planifiée quotidienne (un second conteneur ou un cron) ;
> - une région en France.
>
> Merci de nous indiquer : le périmètre exact couvert par votre certification HDS pour ces services (activités 1 à 6), le contrat HDS et ses conditions, le prix mensuel pour cette configuration, et le délai de mise à disposition. Nous souhaitons démarrer sous un mois.
>
> Cordialement,
> Adam Bavard — PharmaBoost SAS — contact@pharmaboost.app

## 5. La migration, pas à pas

Durée réelle de la bascule : moins d'une heure, la base fait 90 Mo. Le reste
est de la préparation.

**Avant (dès le contrat signé)**

1. Créer chez l'hébergeur : l'application Docker, la base PostgreSQL, le
   bucket privé, la tâche planifiée des suivis (`npm run followup:run` toutes
   les heures, comme dans `docker-compose.prod.yml`).
2. Renseigner les variables d'environnement, à partir de
   `.env.production.example`. Nouveaux secrets pour `AUTH_SESSION_SECRET` et
   `DATA_ENCRYPTION_KEY` **seulement si** on repart d'une base vide ; pour une
   migration, on garde ceux de production, sinon les données chiffrées
   deviennent illisibles.
3. Déployer l'image et vérifier `https://<url-temporaire>/api/sante` →
   `{"ok":true}` (la base cible est encore vide : les migrations Prisma
   la créent au premier démarrage, ce qu'il faut **éviter** avant la
   restauration ; déployer donc l'image avec la variable `DATABASE_URL`
   pointant vers la base cible seulement après l'étape 6, ou restaurer dans
   une base vide puis pointer dessus).
4. Installer les outils PostgreSQL de la version du serveur source (Neon est
   en 18 : `brew install postgresql@18` sur macOS).

**Le jour J (le soir, après la fermeture de l'officine)**

5. Dans Vercel, mettre l'application en lecture seule n'existe pas : on
   prévient l'officine, et on fait vite. Vérifier qu'aucun bip n'arrive
   (`counter_posts.lastScanAt`).
6. Exporter, restaurer, comparer, en une commande (la source n'est jamais
   modifiée) :

   ```
   scripts/hds/migrer-base.sh --source "$NEON_URL" --cible "$HDS_URL" --dossier ./sauvegardes
   ```

   Le script refuse une cible non vide, s'arrête à la première erreur, et
   compare le nombre de lignes de chacune des 71 tables. Testé le 1er octobre
   2026 sur une copie locale : export, restauration, 71 tables identiques.
7. Pointer l'application HDS sur la base restaurée, redémarrer, vérifier
   `/api/sante`, se connecter, ouvrir une vente, un patient, un PDF.
8. Basculer le DNS de `pharmaboost.app` vers l'hébergeur HDS (Vercel garde
   l'ancienne version joignable tant que le DNS n'a pas changé : c'est le
   retour arrière, immédiat).
9. Mettre à jour `APP_URL`/`PUBLIC_APP_URL` si besoin, rejouer un bip depuis
   POSTE2, un e-mail de test vers contact@pharmaboost.app, un paiement test.

**Après**

10. Garder Neon et Vercel en lecture pendant 30 jours, puis supprimer la base
    Neon (données de santé : elle ne doit pas rester aux États-Unis) et
    archiver l'export chiffré.
11. Mettre à jour les mentions légales (hébergeur), la page Confidentialité,
    le registre des traitements et le contrat de sous-traitance avec les
    officines.

## 6. Ce que le HDS ne règle pas, et qu'il faudra décider

- **La lecture d'ordonnance par l'IA.** Le texte de l'ordonnance (sans le nom
  du patient) part vers l'API Anthropic, aux États-Unis. Anthropic signe un
  DPA et n'entraîne pas ses modèles sur ces données, mais c'est un transfert
  hors UE de données de santé pseudonymisées. Deux voies : (a) garder
  l'API avec DPA et clauses contractuelles types, en l'écrivant dans
  l'information des patients ; (b) passer par **Claude sur AWS Bedrock,
  région Paris**, hébergeur lui-même certifié HDS, ce qui garde le
  traitement en France. Le code le permet : l'adaptateur ne change que le
  transport, pas le moteur. À décider avec un conseil juridique ; (b) est la
  voie la plus défendable.
- **Les e-mails.** Resend envoie depuis l'Irlande mais journalise aux
  États-Unis. Nos e-mails patients ne contiennent aucune donnée de santé
  (un lien à jeton, rien d'autre) : c'est pensé pour ça. Si l'on veut tout en
  Europe, l'adaptateur SMTP existe déjà ; un prestataire européen se branche
  sans changer le code.
- **Le poste de caisse.** Le programme sur POSTE2 n'envoie que des codes de
  boîtes : pas de donnée de santé, pas d'impact.

## 7. Calendrier réaliste

| Étape | Qui | Délai |
|---|---|---|
| Mails de devis à Clever Cloud et OVHcloud | Adam | aujourd'hui |
| Réponse et contrat HDS | hébergeur | 1 à 3 semaines |
| Création de l'environnement et déploiement de l'image | Claude | 1 journée |
| Migration et bascule DNS | Claude + Adam | 1 soirée |
| Décision IA (API avec DPA, ou Bedrock Paris) | Adam + conseil juridique | en parallèle |

Rien de tout cela n'empêche l'officine pilote de continuer. Mais **aucune
deuxième officine ne doit être signée avant la bascule** : c'est la première
question qu'un titulaire informé posera, et aujourd'hui la réponse honnête
est « pas encore ».
