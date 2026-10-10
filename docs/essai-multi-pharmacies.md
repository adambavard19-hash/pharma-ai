# Essai multi-pharmacies (`npm run essai:multi`)

PharmaBoost est un SaaS : ce qui marche sur la pharmacie de test ne prouve rien. Ce script joue, sur la **vraie application et la vraie
base** (`npm run live` d'abord), un scénario à plusieurs pharmacies indépendantes, puis supprime tout ce qu'il a créé.

**Scénario :** 3 pharmacies neuves (A : deux postes et un stock ; B : un poste et un autre stock, un prix différent pour le même produit
associé ; C : aucune histoire, aucun stock) ; une association centrale ; 4 postes bipent le même médicament **en même temps**.

**Ce qu'il vérifie :** 4 bips acceptés et 4 ventes distinctes · A et B ne voient que leur stock · l'association centrale est retrouvée dans
le stock de chaque pharmacie, avec son produit et son prix · la pharmacie neuve sans stock ne reçoit aucun conseil de produit, sans erreur ·
un poste ne peut ni lire, ni déclarer « Vendu », ni terminer la vente d'une autre pharmacie · deux collaborateurs répondent en même temps,
chacun garde sa réponse · trois « Vente terminée » simultanés : un seul traitement, **un seul bilan au patient** · le patient suivant ouvre
une nouvelle vente · les résultats ne comptent que chez la pharmacie concernée.

**Ce qu'il a déjà trouvé (10 oct. 2026) :** deux bips simultanés dans la même pharmacie pouvaient calculer le même numéro d'ordonnance et
perdre un bip (`createWithReference`, `server/services/references.ts`, réessaie avec un nouveau numéro ; appliqué aux bips, au dépôt
d'ordonnance, à l'ordonnance saisie et à l'encaissement) ; deux « Vente terminée » simultanés pouvaient envoyer deux bilans (la
fermeture est réservée d'un seul coup). À rejouer après toute modification des ventes, du comptoir, des stocks ou des règles centrales.
