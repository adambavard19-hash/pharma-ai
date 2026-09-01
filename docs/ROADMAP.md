# Feuille de route Pharma.ai

État au terme de la première phase de construction.

---

## Phase 1 — MVP fonctionnel ✅ *livré*

L'objectif était qu'on puisse ouvrir l'application et comprendre immédiatement
la vision, avec une architecture permettant d'en faire un vrai produit.

| # | Élément | État |
|---|---|---|
| 1 | Architecture application (domaine pur / serveur / interface) | ✅ |
| 2 | Authentification, sessions, RBAC par permissions | ✅ |
| 3 | Officine fictive de démonstration (groupe + 2 officines) | ✅ |
| 4 | Tableau de bord | ✅ |
| 5 | Module patients (CRM + profil de santé chiffré + consentements) | ✅ |
| 6 | Catalogue produits + import CSV | ✅ |
| 7 | Stock temps réel + alertes + disponibilité inter-officines | ✅ |
| 8 | Import d'ordonnance (photo / scan / image / PDF) | ✅ |
| 9 | Écran de vérification avec confiance par champ | ✅ |
| 10 | Moteur de recommandation — architecture propre, fournisseurs simulés | ✅ |
| 11 | Copilote du pharmacien (accepter / modifier / remplacer / supprimer) | ✅ |
| 12 | Fiche patient (écran, impression A4, page sécurisée + QR code) | ✅ |
| 13 | Suivi des ventes complémentaires + attribution du CA | ✅ |
| 14 | Analytics | ✅ |
| 15 | Données de démonstration réalistes et fictives | ✅ |

**En complément** : centre de notifications, recherche globale (⌘K), règles de
conseil de l'officine, journal d'audit, console d'administration éditeur,
modèle d'abonnement, 107 tests sur les fonctions critiques.

---

## Refonte « copilote de comptoir » ✅ *livrée*

Le MVP savait tout faire, en onze entrées de menu et quatre écrans successifs :
la carte d'un ERP, pas le travail d'un pharmacien qui reçoit une ordonnance et
dispose d'une minute. La refonte replie l'application derrière un seul geste —
scanner — et ajoute le pilier qui manquait : le retour du patient.

Le moteur, la base et la couche serveur ne sont pas repris ; ce qui change est
la surface, plus l'ajout du suivi patient.

| Lot | Contenu | État |
|---|---|---|
| 0 | Navigation à cinq entrées, plafond de 3 conseils, URL `/vente` posées, anciennes adresses redirigées | ✅ |
| 1 | Écran de vente unique — vérification, sécurité et conseils fusionnés | ✅ |
| 2 | `counterScript` : la phrase à dire au patient, portée par la règle de conseil | ✅ |
| 3 | Accueil comptoir — un bouton, les chiffres en second plan | ✅ |
| 4 | Suivis et rappels — modèle `Reminder`, consentement dédié, désinscription | ✅ |
| 5 | Fusion Produits + Stocks, regroupement des Paramètres | ✅ |
| 6 | Jeu de démonstration, documentation, mesure du parcours | ✅ |

**Règles tenues pendant toute la refonte** : retirer du menu n'est pas
supprimer (aucune route cassée, aucune donnée perdue) ; chaque lot se termine
sur une application qui compile, passe ses tests et reste utilisable ; aucun
écran ne montre une fonctionnalité qui n'existe pas.

**Résultat mesuré** — `npm run demo:comptoir`, build de production :

| Étape | Durée |
|---|---|
| Accueil → écran de scan | 0,14 s |
| Scan → ordonnance lue à l'écran | 0,26 s |
| Vérification des lignes | 0,65 s |
| Analyse → sécurité et conseils affichés | 0,24 s |
| Conseil ajouté à la vente | 0,14 s |
| Vente enregistrée → fin de vente | 0,15 s |
| **Total** | **1,58 s** |

Temps machine uniquement : la saisie et la conversation ne sont pas simulées.
Sur un budget d'une minute, il reste 58 secondes pour le patient.

La mesure a servi à quelque chose dès la première exécution : elle a révélé
7,7 s au lieu de 1,6 s, dont **six secondes pendant lesquelles le bouton
« Terminer la vente » ne répondait pas**. La confirmation affichée après
l'analyse se plaçait exactement par-dessus, et interceptait les clics. Un défaut
qu'aucun test unitaire n'aurait attrapé, et qu'un pharmacien aurait pris pour
une application figée.

---

## Référentiel médicamenteux réel (BDPM) 🚧 *en cours*

Le MVP fonctionnait sur douze fiches médicamenteuses inventées. Elles sont
remplacées par la **Base de Données Publique des Médicaments**, référentiel
officiel des spécialités commercialisées en France.

La règle qui structure tout : **le catalogue national n'est jamais copié dans
une officine**. Une pharmacie ne possède que des lignes de stock qui le
référencent — c'est ce qui permet à une resynchronisation mensuelle de ne jamais
toucher au stock de qui que ce soit.

| Lot | Contenu | État |
|---|---|---|
| A | Les neuf tables du catalogue national, migration additive, journal de synchronisation, mention de source | ✅ |
| B | L'importateur BDPM : téléchargement, lecture ISO-8859-1, contrôle strict des colonnes, upsert idempotent | à faire |
| C | Stock des médicaments, recherche unifiée, scan CIP13, import en masse, étape d'installation | à faire |
| D | Identification des lignes d'ordonnance contre le catalogue, couche éditoriale séparée | à faire |

**Ce qui reste séparé, définitivement** : le catalogue national (BDPM, jamais
modifiable par une officine) et le catalogue officinal (`Product` — vitamines,
probiotiques, dermocosmétique, créés par la pharmacie). Le moteur de conseil ne
lit que le second : un médicament remboursé ne peut donc pas devenir une
recommandation commerciale, non par convention mais par construction.

**Licence** : la BDPM est réutilisable à condition de mentionner la source et sa
date de mise à jour, de ne pas altérer les données et de ne suggérer aucun aval
de l'ANSM, de la HAS ou de l'UNCAM. Ces obligations sont portées par une
fonction unique et testée (`src/core/reference/attribution.ts`). **Aucune
extraction de VIDAL** : base sous licence commerciale.

---

## Phase 2 — Prérequis à une utilisation réelle 🔴 *bloquant*

Aucun de ces points n'est résolu par le code seul.

| # | Élément | Nature |
|---|---|---|
| 1 | **Référentiel médicamenteux validé** — remplacer le jeu fictif | Licence + adaptateur |
| 2 | **Validation du socle de règles par un pharmacien** | Métier |
| 3 | **Hébergement agréé HDS** — base de données et fichiers | Contractuel |
| 4 | **Analyse d'impact (AIPD)** | Juridique |
| 5 | **Durées de conservation** arrêtées et purge automatisée | Juridique + code |
| 6 | **Registre des traitements**, mentions d'information | Juridique |
| 7 | **Revue de sécurité indépendante** | Externe |
| 8 | Authentification à deux facteurs, limitation des tentatives | Code |
| 9 | Sauvegardes et procédure de restauration testée | Exploitation |

---

## Phase 3 — Extraction réelle

| Élément | Détail |
|---|---|
| Adaptateur OCR réel | ✅ livré — `VisionOCRProvider`, modèle de vision, schéma strict, confiance par champ réellement issue du modèle. Activation soumise à trois conditions dont l'autorisation explicite de sortie de l'image (`docs/EXTRACTION.md`). |
| Garantie « aucune valeur inventée » | ✅ livré — un champ sans citation du texte lu sur l'image est écarté ; validateur pur et testé hors ligne. |
| Validation sur ordonnances réelles | **À faire par l'officine.** Dix photos réelles : tout champ inventé est un échec, un champ vide signalé est un succès. Impossible depuis l'environnement de développement (ni clé, ni images réelles). |
| Hébergement HDS des images | **À trancher.** Le stockage livré est local, donc de développement. |
| Ordonnance électronique | Format structuré → extraction fiable, sans OCR |
| Extraction assistée par modèle | Encadrée : le modèle propose, l'écran de vérification reste obligatoire |
| Suivi de la qualité | Taux de correction par champ → mesurer la fiabilité réelle du fournisseur |

---

## Phase 4 — Apprentissage propre à l'officine

Les fondations existent (`PharmacyRule`, `RecommendationEvent`,
`loadValidationHistory`).

| Élément | Détail |
|---|---|
| Pondération par historique | Affiner la dimension `validationHistory` |
| Suggestion de règles | « Vous retirez systématiquement X dans ce contexte — créer une règle ? » |
| Analyse des motifs de refus | Exploiter `pharmacistNote` |
| Garde-fou permanent | L'apprentissage **ne peut agir que sur la dimension commerciale**. Un test le vérifie. |

---

## Phase 5 — Intégrations officinales

| Intégration | Préparation existante |
|---|---|
| Logiciel de gestion officinale | Services de stock conçus pour une synchronisation |
| Caisse / encaissement | `Sale` et `SaleLine` prêts à recevoir une référence externe |
| Catalogues fournisseurs | `ImportJob.kind` extensible |
| Import Excel | Le parseur CSV constitue le premier niveau |
| E-mail / SMS | Port `MessagingProvider` |

---

## Phase 6 — Expérience patient

| Élément | État |
|---|---|
| Page sécurisée + QR code | ✅ livré |
| Impression A4 premium | ✅ livré |
| Envoi e-mail | ✅ livré — Resend (HTTPS) et SMTP. Sans configuration : `SIMULATED`, jamais un faux « envoyé » |
| Envoi SMS | Port prêt, **aucun fournisseur branché** — le canal est refusé explicitement |
| **Vidéo personnalisée** | Port `VideoProvider` prêt, moteur non développé. L'interface affiche « bientôt disponible » — jamais une vidéo qui n'existe pas. |

## Phase 7 — Interactions médicamenteuses

| Élément | État |
|---|---|
| Modèle, importateur strict, CLI `interactions:sync` | ✅ livré |
| Croisement des substances prescrites, classes, alias de vocabulaire | ✅ livré |
| Redondance de substance active (sans référentiel) | ✅ livré |
| Phrase de couverture — ce qui a été vérifié et ce qui ne l'a pas été | ✅ livré |
| Référentiel lui-même | **Fourni par l'officine.** Aucun référentiel français n'est publié en format machine ; le thésaurus ANSM est un PDF, figé depuis septembre 2023. Voir `docs/INTERACTIONS.md`. |

---

## Phase 7 — Plateforme et modèle économique

| Élément | État |
|---|---|
| Modèle Plan / Subscription / statut / essai / limites | ✅ |
| Console d'administration éditeur | ✅ |
| Suivi de consommation IA (`AiUsageRecord`) | Table prête, alimentée dès qu'un fournisseur réel est branché |
| Facturation | `externalCustomerId` prévu, **aucun prestataire branché** |
| Application des limites de plan | À implémenter |
| Métriques SaaS (rétention, expansion) | À implémenter |

---

## Ce qui ne changera pas

Quelle que soit l'évolution du produit, trois garanties sont structurelles et
protégées par des tests :

1. **La sécurité passe avant la pertinence, qui passe avant le commercial.**
   L'ordre du pipeline est un enchaînement de données, pas une convention.
2. **Le pharmacien décide.** Aucun conseil n'atteint le patient sans validation
   professionnelle explicite.
3. **On ne simule jamais ce qui n'existe pas.** Une information absente reste
   absente ; un envoi non effectué est signalé comme tel.
