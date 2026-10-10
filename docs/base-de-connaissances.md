# La base de connaissances (console super admin)

**Où :** console super admin → Gestion → Conseils → **Base de connaissances** (`/admin/connaissances`).

## À quoi ça sert

La pharmacienne de PharmaBoost (Donna) y dépose ses documents (PDF avec texte, Excel, CSV, texte) ou écrit une note. Plus elle y
met d'informations, plus le logiciel a de conseils et d'associations à proposer — **à condition qu'elle les accepte**.

## Le chemin, du dépôt au conseil en ligne

1. **Dépôt.** Seul le TEXTE est gardé (jamais le fichier d'origine). Aucune donnée de patient. Limites : 8 Mo, 150 000 caractères
   (au-delà, seul le début est lu et la console le dit).
2. **Lecture par le modèle d'Anthropic** (`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, modèle `AI_MODEL`). Le document est envoyé
   à Anthropic, rien d'autre. Le modèle PROPOSE des conseils (tolérance ou confort) et des associations ; chaque proposition porte la
   **phrase exacte du document** qui la justifie. Consigne stricte : aucune connaissance médicale ajoutée, jamais de
   contre-indication / interaction / posologie (elles restent dans le code), en cas de doute rien.
3. **Vérification par le logiciel, sans le modèle** (`core/knowledge/extraction.ts`) : la citation existe-t-elle dans le document
   (comparaison mot à mot, accents et casse mis de côté) ? les noms cités y sont-ils écrits ? un conseil respecte-t-il les mêmes règles
   qu'un conseil ajouté à la main (vocabulaire fermé, `{product}`, jamais « sécurité ») ? Ce qui ne passe pas est écarté et compté.
4. **Résolution des produits** d'une association dans les stocks des pharmacies : un seul résultat sûr, sinon la pharmacienne choisit.
5. **Décision de la pharmacienne** : *Accepter* crée un conseil ou une association du centre de contrôle des conseils — en ligne dans
   **toutes** les pharmacies à la vente suivante, « à relire » jusqu'à sa validation. *Refuser* ne crée rien. **Rien n'est jamais mis en
   ligne sans ce clic.** Une relecture ne recrée pas ce qui est déjà tranché.

## Ce que le logiciel lit pour conseiller (affiché dans la page)

Modèle d'Anthropic (classe les médicaments d'une vente ; lit les documents), base publique des médicaments (BDPM / ANSM), stock de
chaque pharmacie, règles et associations du centre de contrôle, documents déposés (après acceptation). **Vidal n'est pas branché** :
base sous licence payante, accès à souscrire ; rien n'est lu dedans.

## Challenges et dates courtes dans le choix des conseils

Entre deux références **cliniquement équivalentes** pour un même besoin (même sécurité, mêmes précautions, écart de pertinence
négligeable), le moteur départage dans cet ordre : formule préférée par la règle, préférence de l'officine, gamme privilégiée,
**date courte** (si la boîte tient au moins 14 jours), **challenge laboratoire en cours**, disponibilité, historique, marge.
Une date courte ou un challenge ne fait **jamais** passer une référence moins sûre, en rupture ou plus signalée devant une autre
(`engines/tiebreak.ts`, `securite-avant-preference.test.ts`). Le titulaire les gère dans son espace : Paramètres → Laboratoires →
Challenges (produits ou marque, dates, laboratoire) ; les dates courtes viennent des lots de son stock.

## Ce que disent les comptoirs (indication, jamais une décision)

Dans « Conseils & associations », chaque règle montre combien de fois elle a été proposée, retenue, achetée, dans combien de
pharmacies (réelles, hors démonstration). « Bien accueilli » / « Peu retenu » n'apparaît qu'avec 30 conseils tranchés dans au moins 3
pharmacies. Rien ne change tout seul dans le moteur : la pharmacienne décide avec ces chiffres sous les yeux
(`core/ai/rule-feedback.ts`).

## Où c'est branché

Tables `knowledge_documents` et `knowledge_proposals` (migration `20261021090000_base_de_connaissances`, additive) ;
`server/ai/knowledge-extractor.ts` (appel Anthropic, injectable pour les tests) ; `server/services/knowledge.ts`,
`knowledge-files.ts` ; `server/actions/admin-knowledge.ts` (barrière `requirePlatformSession`, vérifiée par
`admin-actions-session.test.ts`) ; audit `knowledge.*`.

## Produits à connaître (console super admin → Gestion → Conseils → « Produits à connaître »)

**Le principe :** PharmaBoost doit connaître tout le stock d'une nouvelle pharmacie sans l'aide de personne. Ce qu'il ne sait pas ranger
arrive dans cette liste, visible **seulement** de la console (le titulaire n'en voit rien) ; la pharmacienne répond une fois, la réponse
vaut pour **toutes** les pharmacies, présentes et à venir, et le sujet ne revient plus.

**Quand le stock est lu** (`server/services/stock-learning.ts`) : dès qu'un stock est enregistré (import, logiciel de gestion, dépôt) —
en arrière-plan, après la réponse —, puis **chaque jour** pour ce qui reste. Notre hébergement (Vercel « Hobby ») n'autorise que
**deux** tâches planifiées, une fois par jour : la connaissance du stock n'a donc pas la sienne, elle passe **en dernier** dans la
tâche quotidienne existante (`/api/cron/automatisations`, après les relances, avec 230 s). Un passage est borné dans le temps (on ne
commence pas un lot qu'on ne peut pas finir) ; s'il reste du travail, il **relance un autre passage** (`/api/cron/connaissance-du-stock`,
avec son propre temps, dix relais au plus, `?pharmacie=` pour une seule pharmacie) : un gros stock est lu en quelques minutes, pas en
plusieurs jours. Au pire, la tâche quotidienne reprend le lendemain. `core`: `src/app/api/cron/__tests__/hebergement.test.ts` garde
la règle (2 tâches au plus, une fois par jour).
 1. **Produits** (crèmes, compléments, plantes…) : dictionnaire d'abord, puis modèle d'Anthropic, mémoire commune par nom.
 2. **Médicaments en stock** : substance, famille, code ATC, classés par le modèle (avec les substances officielles de la base publique)
    et mémorisés. Au scan, tout est déjà compris : l'analyse est locale.
 3. Le même carnet se remplit au scan quand un médicament n'a pas de famille.

**Ce qui est signalé :** un produit que le modèle a lu sans savoir le ranger, ou dont il doute (confiance < 60 %) ; un médicament sans
famille (ni ATC ni classe) ou dont le modèle doute. Jamais : un échec du modèle (réseau) ou un lot pas encore traité — ce n'est pas un
trou, le passage suivant reprend.

**La réponse** : produit → catégorie + étiquettes du vocabulaire fermé des règles (« Pas un produit de conseil » = Autres, sans
étiquette) ; médicament → substance, code ATC (ou début : J01) et/ou famille. Écrite dans `product_classifications` /
`drug_classifications` (source « PHARMACIST », confiance 100 %, médicament « confirmé »), **avant** le dictionnaire et le modèle,
et appliquée aussitôt aux produits déjà en stock de toutes les pharmacies. « Je ne sais pas » écarte le sujet sans rien apprendre.

**L'alerte :** une pastille sur l'onglet « Conseils » de la console donne le nombre de sujets ouverts.

Tables : `knowledge_gaps` (migration `20261022090000_produits_a_connaitre`). Audit : `knowledge.gap_answered | gap_dismissed`.
