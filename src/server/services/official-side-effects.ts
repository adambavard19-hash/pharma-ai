import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Les effets indésirables fréquents lus dans les RCP officiels (table `drug_official_side_effects`, remplie par
 * `npm run effets:sync`). Donnée publique de la BDPM, commune à toutes les pharmacies : lue par CIS, sans officine.
 *
 * Seules les spécialités dont le RCP a donné au moins un effet de la liste fermée sont rendues — une ligne « rien
 * trouvé » ne doit jamais effacer les effets du modèle (voir `applyOfficialSideEffects`).
 *
 * Une lecture impossible (table absente parce que la migration n'est pas encore passée, base indisponible) ne casse
 * jamais la classification : on rend une table vide, et le comptoir se comporte exactement comme avant.
 */
export async function loadOfficialSideEffects(cisCodes: readonly (string | null | undefined)[]): Promise<Map<string, { effects: string[]; fetchedAt: Date; sourceUrl: string }>> {
  const wanted = [...new Set(cisCodes.filter((code): code is string => Boolean(code)))];
  if (wanted.length === 0) return new Map();
  try {
    const rows = await prisma.drugOfficialSideEffects.findMany({
      where: { cisCode: { in: wanted }, status: "READ", NOT: { effects: { isEmpty: true } } },
      select: { cisCode: true, effects: true, fetchedAt: true, sourceUrl: true },
    });
    return new Map(rows.map((row) => [row.cisCode, { effects: row.effects, fetchedAt: row.fetchedAt, sourceUrl: row.sourceUrl }]));
  } catch (error) {
    console.error(`[effets-officiels] lecture impossible, effets du modèle conservés : ${error instanceof Error ? error.message : String(error)}`);
    return new Map();
  }
}

/** Pour la fiche médicament : la lecture complète d'un CIS (effets et fréquences), ou `null` si rien d'utilisable. */
export async function loadOfficialSideEffectsSheet(cisCode: string): Promise<{ rows: { label: string; frequency: "VERY_COMMON" | "COMMON" }[]; fetchedAt: Date; sourceUrl: string } | null> {
  try {
    const row = await prisma.drugOfficialSideEffects.findUnique({ where: { cisCode }, select: { status: true, details: true, fetchedAt: true, sourceUrl: true } });
    if (!row || row.status !== "READ" || !Array.isArray(row.details)) return null;
    const rows = (row.details as { label?: unknown; frequency?: unknown }[]).flatMap((detail) =>
      typeof detail.label === "string" && (detail.frequency === "VERY_COMMON" || detail.frequency === "COMMON") ? [{ label: detail.label, frequency: detail.frequency as "VERY_COMMON" | "COMMON" }] : [],
    );
    return rows.length > 0 ? { rows, fetchedAt: row.fetchedAt, sourceUrl: row.sourceUrl } : null;
  } catch (error) {
    console.error(`[effets-officiels] fiche ${cisCode} : ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
