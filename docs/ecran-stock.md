# L'écran « Mon stock » et la mise à jour du stock

Refonte du 8 octobre 2026. Objectif : qu'un pharmacien sans aucune compétence informatique comprenne l'écran en quelques secondes.

## L'écran `/stock`

Titre « Mon stock », l'officine, l'état (**À jour** sous trois jours, **À actualiser** au-delà, **Aucun stock reçu**), l'âge du
dernier stock (« Il y a 21 jours »), **un seul bouton vert** « Mettre à jour mon stock », deux chiffres, la recherche (nom, CIP,
EAN), la liste (produit, quantité modifiable sur place, prix, disponibilité), « Ajouter un produit » (secondaire, en bas), et un
lien discret « Qualité du catalogue ».

Retirés de l'écran principal — rien n'est supprimé, tout est déplacé : « Ma connexion » (déjà dans le menu), « Comprendre les
produits non classés », « Chercher les photos de boîtes », la carte « Anomalies », la bande d'état de la connexion, « Dates
courtes » et « Historique » → page **Qualité du catalogue** (`/stock/qualite`).

## Les chiffres (audit)

Source unique : `src/core/stock/stock-summary.ts`. Un produit est **disponible** (actif, quantité > 0), **en rupture** (actif,
quantité 0) ou **désactivé** ; `référencés = disponibles + ruptures + désactivés`, toujours. Les chiffres du haut sont ceux de tout
le catalogue, jamais ceux de la recherche.

Pourquoi « 4 307 références » et « 2 735 en stock » côtoyaient « 1 rupture » sur l'officine de test : l'ancien écran n'appelait
« en stock » que les produits dont la quantité dépasse leur **seuil d'alerte**. Les 2 373 produits de parapharmacie ont tous un seuil
par défaut de 5 : 1 571 d'entre eux (quantité de 1 à 5) étaient classés « stock faible », ni « en stock » ni en rupture.
2 735 = 802 produits au-dessus du seuil + 1 933 médicaments (seuil 0). Le vrai compte est **4 306 disponibles** (quantité > 0)
et **1 rupture**. Un seuil d'alerte est un réglage de commande : il reste sur la fiche du produit, il n'enlève rien aux
produits disponibles. Les produits « non classés » (457) ou sans photo ne sont PAS des ruptures : seule la quantité compte.

## Mettre à jour mon stock (`/stock/mise-a-jour`) — trois étapes

1. **Choisir le fichier** (CSV, Excel ou PDF d'inventaire, 8 Mo au plus ; glisser-déposer possible).
2. **Vérifier** : `previewStockAction` lit le fichier avec les MÊMES contrôles que l'envoi réel et dit combien de produits,
   combien reconnus ou nouveaux, combien de lignes illisibles, combien de produits en rayon **passeraient à 0**, et si le fichier
   sera appliqué ou retenu pour l'équipe. **Rien n'est écrit** : ni stock, ni dépôt, ni fichier gardé ; l'analyse temporaire est
   supprimée (testé : aucune ligne de plus en base).
3. **Confirmer** : une phrase dit ce qui va se passer ; si des produits passent à 0, une **case à cocher** est obligatoire. Puis
   `sendStockAction` refait les contrôles du serveur et exige la confirmation (`confirmation=remplacer`).

Protections conservées (`assessDeposit`, un seul endroit pour l'aperçu et l'envoi : `evaluateFile`) : fichier lu en partie,
trop de lignes illisibles, moins de 80 % du stock connu, plus de 25 produits ET 5 % du stock qui passeraient à 0 → le fichier
n'est pas appliqué, l'équipe PharmaBoost le vérifie, le stock ne change pas. Les dossiers et chemins du serveur de l'officine
n'apparaissent plus ici (espace d'assistance de la console).

## Qualité du catalogue (`/stock/qualite`)

Produits à comprendre (classification), photos de boîtes, produits sans prix (liste), dates courtes, historique des mouvements,
import avec aperçu des colonnes (`/stock/import`, pour un fichier aux colonnes non reconnues).
