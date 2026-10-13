import "server-only";
import type { Prisma } from "@/generated/prisma";
import { TREE_RULE_KEYS } from "@/core/counter/question-tree";

/**
 * Les conseils qui comptent dans les statistiques (taux de /resultats, console, assistant, objectifs).
 *
 * Un conseil du bout de l'arbre de questions du comptoir (la poche de l'épaule, le thermomètre : `TREE_RULE_KEYS`) est
 * enregistré à l'analyse, hors plafond, mais reste caché tant que le pharmacien n'a pas cliqué la réponse qui le débloque
 * (core/counter/tree-state.ts) : une vente de Doliprane avec des poches en rayon en garde jusqu'à huit, dont aucun n'est vu.
 * Resté PROPOSED ou passé IGNORED à la fin de la vente, il n'a jamais été tranché : il sort du compte, sinon chaque vente
 * d'antalgique ferait entrer des conseils jamais montrés comme « sans réponse » dans le dénominateur du taux. Dès qu'il est
 * tranché (accepté, vendu, refusé…), il a forcément été montré et il compte comme les autres. Un conseil de l'arbre
 * débloqué puis laissé sans réponse sort aussi du compte : la base ne garde pas qui a vu quoi, et l'erreur va dans le
 * sens prudent (ne pas gonfler les « sans réponse »).
 *
 * Écrit en `OR` explicite (sans `NOT` sur la relation) pour qu'un conseil sans opportunité, ou d'une règle sans clé, ne
 * tombe jamais dans un NULL SQL. À poser dans un `AND` pour ne pas écraser un `OR` du `where` qui le reçoit.
 */
export const COUNTED_ADVICE: Prisma.RecommendationWhereInput = {
  OR: [
    { status: { notIn: ["PROPOSED", "IGNORED"] } },
    { opportunityId: null },
    { opportunity: { is: { OR: [{ ruleKey: null }, { ruleKey: { notIn: [...TREE_RULE_KEYS] } }] } } },
  ],
};
