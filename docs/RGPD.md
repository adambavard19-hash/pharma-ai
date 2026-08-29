# RGPD — synthèse opérationnelle

Ce fichier résume ce qu'un exploitant doit savoir au quotidien.
Le détail, y compris les points à faire valider, se trouve dans
[`CONFORMITE.md`](./CONFORMITE.md).

---

## Où vivent les données sensibles

| Donnée | Table | Protection |
|---|---|---|
| Allergies, pathologies, traitements, notes | `patient_health_profiles` | Chiffré AES-256-GCM |
| Grossesse, allaitement, insuffisances | `patient_health_profiles` | Booléens, non chiffrés |
| Ordonnance (fichier) | Fournisseur de stockage | Accès restreint par officine |
| Lignes d'ordonnance | `prescription_lines` | Isolé par officine |
| Consentements | `patient_consents` | Horodatés, révocables |

Le journal d'audit **ne contient jamais** ces contenus — uniquement des
identifiants et des compteurs.

---

## Consentements gérés

| Type | Effet concret dans l'application |
|---|---|
| `DATA_PROCESSING` | Traitement des données personnelles |
| `HEALTH_DATA` | Traitement des données de santé |
| `ADVICE_SHARING` | **Bloque l'envoi de la fiche conseil s'il est absent** |
| `FOLLOW_UP_MESSAGE` | **Bloque l'envoi de tout suivi s'il est absent** |
| `MARKETING_EMAIL` | Communications e-mail |
| `MARKETING_SMS` | Communications SMS |

Chaque consentement est accordé ou retiré depuis la fiche patient, avec
horodatage et auteur du recueil.

`FOLLOW_UP_MESSAGE` est volontairement distinct des consentements marketing. Un
suivi de traitement n'est pas une offre commerciale : les confondre reviendrait
soit à bloquer un suivi légitime, soit à faire passer de la promotion pour du
soin.

## Suivi patient — ce qui sort de l'officine

- **Aucune donnée de santé ne quitte l'officine par message.** Ni molécule, ni
  pathologie, ni posologie : le message dit qu'un suivi existe et porte un lien
  sécurisé. Le contenu de santé reste derrière ce lien, à durée limitée. Les
  gabarits ne reçoivent structurellement que quatre variables — prénom, nom de
  l'officine, lien, lien de désinscription — et des tests le vérifient.
- **Aucun envoi automatique.** Un rappel arrive à échéance dans une liste de
  travail ; c'est un professionnel qui l'envoie, et son identité est enregistrée.
- **Aucun profilage.** Un rappel découle d'un fait enregistré — une vente, une
  ordonnance — jamais d'un segment déduit ni d'un score d'appétence à l'achat.
- **Plafond de sollicitation** paramétrable par officine (30 jours par défaut),
  appliqué côté serveur et non seulement à l'écran.
- **Désinscription** par un lien porté par chaque message, fonctionnel sans
  compte. Elle coupe les rappels à venir et révoque le consentement, sans
  toucher au dossier de soin, qui relève d'une obligation distincte. La page ne
  modifie rien sur simple visite : un aperçu de messagerie ou un antivirus
  désinscrirait sinon des patients qui n'ont rien demandé.

---

## Exercice des droits

| Droit | Où | Effet |
|---|---|---|
| Accès | Fiche patient | Ordonnances, conseils, documents, interactions |
| Rectification | Fiche patient | Modification directe |
| Effacement | Fiche patient → Supprimer | Profil de santé supprimé, identité anonymisée |
| Opposition | Consentements | Retrait immédiat |

L'effacement conserve l'historique commercial **agrégé** sans rattachement
nominatif : les obligations comptables sont préservées, la personne ne l'est
plus.

---

## Suivi de l'équipe

Les indicateurs nominatifs par collaborateur sont protégés par une permission
dédiée et signalés dans l'interface. **Leur usage suppose information préalable
des personnes, proportionnalité, et consultation des représentants du personnel
lorsque cela s'applique.** À faire valider avant toute exploitation
managériale.

---

## Points bloquants avant production

1. Hébergement agréé **HDS**.
2. **Analyse d'impact** relative à la protection des données.
3. **Durées de conservation** arrêtées et purge automatisée.
4. **Registre des traitements**.
5. **Contrats de sous-traitance** (hébergeur, IA, messagerie).
6. **Mentions d'information** rédigées et validées.
