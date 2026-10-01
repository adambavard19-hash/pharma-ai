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
| E-mail au patient | adresse de la fiche, consentement enregistré | adresse donnée au comptoir, utilisée une fois, non conservée (forme masquée au journal) |
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
   moment, jamais un nom de médicament.
6. À l'échéance, `purgeExpiredSealedDocuments` efface le chiffré.

Code : `src/core/documents/seal.ts`, `src/core/documents/calendar.ts`,
`src/server/services/sealed-documents.ts`, `src/app/(public)/plan/[id]`.

## Passer une base existante en mode `none`

```
node --env-file=.env --conditions=react-server --import tsx scripts/sans-patient/purger.mts              # aperçu
node --env-file=.env --conditions=react-server --import tsx scripts/sans-patient/purger.mts --confirmer  # efface
```

Efface fiches patient, rappels, documents conservés, images et noms de
prescripteur ; garde ordonnances, lignes, ventes, conseils, stock. Inscrit
`patient_data.purged` au journal de chaque officine. Irréversible.

## Ce qui reste à faire valider par un juriste

- L'e-mail de remise : une adresse utilisée une fois sans conservation, un
  message sans donnée de santé. C'est la construction la plus prudente qu'on
  sache faire ; elle mérite une relecture.
- Les lignes de médicaments conservées sans identité, rattachées à une
  officine et une heure : nous les tenons pour non identifiantes.
- La lecture d'ordonnance par l'API Anthropic (texte sans nom de patient,
  image effacée ensuite) : un transfert pseudonymisé, à inscrire dans
  l'information des patients.
