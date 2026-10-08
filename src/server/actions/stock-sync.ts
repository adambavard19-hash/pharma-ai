"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { revokeCounterPost } from "@/server/services/stock-sync";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import type { ConnectionOverview } from "@/core/stock/connection-overview";
import { ok, type ActionResult } from "./types";

/**
 * Ce que le PHARMACIEN fait de la connexion de son officine : retirer un comptoir (un ordinateur volé ou remplacé
 * ne doit plus pouvoir utiliser PharmaBoost) et relire l'état de la liste des comptoirs. Réservé au titulaire (import
 * de stock) ; l'officine est celle de la session.
 *
 * Tout le reste du technique — dossiers d'export, intervalle, serveur, codes d'installation, test de connexion, robot —
 * est dans l'espace d'assistance de la console (`admin-connection.ts`, `admin-install.ts`) : un pharmacien n'a pas
 * à y toucher, et les gestes qui y mènent n'existent plus de son côté.
 */

export async function revokePostAction(payload: { postId: string }): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  await revokeCounterPost(session.scope, payload.postId);
  revalidatePath("/connexion");
  return ok(null, "Comptoir retiré : cet ordinateur ne peut plus utiliser PharmaBoost.");
}

/** Un état sans date ni objet : ce que la page relit toutes les dix secondes. Aucune clé, aucun code. */
export type Serialized<T> = T extends Date ? string : T extends (infer U)[] ? Serialized<U>[] : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export type OverviewSnapshot = { overview: Serialized<ConnectionOverview>; lgo: string | null };

export async function getConnectionOverviewAction(): Promise<ActionResult<OverviewSnapshot>> {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const loaded = await loadConnectionOverview(session.scope.pharmacyId);
  return ok({ overview: JSON.parse(JSON.stringify(loaded.overview)) as Serialized<ConnectionOverview>, lgo: loaded.lgo });
}
