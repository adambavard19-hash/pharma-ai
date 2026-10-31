import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db/client";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { NUDGE_MAX_ITEMS, NUDGE_SETTING_KEY, PROFILE_LABEL, TRIGGER_LABEL, formatSeconds, readNudgeStore, type NudgeItem, type NudgeProfile, type NudgeStore, type NudgeTrigger } from "@/core/site/site-nudge";
import type { VisitorPlace } from "@/server/services/site-visitors";
import { DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";

/**
 * La bulle du site, côté serveur (core/site/site-nudge.ts) : les compteurs et les réponses sont gardés dans un réglage de la
 * plateforme, relu et réécrit dans une transaction à chaque geste (un geste par visiteur et par bulle : rien de fréquent).
 */
async function update(change: (store: NudgeStore) => NudgeStore): Promise<NudgeStore> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.platformSetting.findUnique({ where: { key: NUDGE_SETTING_KEY }, select: { value: true } });
    const next = change(readNudgeStore(row?.value));
    next.items = next.items.slice(-NUDGE_MAX_ITEMS);
    const value = next as unknown as object;
    await tx.platformSetting.upsert({ where: { key: NUDGE_SETTING_KEY }, update: { value }, create: { key: NUDGE_SETTING_KEY, value } });
    return next;
  });
}

export async function loadNudgeStore(): Promise<NudgeStore> {
  const row = await prisma.platformSetting.findUnique({ where: { key: NUDGE_SETTING_KEY }, select: { value: true } });
  return readNudgeStore(row?.value);
}

/** La bulle s'est ouverte, ou a été fermée sans réponse. */
export async function countNudge(kind: "shown" | "closed"): Promise<void> {
  await update((store) => ({ ...store, [kind]: store[kind] + 1 }));
}

/** Le profil choisi d'un clic : une réponse est créée, la suite (facultative) viendra la compléter. */
export async function recordNudgeChoice(input: { profile: NudgeProfile; trigger: NudgeTrigger; seconds: number; pages: string[] }, place: VisitorPlace): Promise<string> {
  const id = randomBytes(12).toString("hex");
  const item: NudgeItem = { id, at: new Date().toISOString(), ...input, city: place.city, region: place.region, country: place.country, interest: "", message: "", name: "", email: "", phone: "", status: "PROFIL" };
  await update((store) => ({ ...store, items: [...store.items, item] }));
  return id;
}

/** La suite : ce qui l'intéresse et ses coordonnées. L'équipe est prévenue (cloche de la console et e-mail). */
export async function recordNudgeDetails(input: { id: string; interest: string; message: string; name: string; email: string; phone: string }): Promise<boolean> {
  let saved: NudgeItem | null = null;
  await update((store) => ({
    ...store,
    items: store.items.map((item) => {
      if (item.id !== input.id || item.status === "CONTACT") return item;
      const status = input.email || input.phone ? "CONTACT" : input.interest || input.message ? "REPONSE" : item.status;
      saved = { ...item, interest: input.interest, message: input.message, name: input.name, email: input.email, phone: input.phone, status };
      return saved;
    }),
  }));
  const item = saved as NudgeItem | null;
  if (!item) return false;
  const lines = [
    item.name || item.email || item.phone ? [item.name, item.email, item.phone].filter(Boolean).join(" · ") : "Sans coordonnées",
    item.interest ? `Intéressé par : ${item.interest}` : "",
    item.message ? `Message : « ${item.message} »` : "",
    `${formatSeconds(item.seconds)} sur le site · ${TRIGGER_LABEL[item.trigger]}${item.city ? ` · ${item.city}` : ""}`,
    item.pages.length ? `Pages vues : ${item.pages.join(", ")}` : "",
  ].filter(Boolean);
  const title = `Site internet — ${PROFILE_LABEL[item.profile]}${item.name ? ` : ${item.name}` : ""}`;
  const body = lines.join("\n");
  // L'adresse de contact de la société reçoit l'e-mail, comme pour les formulaires du site ; puis chaque administrateur.
  const [{ getMessagingProvider }, { publicUrl }, { buildTeamNotificationEmail }, company] = await Promise.all([
    import("@/server/ai/registry"),
    import("@/server/public-url"),
    import("@/core/platform/site-emails"),
    prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } }),
  ]);
  const contactEmail = company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL;
  const email = buildTeamNotificationEmail({ title, body, url: publicUrl("/admin/site-internet") });
  await getMessagingProvider().sendEmail({ to: contactEmail, fromName: "PharmaBoost", subject: email.subject, text: email.text, html: email.html }).catch(() => undefined);
  await notifyAdmins({ type: "SITE_INTERACTION", title, body, linkUrl: "/admin/site-internet", severity: "INFO", email, alreadySentTo: [contactEmail] });
  return true;
}
