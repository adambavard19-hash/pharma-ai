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
| Abonnement aux nouveautés de l'officine | `patient_news_subscriptions` | Adresse chiffrée AES-256-GCM, empreinte HMAC ; **aucune donnée de santé**, aucun lien avec un patient |

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
| Abonnement aux nouveautés de l'officine | Le patient reçoit les annonces de **sa** pharmacie (nouvelles gammes), au plus une par semaine, écrites et confirmées par le titulaire. **Aucune annonce sans abonnement.** Recueilli par le patient lui-même, sur un lien facultatif de l'e-mail du plan : il ne passe ni par la fiche patient ni par `patient_consents` |

Chaque consentement est accordé ou retiré depuis la fiche patient, avec
horodatage et auteur du recueil. **Une exception, voulue :** l'abonnement aux
nouveautés de l'officine (ci-dessous) est recueilli par le patient lui-même, sans
fiche.

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

## Nouveautés de l'officine — un abonnement qui n'est pas un suivi

Le patient qui reçoit l'e-mail de son plan peut demander à être prévenu des
nouvelles gammes de sa pharmacie. Détail et limites :
[`NOTIFICATIONS-CAMPAGNES.md`](./NOTIFICATIONS-CAMPAGNES.md).

- **Le geste est le sien.** L'e-mail porte un lien facultatif ; l'adresse y est
  chiffrée et **n'est enregistrée nulle part tant que le patient n'a pas cliqué**.
  Ouvrir la page n'écrit rien ; l'abonnement naît sur un bouton explicite, rien
  n'est coché d'avance. Le plan n'en dépend pas.
- **Ce qui est conservé :** l'adresse chiffrée, son empreinte, la date, la source
  et la version du texte d'information. **Ce qui ne l'est pas :** aucun nom, aucune
  donnée de santé, aucun lien avec une ordonnance, un plan, un produit ou un
  traitement. Le patient n'a pas de fiche.
- **Conservation : 36 mois** après le consentement, puis purge automatique (comptes
  seulement au journal d'audit, jamais d'adresse).
- **Désinscription** par un lien présent dans chaque message, sans compte, en un
  clic : l'adresse chiffrée est effacée, seule l'empreinte reste pour que le choix
  soit respecté. La page ne modifie rien sur simple visite.
- **Ce qui sort :** une annonce écrite et confirmée par le titulaire (nombre
  d'abonnés à l'appui), au plus une tous les 7 jours, 600 caractères, aucun lien,
  aucun mot d'ordonnance ou de guérison ; expéditeur : le nom de la pharmacie.
  Rien ne part tout seul, et rien n'est déclenché par un partenaire ou un paiement.

### Un suivi n'est pas une offre

Les deux circuits restent **séparés, volontairement** :

| | Suivi de traitement | Nouveautés de l'officine |
|---|---|---|
| Nature | accompagnement, lié à un fait de soin | information commerciale sur une gamme |
| Consentement | `FOLLOW_UP_MESSAGE`, sur la fiche | abonnement, par le patient, sans fiche |
| Lien avec le patient | oui (fiche, ordonnance) | **aucun** |
| Contenu | jamais de donnée de santé dans le message | jamais de donnée de santé, jamais de mot d'ordonnance |
| Envoi | un professionnel, un rappel à la fois | le titulaire, une annonce par semaine au plus |
| Désinscription | coupe les suivis | coupe les nouveautés, **et seulement elles** |

Accepter l'un n'autorise jamais l'autre. Un suivi n'annonce pas de gamme ; une
annonce ne parle jamais d'un traitement. Les confondre reviendrait à faire passer
de la promotion pour du soin, ou à bloquer un suivi légitime.

---

## Exercice des droits

| Droit | Où | Effet |
|---|---|---|
| Accès | Fiche patient | Ordonnances, conseils, documents, interactions |
| Rectification | Fiche patient | Modification directe |
| Effacement | Fiche patient → Supprimer | Profil de santé supprimé, identité anonymisée |
| Opposition | Consentements | Retrait immédiat |
| Opposition aux nouveautés | Lien de désinscription de chaque message, sans compte | Adresse effacée ; empreinte gardée pour respecter le choix |

L'effacement conserve l'historique commercial **agrégé** sans rattachement
nominatif : les obligations comptables sont préservées, la personne ne l'est
plus.

Un abonné aux nouveautés se désinscrit lui-même par le lien de n'importe quel
message. **Aucun outil ne permet aujourd'hui** à l'officine ni à la console de
retrouver, d'exporter ou d'effacer l'abonnement d'une adresse donnée quand le
patient a perdu ses liens : à construire ou à encadrer par une procédure
(`NOTIFICATIONS-CAMPAGNES.md` § 10).

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
3. **Durées de conservation** arrêtées et purge automatisée (faite pour les
   abonnements aux nouveautés : 36 mois ; à faire pour le reste).
4. **Registre des traitements**.
5. **Contrats de sous-traitance** (hébergeur, IA, messagerie).
6. **Mentions d'information** rédigées et validées.
