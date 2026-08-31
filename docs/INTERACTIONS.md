# Interactions médicamenteuses

## Ce que Pharma.ai fait, et ce qu'il ne fait pas

Pharma.ai **ne produit aucune interaction médicamenteuse**. Il ne dispose
d'aucune connaissance propre sur le sujet, n'en déduit aucune, et n'en
extrapole aucune d'une substance vers une autre.

Il sait faire trois choses :

1. **Charger** un référentiel d'interactions fourni par l'officine, en le
   refusant entièrement à la première anomalie de format.
2. **Croiser** les médicaments confirmés d'une ordonnance avec ce référentiel,
   à partir de leur composition réelle issue du catalogue national (BDPM).
3. **Dire ce qu'il a couvert** — et surtout ce qu'il n'a pas pu couvrir.

Tant qu'aucun référentiel n'est chargé, l'écran affiche :

> Les interactions entre médicaments prescrits ne sont pas analysées.

C'est délibéré. Un écran sans alerte se lit « rien à signaler » ; laisser
croire cela serait le mensonge le plus dangereux que ce produit puisse faire.

### Ce qui fonctionne sans aucun référentiel

Une seule chose, mais elle est réelle : la **redondance de substance active**.
Quand deux lignes de l'ordonnance apportent la même substance — un Doliprane et
un Dafalgan codéiné, par exemple — Pharma.ai le signale, à partir de la
composition officielle du catalogue national. Ce n'est pas une interaction,
c'est un risque de double dose, et l'écran le nomme ainsi.

---

## Pourquoi l'officine doit fournir le fichier

Il n'existe pas, à ce jour, de référentiel français d'interactions publié dans
un format exploitable par une machine.

Le **thésaurus national des interactions médicamenteuses** de l'ANSM est la
référence française. Deux faits doivent être connus avant de s'y fier :

- il est publié **en PDF**, pas en données structurées ;
- **l'ANSM a cessé de le mettre à jour.** La dernière version date de
  septembre 2023 ; le document reste consultable sur le site de l'ANSM,
  sans actualisation, jusqu'en juin 2027.

Des extracteurs communautaires existent (par exemple
[`ExtractThesaurusANSM`](https://github.com/scossin/ExtractThesaurusANSM),
GPL-3.0), mais leur auteur signale lui-même que l'extraction échoue à
structurer le niveau de gravité et le mécanisme de certaines interactions, et
qu'une reprise manuelle est nécessaire. Construire une alerte de sécurité sur
une extraction approximative reviendrait à fabriquer de la donnée médicale.

Pharma.ai ne le fera pas. L'officine fournit donc le fichier, depuis la source
de son choix — sa base sous licence, son groupement, ou une extraction du
thésaurus qu'elle a vérifiée — et Pharma.ai cite cette source, avec sa version
et sa date, sur **chaque** alerte affichée.

---

## Format des fichiers

Un dossier contenant deux fichiers obligatoires et deux facultatifs.

### `meta.json` — obligatoire

L'identité du référentiel. Sans elle, aucune alerte ne pourrait dire d'où elle
vient ni de quand elle date : l'import est refusé.

```json
{
  "name": "Thésaurus ANSM",
  "version": "2023-09",
  "updatedAt": "2023-09-15",
  "url": "https://ansm.sante.fr/documents/reference/thesaurus-des-interactions-medicamenteuses-1"
}
```

| Champ | Obligatoire | Rôle |
|---|---|---|
| `name` | oui | Nom affiché sur chaque alerte |
| `version` | oui | Version affichée sur chaque alerte |
| `updatedAt` | oui | Date **de la source**, format `AAAA-MM-JJ` |
| `url` | non | Provenance, journalisée |

### `interactions.tsv` — obligatoire

Séparateur **tabulation**, encodage **UTF-8**, avec une **ligne d'en-tête aux
noms exacts** :

```
type_gauche	libelle_gauche	type_droit	libelle_droit	niveau	risque	conduite_a_tenir
```

| Colonne | Valeurs | Obligatoire |
|---|---|---|
| `type_gauche` / `type_droit` | `substance` ou `classe` | oui |
| `libelle_gauche` / `libelle_droit` | le libellé, tel qu'il doit s'afficher | oui |
| `niveau` | `contre-indication`, `association déconseillée`, `précaution d'emploi`, `à prendre en compte` | oui |
| `risque` | le risque, **mot pour mot depuis la source** | oui |
| `conduite_a_tenir` | la conduite à tenir, mot pour mot | non |

L'en-tête est exigé pour une raison précise : un fichier dont les colonnes ont
été interverties est alors refusé, ce qu'un format purement positionnel ne
saurait pas détecter. Sur des données de sécurité, une colonne décalée est pire
qu'un import qui échoue.

Sont refusés, en citant la ligne : un compte de colonnes différent, un niveau
inconnu, un type inconnu, un libellé manquant, un **risque manquant** (Pharma.ai
n'affiche pas d'alerte dont il ne peut pas dire la raison), un couple dont les
deux côtés sont identiques, un doublon strict.

### `classes.tsv` — facultatif

Les substances de chaque classe citée par le référentiel. Sans ce fichier, les
règles exprimées au niveau d'une classe ne pourront jamais être rapprochées
d'une ordonnance — qui ne contient que des substances.

```
classe	substance
Antiagrégants plaquettaires	Acide acétylsalicylique
Antiagrégants plaquettaires	Clopidogrel
```

### `alias.tsv` — facultatif, mais souvent indispensable

Le catalogue national écrit les substances telles qu'elles sont formulées. Un
thésaurus écrit le nom courant. Les deux ne coïncident presque jamais :

| Catalogue national (BDPM) | Thésaurus |
|---|---|
| `WARFARINE SODIQUE` | warfarine |
| `AMOXICILLINE TRIHYDRATÉE`, `AMOXICILLINE BASE` | amoxicilline |
| `FUMARATE FERREUX` | fumarate de fer |

Sans correspondance déclarée, l'appariement strict échoue en silence : le
référentiel est bien chargé, l'écran est vert, et **aucune alerte ne se
déclenchera jamais**. C'est un faux négatif dans une fonction de sécurité,
c'est-à-dire le pire échec possible ici.

Pharma.ai ne devine pas ces correspondances — décider que deux libellés
désignent la même substance est un acte pharmaceutique. Il fait deux choses à
la place :

1. il retient **les deux graphies officielles** de chaque composant, la
   substance active (SA) et sa fraction thérapeutique (FT), toutes deux
   déclarées par la BDPM ;
2. il **mesure et affiche l'écart** à chaque import.

```
! 2 substance(s) du référentiel ne correspondent à aucun libellé du catalogue national.
  Elles ne déclencheront jamais d'alerte. Déclarez leur équivalent dans alias.tsv.
    · Fumarate de fer
    · Warfarine
```

Le fichier d'alias comble cet écart, et l'écart mesuré retombe à zéro :

```
libelle_referentiel	libelle_catalogue
Warfarine	WARFARINE SODIQUE
Fumarate de fer	FUMARATE FERREUX
```

Un rapprochement passant par un alias n'est **pas** présenté comme un
raisonnement par classe : c'est la même substance, écrite autrement.

---

## Charger le référentiel

```bash
# Vérifier sans rien écrire
npm run interactions:sync -- --from ~/Téléchargements/interactions --dry-run

# Charger
npm run interactions:sync -- --from ~/Téléchargements/interactions
```

Le remplacement se fait dans une transaction unique : si elle échoue, le
référentiel précédent est toujours en place. Une synchronisation ratée ne
laisse jamais l'officine sans référentiel. Un fichier vide est refusé, pour la
même raison.

Un jeu d'essai est fourni dans `docs/exemples/interactions-jeu-essai/`. Il est
**fictif** et porte ce mot dans son nom : chargé, il apparaît tel quel sur
chaque alerte. Il sert à vérifier la chaîne, jamais à conseiller un patient.

---

## Comment les alertes se comportent au comptoir

| Niveau du référentiel | Niveau Pharma.ai | Effet |
|---|---|---|
| Contre-indication | BLOQUANT | Rouge, non repliable, ferme la zone conseils tant qu'un pharmacien n'a pas acquitté |
| Association déconseillée | BLOQUANT | Idem |
| Précaution d'emploi | VIGILANCE | Visible, n'arrête pas le comptoir |
| À prendre en compte | INFORMATION | Dans le détail des signaux |

Un acquittement n'autorise pas la vente : il atteste que le pharmacien a lu.
La décision de délivrer reste professionnelle, et elle est horodatée et signée.

Aucune alerte de sécurité n'est jamais présentée dans la même carte qu'une
proposition commerciale.

---

## La limite qui reste

Une ligne d'ordonnance non rattachée au catalogue national n'a pas de
composition connue : **aucune interaction ne peut être recherchée pour elle**.
L'écran ne dit alors pas « aucune interaction », il dit combien de lignes ont
pu être vérifiées et combien ne l'ont pas été.

C'est la garantie la plus importante de ce lot.
