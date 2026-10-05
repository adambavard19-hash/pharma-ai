import { describe, expect, it } from "vitest";
import { validateAnnouncement } from "@/core/patient-news";
import { EMPTY_DRAFT, afterSendNote, announcementTally, checkDraft, rangeOptions, sendBlocker, sendLabel, statusBadge, subscribersLabel } from "../news-rules";

/**
 * Ce que l'écran décide sans serveur : le retour pendant la saisie (les règles
 * sont celles du serveur, pas une copie), la raison d'un bouton grisé, les
 * pastilles de l'historique.
 */

const GOOD = { title: "Une nouvelle gamme est arrivée", rangeLabel: "Gamme Solaire", message: "Découvrez notre nouvelle gamme de soins solaires." };

describe("checkDraft : le même verdict que le serveur", () => {
  it("un texte valide donne la valeur que le serveur recevra (champs nettoyés, gamme vide = null)", () => {
    const checked = checkDraft({ title: "  Une nouvelle gamme  ", rangeLabel: "", message: "Un message.\n\n\n\nSuite." });
    expect(checked).toEqual({ value: { title: "Une nouvelle gamme", rangeLabel: null, message: "Un message.\n\nSuite." }, problem: null, fieldErrors: {} });
  });

  it("rend exactement l'erreur de validateAnnouncement, jamais une phrase de l'écran", () => {
    for (const draft of [EMPTY_DRAFT, { ...GOOD, title: "" }, { ...GOOD, message: "Rendez-vous sur https://marque.fr" }, { ...GOOD, rangeLabel: "x".repeat(81) }]) {
      const server = validateAnnouncement(draft);
      expect(server.ok).toBe(false);
      expect(checkDraft(draft).problem).toBe(server.ok ? null : server.error);
      expect(checkDraft(draft).value).toBeNull();
    }
  });

  it("un lien dans le message est refusé, et le reproche tombe sous le message et sous lui seul", () => {
    const checked = checkDraft({ ...GOOD, message: "Toute la gamme sur www.marque.fr" });
    expect(checked.problem).toContain("aucune adresse web");
    expect(checked.fieldErrors).toEqual({ message: expect.stringContaining("aucune adresse web") });
  });

  it("un reproche est attribué au bon champ : objet, gamme, message", () => {
    expect(checkDraft({ ...GOOD, title: "Écrivez à contact@marque.fr" }).fieldErrors).toEqual({ title: expect.stringContaining("adresse e-mail") });
    expect(checkDraft({ ...GOOD, rangeLabel: "Solaire {{prenom}}" }).fieldErrors).toEqual({ rangeLabel: expect.stringContaining("variable") });
    expect(checkDraft({ ...GOOD, message: "Un produit sur ordonnance." }).fieldErrors).toEqual({ message: expect.stringContaining("ordonnance") });
    expect(checkDraft({ ...GOOD, message: "x".repeat(601) }).fieldErrors).toEqual({ message: expect.stringContaining("600 caractères") });
    expect(checkDraft({ ...GOOD, title: "x".repeat(91) }).fieldErrors).toEqual({ title: expect.stringContaining("90 caractères") });
  });

  it("un champ vide n'est pas grondé : la raison est dite près du bouton, pas en rouge sous un champ qu'on n'a pas encore rempli", () => {
    const empty = checkDraft(EMPTY_DRAFT);
    expect(empty.fieldErrors).toEqual({});
    expect(empty.problem).toBe("Donnez un objet à l'annonce.");
    const noMessage = checkDraft({ ...GOOD, message: "   " });
    expect(noMessage.fieldErrors).toEqual({});
    expect(noMessage.problem).toBe("Écrivez le message de l'annonce.");
  });

  it("la limite de 600 caractères est celle du serveur : 600 passe, 601 est refusé", () => {
    expect(checkDraft({ ...GOOD, message: "a".repeat(600) }).value).not.toBeNull();
    expect(checkDraft({ ...GOOD, message: "a".repeat(601) }).value).toBeNull();
  });
});

describe("sendBlocker : pourquoi l'envoi aux abonnés est grisé", () => {
  const OPEN = { enabled: true, activeCount: 12, nextAllowedAt: null };

  it("aucun obstacle : null", () => {
    expect(sendBlocker(OPEN)).toBeNull();
  });

  it("fonction coupée : le dit, et passe avant le reste", () => {
    expect(sendBlocker({ enabled: false, activeCount: 0, nextAllowedAt: "2026-10-12T14:30:00Z" })).toContain("désactivées");
  });

  it("aucun abonné : le dit", () => {
    expect(sendBlocker({ ...OPEN, activeCount: 0 })).toBe("Aucun patient n'est abonné pour l'instant : il n'y a personne à qui écrire.");
  });

  it("une annonce est déjà partie : donne la date ET l'heure du prochain envoi possible (heure de Paris)", () => {
    expect(sendBlocker({ ...OPEN, nextAllowedAt: "2026-10-12T14:30:00Z" })).toBe("Une annonce est déjà partie cette semaine : la prochaine sera possible le 12 octobre 2026 à 16:30.");
  });
});

describe("les libellés d'envoi", () => {
  it("le bouton dit le nombre d'abonnés, au singulier comme au pluriel ; sans abonné, il ne dit pas « 0 »", () => {
    expect(sendLabel(12)).toBe("Envoyer à 12 abonnés");
    expect(sendLabel(1)).toBe("Envoyer à 1 abonné");
    expect(sendLabel(0)).toBe("Envoyer aux abonnés");
    expect(subscribersLabel(1250)).toMatch(/^1\s?250 abonnés$/);
  });

  it("l'après : la date du prochain envoi possible, sept jours plus tard", () => {
    expect(afterSendNote(true, new Date("2026-10-05T10:00:00Z"))).toBe("Après cet envoi, la prochaine annonce ne pourra pas partir avant le 12 octobre 2026 (une par semaine au plus).");
  });

  it("l'après d'un envoi simulé : il ne bloque pas le suivant, et c'est dit", () => {
    const note = afterSendNote(false, new Date("2026-10-05T10:00:00Z"));
    expect(note).toContain("simulé");
    expect(note).toContain("ne compte pas");
    expect(note).not.toContain("12 octobre");
  });
});

describe("rangeOptions : les suggestions viennent des gammes privilégiées, et d'elles seules", () => {
  it("met en forme gamme et laboratoire, sans doublon (casse comprise)", () => {
    expect(
      rangeOptions([
        { laboratory: "Avène", rangeName: "Cicalfate" },
        { laboratory: "Bioderma", rangeName: null },
        { laboratory: "AVÈNE", rangeName: "cicalfate" },
        { laboratory: "Bioderma", rangeName: null },
      ]),
    ).toEqual(["Cicalfate (Avène)", "Bioderma"]);
  });

  it("ne propose pas ce que le serveur refuserait : trop long, adresse web", () => {
    expect(rangeOptions([{ laboratory: "L".repeat(81), rangeName: null }, { laboratory: "Laboratoire.com", rangeName: null }, { laboratory: "Pierre Fabre", rangeName: null }])).toEqual(["Pierre Fabre"]);
  });

  it("aucune gamme privilégiée : aucune suggestion", () => {
    expect(rangeOptions([])).toEqual([]);
  });
});

describe("statusBadge : la pastille d'une annonce", () => {
  it("les quatre états de l'historique", () => {
    expect(statusBadge("SENDING", false)).toEqual({ label: "En cours", tone: "info", simulated: false });
    expect(statusBadge("SENT", false)).toEqual({ label: "Envoyée", tone: "success", simulated: false });
    expect(statusBadge("PARTIAL", false)).toEqual({ label: "Partielle", tone: "warning", simulated: false });
    expect(statusBadge("FAILED", false)).toEqual({ label: "Échec", tone: "danger", simulated: false });
  });

  it("une annonce simulée n'est jamais « Envoyée » : aucun message n'est parti", () => {
    expect(statusBadge("SENT", true)).toEqual({ label: "Simulée", tone: "warning", simulated: false });
    expect(statusBadge("SENT", true).label).not.toMatch(/envoy/i);
  });

  it("les autres états simulés gardent leur mot et portent en plus la mention « simulée »", () => {
    expect(statusBadge("PARTIAL", true)).toMatchObject({ label: "Partielle", simulated: true });
    expect(statusBadge("SENDING", true)).toMatchObject({ label: "En cours", simulated: true });
  });

  it("un statut inconnu est montré tel quel plutôt que maquillé", () => {
    expect(statusBadge("QUELQUE_CHOSE", false)).toEqual({ label: "QUELQUE_CHOSE", tone: "neutral", simulated: false });
  });
});

describe("announcementTally : les compteurs, en toutes lettres", () => {
  const base = { status: "SENT", recipientCount: 12, sentCount: 11, failedCount: 1, simulated: false };

  it("remis et échecs", () => {
    expect(announcementTally(base)).toBe("11 remis · 1 échec");
    expect(announcementTally({ ...base, sentCount: 10, failedCount: 2, status: "PARTIAL" })).toBe("10 remis · 2 échecs");
    expect(announcementTally({ ...base, sentCount: 0, failedCount: 0, status: "FAILED" })).toBe("0 remis · 0 échec");
  });

  it("une annonce simulée compte des messages « simulés », jamais « remis »", () => {
    expect(announcementTally({ ...base, simulated: true, sentCount: 12, failedCount: 0 })).toBe("12 simulés · 0 échec");
    expect(announcementTally({ ...base, simulated: true, sentCount: 1, failedCount: 0 })).toBe("1 simulé · 0 échec");
    expect(announcementTally({ ...base, simulated: true })).not.toContain("remis");
  });

  it("en cours : où en est l'envoi sur le nombre confirmé", () => {
    expect(announcementTally({ status: "SENDING", recipientCount: 300, sentCount: 120, failedCount: 5, simulated: false })).toBe("125 sur 300 traités");
  });
});
