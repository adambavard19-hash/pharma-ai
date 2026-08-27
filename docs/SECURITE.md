# Sécurité

## Mots de passe

**scrypt** (RFC 7914), fourni par Node — aucune dépendance native, donc aucun
échec de build selon la plateforme.

- Paramètres : `N = 2^15`, `r = 8`, `p = 1`, clé de 64 octets
- Sel aléatoire de 16 octets par mot de passe
- Comparaison à temps constant (`timingSafeEqual`)
- Format stocké : `scrypt$N$r$p$sel$empreinte` — les paramètres sont portés par
  l'empreinte, ce qui permet de les durcir sans invalider l'existant

Exigences minimales à la saisie : 12 caractères, une minuscule, une majuscule,
un chiffre (`validatePasswordStrength`).

## Sessions

- Jeton opaque de 32 octets aléatoires (`randomBytes`)
- **Seule l'empreinte SHA-256 est stockée** : une fuite de la base ne permet pas
  de rejouer une session
- Cookie `httpOnly`, `secure` en production, `sameSite=lax`
- Durée : 12 heures ; révocables individuellement (`revokedAt`)
- IP et agent utilisateur enregistrés pour l'audit

Les sessions **plateforme** (éditeur) sont une table distincte : un
administrateur de l'éditeur ne peut pas obtenir de session officine.

## Chiffrement applicatif

**AES-256-GCM** sur les champs de santé libres.

- Clé dérivée de `DATA_ENCRYPTION_KEY` (base64 de 32 octets, ou dérivation
  SHA-256 sinon)
- Vecteur d'initialisation aléatoire de 12 octets par valeur
- Tag d'authentification vérifié au déchiffrement — une valeur altérée renvoie
  `null` plutôt qu'un contenu douteux
- Format versionné `enc:v1:iv.tag.données` → rotation possible

⚠️ La rotation de la clé nécessite un déchiffrement/rechiffrement de
l'existant. Procédure à écrire avant la production.

## Isolation multi-tenant

Voir `docs/ARCHITECTURE.md` § 3. En résumé :

1. L'officine active vient **exclusivement** de la session serveur
2. Chaque requête filtre sur `pharmacyId`
3. Chaque entité récupérée par identifiant client est revérifiée

## Secrets

- `src/config/env.ts` importe `server-only` : un import depuis un composant
  client fait **échouer la compilation**
- Validation Zod au démarrage — un secret manquant arrête l'application avec un
  message explicite plutôt qu'une erreur au premier appel
- `.env` est dans `.gitignore` ; `.env.example` ne contient aucune valeur réelle

## Fichiers

La route `/api/files/[...key]` applique deux contrôles :

1. Authentification obligatoire
2. La clé **doit** commencer par l'identifiant de l'officine de la session

Les remontées de répertoire (`..`) sont rejetées.

## Validation des entrées

Toutes les actions serveur valident leurs entrées avec Zod. Les erreurs métier
sont renvoyées sous forme de `ActionResult` typé ; les exceptions restent
réservées aux erreurs de programmation et aux violations d'isolation, qui
doivent remonter et être tracées.

## Journalisation

`AuditLog` enregistre : action, type et identifiant d'entité, officine,
utilisateur, IP, agent utilisateur, horodatage.

**Règle absolue** : `metadata` ne contient jamais de donnée de santé en clair.

## Ce qui reste à faire

- Revue de sécurité indépendante
- Authentification à deux facteurs
- Limitation du nombre de tentatives de connexion
- En-têtes de sécurité (CSP, HSTS) au niveau de l'hébergement
- Politique de sauvegarde et procédure de restauration testée
- Gestion des secrets par coffre-fort
