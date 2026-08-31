import "server-only";
import { prisma } from "@/server/db/client";
import { interactionKey } from "@/core/interactions";
import type {
  InteractionCatalogState,
  InteractionClassMember,
  InteractionRule,
} from "@/core/interactions";

/**
 * Lecture du référentiel d'interactions pour une ordonnance donnée.
 *
 * On ne charge JAMAIS le référentiel entier. Une règle n'a d'intérêt que si
 * ses deux côtés sont présents sur l'ordonnance : la requête filtre donc sur
 * les clés réellement en jeu — substances prescrites et classes auxquelles
 * elles appartiennent. Le coût de l'étape ne dépend plus de la taille du
 * référentiel mais du nombre de lignes, ce qui protège le budget du comptoir.
 */

export async function loadInteractionCatalogState(): Promise<InteractionCatalogState> {
  const lastSuccess = await prisma.referenceImport.findFirst({
    where: { source: "INTERACTIONS", status: "SUCCEEDED", isDryRun: false },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, sourceUpdatedAt: true },
  });
  if (!lastSuccess) return { status: "NOT_LOADED" };

  const [rule, ruleCount, classMemberCount] = await Promise.all([
    prisma.drugInteractionRule.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { sourceName: true, sourceVersion: true },
    }),
    prisma.drugInteractionRule.count(),
    prisma.drugInteractionClassMember.count(),
  ]);

  // Un journal d'import réussi mais plus une seule règle en base : le
  // référentiel a été vidé depuis. On ne prétend pas qu'il est chargé.
  if (!rule || ruleCount === 0) return { status: "NOT_LOADED" };

  return {
    status: "LOADED",
    sourceName: rule.sourceName,
    sourceVersion: rule.sourceVersion,
    sourceUpdatedAt: lastSuccess.sourceUpdatedAt?.toISOString() ?? null,
    importedAt: lastSuccess.startedAt.toISOString(),
    ruleCount,
    classMemberCount,
  };
}

/**
 * Les règles et appartenances de classe utiles à CETTE ordonnance.
 *
 * `substanceKeys` sont les substances actives des lignes rattachées au
 * catalogue national. Une ordonnance dont aucune ligne n'est rattachée ne
 * produit aucune requête — et aucune illusion de vérification.
 */
export async function loadInteractionData(substanceKeys: string[]): Promise<{
  rules: InteractionRule[];
  classMembers: InteractionClassMember[];
}> {
  const keys = [...new Set(substanceKeys)].filter(Boolean);
  if (keys.length < 1) return { rules: [], classMembers: [] };

  const members = await prisma.drugInteractionClassMember.findMany({
    where: { substanceKey: { in: keys } },
    select: { classKey: true, classLabel: true, substanceKey: true, isAlias: true },
  });

  // Les deux côtés d'une règle applicable sont forcément dans cet ensemble.
  const searchKeys = [...new Set([...keys, ...members.map((m) => m.classKey)])];

  const rules = await prisma.drugInteractionRule.findMany({
    where: {
      AND: [{ leftKey: { in: searchKeys } }, { rightKey: { in: searchKeys } }],
    },
    select: {
      leftLabel: true,
      rightLabel: true,
      leftKey: true,
      rightKey: true,
      leftKind: true,
      rightKind: true,
      severity: true,
      risk: true,
      guidance: true,
      sourceName: true,
      sourceVersion: true,
    },
  });

  return { rules, classMembers: members };
}

/** Clé d'appariement d'un libellé de substance. Exposée pour les appelants. */
export function substanceKey(label: string): string {
  return interactionKey(label);
}
