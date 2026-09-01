# Lecture réelle d'une ordonnance photographiée

## Avant tout : une ordonnance est une donnée de santé

Activer la lecture réelle **transmet la photo d'une ordonnance à un
fournisseur tiers**. Ce n'est pas un réglage technique, c'est une décision qui
engage l'officine :

- l'hébergement des images doit être conforme (HDS pour un hébergement en
  France) ;
- le fournisseur de lecture devient un **sous-traitant au sens du RGPD** :
  contrat écrit, finalité limitée, durée de conservation, localisation ;
- le patient doit être informé du traitement.

Pharma.ai ne peut pas trancher cela à votre place. Il peut, en revanche,
refuser d'agir tant que ce n'est pas tranché — et c'est ce qu'il fait.

---

## Trois conditions, délibérément distinctes

```env
OCR_PROVIDER="anthropic"              # 1. le fournisseur
ANTHROPIC_API_KEY="sk-ant-..."        # 2. la clé
OCR_SEND_IMAGES_EXTERNALLY="true"     # 3. l'autorisation explicite
```

La troisième n'est pas une redondance. Une clé d'API recopiée depuis un autre
projet ne doit pas suffire à envoyer les ordonnances des patients : il faut un
geste dont la seule signification est « nous avons tranché où part l'image ».

Tant que les trois ne sont pas réunies, l'extraction reste simulée et
l'application dit **précisément ce qui manque** — à l'écran comme dans
`npm run doctor` :

```
✗ OCR_PROVIDER="anthropic" mais OCR_SEND_IMAGES_EXTERNALLY="true" manque(nt) — extraction simulée
  Renseignez OCR_SEND_IMAGES_EXTERNALLY="true" dans .env, ou repassez OCR_PROVIDER="mock".
```

Aucune image n'est même lue depuis le stockage tant qu'un lecteur réel n'est
pas actif : un fournisseur simulé n'a aucune raison de recevoir une donnée de
santé, fût-ce en mémoire.

---

## La règle qui empêche l'invention

Un modèle de vision lit très bien. Il est aussi parfaitement capable de
**combler un blanc de façon plausible** — et sur une ordonnance, une posologie
plausible mais fausse est plus dangereuse qu'une posologie absente : la
première sera délivrée, la seconde sera relue.

La garantie est donc **structurelle, jamais seulement demandée dans une
consigne** :

> Pour être retenu, un champ doit être accompagné du texte **lu tel quel** sur
> l'image. Un champ sans citation est écarté, quelle que soit la confiance
> annoncée par le modèle.

Le modèle renvoie, pour chaque champ :

| Champ | Rôle |
|---|---|
| `valeur` | la valeur normalisée, ou `null` |
| `lu_tel_quel` | le texte **exactement** tel qu'il figure sur l'image |
| `confiance` | 0 → 1, jamais cru sur parole |

La validation (`src/core/extraction/validate.ts`) est une **fonction pure**,
testable sans réseau. Une garantie de sécurité qui ne serait vérifiable qu'en
appelant une API n'en serait pas une.

Ce qu'elle écarte :

| Situation | Décision |
|---|---|
| Valeur proposée, aucune citation | **écartée** — le cas dangereux |
| Citation vide | écartée |
| Durée « 7 » citée « pendant une semaine » | écartée : aucun chiffre dans la citation |
| Confiance hors de 0 → 1 | écartée |
| Rien lu là où il n'y a rien | **acceptée** — ne rien lire est correct |

Ce qui est écarté n'est jamais silencieux : le champ devient *illisible*, ce
qui déclenche l'alerte rouge existante au comptoir et impose la relecture par
un pharmacien avant toute analyse.

**Une ligne n'est jamais supprimée.** Un médicament illisible reste affiché,
avec son nom vide : une ligne supprimée est une ligne que personne ne relira.

---

## Ce qui se passe quand la lecture échoue

Aucune panne ne bloque le comptoir et aucune ne produit d'ordonnance vide
silencieuse. Chaque cas revient avec son motif à l'écran :

| Cas | Message |
|---|---|
| Image absente ou illisible depuis le stockage | « Aucune image n'a pu être lue pour cette ordonnance. » |
| Format non pris en charge | « Format non pris en charge (application/pdf). Formats acceptés : JPEG, PNG, GIF, WEBP. » |
| Panne réseau, quota, clé révoquée | le motif réel du fournisseur + « L'ordonnance doit être saisie manuellement. » |
| Le modèle refuse l'image | « Le modèle a refusé de traiter cette image (…). » |
| Réponse sans lecture exploitable | « Le modèle n'a renvoyé aucune lecture exploitable. » |

La clé d'API n'apparaît dans aucun de ces messages.

---

## Ce qui reste à trancher avant une utilisation réelle

1. **Hébergement des images.** Le stockage livré écrit dans un dossier local :
   c'est du développement. Un hébergement agréé HDS est nécessaire.
2. **Durée de conservation de l'image** après extraction. Pharma.ai ne
   supprime rien de lui-même — ce serait décider à la place de l'officine —
   mais le port de stockage expose `delete()`.
3. **Information du patient**, à intégrer aux mentions déjà en place.

Ces trois points ne sont pas des détails d'implémentation : ce sont les
conditions de licéité du traitement.

---

## Vérification

La chaîne complète est testée hors ligne — 30 tests, aucun appel réseau : le
transport (image transmise, schéma strict imposé, pannes rattrapées), la
validation (chaque motif de rejet), et le garde-fou d'autorisation.

**Ce qui n'a pas pu être vérifié ici :** aucune ordonnance réellement
photographiée n'a été soumise à un modèle de vision depuis cet environnement —
il n'a ni clé ni accès réseau vers l'API. La validation demandée par le plan de
développement (« dix ordonnances réelles photographiées : tout champ inventé
est un échec, un champ vide signalé est un succès ») reste donc à faire par
l'officine, avec de vraies images.
