"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { modifyRobotProposal, refuseRobotProposal, validateRobotProposal } from "@/server/services/robot-proposals";
import { fail, ok, type ActionResult } from "./types";

/** « Suggestions du robot » : la pharmacienne de PharmaBoost valide une proposition pour toutes les pharmacies, ou la refuse pour toujours. */

const idSchema = z.object({ id: z.string().min(1).max(64) });

export async function validateRobotProposalAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Proposition invalide.");
  const result = await validateRobotProposal({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.label} » est validé pour toutes les pharmacies. ${result.summary}`);
}

export async function refuseRobotProposalAction(payload: z.input<typeof idSchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return fail("Proposition invalide.");
  const result = await refuseRobotProposal({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id);
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.label} » est refusé : le robot ne le proposera plus pour ce médicament.`);
}

const modifySchema = z.object({
  id: z.string().min(1).max(64),
  product: z.object({ ean: z.string().min(7).max(20), name: z.string().min(1).max(200) }),
  sentence: z.string().max(280).nullable(),
});

/** « Modifier » : la base du robot, avec un autre produit conseil, validée pour toutes les pharmacies. */
export async function modifyRobotProposalAction(payload: z.input<typeof modifySchema>): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  const parsed = modifySchema.safeParse(payload);
  if (!parsed.success) return fail("Choisissez le produit à proposer.");
  const result = await modifyRobotProposal({ id: session.admin.id, fullName: session.admin.fullName }, parsed.data.id, { product: parsed.data.product, sentence: parsed.data.sentence });
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/conseils");
  return ok(null, `« ${result.label} » est validé pour toutes les pharmacies. Le produit du robot ne sera plus proposé pour ce médicament.`);
}
