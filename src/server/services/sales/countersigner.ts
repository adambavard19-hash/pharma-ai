import "server-only";
import { prisma } from "@/server/db/client";
import { getEnv } from "@/config/env";
import { recordAudit } from "@/server/audit/log";
import { COUNTERSIGNER_SETTING_KEY, isValidSignerEmail, resolveCountersigner, type Countersigner } from "@/core/contracts/countersignature";

/**
 * Le signataire PharmaBoost des contrats (contresignature) : le réglage de la
 * console, sinon PHARMABOOST_COUNTERSIGNER_EMAIL, sinon contact@pharmaboost.app.
 * Il ne vaut que pour les contrats à venir : un contrat déjà envoyé garde son signataire.
 */
export async function loadCountersigner(): Promise<Countersigner> {
  const [row, company] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: COUNTERSIGNER_SETTING_KEY } }),
    prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeName: true } }),
  ]);
  return resolveCountersigner(row?.value ?? null, getEnv().PHARMABOOST_COUNTERSIGNER_EMAIL ?? null, company?.representativeName ?? null);
}

export async function saveCountersigner(input: { name?: string | null; email: string }, adminId: string): Promise<{ ok: true; countersigner: Countersigner } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isValidSignerEmail(email)) return { ok: false, error: "Adresse e-mail invalide." };
  const name = input.name?.trim().slice(0, 120) || null;
  const value = { email, ...(name ? { name } : {}) };
  await prisma.platformSetting.upsert({ where: { key: COUNTERSIGNER_SETTING_KEY }, update: { value, updatedBy: adminId }, create: { key: COUNTERSIGNER_SETTING_KEY, value, updatedBy: adminId } });
  await recordAudit({ action: "platform.setting_updated", entityType: "PlatformSetting", entityId: COUNTERSIGNER_SETTING_KEY, platformAdminId: adminId, metadata: value });
  return { ok: true, countersigner: await loadCountersigner() };
}
