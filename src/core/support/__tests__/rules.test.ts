import { describe, expect, it } from "vitest";
import { checkMessage, cleanMessage, deriveSubject, excerpt, shouldAlertSupport, SUPPORT_ALERT_COOLDOWN_MS, SUPPORT_BODY_MAX, SUPPORT_STATE_FOR_ADMIN, SUPPORT_STATE_FOR_PHARMACY, supportThreadState, SUPPORT_TOPIC_LABELS } from "../rules";
import { buildSupportAlertEmail, buildSupportReplyEmail } from "../emails";

describe("l'état d'une discussion se lit de qui a écrit en dernier", () => {
  it("l'officine a écrit : c'est à l'équipe de répondre", () => {
    expect(supportThreadState({ status: "OPEN", lastMessageFrom: "PHARMACY" })).toBe("TO_ANSWER");
  });
  it("l'équipe a répondu : elle attend l'officine", () => {
    expect(supportThreadState({ status: "OPEN", lastMessageFrom: "SUPPORT" })).toBe("WAITING_PHARMACY");
  });
  it("une discussion fermée n'attend plus rien, quelle que soit la dernière à avoir écrit", () => {
    expect(supportThreadState({ status: "CLOSED", lastMessageFrom: "PHARMACY" })).toBe("CLOSED");
    expect(supportThreadState({ status: "CLOSED", lastMessageFrom: "SUPPORT" })).toBe("CLOSED");
  });
  it("les mots ne sont pas les mêmes pour la console et pour l'officine", () => {
    expect(SUPPORT_STATE_FOR_ADMIN.TO_ANSWER.label).toBe("À répondre");
    expect(SUPPORT_STATE_FOR_PHARMACY.TO_ANSWER.label).toBe("En attente de réponse");
    expect(SUPPORT_STATE_FOR_PHARMACY.WAITING_PHARMACY.label).toBe("PharmaBoost a répondu");
  });
});

describe("un message propre", () => {
  it("garde les retours à la ligne, retire les caractères de contrôle et les lignes vides en trop", () => {
    expect(cleanMessage("Bonjour  \r\n\r\n\r\n\r\nMerci\u0000 !\t\n")).toBe("Bonjour\n\nMerci !");
  });
  it("ne change ni les accents ni les symboles", () => {
    expect(cleanMessage("  Le stock s'affiche à 0 € — pourquoi ?  ")).toBe("Le stock s'affiche à 0 € — pourquoi ?");
  });
  it("refuse un message vide ou trop court, et trop long", () => {
    expect(checkMessage("   ")).toMatchObject({ ok: false });
    expect(checkMessage("ok")).toMatchObject({ ok: false });
    expect(checkMessage("a".repeat(SUPPORT_BODY_MAX + 1))).toMatchObject({ ok: false, error: expect.stringMatching(/trop long/) });
    expect(checkMessage("Comment mettre à jour mon stock ?")).toEqual({ ok: true, body: "Comment mettre à jour mon stock ?" });
  });
  it("coupe un extrait à la limite d'un mot", () => {
    expect(excerpt("court")).toBe("court");
    const long = "mot ".repeat(100);
    const cut = excerpt(long, 50);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(51);
    expect(cut).not.toMatch(/mo…$/);
  });
  it("tire le sujet des premiers mots quand l'officine n'en a pas donné", () => {
    expect(deriveSubject("\n\nMon stock ne se met pas à jour depuis hier\nMerci")).toBe("Mon stock ne se met pas à jour depuis hier");
    expect(deriveSubject("x".repeat(200)).length).toBeLessThanOrEqual(61);
    expect(deriveSubject("   ")).toBe("Question");
  });
  it("nomme les types de discussion", () => {
    expect(SUPPORT_TOPIC_LABELS).toMatchObject({ QUESTION: "Une question", TECHNICAL: "Un problème", BILLING: "Abonnement et facture", SUGGESTION: "Une idée" });
  });
});

describe("quand prévenir l'équipe par e-mail", () => {
  const now = new Date("2026-10-08T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("toujours pour une nouvelle discussion", () => {
    expect(shouldAlertSupport({ isNewThread: true, previousMessageFrom: null, supportAlertedAt: ago(1000), now })).toBe(true);
  });
  it("toujours quand l'officine répond à l'équipe : c'est de nouveau à elle de répondre", () => {
    expect(shouldAlertSupport({ isNewThread: false, previousMessageFrom: "SUPPORT", supportAlertedAt: ago(1000), now })).toBe(true);
  });
  it("pas de second e-mail si l'officine écrit en plusieurs fois en moins de dix minutes", () => {
    expect(shouldAlertSupport({ isNewThread: false, previousMessageFrom: "PHARMACY", supportAlertedAt: ago(60_000), now })).toBe(false);
    expect(shouldAlertSupport({ isNewThread: false, previousMessageFrom: "PHARMACY", supportAlertedAt: ago(SUPPORT_ALERT_COOLDOWN_MS - 1), now })).toBe(false);
  });
  it("…mais un rappel au bout de dix minutes, ou si l'équipe n'a jamais été prévenue", () => {
    expect(shouldAlertSupport({ isNewThread: false, previousMessageFrom: "PHARMACY", supportAlertedAt: ago(SUPPORT_ALERT_COOLDOWN_MS), now })).toBe(true);
    expect(shouldAlertSupport({ isNewThread: false, previousMessageFrom: "PHARMACY", supportAlertedAt: null, now })).toBe(true);
  });
});

describe("les e-mails du support", () => {
  const alert = { pharmacyName: "Pharmacie du Port & Fils", city: "Nice", authorName: "Donna Benveniste", subject: "Mon stock ne se met pas à jour", topicLabel: "Un problème", excerpt: "Bonjour, depuis hier <b>rien</b> ne bouge.", isNewThread: true, isReply: false, adminUrl: "https://pharmaboost.app/admin/support/abc" };

  it("dit en toutes lettres que l'officine a posé une question, avec le lien pour répondre", () => {
    const mail = buildSupportAlertEmail(alert);
    expect(mail.subject).toBe("Nouvelle question de Pharmacie du Port & Fils — Mon stock ne se met pas à jour");
    expect(mail.text).toContain("Pharmacie du Port & Fils (Nice) vous a posé une question.");
    expect(mail.text).toContain("De : Donna Benveniste");
    expect(mail.text).toContain("https://pharmaboost.app/admin/support/abc");
  });
  it("échappe le HTML : un nom d'officine ou un message ne peut pas injecter de balise", () => {
    const mail = buildSupportAlertEmail(alert);
    expect(mail.html).toContain("Pharmacie du Port &amp; Fils");
    expect(mail.html).not.toContain("<b>rien</b>");
    expect(mail.html).toContain("&lt;b&gt;rien&lt;/b&gt;");
  });
  it("distingue une nouvelle question, une réponse de l'officine et un message de plus", () => {
    expect(buildSupportAlertEmail({ ...alert, isNewThread: false, isReply: true }).subject).toMatch(/^Réponse de/);
    expect(buildSupportAlertEmail({ ...alert, isNewThread: false, isReply: false }).subject).toMatch(/^Nouveau message de/);
  });
  it("l'e-mail de réponse à l'officine cite un extrait et renvoie vers PharmaBoost", () => {
    const mail = buildSupportReplyEmail({ firstName: "Donna", subject: "Mon stock", excerpt: "Voici la marche à suivre.", supportUrl: "https://pharmaboost.app/support/abc" });
    expect(mail.subject).toBe("PharmaBoost vous a répondu — Mon stock");
    expect(mail.text).toContain("Bonjour Donna,");
    expect(mail.text).toContain("https://pharmaboost.app/support/abc");
    expect(mail.html).toContain("Lire la réponse");
  });
});
