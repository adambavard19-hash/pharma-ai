import { describe, expect, it } from "vitest";
import { POST_PRESENCE_MS, postDrawsRobot, robotLivesOnLinkedPost, type LinkedPost } from "../single-robot";

/**
 * 1 robot pour 1 espace : l'espace dans le navigateur ne s'efface QUE sur le navigateur lié (cookie signé) à un poste
 * de la pharmacie de la session, qui dessine le robot en ce moment. Le PC du bureau sans logiciel, un Mac, un
 * téléphone — même derrière la même box — n'ont pas de lien : ils gardent leur robot. Dans le doute, le robot reste.
 */

const NOW = new Date("2026-10-13T10:00:00Z");
const PHARMACY = "ph_port";
const OTHER = "ph_gare";
const LINK = { postId: "post_1", pharmacyId: PHARMACY };
const post = (over: Partial<LinkedPost> = {}): LinkedPost => ({ pharmacyId: PHARMACY, revokedAt: null, pairedAt: new Date("2026-10-01T08:00:00Z"), robotShownAt: new Date(NOW.getTime() - 50_000), ...over });
const decide = (over: { link?: typeof LINK | null; post?: LinkedPost | null; sessionPharmacyId?: string } = {}) =>
  robotLivesOnLinkedPost({ sessionPharmacyId: over.sessionPharmacyId ?? PHARMACY, link: over.link === undefined ? LINK : over.link, post: over.post === undefined ? post() : over.post, now: NOW });

describe("la fenêtre du poste dessine-t-elle le robot ?", () => {
  it("l'île et la bannière : oui ; l'ancienne fenêtre, la notification seule, rien, un ancien agent muet, une valeur piégée : non", () => {
    expect(postDrawsRobot("ile")).toBe(true);
    expect(postDrawsRobot("banniere")).toBe(true);
    for (const value of ["classique", "notification", "aucune", undefined, null, "", "ILE", ["ile"], { fenetre: "ile" }, 1]) expect(postDrawsRobot(value)).toBe(false);
  });
});

describe("le robot de l'espace s'efface-t-il sur ce navigateur ?", () => {
  it("navigateur lié à un poste de la pharmacie de la session, qui dessine le robot à l'instant : oui", () => {
    expect(decide()).toBe(true);
    expect(decide({ post: post({ robotShownAt: new Date(NOW.getTime() - POST_PRESENCE_MS) }) })).toBe(true);
  });

  it("PC sans logiciel (aucun lien) : non — même sur le réseau de la pharmacie, même sous Windows", () => {
    expect(decide({ link: null })).toBe(false);
  });

  it("lien d'une AUTRE pharmacie (session d'un groupe, cookie d'ailleurs) : non", () => {
    expect(decide({ link: { postId: "post_1", pharmacyId: OTHER } })).toBe(false);
    expect(decide({ sessionPharmacyId: OTHER })).toBe(false);
    expect(decide({ post: post({ pharmacyId: OTHER }) })).toBe(false);
  });

  it("poste retiré, pas encore relié, ou introuvable : non", () => {
    expect(decide({ post: post({ revokedAt: new Date("2026-10-12T18:00:00Z") }) })).toBe(false);
    expect(decide({ post: post({ pairedAt: null }) })).toBe(false);
    expect(decide({ post: null })).toBe(false);
  });

  it("poste qui ne dessine pas le robot (ancienne fenêtre, notification) ou éteint depuis plus de 3 minutes : non, l'espace garde le sien", () => {
    expect(decide({ post: post({ robotShownAt: null }) })).toBe(false);
    expect(decide({ post: post({ robotShownAt: new Date(NOW.getTime() - POST_PRESENCE_MS - 1) }) })).toBe(false);
    expect(decide({ post: post({ robotShownAt: new Date(NOW.getTime() - 3_600_000) }) })).toBe(false);
  });

  it("une session sans pharmacie ne s'efface jamais", () => {
    expect(decide({ sessionPharmacyId: "" })).toBe(false);
  });
});
