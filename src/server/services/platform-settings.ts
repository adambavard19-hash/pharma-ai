import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { DEFAULT_REMINDER_POLICY, REMINDER_SETTING_KEY, sanitizePolicy, type ReminderPolicy } from "@/core/contracts/reminders";

/** La cadence des relances : celle de la console, sinon la règle par défaut. */
export async function loadReminderPolicy(): Promise<ReminderPolicy> {
  const row = await prisma.platformSetting.findUnique({ where: { key: REMINDER_SETTING_KEY } });
  return row ? sanitizePolicy(row.value) : DEFAULT_REMINDER_POLICY;
}

export async function saveReminderPolicy(input: unknown, adminId: string): Promise<ReminderPolicy> {
  const policy = sanitizePolicy(input);
  await prisma.platformSetting.upsert({ where: { key: REMINDER_SETTING_KEY }, update: { value: policy, updatedBy: adminId }, create: { key: REMINDER_SETTING_KEY, value: policy, updatedBy: adminId } });
  await recordAudit({ action: "platform.setting_updated", entityType: "PlatformSetting", entityId: REMINDER_SETTING_KEY, platformAdminId: adminId, metadata: policy });
  return policy;
}
