# Notifications et campagnes — référence du lot

*Octobre 2026. Branche `lot/notifications-campagnes`. Migration additive
`20261007090000_notifications_campagnes`.*

Ce document est écrit pour l'exploitant : ce que le lot fait, ce qu'il garde,
ce qu'il refuse de faire, ce qui n'est pas branché, et ce qu'un juriste ou un
délégué à la protection des données doit encore valider. Chaque affirmation a
été relue dans le code ; quand une règle est testée, le test est cité.

Il complète [`RGPD.md`](./RGPD.md), [`MODE-SANS-PATIENT.md`](./MODE-SANS-PATIENT.md),
[`PARTENAIRES.md`](./PARTENAIRES.md) et [`CONFORMITE.md`](./CONFORMITE.md).

---

## 1. Ce que fait le lot

| Chantier | Qui agit | Qui reçoit | En deux phrases |
|---|---|---|---|
| **Nouveautés pour les patients** | le titulaire de l'officine | les patients qui l'ont demandé, un par un | Le patient qui reçoit l'e-mail de son plan peut, s'il le veut, demander à être prévenu des nouvelles gammes de **sa** pharmacie. Le titulaire écrit une annonce, confirme le nombre d'abonnés, et elle part (au plus une par semaine). |
| **Campagnes de la console** | l'équipe PharmaBoost (Super Admin) | des professionnels : titulaires d'officines, contacts de partenaires | Un e-mail d'offre bonus, de parrainage (avec le montant choisi), d'invitation des partenaires ou une annonce, envoyé maintenant ou programmé à un jour choisi, après confirmation. |
| **Parrainage et relances** | le système, une fois activé par l'équipe | le titulaire parrain ; le contact d'un partenaire | Une offre de parrainage est réellement appliquée aux nouveaux filleuls ; deux relances automatiques s'ajoutent, désactivées par défaut. |

Ce que le lot **ne fait pas** (détail au § 7) : aucun rappel de prise de
médicament n'est envoyé par le serveur (§ 3), aucun partenaire ne déclenche ni
ne finance un message aux patients (§ 2.7), aucun crédit de bonus n'est
appliqué automatiquement (§ 5).

---

## 2. Les nouveautés pour les patients

### 2.1 Le parcours du consentement, pas à pas

1. **Au comptoir**, le pharmacien remet le plan par e-mail (plan scellé en mode
   sans patient, fiche en mode `full`). L'adresse est saisie ou lue sur la fiche
   comme avant ; **elle n'est pas conservée par l'envoi du plan**.
2. **L'e-mail du plan contient un bloc facultatif**, distinct du plan et de son
   bouton : « Être prévenu(e) des nouveautés de votre pharmacie », avec un lien.
   Le bloc dit que ce n'est pas nécessaire pour consulter le plan et que rien
   n'est enregistré avant la confirmation (`buildNewsOptInBlock`,
   `src/core/documents/email.ts`). Sans lien d'abonnement, le message est
   strictement celui d'avant.
3. **Le bloc n'apparaît que si** l'officine est active, **n'est pas une officine
   de démonstration**, n'a pas coupé la fonction (`Pharmacy.patientNewsEnabled`,
   **vrai par défaut**) et si l'adresse a une forme valable
   (`newsOptInUrlFor`). Un échec de préparation du lien n'empêche jamais la
   remise du plan : le message part sans le bloc.
4. **Le patient ouvre le lien.** La page `/nouveautes/abonnement/<jeton>` dit ce
   qu'il recevra (une annonce de sa pharmacie quand une gamme arrive, au plus une
   par semaine), ce qui n'y figure pas (aucune information de santé, aucun lien
   avec son ordonnance, son plan ou un médicament), qui est responsable (la
   pharmacie), combien de temps l'adresse est gardée, comment partir. **Ouvrir la
   page n'écrit rien** : un antivirus ou un aperçu de messagerie ouvre les liens.
5. **Il clique « Oui, tenez-moi informé(e) »** (aucune case cochée d'avance).
   C'est un `POST` (`confirmNewsOptInAction`), limité à 30 tentatives par heure et
   par adresse IP. **C'est ici, et seulement ici, que l'adresse est enregistrée.**
   Un patient déjà abonné voit « Vous êtes déjà inscrit(e) », sans bouton.
6. **Le serveur crée l'abonnement** (ou le réactive s'il s'était désinscrit),
   inscrit `patient_news.subscribed` au journal d'audit (source, version du texte,
   réactivation ou non : **jamais d'adresse**) et envoie un message de
   confirmation qui redonne le lien de désinscription. L'échec de ce message
   n'annule pas l'abonnement.
7. **Les annonces** ne partent qu'à l'initiative du titulaire (§ 2.6).

Si le titulaire coupe la fonction : le lien disparaît des e-mails de plan, les
liens déjà envoyés cessent de fonctionner (page « lien introuvable »), aucune
annonce ne peut partir, une annonce en cours est close avec ses compteurs réels.
Les abonnements existants sont conservés (jusqu'à 36 mois) et la page de
désinscription reste accessible : **un patient doit toujours pouvoir partir**.

### 2.2 Ce qui est conservé, ce qui ne l'est pas

Table `patient_news_subscriptions` (une ligne par officine et par adresse) :

| Donnée | Conservée ? | Détail |
|---|---|---|
| Officine | oui | une seule officine par ligne : l'abonnement n'est jamais partagé |
| Adresse e-mail | oui, **chiffrée** | `emailCipher`, AES-256-GCM (`encryptField`, clé `DATA_ENCRYPTION_KEY`) ; déchiffrée au seul moment d'un envoi |
| Empreinte de l'adresse | oui | `emailHash`, HMAC-SHA256 de l'adresse en minuscules ; sert à reconnaître l'adresse sans la lire (unicité, désinscription) |
| Forme masquée | oui | `emailMasked` (`j***@exemple.fr`) ; l'écran de l'officine ne montre que des comptes et ne l'affiche pas |
| Statut, dates | oui | `ACTIVE` ou `UNSUBSCRIBED`, `consentAt`, `unsubscribedAt`, création, modification |
| Source du consentement | oui | `PLAN_EMAIL` |
| Version du texte d'information | oui | `noticeVersion` (`v1`) — voir § 10 |
| Nom, prénom, téléphone | **non** | le patient n'a pas de fiche |
| Lien avec une ordonnance, un plan, un produit, un traitement, une vente | **non** | aucune clé étrangère ; vérifié par test (§ 9) |
| Donnée de santé | **non** | aucune, ni dans la table, ni dans les messages |
| Adresse IP, navigateur | **non** | seule une limite de débit en mémoire, par instance, voit l'IP ; elle n'est jamais écrite en base |
| Texte exact présenté au patient | **non** | seule sa version est gardée |
| Le jeton du lien | **non** | rien ne le stocke |

Après désinscription : `emailCipher` et `emailMasked` sont **effacés** ; restent
l'empreinte, le statut `UNSUBSCRIBED` et les dates, pour que le choix du patient
soit respecté. Ces données de trace disparaissent à leur tour à la purge (§ 2.4).

Tables liées : `patient_news_announcements` (objet, gamme, texte, compteurs,
identifiant du titulaire auteur : **aucune donnée sur les abonnés**, conservées
sans limite de durée) et `patient_news_deliveries` (une ligne par annonce et par
abonné : statut et détail d'envoi, **sans adresse** ; supprimées avec
l'abonnement).

`lastNewsAt` existe dans le schéma mais **aucun code ne l'écrit** aujourd'hui : il
reste vide.

### 2.3 Les jetons

| Lien | Jeton | Contenu | Durée |
|---|---|---|---|
| Abonnement | **chiffré** et authentifié (`sealToken("news-optin", …)`, AES-256-GCM, clé dérivée de `DATA_ENCRYPTION_KEY`) | l'officine et l'adresse, illisibles dans l'adresse du lien comme dans un journal d'accès | 90 jours (la durée du plan scellé) |
| Désinscription | **signé**, lisible, non chiffré (`signPayload`, HMAC avec `AUTH_SESSION_SECRET`) | l'officine et **l'empreinte** de l'adresse, jamais l'adresse | 5 ans |

Le jeton d'abonnement est lié à son usage (un jeton d'une autre fonction ne
l'ouvre pas) et daté. Le lien de désinscription est long à dessein : un message
ancien doit toujours pouvoir y mener.

> **Rotation des secrets.** `hashEmail` est calculée avec `AUTH_SESSION_SECRET`.
> Changer ce secret rend caduques tous les liens de désinscription déjà envoyés
> **et** rompt la correspondance entre les empreintes enregistrées et les
> adresses : un patient désinscrit pourrait être réabonné par un nouveau
> consentement sans que l'ancien choix soit retrouvé, et la liste de
> désinscription des offres (§ 4) cesserait de protéger. Changer
> `DATA_ENCRYPTION_KEY` rend illisibles les adresses chiffrées et invalide les
> liens d'abonnement en circulation (procédure de rotation : `CONFORMITE.md` § 5,
> toujours à écrire). Ne pas faire tourner ces secrets sans plan de migration.

### 2.4 Durée de conservation : 36 mois, puis purge

- La durée est portée par une constante (`NEWS_RETENTION_MONTHS = 36`,
  `src/core/patient-news/constants.ts`) que lisent la page d'abonnement, les
  messages et le serveur : le texte dit au patient « 36 mois », le serveur
  applique 36 mois.
- Elle se compte **à partir du consentement** (`consentAt`, remis à jour si le
  patient se réabonne), pas de la dernière annonce.
- La purge (`purgeStalePatientNews`) supprime les lignes dont le consentement a
  plus de 36 mois calendaires, abonnés actifs comme désinscrits, avec leurs envois
  associés. Elle inscrit `patient_news.purged` au journal : **un nombre, jamais une
  adresse**.
- La purge tourne au **passage quotidien** `/api/cron/automatisations` (§ 4.7).
  Sans `CRON_SECRET` ou sans tâche planifiée, **rien ne purge** : c'est un
  prérequis d'exploitation.
- Un patient dont l'abonnement est purgé n'est plus contacté ; il peut redonner
  son accord par le lien d'un prochain e-mail de plan.

### 2.5 Désinscription

- **Un lien dans chaque message** (pied de page, texte et HTML), y compris le
  message de confirmation. Il ouvre `/nouveautes/desinscription/<jeton>`, **sans
  compte** : la page ne modifie rien à l'ouverture et demande un clic de
  confirmation (« Ne plus recevoir les nouveautés »).
- **En-têtes de messagerie** : `List-Unsubscribe` et `List-Unsubscribe-Post`
  (RFC 8058) pointent sur la route `/nouveautes/desinscription/<jeton>/un-clic`,
  qui désinscrit sur un `POST` de la messagerie et renvoie à la page sur un `GET`.
  Le bouton « Se désabonner » de la messagerie du patient désinscrit donc
  réellement, en un clic. Le lien visible dans le message reste celui de la page.
- Le geste efface l'adresse chiffrée et la forme masquée, garde l'empreinte et
  les dates, inscrit `patient_news.unsubscribed` au journal (sans adresse). Deux
  clics simultanés n'écrivent et ne journalisent qu'une fois.
- La page reste fonctionnelle même si l'officine a coupé la fonction ou a été
  désactivée.
- Se désinscrire des nouveautés **ne touche pas** au suivi de traitement, et
  inversement : ce sont deux consentements, deux tables, deux désinscriptions
  (`RGPD.md`).

### 2.6 Les annonces : limites appliquées côté serveur

Une annonce est un acte du titulaire (permission `news:manage`, accordée au
titulaire par défaut et confiable à un autre rôle). L'officine vient de la
**session**, jamais d'une donnée envoyée par le navigateur.

| Règle | Valeur | Où |
|---|---|---|
| Fréquence | **une annonce par officine tous les 7 jours** au plus | `nextAnnouncementAllowedAt`, rejouée à l'envoi |
| Longueur | objet 90 caractères, gamme 80, message **600** | `NEWS_LIMITS` |
| Liens | **aucun** : ni adresse web (`http(s)://`, `www.`, `.com`, `.fr`, `.net`, `.org`, `.eu`, `.io`, `.app`, `.shop`, `.store`, `.info`, `.biz`, `.ly`, `.link`), ni e-mail, ni variable `{{…}}` | `validateAnnouncement` |
| Mots refusés | *ordonnance* (sous toutes ses formes, « sans ordonnance » compris), *prescri…*, *rembours…*, *guéri…* (guérit, guérison…), « traitement(s) contre / pour » ; sans égard à la casse ni aux accents | `HEALTH_CLAIMS` |
| Objet et gamme | une seule ligne (protection contre l'injection d'en-têtes) | `oneLine` |
| Confirmation | le titulaire confirme le **nombre d'abonnés actifs**, **recalculé** par le serveur ; écart = refus | `sendAnnouncement` |
| Mention fixe | « Aucun médicament sur ordonnance n'est présenté dans ce message. » | `buildPatientNewsEmail` |
| Expéditeur | le **nom de l'officine** ; aucun nom d'outil dans le message | `fromName` |
| Suggestions de gamme | uniquement les gammes privilégiées de l'officine (`PreferredRange`) : laboratoire et nom de gamme, jamais une remise ni une marge | `getNewsOverview` |
| Test | un message de test part **uniquement** vers l'adresse de l'utilisateur connecté, bandeau « MESSAGE DE TEST » | `sendAnnouncementTest` |

Précisions utiles :

- Le délai de 7 jours ne compte que les annonces qui ont **réellement contacté**
  quelqu'un : ni une annonce `FAILED`, ni une annonce simulée (messagerie non
  configurée). Deux envois lancés au même instant (deux onglets) sont départagés :
  le plus ancien garde la main, l'autre se retire avant d'avoir écrit à quiconque.
- Un abonné dont le consentement est postérieur à la création de l'annonce n'est
  pas servi par elle (utile à une reprise le lendemain).
- **Un abonné, un message.** Avant chaque envoi, une réservation
  (`PatientNewsDelivery`, clé unique annonce × abonné) est inscrite ; le statut de
  l'abonné est relu juste après (un patient désinscrit pendant l'envoi n'est pas
  contacté : statut `SKIPPED`). Envoi par lots de 5, budget d'environ 45 s ; au-delà
  l'annonce reste `SENDING` et se poursuit par `resumeAnnouncement` ou le passage
  quotidien (annonces `SENDING` depuis plus de 5 minutes), **sans doublon**.
- Une réservation restée sans issue plus de 10 minutes est close en `FAILED`
  « résultat inconnu » et **jamais rejouée** : un message manquant vaut mieux que
  deux.
- Statut final : `SENT` (tous remis ou simulés), `PARTIAL`, `FAILED`. Le compteur
  `sentCount` regroupe remis **et** simulés ; le drapeau `simulated` dit que ces
  « envoyés » ne sont pas partis. `recipientCount` = remis + échecs à la clôture.
- Messagerie non configurée : l'envoi est possible mais **simulé**, et dit simulé
  partout. Rien n'est présenté comme réussi.
- Audit : `patient_news.announcement_sent` (statut et compteurs),
  `patient_news.settings_changed`. Les e-mails aux patients **ne sont pas** tracés
  dans `EmailDispatch` (sa trace conserverait l'adresse).
- Les détails d'envoi enregistrés sont **débarrassés de toute adresse** (`scrub`) :
  certains prestataires recopient le destinataire dans leur message.

### 2.7 Aucun lien avec le plan, le traitement, un partenaire ou un paiement

- **Aucun lien avec le plan ou le traitement.** Les trois tables du lot ne
  référencent que `pharmacies` et elles-mêmes. Le code du lot ne lit
  ni ordonnance, ni plan scellé, ni patient, ni conseil, ni médicament.
- **Aucun partenaire, aucun paiement.** Le module n'importe aucun module ni modèle
  « partenaire », ni facturation, ni parrainage, ni campagne. Un partenaire ne
  déclenche, ne finance et ne signe aucune annonce.
- Ces deux garanties sont des **tests** : `src/core/patient-news/__tests__/independance.test.ts`
  (partenaires, paiements) et
  `src/core/patient-news/__tests__/independance-donnees-sante.test.ts` (aucune
  table ni requête vers ordonnance, plan scellé, patient, conseil ou nom de
  médicament).

### 2.8 Limites connues

- **Adresse technique d'expédition et liens.** Le nom affiché est celui de la
  pharmacie, mais l'adresse d'expédition (`EMAIL_FROM`) et le domaine des liens
  (abonnement, désinscription, plan) sont ceux de la plateforme, et aucun
  `Reply-To` n'est posé : une réponse du patient arrive à la plateforme, pas à la
  pharmacie. Le message renvoie à la pharmacie pour toute question. « Le patient
  voit sa pharmacie, pas un logiciel » vaut pour le contenu, pas pour ces détails
  techniques.
- **Limite de débit en mémoire**, par instance : elle freine un essai de jetons en
  rafale, elle n'est pas une protection absolue.
- **Aucun outil d'effacement, d'export ni de recherche par adresse** (ni pour la
  pharmacie, qui ne voit que des comptes, ni pour la console). Le patient s'efface
  lui-même par le lien de n'importe quel message. S'il l'a perdu, aucun écran ne
  permet de le faire à sa place : voir § 10.
- **Consentement porté par un lien.** Qui détient l'e-mail du plan (un transfert)
  peut confirmer à la place du patient ; le message de confirmation, qui part à
  l'adresse concernée, et la désinscription en un clic sont la parade.

---

## 3. Pourquoi les rappels de prise ne sont PAS envoyés par le serveur

La demande d'origine évoquait des notifications pour le **traitement** et la
**posologie** du patient. Ce n'est volontairement **pas construit**.

- Un rappel envoyé par le serveur doit savoir **quel médicament prendre, quand**,
  et **à quelle adresse** l'envoyer. Cela rattache un traitement à une personne :
  c'est une **donnée de santé à caractère personnel**.
- Conserver une telle donnée impose l'**hébergement HDS** (`HDS.md`). La décision
  du **1er octobre 2026** est de ne conserver aucune donnée de santé rattachée à
  une personne tant que cet hébergement n'est pas en place (`MODE-SANS-PATIENT.md`).
- Le rappel de prise reste donc **le fichier iCalendar produit dans le navigateur
  du patient** (« Ajouter les rappels à mon agenda » sur la page du plan scellé) :
  le serveur ne voit jamais le traitement, ne connaît pas l'adresse, ne programme
  rien.
- Les nouveautés n'ont **aucun point de contact** avec ce sujet : l'abonnement ne
  porte ni traitement ni lien avec un plan, et le texte d'une annonce ne peut pas
  parler d'ordonnance (§ 2.6).

**Ce qu'il faudrait pour les offrir un jour** :

1. un hébergement certifié HDS contractualisé, pour la base **et** le sous-traitant
   d'envoi (le prestataire de messagerie verrait un traitement lié à une adresse) ;
2. un consentement dédié au rappel de prise, distinct des nouveautés et du suivi,
   avec un texte d'information validé ;
3. la bascule en mode `full` (conservation de la fiche et de la posologie), la
   purge et les durées de conservation arrêtées ;
4. une analyse d'impact (AIPD) couvrant ce traitement ;
5. un message sans nom de médicament, comme le suivi existant, et un envoi
   déclenché et signé par un professionnel, jamais automatique.

---

## 4. Les campagnes de la console

Toute action de la console commence par `requirePlatformSession()`
(`src/server/actions/admin-campaigns.ts`) ; un test de garde-fou le vérifie pour
**toutes** les actions `admin-*.ts` (§ 9). Les destinataires sont des
**professionnels**, jamais des patients.

### 4.1 Types

| Type | Côté | Montant | Ce qu'il fait |
|---|---|---|---|
| `BONUS_OFFER` — Offre bonus | officines | 1 € à 2 000 € | Message tracé avec montant et conditions. **Application manuelle** par l'équipe (§ 5). |
| `REFERRAL_OFFER` — Offre de parrainage | officines | 1 € à 500 € par filleul et par mois | Le montant est **réellement appliqué** aux nouveaux filleuls (§ 5). |
| `PARTNER_INVITATION` — Invitation des partenaires | partenaires | — | Invite à déposer sa gamme par le formulaire public de candidature. Rappelle qu'un partenaire n'achète jamais une recommandation. |
| `ANNOUNCEMENT` — Annonce | officines ou partenaires | — | Une information de l'équipe, sans offre chiffrée. |

Le bouton du message ne mène qu'à une destination connue : l'espace de l'officine
(`/parametres?onglet=abonnement`) ou le formulaire `/decouvrir/partenaires`,
jamais une adresse saisie.

### 4.2 Segments (destinataires)

Officines non démonstration (`isDemo = false`) et actives ; le destinataire est le
titulaire actif, à défaut l'e-mail de l'officine.

| Segment | Contenu |
|---|---|
| `pharmacies.all_active` | toutes les officines actives |
| `pharmacies.trialing` | abonnement en essai |
| `pharmacies.subscribed` | abonnement actif (essai et impayés exclus) |
| `pharmacies.without_referrals` | aucune officine filleule |
| `pharmacies.selected` | officines choisies une à une |
| `partners.contacts` | contacts avec adresse des partenaires ni archivés ni suspendus |
| `partners.without_brand` | contacts des partenaires sans aucune marque |
| `partners.applications_open` | candidatures `NEW`, `REVIEWING`, `CONTACTED`, `NEGOTIATION` (**jamais** `REFUSED`, ni déjà devenues partenaires) |
| `partners.selected` | partenaires choisis un à un (tous leurs contacts avec adresse) |

Le type et le segment doivent viser le même côté : une offre bonus ne s'adresse
pas à des partenaires, la notification dans l'application n'existe que pour les
officines.

Variables des textes (une variable inconnue est refusée, aucune accolade `{{`
ne part chez le destinataire) : officines `{{prenom}}`, `{{titulaire}}`,
`{{officine}}`, `{{contact}}`, `{{lien_espace}}`, `{{code_parrainage}}`,
`{{lien_parrainage}}` et, pour les types à montant, `{{montant_offre}}`,
`{{date_fin_offre}}`, `{{conditions_offre}}` ; partenaires `{{prenom}}`,
`{{nom_partenaire}}`, `{{contact}}`, `{{lien_candidature}}`.

### 4.3 Du brouillon à l'envoi

| État | Ce qui se passe |
|---|---|
| **Brouillon** (`DRAFT`) | enregistré, modifiable, supprimable. **Ne contacte personne.** L'aperçu utilise des valeurs d'exemple ; le montant de l'offre, lui, est réel. |
| **Test** | envoie le message avec l'objet préfixé `[TEST]` **uniquement à l'adresse de l'administrateur connecté** (jamais une adresse saisie). |
| **Confirmation** | l'administrateur **retape le mot `ENVOYER`** (sans égard à la casse) et confirme le **nombre de destinataires**, que le serveur **recalcule** : un écart refuse l'envoi. Exigé aussi pour programmer. |
| **Programmée** (`SCHEDULED`) | un jour entre demain et 90 jours (jour calendaire à Paris). Part au **passage quotidien** de ce jour-là (§ 4.7), pas à l'heure près. Modifier une campagne programmée la **ramène au brouillon** (la confirmation portait sur l'ancienne version) ; on peut aussi retirer la programmation. |
| **En cours** (`SENDING`) | les destinataires sont figés, l'envoi se fait par lots de 5, budget d'environ 45 s depuis la console (30 s au passage quotidien). |
| **Envoyée** (`SENT`) | plus personne en attente. Audit `campaign.sent` (début et fin, avant/après, compteurs). |
| **Annulée** (`CANCELED`) | possible depuis programmée ou en cours : les destinataires encore en attente deviennent « ignorés — Campagne annulée », l'offre de parrainage liée est arrêtée. Les messages déjà partis ne se rappellent pas. |

**Programmation et public recalculé.** Au passage quotidien, le public est
**recalculé** : si le nombre a changé depuis la programmation, la campagne part
quand même (le journal `campaign.sent` dit le nombre confirmé et la différence).
Un public « choisi » reste le même ; un segment (« toutes les officines actives »)
peut avoir grossi entre la confirmation et le jour d'envoi. Le plafond de 2 000
s'applique toujours. Si le texte, la date de fin ou le public sont devenus
invalides, la campagne ne part pas et redevient un brouillon.

**Reprise.** Une campagne `SENDING` dont il reste des destinataires en attente se
poursuit par la reprise manuelle depuis la console (`resumeCampaignAction`) ou, à
défaut, par le passage quotidien (campagnes `SENDING` sans mouvement depuis plus
de 5 minutes), **sans doublon**.
Un destinataire resté « en cours » au-delà de 5 minutes est marqué en échec « à
vérifier » : on ne sait pas si le message est parti, on ne le renvoie pas.

### 4.4 Garde-fous

| Garde-fou | Mécanisme |
|---|---|
| **Aucun doublon** | clé unique `(campagne, adresse en minuscules)` ; deux officines au même titulaire = un seul message (la première par ancienneté) ; passage `PENDING → SENDING` conditionnel **avant** chaque envoi |
| **Désinscription** | liste `marketing_opt_outs` (**empreinte seulement**). Une adresse désinscrite n'est jamais contactée : exclue du décompte, gardée comme ligne « Ignoré — Désinscrit des offres » avec une forme masquée ; relue à chaque lot, donc une désinscription faite pendant l'envoi compte |
| **Plafond** | **2 000 destinataires** par campagne ; au-delà, refus (segment plus étroit) |
| **Mot de confirmation** | `ENVOYER` retapé ; nombre recalculé côté serveur |
| **Simulé** | si la messagerie n'est pas configurée, l'envoi reste possible mais chaque destinataire est `SIMULATED`, la campagne porte `simulated`, et l'écran dit « simulé », jamais « envoyé » |
| **Notification dans l'application** | option « aussi dans l'application » (officines seulement) : créée **uniquement** pour un message réellement parti, jamais pour un envoi simulé ou en échec |
| **Offre honnête** | voir § 5 |
| **Traçabilité** | `traceDispatch` (type `CAMPAIGN`) pour chaque message ; audit avant/après à chaque changement d'état ; aucune donnée patient |

Le pied de page de chaque message contient « Ne plus recevoir ces offres :
me désinscrire » (texte et HTML), plus les en-têtes `List-Unsubscribe` et
`List-Unsubscribe-Post`. Le POST en un clic est traité par
`/offres/desinscription/<jeton>/un-clic` ; la page `/offres/desinscription/<jeton>`
ne modifie rien à l'ouverture. Le jeton est signé et ne porte que l'empreinte de
l'adresse. Les messages liés à un contrat ou à un abonnement en cours
(facturation, signature, sécurité du compte) **ne sont pas** concernés et
continuent de partir : la page de désinscription le dit.

### 4.5 Sémantique des compteurs

| Compteur | Sens |
|---|---|
| `recipientCount` | destinataires **à contacter** (hors désinscrits, sans adresse, doublons) |
| `sentCount` | **envoyés ou simulés** ; `simulated` dit que ces « envoyés » ne sont pas partis |
| `failedCount` | échecs |
| `skippedCount` | ignorés : désinscrits, annulés, désinscrits pendant l'envoi — comptés à part |

Un compteur absent s'affiche « — », jamais un zéro inventé.

### 4.6 Ce qu'une campagne conserve

`campaign_recipients` garde, pour chaque destinataire, **l'adresse
professionnelle**, le nom, le statut et le détail renvoyé par le prestataire (qui
peut citer l'adresse). Une désinscription n'y laisse qu'une forme masquée.
**Aucune purge n'est prévue** : voir § 10.

### 4.7 Le passage quotidien

`GET /api/cron/automatisations`, tâche planifiée Vercel `15 8 * * *` (8 h 15 UTC,
soit 10 h 15 l'été et 9 h 15 l'hiver à Paris), protégée par `CRON_SECRET` (sans
secret configuré la route répond 503 : jamais ouverte). Ordre :

1. les relances automatiques existantes (inchangées) ;
2. `processDueCampaigns` : campagnes programmées dont le jour est atteint, puis
   reprise des campagnes `SENDING` restées en plan (budget 30 s) ;
3. `resumeStuckAnnouncements` : annonces aux patients restées `SENDING` ;
4. `purgeStalePatientNews` : purge des abonnements de plus de 36 mois.

Chaque étape est isolée : un échec est journalisé, la réponse JSON porte `null`
pour cette étape (jamais un faux zéro) et les autres tournent. La réponse ajoute
`campaigns: { started, resumed }` et `news: { resumed, purged }` aux clés
existantes. Une campagne programmée devenue impossible (texte invalide, segment
vide ou trop grand) est rendue en brouillon et l'équipe est prévenue.

---

## 5. L'honnêteté des offres

**Le montant écrit dans le message est celui que le système applique.**

- Un montant en euros tapé à la main dans l'objet, le titre ou le texte d'une
  offre doit être égal au montant de l'offre (le montant standard de 10 € est
  aussi toléré pour le parrainage) ; sinon refus, avec invitation à écrire
  `{{montant_offre}}`. Citer `{{date_fin_offre}}` ou `{{conditions_offre}}` sans
  la donnée correspondante est refusé. Une date de fin doit être dans le futur ;
  elle court jusqu'à la fin du jour choisi, heure de Paris.

### Parrainage : réellement appliqué

- À l'envoi, une **offre** (`referral_offers`) est créée, **sauf** si le montant
  est le montant standard (10 €) et sans date de fin : le message ne fait alors
  que rappeler le parrainage, et l'écran le dit.
- Chaque **nouveau filleul** inscrit pendant l'offre reçoit un **montant figé**
  sur sa fiche (`Pharmacy.referralAmountCents`). Les deux chemins de création
  d'une officine parrainée figent ce montant (création depuis la console et
  création depuis un dossier signé).
- **L'offre est globale.** Elle s'applique à tout nouveau filleul de n'importe
  quel parrain pendant sa durée, **quel que soit le public choisi pour le message** :
  envoyer le message à cinq officines n'en réserve pas l'effet à ces cinq-là
  (`referralAmountForNewFilleul` ne connaît pas le parrain). Le texte du message
  parle de « chaque officine que vous parrainez » : c'est vrai pour tous les
  parrains, pas seulement pour les destinataires.
- Les **filleuls déjà inscrits ne changent pas** : une offre qui change, se termine
  ou est annulée ne modifie jamais ce qu'un filleul existant apporte. Une colonne
  vide vaut le montant standard (filleuls d'avant les offres).
- Plusieurs offres peuvent se chevaucher : la plus récemment démarrée l'emporte ;
  si elle est annulée, la précédente, si elle court encore, redevient celle qu'on
  applique. Annuler la campagne arrête l'offre ; rejouer l'annulation s'assure
  que l'offre est arrêtée.
- La remise affichée au titulaire est la **somme des montants propres à chacun de
  ses filleuls actifs, bornée par son tarif contractuel**, jamais négative
  (`referralSummary`, onglet Abonnement des paramètres).
- **Aucune remise Stripe n'est créée ni modifiée par le lot, et le reste du code
  n'en crée pas non plus** : aucun coupon, aucune ligne de facture, aucun avoir pour
  le parrainage (le code serveur ne contient que `allow_promotion_codes: false`). Le
  montant est donc **un calcul affiché**, dans l'espace du titulaire et dans la
  console. Sa traduction sur la facture est à faire à la main par l'équipe (le
  tarif contractuel d'une officine reste modifiable depuis la console), tant
  qu'aucun raccordement automatique n'existe : voir § 7 et § 10. Les textes d'offre
  doivent être lus avec cette réserve.

### Bonus : un message tracé, à appliquer à la main

- Le type `BONUS_OFFER` envoie un message avec **montant, date de fin et
  conditions** obligatoires. **Aucun crédit n'est créé** : l'équipe applique le bonus
  à la main, et le texte par défaut le dit en toutes lettres. L'interface ne simule
  aucune application.

---

## 6. Les deux relances automatiques

Elles s'ajoutent au moteur des relances (`/admin/relances`) : **désactivées par
défaut**, rattrapage de 2 jours (`CATCH_UP_DAYS`), clé unique inscrite **avant**
l'envoi (jamais deux fois), aperçu sans écriture, activation confirmée. Les
candidats (officines parrainées, partenaires) ne sont lus que si la règle
correspondante est activée.

| | `referral.filleul_joined` — Parrainage | `partner.range_invitation` — Partenaires |
|---|---|---|
| Déclencheur | une officine parrainée (non démo, parrain non démo) s'est inscrite | une fiche partenaire ni suspendue ni archivée, **sans aucune marque** ; sans contact e-mail, la ligne est ignorée et le dit |
| Délai | 0 jour par défaut (0 à 3) après l'inscription | 5 jours par défaut (1 à 30) après la création de la fiche |
| Destinataire | le titulaire du **parrain** | contact principal du partenaire, à défaut le premier contact avec adresse, à défaut l'e-mail de la candidature liée |
| Contenu | le nom de l'officine parrainée et son montant mensuel (`referralAmountFor`), rien d'autre ; **plus une notification dans l'application** du parrain | invite à déposer la gamme par `/decouvrir/partenaires` ; rappelle qu'un partenaire n'achète jamais une recommandation ; aucun portail promis |
| Désinscription | message de relation avec un client : non concerné par la liste des offres | **jamais envoyé** à une adresse de `marketing_opt_outs` ; pas de lien de désinscription en pied de page, le texte propose de répondre pour ne plus être sollicité |
| Clé d'unicité | `referral.filleul_joined:<filleul>:<jour d'inscription>` | `partner.range_invitation:<partenaire>:<jour de création>` |
| Audit | `referral.filleul_notified` | `partner.invitation_sent` |

La notification dans l'application est créée après la tentative d'e-mail, **quelle
qu'en soit l'issue** (envoyé, simulé, échec), jamais si la ligne est ignorée faute
de destinataire. Ces deux messages sont « liés à un contexte » : ils ne sont pas
proposés dans la fenêtre « Contacter ».

---

## 7. Ce qui n'est pas branché

| Sujet | État |
|---|---|
| **Portail partenaire** | n'existe pas. Un partenaire dépose sa gamme par le formulaire public `/decouvrir/partenaires` ; aucun message ne promet un espace partenaire (`PARTENAIRES.md`, « Futur espace partenaire, non construit »). |
| **Rappels de prise par le serveur** | volontairement absents (§ 3). |
| **Application automatique du bonus** | absente : le bonus est un message tracé, appliqué à la main. |
| **Remise de parrainage sur la facture Stripe** | absente : le montant est un calcul affiché (§ 5). |
| **Facturation annuelle** | absente : le parrainage et le bonus se comptent **par mois** ; un tarif annuel d'offre n'est qu'affiché, et le contrat se règle mensuellement. |
| **Reprise d'un très gros envoi** | pas de file d'attente. À 5 messages en parallèle, un passage envoie de l'ordre de quelques centaines de messages en 45 s ; une campagne plus grosse reste `SENDING` et se termine par « Reprendre » ou aux passages quotidiens suivants (30 s chacun). Acceptable pour des dizaines d'officines ; à revoir si les segments grossissent. Le plafond de 2 000 le borne. |
| **Effacement ou export par adresse** | absents (§ 2.8, § 10). |
| **Saisie manuelle d'une désinscription** | absente : seul le lien du message inscrit une adresse dans `marketing_opt_outs` (le champ `source` prévoit `ADMIN`, aucun code ne l'écrit). Une réponse « arrêtez » par e-mail, ou un lien de plus de 3 ans, ne peut donc être honorée qu'en choisissant les destinataires un à un (segments « choisis »). |
| **Lien de désinscription dans la relance automatique des partenaires** | absent : le modèle propose de répondre au message (voir § 6). |
| **Heure d'envoi précise** | absente : une campagne programmée part au passage quotidien du jour choisi. |

---

## 8. Exploitation

| Besoin | Réglage |
|---|---|
| Passage quotidien (campagnes, reprises, purge) | `CRON_SECRET` renseigné + tâche planifiée Vercel (`vercel.json`) ; sans eux, ni programmation, ni purge, ni reprise automatique |
| Messagerie réelle | `RESEND_API_KEY` ou `SMTP_*`, et `EMAIL_FROM` ; sans eux tout envoi est **simulé** et dit simulé |
| Liens des e-mails | `PUBLIC_APP_URL` (HTTPS public en production) : c'est elle qui compose les liens d'abonnement, de désinscription et de bouton |
| Secrets | `DATA_ENCRYPTION_KEY` (adresses chiffrées, jetons d'abonnement), `AUTH_SESSION_SECRET` (empreintes et jetons signés) : voir l'avertissement du § 2.3 |
| Budget d'envoi interactif | 45 s par envoi (annonce ou campagne) : la page qui porte l'action doit autoriser 60 s (`maxDuration`) |

Aucune annonce aux patients ne démarre sans un clic du titulaire (le passage
quotidien ne fait que reprendre une annonce déjà lancée) ; aucune campagne ne
démarre sans un envoi confirmé, ou programmé et confirmé. Aucun test n'envoie
d'e-mail réel : les tests mockent le fournisseur.

---

## 9. Fichiers

**Schéma et migration** — `prisma/schema.prisma` (fin du fichier),
`prisma/migrations/20261007090000_notifications_campagnes/migration.sql`
(additive : trois types, deux colonnes sur `pharmacies`, sept tables ; aucun
`DROP`, `RENAME` ni `DELETE`).

**Nouveautés pour les patients**

- Règles pures : `src/core/patient-news/` (`constants.ts`, `validate.ts`,
  `email.ts`), bloc facultatif de l'e-mail du plan dans `src/core/documents/email.ts`.
- Service : `src/server/services/patient-news.ts`. Actions :
  `src/server/actions/patient-news.ts`.
- Pages publiques : `src/app/(public)/nouveautes/` (abonnement, désinscription,
  route `un-clic`, `not-found.tsx`).
- Intégration à l'e-mail du plan : `src/server/services/sealed-documents.ts`,
  `src/server/actions/documents.ts`.

**Campagnes**

- Règles pures : `src/core/admin/campaigns.ts` ; pied de page d'e-mail :
  `src/core/platform/email-layout.ts`.
- Services : `src/server/services/admin/campaigns.ts`,
  `src/server/services/admin/campaign-audience.ts`. Actions :
  `src/server/actions/admin-campaigns.ts`.
- Désinscription des offres : `src/app/(public)/offres/desinscription/`.
- Passage quotidien : `src/app/api/cron/automatisations/route.ts`.

**Interfaces** — écran de l'officine : `src/app/(app)/nouveautes/` (permission
`news:manage`) ; console : `src/app/(admin)/admin/campagnes/` ; relances
automatiques : `src/app/(admin)/admin/relances/`.

**Parrainage et relances** — `src/core/billing/referral.ts`,
`src/server/services/referral.ts`, `src/server/services/referral-offers.ts`,
`src/core/admin/automations.ts`, `src/server/services/admin/automations.ts`,
`src/core/admin/email-templates.ts`, `src/server/services/admin/outbound-email.ts`.

**Transverse** — jetons `src/server/security/tokens.ts`, en-têtes
`OutgoingEmail.headers` (`src/core/ai/ports/index.ts`, fournisseurs Resend et SMTP),
permission `news:manage` (`src/server/rbac/permissions.ts`), actions d'audit
(`src/server/audit/log.ts`).

**Garde-fous (tests)**

| Test | Ce qu'il garantit |
|---|---|
| `src/server/actions/__tests__/admin-actions-session.test.ts` | chaque fonction asynchrone exportée de `admin-*.ts` appelle `requirePlatformSession()` avant tout autre traitement |
| `src/core/patient-news/__tests__/independance-donnees-sante.test.ts` | aucune table ni requête du lot vers ordonnance, plan scellé, patient, conseil, ni nom de médicament ; aucun nom d'outil côté patient ; pied de page des messages aux professionnels avec lien de désinscription |
| `src/core/admin/__tests__/migration-notifications-campagnes.test.ts` | la migration ne contient aucun `DROP`, `RENAME`, `DELETE` ni modification de colonne existante ; chaque table nouvelle du schéma y figure |
| `src/core/patient-news/__tests__/independance.test.ts` | aucun import ni modèle « partenaire », aucun paiement dans le module des nouveautés |

---

## 10. À faire valider par un juriste ou un DPO

Aucun point ci-dessous n'est un avis juridique : ce sont les décisions que le code
a dû prendre et qu'un professionnel doit confirmer.

1. **Adresse conservée sur consentement, en mode sans patient.** Le mode sans
   patient promet de ne rien conserver de ce qui rattache une personne à son
   traitement ; l'abonnement conserve **une adresse e-mail et le nom d'une
   pharmacie**, chiffrées, sur le seul geste du patient. À confirmer : cette
   adresse n'est pas une donnée de santé tant qu'aucun lien avec un plan,
   une ordonnance ou un produit n'existe ; savoir que cette personne est cliente
   d'une pharmacie donnée est acceptable ; `MODE-SANS-PATIENT.md` en tient le détail.
2. **Rôles.** La pharmacie est responsable du traitement, PharmaBoost
   sous-traitant : contrat de sous-traitance, mention d'information (page
   d'abonnement et pied de page des messages) rédigée au nom de la pharmacie. Le
   texte actuel (`noticeVersion = v1`) est à valider ; **toute modification de ce
   texte doit incrémenter `PATIENT_NEWS_NOTICE_VERSION`**, sans quoi les
   consentements déjà recueillis se rapporteraient à un texte qui n'existe plus.
3. **Preuve du consentement.** Sont gardés : la date, la source, la version du
   texte. Ne sont pas gardés : le texte lui-même, l'adresse IP. Le lien peut être
   transféré avec l'e-mail du plan (double confirmation non exigée). À juger
   suffisant ou non.
4. **Durée de 36 mois** après le consentement, puis purge : durée à confirmer, ainsi
   que l'effacement des empreintes de désinscription à ce terme (un patient
   désinscrit puis purgé n'est plus connu, mais plus aucun message ne lui part).
5. **Exercice des droits.** Les textes renvoient à la pharmacie pour l'accès, la
   rectification et la suppression. **Aucun outil ne permet aujourd'hui** à la
   pharmacie ni à l'équipe de retrouver, exporter ou effacer l'abonnement d'une
   adresse donnée si le patient a perdu ses liens (la pharmacie ne voit que des
   comptes). À construire ou à encadrer par une procédure avant l'ouverture à des
   officines réelles.
6. **Transfert et sous-traitants.** L'adresse est chiffrée au repos, mais déchiffrée
   pour être remise au prestataire d'envoi (Resend ou SMTP selon la
   configuration) ; la base (Neon) est en `us-east-1`, hors Union européenne
   (`HDS.md`). Garanties à qualifier.
7. **Option activée par défaut.** `patientNewsEnabled` est vrai pour toutes les
   officines : le bloc d'invitation figure dans leurs e-mails de plan dès le
   déploiement, sans action du titulaire. L'invitation reste facultative et
   n'enregistre rien avant le geste du patient ; l'activation par défaut est un
   choix produit à confirmer.
8. **Base légale des campagnes B2B.** Les campagnes écrivent à des adresses
   professionnelles (titulaire d'officine, contact d'un laboratoire) avec une
   désinscription en un clic et une liste d'opposition. La qualification
   (prospection entre professionnels, intérêt légitime, information préalable) et
   le texte du pied de page sont à valider ; le titulaire peut être une personne
   physique.
9. **Conservation des destinataires de campagne.** `campaign_recipients` (adresse,
   nom, détail du prestataire) et `EmailDispatch` ne sont **jamais purgés**. Durée à
   arrêter, puis purge à écrire.
10. **Liste de désinscription des offres.** Elle ne garde que des empreintes, sans
    limite de durée, ce qui est nécessaire pour respecter l'opposition : à confirmer.
11. **Frontière entre message de service et offre.** Le message « un filleul a
    rejoint » et les relances de contrat ne sont pas soumis à la liste des offres ;
    l'invitation à référencer sa gamme l'est. La qualification est à confirmer.
12. **Offres de parrainage et de bonus.** Le texte promet « réduit votre abonnement
    de X » alors que la remise n'est qu'un calcul affiché et que la facture Stripe
    n'est pas modifiée (§ 5) : à aligner avec les conditions de l'offre avant tout
    envoi d'une campagne de parrainage réelle. L'offre s'applique en outre à tous les
    nouveaux filleuls, pas aux seuls destinataires du message (§ 5).
13. **Annonces aux patients.** Une annonce présente une gamme sans prétendre
    soigner ; les mots d'ordonnance, de prescription, de remboursement et de
    guérison sont refusés. La frontière avec la publicité pour des produits de
    santé (même sans ordonnance) est à faire valider, comme pour le suivi
    (`CONFORMITE.md` § 3.5 bis).
