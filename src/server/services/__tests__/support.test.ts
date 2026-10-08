import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contact support : ce qui est éprouvé, c'est le parcours d'un message — l'officine écrit, l'équipe est prévenue (cloche,
 * e-mail, jamais en rafale), l'équipe répond, l'officine est prévenue — et ses garde-fous : une discussion n'est jamais lue
 * par une autre officine, et une panne d'envoi ne fait jamais perdre un message.
 */

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  supportThread: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  supportMessage: { create: vi.fn(), findFirst: vi.fn() },
  notification: { updateMany: vi.fn() },
  membership: { findFirst: vi.fn() },
  companyProfile: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  notifyAdmins: vi.fn(),
  createNotification: vi.fn(),
  traceDispatch: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({ prisma: prismaMock }));
vi.mock("@/server/ai/registry", () => ({ getMessagingProvider: () => ({ info: { id: "test" }, sendEmail: mocks.sendEmail }) }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));
vi.mock("@/server/services/email-dispatch", () => ({ traceDispatch: mocks.traceDispatch }));
vi.mock("@/server/services/notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/server/services/sales/notifications", () => ({ notifyAdmins: mocks.notifyAdmins }));
vi.mock("@/server/services/site-leads", () => ({ DEFAULT_CONTACT_EMAIL: "contact@pharmaboost.app" }));

const { countPharmacyUnread, countSupportToAnswer, getPharmacyThread, listPharmacyThreads, listSupportInbox, markReadByPharmacy, openSupportThread, replyFromPharmacy, replyFromSupport, setThreadClosedByPharmacy, setThreadClosedBySupport } = await import("../support");

const NOW = new Date("2026-10-08T10:00:00.000Z");
const pharmacy = { id: "ph_1", name: "Pharmacie du Petit Nicolas", city: "Nice", isDemo: false };
const author = { userId: "u_donna", name: "Donna Benveniste" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prismaMock) : Promise.all(arg as Promise<unknown>[])));
  prismaMock.companyProfile.findUnique.mockResolvedValue(null);
  // `clearAllMocks` efface les appels, pas les comportements : on remet ceux de chaque test.
  mocks.notifyAdmins.mockResolvedValue(undefined);
  mocks.createNotification.mockResolvedValue(undefined);
  mocks.traceDispatch.mockResolvedValue({ id: "d1" });
  mocks.sendEmail.mockResolvedValue({ status: "SENT", provider: "resend", detail: "ok", messageId: "m1" });
  prismaMock.supportThread.create.mockResolvedValue({ id: "th_1", supportAlertedAt: null });
});

describe("l'officine ouvre une discussion", () => {
  it("enregistre la discussion avec son premier message, à répondre et non lue par l'équipe", async () => {
    const result = await openSupportThread({ pharmacy, author, topic: "TECHNICAL", subject: "Stock bloqué", body: "Mon stock ne se met pas à jour." }, { now: NOW });
    expect(result).toEqual({ threadId: "th_1" });
    const data = prismaMock.supportThread.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ pharmacyId: "ph_1", createdByUserId: "u_donna", subject: "Stock bloqué", topic: "TECHNICAL", lastMessageFrom: "PHARMACY", unreadForSupport: true, isDemo: false });
    expect(data.messages.create).toMatchObject({ author: "PHARMACY", authorUserId: "u_donna", authorName: "Donna Benveniste", body: "Mon stock ne se met pas à jour." });
  });

  it("sans sujet, reprend les premiers mots du message", async () => {
    await openSupportThread({ pharmacy, author, topic: "QUESTION", subject: null, body: "Comment ajouter un deuxième poste de comptoir ?\nMerci" }, { now: NOW });
    expect(prismaMock.supportThread.create.mock.calls[0][0].data.subject).toBe("Comment ajouter un deuxième poste de comptoir ?");
  });

  it("prévient l'équipe : la cloche de la console, puis l'e-mail à l'adresse de contact par défaut", async () => {
    await openSupportThread({ pharmacy, author, topic: "QUESTION", subject: "Question", body: "Bonjour, une question sur mon abonnement." }, { now: NOW });
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: "SUPPORT_MESSAGE", title: "Pharmacie du Petit Nicolas vous a posé une question", linkUrl: "/admin/support/th_1" }));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("contact@pharmaboost.app");
    expect(mail.subject).toBe("Nouvelle question de Pharmacie du Petit Nicolas — Question");
    expect(mail.text).toContain("https://pharmaboost.test/admin/support/th_1");
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "SUPPORT_ALERT", recipient: "contact@pharmaboost.app", pharmacyId: "ph_1" }));
    expect(prismaMock.supportThread.update).toHaveBeenCalledWith({ where: { id: "th_1" }, data: { supportAlertedAt: NOW } });
  });

  it("écrit à l'adresse de la société quand elle est renseignée", async () => {
    prismaMock.companyProfile.findUnique.mockResolvedValue({ representativeEmail: "direction@pharmaboost.app" });
    await openSupportThread({ pharmacy, author, topic: "QUESTION", subject: "Q", body: "Bonjour, une question." }, { now: NOW });
    expect(mocks.sendEmail.mock.calls[0][0].to).toBe("direction@pharmaboost.app");
  });

  it("une panne d'envoi ne fait jamais perdre le message : la discussion est créée, l'erreur est gardée", async () => {
    mocks.notifyAdmins.mockRejectedValue(new Error("base indisponible"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await openSupportThread({ pharmacy, author, topic: "QUESTION", subject: "Q", body: "Bonjour, une question." }, { now: NOW });
    expect(result).toEqual({ threadId: "th_1" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("un e-mail en échec est tracé tel quel, sans bloquer", async () => {
    mocks.sendEmail.mockResolvedValue({ status: "FAILED", provider: "resend", detail: "boîte pleine" });
    await openSupportThread({ pharmacy, author, topic: "QUESTION", subject: "Q", body: "Bonjour, une question." }, { now: NOW });
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ outcome: expect.objectContaining({ status: "FAILED" }) }));
  });
});

describe("l'officine écrit dans une discussion existante", () => {
  const existing = (overrides = {}) => ({ id: "th_1", subject: "Stock bloqué", topic: "TECHNICAL", lastMessageFrom: "SUPPORT", supportAlertedAt: null, ...overrides });

  it("n'écrit que dans SA discussion : celle d'une autre officine est introuvable", async () => {
    prismaMock.supportThread.findFirst.mockResolvedValue(null);
    const result = await replyFromPharmacy({ pharmacy, threadId: "th_autre", author, body: "Merci" }, { now: NOW });
    expect(result).toEqual({ ok: false, error: "Discussion introuvable." });
    expect(prismaMock.supportThread.findFirst.mock.calls[0][0].where).toEqual({ id: "th_autre", pharmacyId: "ph_1" });
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rouvre la discussion, la rend « à répondre » et non lue par l'équipe", async () => {
    prismaMock.supportThread.findFirst.mockResolvedValue(existing());
    expect(await replyFromPharmacy({ pharmacy, threadId: "th_1", author, body: "Merci, c'est réglé." }, { now: NOW })).toEqual({ ok: true });
    expect(prismaMock.supportThread.update.mock.calls[0][0].data).toMatchObject({ status: "OPEN", closedAt: null, lastMessageFrom: "PHARMACY", unreadForSupport: true, unreadForPharmacy: false });
  });

  it("une réponse à l'équipe prévient toujours l'équipe, même si elle a été prévenue il y a une minute", async () => {
    prismaMock.supportThread.findFirst.mockResolvedValue(existing({ lastMessageFrom: "SUPPORT", supportAlertedAt: new Date(NOW.getTime() - 60_000) }));
    await replyFromPharmacy({ pharmacy, threadId: "th_1", author, body: "Voici la capture demandée." }, { now: NOW });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].subject).toMatch(/^Réponse de/);
  });

  it("des messages en rafale ne remplissent pas la boîte : un seul e-mail par dix minutes", async () => {
    prismaMock.supportThread.findFirst.mockResolvedValue(existing({ lastMessageFrom: "PHARMACY", supportAlertedAt: new Date(NOW.getTime() - 120_000) }));
    await replyFromPharmacy({ pharmacy, threadId: "th_1", author, body: "J'ajoute une précision." }, { now: NOW });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).not.toHaveBeenCalled();
    // …le message, lui, est bien enregistré.
    expect(prismaMock.supportMessage.create).toHaveBeenCalledTimes(1);
  });

  it("…mais l'équipe est prévenue de nouveau au bout de dix minutes", async () => {
    prismaMock.supportThread.findFirst.mockResolvedValue(existing({ lastMessageFrom: "PHARMACY", supportAlertedAt: new Date(NOW.getTime() - 11 * 60_000) }));
    await replyFromPharmacy({ pharmacy, threadId: "th_1", author, body: "Toujours pas de réponse ?" }, { now: NOW });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].subject).toMatch(/^Nouveau message de/);
  });
});

describe("l'équipe répond", () => {
  const thread = { id: "th_1", pharmacyId: "ph_1", subject: "Stock bloqué", createdByUserId: "u_donna", isDemo: false };
  const wire = () => {
    prismaMock.supportThread.findUnique.mockResolvedValue(thread);
    prismaMock.supportMessage.findFirst.mockResolvedValue({ authorUserId: "u_leo" });
    prismaMock.membership.findFirst.mockResolvedValue({ user: { email: "leo@pharmacie.fr", firstName: "Léo" } });
  };

  it("enregistre la réponse signée de l'administrateur, rouvre la discussion, la rend non lue pour l'officine", async () => {
    wire();
    const result = await replyFromSupport({ threadId: "th_1", admin: { id: "adm_1", name: "Adam (PharmaBoost)" }, body: "Voici la marche à suivre." }, { now: NOW });
    expect(result).toMatchObject({ ok: true });
    expect(prismaMock.supportMessage.create.mock.calls[0][0].data).toMatchObject({ threadId: "th_1", author: "SUPPORT", authorAdminId: "adm_1", authorName: "Adam (PharmaBoost)", body: "Voici la marche à suivre." });
    expect(prismaMock.supportThread.update.mock.calls[0][0].data).toMatchObject({ status: "OPEN", lastMessageFrom: "SUPPORT", unreadForPharmacy: true, unreadForSupport: false });
  });

  it("prévient celui qui a écrit en dernier : cloche de PharmaBoost et e-mail", async () => {
    wire();
    const result = await replyFromSupport({ threadId: "th_1", admin: { id: "adm_1", name: "Adam (PharmaBoost)" }, body: "Voici la marche à suivre." }, { now: NOW });
    expect(result).toEqual({ ok: true, notified: { inApp: true, email: "SENT" } });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ pharmacyId: "ph_1", userId: "u_leo", type: "SYSTEM", linkUrl: "/support/th_1" }));
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("leo@pharmacie.fr");
    expect(mail.subject).toBe("PharmaBoost vous a répondu — Stock bloqué");
    expect(mocks.traceDispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "SUPPORT_REPLY", recipient: "leo@pharmacie.fr", sentByAdminId: "adm_1", userId: "u_leo" }));
  });

  it("à défaut, prévient celui qui a ouvert la discussion", async () => {
    prismaMock.supportThread.findUnique.mockResolvedValue(thread);
    prismaMock.supportMessage.findFirst.mockResolvedValue(null);
    prismaMock.membership.findFirst.mockResolvedValue({ user: { email: "donna@pharmacie.fr", firstName: "Donna" } });
    await replyFromSupport({ threadId: "th_1", admin: { id: "adm_1", name: "Adam (PharmaBoost)" }, body: "Bonjour, voici." }, { now: NOW });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u_donna" }));
  });

  it("un compte qui n'est plus actif dans l'officine ne reçoit pas d'e-mail (la cloche reste)", async () => {
    wire();
    prismaMock.membership.findFirst.mockResolvedValue(null);
    expect(await replyFromSupport({ threadId: "th_1", admin: { id: "adm_1", name: "A" }, body: "Bonjour, voici." }, { now: NOW })).toEqual({ ok: true, notified: { inApp: true, email: "NONE" } });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("une panne d'e-mail ne perd pas la réponse : elle est enregistrée, l'échec est dit", async () => {
    wire();
    mocks.sendEmail.mockResolvedValue({ status: "FAILED", provider: "resend", detail: "refusé" });
    expect(await replyFromSupport({ threadId: "th_1", admin: { id: "adm_1", name: "A" }, body: "Bonjour, voici." }, { now: NOW })).toMatchObject({ ok: true, notified: { email: "FAILED" } });
    expect(prismaMock.supportMessage.create).toHaveBeenCalledTimes(1);
  });

  it("une discussion inconnue est refusée", async () => {
    prismaMock.supportThread.findUnique.mockResolvedValue(null);
    expect(await replyFromSupport({ threadId: "x", admin: { id: "a", name: "A" }, body: "Bonjour" }, { now: NOW })).toEqual({ ok: false, error: "Discussion introuvable." });
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
  });
});

describe("lire, marquer lu, fermer", () => {
  it("l'officine ne lit que ses discussions, et la liste est bornée à son officine", async () => {
    prismaMock.supportThread.findFirst.mockResolvedValue(null);
    expect(await getPharmacyThread("ph_1", "th_autre")).toBeNull();
    expect(prismaMock.supportThread.findFirst.mock.calls[0][0].where).toEqual({ id: "th_autre", pharmacyId: "ph_1" });
    prismaMock.supportThread.findMany.mockResolvedValue([{ id: "th_1", subject: "S", topic: "QUESTION", status: "OPEN", lastMessageFrom: "SUPPORT", lastMessageAt: NOW, unreadForPharmacy: true, createdAt: NOW, messages: [{ body: "Voici la marche à suivre", authorName: "Adam (PharmaBoost)" }] }]);
    const list = await listPharmacyThreads("ph_1");
    expect(prismaMock.supportThread.findMany.mock.calls[0][0].where).toEqual({ pharmacyId: "ph_1" });
    expect(list[0]).toMatchObject({ id: "th_1", unread: true, preview: "Voici la marche à suivre", previewAuthor: "Adam (PharmaBoost)" });
  });

  it("le chiffre du menu compte les réponses non lues de CETTE officine", async () => {
    prismaMock.supportThread.count.mockResolvedValue(2);
    expect(await countPharmacyUnread("ph_1")).toBe(2);
    expect(prismaMock.supportThread.count).toHaveBeenCalledWith({ where: { pharmacyId: "ph_1", unreadForPharmacy: true } });
  });

  it("marquer lu éteint le point ET la notification de la cloche, pour cette personne", async () => {
    await markReadByPharmacy({ pharmacyId: "ph_1", userId: "u_donna", threadId: "th_1" });
    expect(prismaMock.supportThread.updateMany).toHaveBeenCalledWith({ where: { id: "th_1", pharmacyId: "ph_1", unreadForPharmacy: true }, data: { unreadForPharmacy: false } });
    expect(prismaMock.notification.updateMany.mock.calls[0][0].where).toMatchObject({ pharmacyId: "ph_1", linkUrl: "/support/th_1", readAt: null });
  });

  it("l'officine ferme et rouvre sa discussion ; une autre n'y touche pas", async () => {
    prismaMock.supportThread.updateMany.mockResolvedValue({ count: 1 });
    expect(await setThreadClosedByPharmacy({ pharmacyId: "ph_1", threadId: "th_1", closed: true })).toBe(true);
    expect(prismaMock.supportThread.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "th_1", pharmacyId: "ph_1" }, data: { status: "CLOSED" } });
    prismaMock.supportThread.updateMany.mockResolvedValue({ count: 0 });
    expect(await setThreadClosedByPharmacy({ pharmacyId: "ph_2", threadId: "th_1", closed: false })).toBe(false);
  });

  it("l'équipe ferme une discussion : elle n'est plus « non lue »", async () => {
    prismaMock.supportThread.updateMany.mockResolvedValue({ count: 1 });
    expect(await setThreadClosedBySupport("th_1", true)).toBe(true);
    expect(prismaMock.supportThread.updateMany.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", unreadForSupport: false });
  });
});

describe("la boîte de réception de la console", () => {
  beforeEach(() => {
    prismaMock.supportThread.count.mockResolvedValue(3);
    prismaMock.supportThread.findMany.mockResolvedValue([]);
  });

  it("« à répondre » = ouvertes dont la dernière à avoir écrit est l'officine, la plus ancienne en tête", async () => {
    await listSupportInbox({ filter: "a-repondre", q: null, page: 1 });
    const args = prismaMock.supportThread.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "OPEN", lastMessageFrom: "PHARMACY" });
    expect(args.orderBy).toEqual({ lastMessageAt: "asc" });
  });

  it("« en attente » = l'équipe a répondu ; « fermées » = fermées ; « toutes » = sans filtre, les plus récentes d'abord", async () => {
    await listSupportInbox({ filter: "en-attente", q: null, page: 1 });
    expect(prismaMock.supportThread.findMany.mock.calls[0][0].where).toEqual({ status: "OPEN", lastMessageFrom: "SUPPORT" });
    await listSupportInbox({ filter: "fermees", q: null, page: 1 });
    expect(prismaMock.supportThread.findMany.mock.calls[1][0].where).toEqual({ status: "CLOSED" });
    await listSupportInbox({ filter: "toutes", q: null, page: 2 });
    const all = prismaMock.supportThread.findMany.mock.calls[2][0];
    expect(all.where).toEqual({});
    expect(all.orderBy).toEqual({ lastMessageAt: "desc" });
    expect(all.skip).toBe(25);
  });

  it("la recherche porte sur le sujet, le nom et la ville de l'officine", async () => {
    await listSupportInbox({ filter: "toutes", q: "nice", page: 1 });
    const where = prismaMock.supportThread.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
  });

  it("rend les chiffres de chaque onglet et le nombre de pages", async () => {
    prismaMock.supportThread.count.mockResolvedValue(60);
    const inbox = await listSupportInbox({ filter: "toutes", q: null, page: 1 });
    expect(inbox.counts).toEqual({ "a-repondre": 60, "en-attente": 60, fermees: 60, toutes: 60 });
    expect(inbox.pages).toBe(3);
  });

  it("le compteur du menu : les questions où l'officine attend", async () => {
    prismaMock.supportThread.count.mockResolvedValue(4);
    expect(await countSupportToAnswer()).toBe(4);
    expect(prismaMock.supportThread.count).toHaveBeenCalledWith({ where: { status: "OPEN", lastMessageFrom: "PHARMACY" } });
  });
});
