import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import type { MessagingProvider } from "@/core/ai/ports";
import { publicUrl } from "@/server/public-url";
import { traceDispatch } from "@/server/services/email-dispatch";
import { createNotification } from "@/server/services/notifications";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";
import { buildSupportAlertEmail, buildSupportReplyEmail } from "@/core/support/emails";
import { SUPPORT_TOPIC_LABELS, deriveSubject, excerpt, shouldAlertSupport, SUPPORT_SUBJECT_MAX, type SupportAuthorCode, type SupportTopicCode } from "@/core/support/rules";

/**
 * Contact support : les discussions entre une officine et l'équipe PharmaBoost.
 *
 * Deux côtés d'une même table. L'officine (toute son équipe) ouvre une discussion et y écrit ; la console la lit, y répond,
 * la ferme. À chaque message de l'officine, l'équipe est prévenue (cloche de la console + e-mail, jamais plus d'un toutes
 * les dix minutes pour une même discussion) ; à chaque réponse, l'officine l'est (cloche + e-mail à celui qui a écrit).
 * Une panne d'envoi ne perd JAMAIS un message : il est enregistré d'abord, l'alerte vient ensuite et ne lève pas.
 */

type Deps = { messaging?: MessagingProvider; now?: Date };

type PharmacyAuthor = { userId: string; name: string };

/** Ce que l'officine voit d'une discussion, sans les messages. */
export async function listPharmacyThreads(pharmacyId: string) {
  const threads = await prisma.supportThread.findMany({
    where: { pharmacyId },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: { id: true, subject: true, topic: true, status: true, lastMessageFrom: true, lastMessageAt: true, unreadForPharmacy: true, createdAt: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorName: true } } },
  });
  return threads.map((thread) => ({
    id: thread.id,
    subject: thread.subject,
    topic: thread.topic as SupportTopicCode,
    status: thread.status,
    lastMessageFrom: thread.lastMessageFrom as SupportAuthorCode,
    lastMessageAt: thread.lastMessageAt,
    unread: thread.unreadForPharmacy,
    preview: excerpt(thread.messages[0]?.body ?? "", 140),
    previewAuthor: thread.messages[0]?.authorName ?? "",
  }));
}

/** Une discussion de CETTE officine, avec tous ses messages. Une autre officine n'y a jamais accès (portée = l'officine). */
export async function getPharmacyThread(pharmacyId: string, threadId: string) {
  return prisma.supportThread.findFirst({
    where: { id: threadId, pharmacyId },
    select: { id: true, subject: true, topic: true, status: true, lastMessageFrom: true, unreadForPharmacy: true, createdAt: true, closedAt: true, messages: { orderBy: { createdAt: "asc" }, select: { id: true, author: true, authorName: true, body: true, createdAt: true } } },
  });
}

/** Les réponses de l'équipe que personne n'a lues : le chiffre du menu « Contact support ». */
export async function countPharmacyUnread(pharmacyId: string): Promise<number> {
  return prisma.supportThread.count({ where: { pharmacyId, unreadForPharmacy: true } });
}

/** L'officine a lu : le point disparaît, et la notification de la cloche avec lui. */
export async function markReadByPharmacy(input: { pharmacyId: string; userId: string; threadId: string }): Promise<void> {
  await prisma.supportThread.updateMany({ where: { id: input.threadId, pharmacyId: input.pharmacyId, unreadForPharmacy: true }, data: { unreadForPharmacy: false } });
  await prisma.notification.updateMany({
    where: { pharmacyId: input.pharmacyId, readAt: null, linkUrl: `/support/${input.threadId}`, OR: [{ userId: null }, { userId: input.userId }] },
    data: { readAt: new Date() },
  });
}

/** L'officine ferme (« c'est réglé ») ou rouvre une de ses discussions. */
export async function setThreadClosedByPharmacy(input: { pharmacyId: string; threadId: string; closed: boolean }): Promise<boolean> {
  const { count } = await prisma.supportThread.updateMany({
    where: { id: input.threadId, pharmacyId: input.pharmacyId },
    data: { status: input.closed ? "CLOSED" : "OPEN", closedAt: input.closed ? new Date() : null },
  });
  return count > 0;
}

type OpenThreadInput = {
  pharmacy: { id: string; name: string; city: string | null; isDemo: boolean };
  author: PharmacyAuthor;
  topic: SupportTopicCode;
  subject: string | null;
  body: string;
};

/** L'officine ouvre une discussion : son premier message en fait partie, et l'équipe est prévenue. */
export async function openSupportThread(input: OpenThreadInput, deps: Deps = {}): Promise<{ threadId: string }> {
  const now = deps.now ?? new Date();
  const subject = (input.subject?.trim() || deriveSubject(input.body)).slice(0, SUPPORT_SUBJECT_MAX);
  const thread = await prisma.supportThread.create({
    data: {
      pharmacyId: input.pharmacy.id,
      createdByUserId: input.author.userId,
      subject,
      topic: input.topic,
      lastMessageFrom: "PHARMACY",
      lastMessageAt: now,
      unreadForSupport: true,
      isDemo: input.pharmacy.isDemo,
      messages: { create: { author: "PHARMACY", authorUserId: input.author.userId, authorName: input.author.name, body: input.body, createdAt: now } },
    },
    select: { id: true, supportAlertedAt: true },
  });
  await alertSupport({ threadId: thread.id, pharmacy: input.pharmacy, authorName: input.author.name, subject, topic: input.topic, body: input.body, isNewThread: true, previousFrom: null, supportAlertedAt: null }, { ...deps, now });
  return { threadId: thread.id };
}

/** L'officine écrit dans une discussion qui existe : si elle était fermée, elle se rouvre. Rend `null` si elle n'est pas à cette officine. */
export async function replyFromPharmacy(input: { pharmacy: { id: string; name: string; city: string | null }; threadId: string; author: PharmacyAuthor; body: string }, deps: Deps = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = deps.now ?? new Date();
  const thread = await prisma.supportThread.findFirst({ where: { id: input.threadId, pharmacyId: input.pharmacy.id }, select: { id: true, subject: true, topic: true, lastMessageFrom: true, supportAlertedAt: true } });
  if (!thread) return { ok: false, error: "Discussion introuvable." };

  await prisma.$transaction([
    prisma.supportMessage.create({ data: { threadId: thread.id, author: "PHARMACY", authorUserId: input.author.userId, authorName: input.author.name, body: input.body, createdAt: now } }),
    prisma.supportThread.update({ where: { id: thread.id }, data: { status: "OPEN", closedAt: null, lastMessageFrom: "PHARMACY", lastMessageAt: now, unreadForSupport: true, unreadForPharmacy: false } }),
  ]);
  await alertSupport({ threadId: thread.id, pharmacy: input.pharmacy, authorName: input.author.name, subject: thread.subject, topic: thread.topic as SupportTopicCode, body: input.body, isNewThread: false, previousFrom: thread.lastMessageFrom as SupportAuthorCode, supportAlertedAt: thread.supportAlertedAt }, { ...deps, now });
  return { ok: true };
}

/**
 * Prévient l'équipe : la cloche de la console, puis l'e-mail à l'adresse de la société (celle des demandes du site). Ne lève
 * jamais : le message est déjà enregistré, une panne d'alerte ne doit pas le faire perdre — elle se voit dans l'historique des envois.
 */
async function alertSupport(input: { threadId: string; pharmacy: { id: string; name: string; city: string | null }; authorName: string; subject: string; topic: SupportTopicCode; body: string; isNewThread: boolean; previousFrom: SupportAuthorCode | null; supportAlertedAt: Date | null }, deps: Required<Pick<Deps, "now">> & Deps): Promise<void> {
  if (!shouldAlertSupport({ isNewThread: input.isNewThread, previousMessageFrom: input.previousFrom, supportAlertedAt: input.supportAlertedAt, now: deps.now })) return;
  try {
    const adminPath = `/admin/support/${input.threadId}`;
    const lead = input.isNewThread ? "vous a posé une question" : input.previousFrom === "SUPPORT" ? "vous a répondu" : "a ajouté un message";
    await notifyAdmins({ type: "SUPPORT_MESSAGE", title: `${input.pharmacy.name} ${lead}`, body: `${input.subject} — ${excerpt(input.body, 140)}`, linkUrl: adminPath, severity: "INFO" });

    const company = await prisma.companyProfile.findUnique({ where: { id: "default" }, select: { representativeEmail: true } });
    const to = company?.representativeEmail || DEFAULT_CONTACT_EMAIL;
    const mail = buildSupportAlertEmail({
      pharmacyName: input.pharmacy.name,
      city: input.pharmacy.city,
      authorName: input.authorName,
      subject: input.subject,
      topicLabel: SUPPORT_TOPIC_LABELS[input.topic],
      excerpt: excerpt(input.body, 600),
      isNewThread: input.isNewThread,
      isReply: input.previousFrom === "SUPPORT",
      adminUrl: publicUrl(adminPath),
    });
    const messaging = deps.messaging ?? getMessagingProvider();
    const outcome = await messaging.sendEmail({ to, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html });
    await traceDispatch({ kind: "SUPPORT_ALERT", recipient: to, outcome, subject: mail.subject, trigger: "SYSTEM", pharmacyId: input.pharmacy.id });
    await prisma.supportThread.update({ where: { id: input.threadId }, data: { supportAlertedAt: deps.now } });
  } catch (error) {
    console.error("[support] alerte à l'équipe impossible", input.threadId, error);
  }
}

// ----------------------------------------------------------------- Console

export type InboxFilter = "a-repondre" | "en-attente" | "fermees" | "toutes";
export const INBOX_FILTERS: InboxFilter[] = ["a-repondre", "en-attente", "fermees", "toutes"];
const INBOX_PAGE_SIZE = 25;

function inboxWhere(filter: InboxFilter, q: string | null) {
  const state = filter === "a-repondre" ? { status: "OPEN" as const, lastMessageFrom: "PHARMACY" as const } : filter === "en-attente" ? { status: "OPEN" as const, lastMessageFrom: "SUPPORT" as const } : filter === "fermees" ? { status: "CLOSED" as const } : {};
  const search = q ? { OR: [{ subject: { contains: q, mode: "insensitive" as const } }, { pharmacy: { name: { contains: q, mode: "insensitive" as const } } }, { pharmacy: { city: { contains: q, mode: "insensitive" as const } } }] } : {};
  return { ...state, ...search };
}

/** La boîte de réception de la console : les discussions de toutes les officines, avec les chiffres de chaque onglet. */
export async function listSupportInbox(input: { filter: InboxFilter; q: string | null; page: number }) {
  const where = inboxWhere(input.filter, input.q);
  const [total, toAnswer, waiting, closed, all, rows] = await Promise.all([
    prisma.supportThread.count({ where }),
    prisma.supportThread.count({ where: inboxWhere("a-repondre", input.q) }),
    prisma.supportThread.count({ where: inboxWhere("en-attente", input.q) }),
    prisma.supportThread.count({ where: inboxWhere("fermees", input.q) }),
    prisma.supportThread.count({ where: inboxWhere("toutes", input.q) }),
    prisma.supportThread.findMany({
      where,
      // Ce qui attend l'équipe d'abord, le plus ancien en tête (c'est lui qui attend depuis le plus longtemps) ; le reste par date.
      orderBy: input.filter === "a-repondre" ? { lastMessageAt: "asc" } : { lastMessageAt: "desc" },
      skip: (input.page - 1) * INBOX_PAGE_SIZE,
      take: INBOX_PAGE_SIZE,
      select: { id: true, subject: true, topic: true, status: true, lastMessageFrom: true, lastMessageAt: true, unreadForSupport: true, createdAt: true, pharmacy: { select: { id: true, name: true, city: true, isActive: true, isDemo: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorName: true } }, _count: { select: { messages: true } } },
    }),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)), counts: { "a-repondre": toAnswer, "en-attente": waiting, fermees: closed, toutes: all } };
}

/** Les discussions d'UNE officine, pour sa fiche dans la console : les plus récentes d'abord, avec le dernier message. */
export async function listSupportThreadsForPharmacy(pharmacyId: string, limit = 8) {
  const [total, rows] = await Promise.all([
    prisma.supportThread.count({ where: { pharmacyId } }),
    prisma.supportThread.findMany({
      where: { pharmacyId },
      orderBy: { lastMessageAt: "desc" },
      take: limit,
      select: { id: true, subject: true, topic: true, status: true, lastMessageFrom: true, lastMessageAt: true, unreadForSupport: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorName: true } }, _count: { select: { messages: true } } },
    }),
  ]);
  return { total, rows };
}

/** Le chiffre du menu de la console : les discussions où l'officine attend une réponse. */
export async function countSupportToAnswer(): Promise<number> {
  return prisma.supportThread.count({ where: { status: "OPEN", lastMessageFrom: "PHARMACY" } });
}

/** Une discussion pour la console : ses messages, et ce qu'il faut savoir de l'officine pour répondre sans chercher. */
export async function getSupportThread(threadId: string) {
  return prisma.supportThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      subject: true,
      topic: true,
      status: true,
      lastMessageFrom: true,
      unreadForSupport: true,
      createdAt: true,
      closedAt: true,
      pharmacy: {
        select: {
          id: true,
          name: true,
          city: true,
          isActive: true,
          isDemo: true,
          organization: { select: { subscription: { select: { status: true } } } },
          memberships: { where: { role: "OWNER", isActive: true, user: { deletedAt: null } }, orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }], take: 1, select: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, author: true, authorName: true, body: true, createdAt: true } },
    },
  });
}

export async function markReadBySupport(threadId: string): Promise<void> {
  await prisma.supportThread.updateMany({ where: { id: threadId, unreadForSupport: true }, data: { unreadForSupport: false } });
}

export async function setThreadClosedBySupport(threadId: string, closed: boolean): Promise<boolean> {
  const { count } = await prisma.supportThread.updateMany({ where: { id: threadId }, data: { status: closed ? "CLOSED" : "OPEN", closedAt: closed ? new Date() : null, unreadForSupport: false } });
  return count > 0;
}

/**
 * L'équipe répond. Le message est enregistré, la discussion rouverte si elle était fermée, puis l'officine est prévenue :
 * la cloche de PharmaBoost (pour celui qui a écrit en dernier) et un e-mail à lui. Ne lève jamais pour l'alerte.
 */
export async function replyFromSupport(input: { threadId: string; admin: { id: string; name: string }; body: string }, deps: Deps = {}): Promise<{ ok: true; notified: { inApp: boolean; email: "SENT" | "SIMULATED" | "FAILED" | "NONE" } } | { ok: false; error: string }> {
  const now = deps.now ?? new Date();
  const thread = await prisma.supportThread.findUnique({ where: { id: input.threadId }, select: { id: true, pharmacyId: true, subject: true, createdByUserId: true, isDemo: true } });
  if (!thread) return { ok: false, error: "Discussion introuvable." };

  await prisma.$transaction([
    prisma.supportMessage.create({ data: { threadId: thread.id, author: "SUPPORT", authorAdminId: input.admin.id, authorName: input.admin.name, body: input.body, createdAt: now } }),
    prisma.supportThread.update({ where: { id: thread.id }, data: { status: "OPEN", closedAt: null, lastMessageFrom: "SUPPORT", lastMessageAt: now, unreadForPharmacy: true, unreadForSupport: false } }),
  ]);
  return { ok: true, notified: await notifyPharmacy({ thread, body: input.body, adminId: input.admin.id }, deps) };
}

async function notifyPharmacy(input: { thread: { id: string; pharmacyId: string; subject: string; createdByUserId: string | null; isDemo: boolean }; body: string; adminId: string }, deps: Deps): Promise<{ inApp: boolean; email: "SENT" | "SIMULATED" | "FAILED" | "NONE" }> {
  const result: { inApp: boolean; email: "SENT" | "SIMULATED" | "FAILED" | "NONE" } = { inApp: false, email: "NONE" };
  try {
    // Celui qui a écrit en dernier, à défaut celui qui a ouvert la discussion.
    const lastFromPharmacy = await prisma.supportMessage.findFirst({ where: { threadId: input.thread.id, author: "PHARMACY", authorUserId: { not: null } }, orderBy: { createdAt: "desc" }, select: { authorUserId: true } });
    const userId = lastFromPharmacy?.authorUserId ?? input.thread.createdByUserId;
    await createNotification({ pharmacyId: input.thread.pharmacyId, userId, type: "SYSTEM", severity: "INFO", title: "PharmaBoost a répondu à votre question", body: input.thread.subject, linkUrl: `/support/${input.thread.id}` });
    result.inApp = true;
    if (!userId || input.thread.isDemo) return result;

    // Seul un compte encore actif dans cette officine reçoit l'e-mail.
    const member = await prisma.membership.findFirst({ where: { userId, pharmacyId: input.thread.pharmacyId, isActive: true, user: { deletedAt: null } }, select: { user: { select: { email: true, firstName: true } } } });
    if (!member) return result;
    const mail = buildSupportReplyEmail({ firstName: member.user.firstName, subject: input.thread.subject, excerpt: excerpt(input.body, 600), supportUrl: publicUrl(`/support/${input.thread.id}`) });
    const messaging = deps.messaging ?? getMessagingProvider();
    const outcome = await messaging.sendEmail({ to: member.user.email, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html });
    await traceDispatch({ kind: "SUPPORT_REPLY", recipient: member.user.email, outcome, subject: mail.subject, trigger: "MANUAL", pharmacyId: input.thread.pharmacyId, userId, sentByAdminId: input.adminId });
    result.email = outcome.status;
  } catch (error) {
    console.error("[support] notification de l'officine impossible", input.thread.id, error);
  }
  return result;
}
