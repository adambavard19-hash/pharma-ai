# Mode sans patient — ne conserver aucune donnée de santé rattachée à une personne

*Décidé le 1er octobre 2026. L'interrupteur : `PATIENT_DATA_MODE=none`.*

## Pourquoi

L'obligation d'hébergement certifié HDS (docs/HDS.md) tombe dès qu'on
conserve des données de santé à caractère personnel. Tant que PharmaBoost ne
garde rien qui rattache un traitement à une personne, il n'héberge pas de
donnée de santé au sens de la loi, et peut tourner sur un hébergement
ordinaire. Le mode `full`, qui conserve fiches, suivis et documents, reste
dans le code pour le jour où l'hébergement HDS est en place.

## Ce que le mode `none` change

| | `full` | `none` |
|---|---|---|
| Fiche patient, allergies, historique | conservés | écran absent, création impossible |
| Nom lu sur l'ordonnance | proposé pour rattacher un patient | jamais renvoyé par le lecteur |
| Image de l'ordonnance | conservée | **effacée à la vérification** des lignes (`prescription.file_erased` au journal) |
| Lignes de médicaments, conseils, vente | conservés, rattachés au patient | conservés, **sans personne** |
| Plan de prise remis | document conservé, lien à jeton | **plan scellé** : chiffré, clé dans le lien, effacé après 90 jours |
| E-mail au patient (l'e-mail du plan) | adresse de la fiche, consentement enregistré | adresse donnée au comptoir, utilisée une fois, non conservée (forme masquée au journal) |
| Nouveautés de l'officine (facultatif) | abonnement sur le geste du patient : adresse chiffrée, 36 mois, aucun lien avec la fiche | **même mécanisme** : adresse chiffrée, 36 mois, aucun lien avec un plan, une ordonnance ou un produit (voir ci-dessous) |
| Rappels de prise | messages de suivi programmés par l'officine | **dans l'agenda du téléphone** du patient (fichier iCalendar produit dans son navigateur) |
| Suivis à J+7 | écran Suivis | écran absent |

## Le plan scellé, en détail

1. Au comptoir, « Remettre le plan » compose le plan sans identité
   (`composeDocumentContent(..., { withIdentity: false })`).
2. Le serveur le chiffre (AES-256-GCM) avec une clé tirée au hasard, stocke
   le chiffré dans `sealed_documents`, et **jette la clé**.
3. Le lien remis est `/plan/<id>#<clé>`. La partie après le dièse n'est
   jamais envoyée au serveur par un navigateur.
4. Le téléphone du patient charge le chiffré (`/api/plan/<id>`) et le
   déchiffre localement (WebCrypto). « Ajouter les rappels à mon agenda »
   construit un fichier iCalendar à partir du plan, dans le navigateur.
5. Le plan en clair ne revient qu'au poste du pharmacien, pour l'afficher et
   l'imprimer. L'e-mail ne contient que le lien et le nombre de prises par
   moment, jamais un nom de médicament. Il porte aussi, sauf si l'officine l'a
   coupé, un bloc **facultatif** d'invitation aux nouveautés de la pharmacie : un
   lien, et rien n'est enregistré sans le geste du patient (section suivante).
6. À l'échéance, `purgeExpiredSealedDocuments` efface le chiffré.

Code : `src/core/documents/seal.ts`, `src/core/documents/calendar.ts`,
`src/server/services/sealed-documents.ts`, `src/app/(public)/plan/[id]`.

## La seule exception : l'abonnement aux nouveautés de l'officine

La ligne « E-mail au patient » ci-dessus reste vraie pour l'e-mail du plan :
l'adresse donnée au comptoir sert à cet envoi et n'est pas conservée. **Une
adresse n'est conservée que dans un cas : le patient lui-même demande à être
prévenu des nouveautés de sa pharmacie.** Rien d'autre ne la retient, et rien n'est
fait à sa place.

- **Le geste.** L'e-mail du plan contient un lien facultatif. L'adresse y est dans
  un **jeton chiffré** (valable 90 jours) : elle n'est enregistrée nulle part tant
  que le patient n'a pas ouvert la page **et** cliqué sur « Oui, tenez-moi
  informé(e) ». Ouvrir la page n'écrit rien.
- **Ce qui est conservé** (`patient_news_subscriptions`) : l'officine, l'adresse
  **chiffrée** (AES-256-GCM), son empreinte, le statut, la date et la source du
  consentement, la version du texte d'information. **Aucun lien avec le plan, une
  ordonnance, un produit ou un traitement ; aucun nom ; aucune donnée de santé.**
  Le patient n'a pas de fiche.
- **Conservation : 36 mois** après le consentement, puis purge (passage quotidien).
  La désinscription, présente dans chaque message et sans compte, efface
  l'adresse sur-le-champ.
- **Ce qui part** : une annonce du titulaire, une par semaine au plus, sans lien
  libre ni mot d'ordonnance. Le plan, lui, ne dépend jamais de l'abonnement.
- **Ce que ça ne change pas** : les rappels de prise restent dans l'agenda du
  téléphone du patient ; le serveur n'en envoie aucun (un rappel de prise lié à
  une adresse serait une donnée de santé : `NOTIFICATIONS-CAMPAGNES.md` § 3).
- Le script de purge ci-dessous ne touche pas à ces abonnements : ce ne sont pas des
  données de santé, ils ont leur propre purge.

Détail, limites et points ouverts : [`NOTIFICATIONS-CAMPAGNES.md`](./NOTIFICATIONS-CAMPAGNES.md).

## Passer une base existante en mode `none`

```
node --env-file=.env --conditions=react-server --import tsx scripts/sans-patient/purger.mts              # aperçu
node --env-file=.env --conditions=react-server --import tsx scripts/sans-patient/purger.mts --confirmer  # efface
```

Efface fiches patient, rappels, documents conservés, images et noms de
prescripteur ; garde ordonnances, lignes, ventes, conseils, stock. Inscrit
`patient_data.purged` au journal de chaque officine. Irréversible.

## Ce qui reste à faire valider par un juriste

- **L'abonnement aux nouveautés** : une adresse e-mail est conservée, chiffrée,
  36 mois, sur le seul geste du patient, sans lien avec un plan ni un traitement.
  À confirmer : elle n'est pas une donnée de santé ; savoir qu'une personne est
  cliente d'une pharmacie donnée est acceptable ; le texte d'information et la
  durée conviennent ; l'option est activée par défaut dans l'e-mail du plan.
  Liste complète : `NOTIFICATIONS-CAMPAGNES.md` § 10.
- L'e-mail de remise : une adresse utilisée une fois sans conservation, un
  message sans donnée de santé. C'est la construction la plus prudente qu'on
  sache faire ; elle mérite une relecture.
- Les lignes de médicaments conservées sans identité, rattachées à une
  officine et une heure : nous les tenons pour non identifiantes.
- La lecture d'ordonnance par l'API Anthropic (texte sans nom de patient,
  image effacée ensuite) : un transfert pseudonymisé, à inscrire dans
  l'information des patients.
