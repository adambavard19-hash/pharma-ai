import { describe, expect, it } from "vitest";
import { NEWS_LIMITS } from "../constants";
import { newsRetentionCutoff, nextAnnouncementAllowedAt, validateAnnouncement } from "../validate";

/**
 * Ce qu'une annonce a le droit de contenir. Chaque refus protège le patient :
 * pas de lien libre, pas d'adresse, pas de personnalisation, pas de langage de
 * santé.
 */

const VALID = { title: "Une nouvelle gamme est arrivée", rangeLabel: "Gamme Solaire", message: "Découvrez notre nouvelle gamme de soins solaires, disponible dès aujourd'hui en pharmacie." };

function refused(raw: Parameters<typeof validateAnnouncement>[0]): string {
  const result = validateAnnouncement(raw);
  if (result.ok) throw new Error("l'annonce aurait dû être refusée");
  return result.error;
}

describe("une annonce valide", () => {
  it("est acceptée telle quelle", () => {
    expect(validateAnnouncement(VALID)).toEqual({ ok: true, value: VALID });
  });

  it("garde les paragraphes du message et nettoie les espaces", () => {
    const result = validateAnnouncement({ ...VALID, title: "  Une   gamme\n arrivée ", message: "Premier paragraphe.  \r\n\r\n\r\n\r\nSecond paragraphe.\n" });
    expect(result).toEqual({ ok: true, value: { title: "Une gamme arrivée", rangeLabel: "Gamme Solaire", message: "Premier paragraphe.\n\nSecond paragraphe." } });
  });

  it("la gamme est facultative : absente, vide ou nulle, elle devient null", () => {
    for (const rangeLabel of [undefined, null, "", "   "]) {
      expect(validateAnnouncement({ ...VALID, rangeLabel })).toMatchObject({ ok: true, value: { rangeLabel: null } });
    }
  });

  it("un objet reste sur une ligne : un saut de ligne dans un objet d'e-mail ouvre la porte à l'injection d'en-têtes", () => {
    const result = validateAnnouncement({ ...VALID, title: "Nouveauté\r\nBcc: tout le monde" });
    expect(result).toMatchObject({ ok: true, value: { title: "Nouveauté Bcc: tout le monde" } });
  });

  it("retire les caractères de contrôle", () => {
    const result = validateAnnouncement({ ...VALID, message: "Nouvelle\u0000 gamme\u0007 arrivée" });
    expect(result).toMatchObject({ ok: true, value: { message: "Nouvelle gamme arrivée" } });
  });

  it("un nom de laboratoire qui ressemble à un mot interdit passe (Guérin n'est pas une guérison)", () => {
    expect(validateAnnouncement({ ...VALID, rangeLabel: "Laboratoires Guérin" }).ok).toBe(true);
    expect(validateAnnouncement({ ...VALID, message: "Une gamme venue de Guérande, comme sa fleur de sel." }).ok).toBe(true);
  });
});

describe("longueurs", () => {
  it("l'objet, la gamme et le message ont chacun leur limite, inclusive", () => {
    expect(validateAnnouncement({ ...VALID, title: "a".repeat(NEWS_LIMITS.title) }).ok).toBe(true);
    expect(refused({ ...VALID, title: "a".repeat(NEWS_LIMITS.title + 1) })).toContain("L'objet est trop long");
    expect(validateAnnouncement({ ...VALID, rangeLabel: "a".repeat(NEWS_LIMITS.range) }).ok).toBe(true);
    expect(refused({ ...VALID, rangeLabel: "a".repeat(NEWS_LIMITS.range + 1) })).toContain("Le nom de la gamme est trop long");
    expect(validateAnnouncement({ ...VALID, message: "a".repeat(NEWS_LIMITS.message) }).ok).toBe(true);
    expect(refused({ ...VALID, message: "a".repeat(NEWS_LIMITS.message + 1) })).toContain("Le message est trop long");
  });

  it("l'objet et le message sont obligatoires, une chaîne d'espaces ne compte pas", () => {
    expect(refused({ ...VALID, title: "   " })).toBe("Donnez un objet à l'annonce.");
    expect(refused({ ...VALID, message: " \n " })).toBe("Écrivez le message de l'annonce.");
    expect(refused({})).toBe("Donnez un objet à l'annonce.");
  });

  it("refuse ce qui n'est pas du texte", () => {
    expect(refused({ ...VALID, title: 42 })).toBe("Donnez un objet à l'annonce.");
    expect(refused({ ...VALID, message: { texte: "x" } })).toBe("Écrivez le message de l'annonce.");
    expect(refused({ ...VALID, rangeLabel: 42 })).toBe("Le nom de la gamme n'est pas valide.");
  });
});

describe("aucun lien libre", () => {
  const ADDRESSES = ["https://exemple.fr/promo", "http://exemple.fr", "//exemple.fr", "www.marque.fr", "marque.com", "MARQUE.COM", "marque.shop", "bit.ly/abc"];

  for (const address of ADDRESSES) {
    it(`refuse « ${address} » dans le message, l'objet et le nom de la gamme`, () => {
      expect(refused({ ...VALID, message: `Voir ${address} pour en savoir plus` })).toContain("adresse web");
      expect(refused({ ...VALID, title: `Promo ${address}` })).toContain("adresse web");
      expect(refused({ ...VALID, rangeLabel: address })).toContain("adresse web");
    });
  }

  it("ne confond pas un nombre ou une phrase avec une adresse", () => {
    expect(validateAnnouncement({ ...VALID, message: "Disponible dès 9,90 euros. À très vite, nous vous attendons chez nous." }).ok).toBe(true);
  });
});

describe("aucune adresse e-mail, aucune variable", () => {
  it("refuse une adresse e-mail où que ce soit", () => {
    expect(refused({ ...VALID, message: "Écrivez-nous à contact@marque.fr" })).toContain("adresse e-mail");
    expect(refused({ ...VALID, title: "info@marque.fr" })).toContain("adresse e-mail");
    expect(refused({ ...VALID, rangeLabel: "a@b" })).toContain("adresse e-mail");
  });

  it("refuse toute variable {{…}} : une annonce n'est pas personnalisée", () => {
    expect(refused({ ...VALID, message: "Bonjour {{prenom}}, une gamme est arrivée." })).toContain("variable");
    expect(refused({ ...VALID, title: "{{ nom }}, du nouveau" })).toContain("variable");
    expect(refused({ ...VALID, rangeLabel: "{{gamme}}" })).toContain("variable");
  });
});

describe("aucun langage de santé", () => {
  const CLAIMS = ["sur ordonnance", "SUR ORDONNANCE", "ordonnances", "sur prescription", "prescrit", "remboursé", "REMBOURSEMENT", "remboursable", "guérit", "guérir", "guérison", "traitement contre le rhume", "traitements pour la peau"];

  for (const claim of CLAIMS) {
    it(`refuse « ${claim} »`, () => {
      const error = refused({ ...VALID, message: `Une gamme ${claim} arrive.` });
      expect(error).toContain("ordonnance");
      expect(error).toContain("guérison");
    });
  }

  it("la règle s'applique aussi à l'objet et au nom de la gamme", () => {
    expect(refused({ ...VALID, title: "Remboursé dès demain" })).toContain("L'objet");
    expect(refused({ ...VALID, rangeLabel: "Guérit tout" })).toContain("Le nom de la gamme");
  });

  it("l'absence d'accent ne la contourne pas", () => {
    expect(refused({ ...VALID, message: "Rembourse par la secu" })).toContain("remboursement");
    expect(refused({ ...VALID, message: "Ca guerit vite" })).toContain("guérison");
  });
});

describe("nextAnnouncementAllowedAt : une annonce tous les 7 jours au plus", () => {
  const now = new Date("2026-10-14T10:00:00Z");

  it("aucune annonce avant : permis maintenant", () => {
    expect(nextAnnouncementAllowedAt(null, now)).toBeNull();
  });

  it("une annonce récente : la date de la prochaine, 7 jours après", () => {
    const last = new Date("2026-10-10T08:00:00Z");
    expect(nextAnnouncementAllowedAt(last, now)).toEqual(new Date("2026-10-17T08:00:00Z"));
  });

  it("à la minute près : 7 jours moins une seconde, c'est encore trop tôt ; 7 jours pile, c'est permis", () => {
    expect(nextAnnouncementAllowedAt(new Date(now.getTime() - 7 * 86_400_000 + 1000), now)).not.toBeNull();
    expect(nextAnnouncementAllowedAt(new Date(now.getTime() - 7 * 86_400_000), now)).toBeNull();
  });

  it("une annonce ancienne ne bloque rien", () => {
    expect(nextAnnouncementAllowedAt(new Date("2026-08-01T00:00:00Z"), now)).toBeNull();
  });
});

describe("newsRetentionCutoff : 36 mois", () => {
  it("trois ans calendaires avant maintenant", () => {
    expect(newsRetentionCutoff(new Date("2026-10-04T10:15:00Z"))).toEqual(new Date("2023-10-04T10:15:00Z"));
    expect(newsRetentionCutoff(new Date("2026-03-31T00:00:00Z"))).toEqual(new Date("2023-03-31T00:00:00Z"));
  });

  it("le 29 février redescend au 28 plutôt que de sauter au 1er mars", () => {
    expect(newsRetentionCutoff(new Date("2028-02-29T09:00:00Z"))).toEqual(new Date("2025-02-28T09:00:00Z"));
  });

  it("un consentement du jour même n'est pas périmé, celui d'il y a plus de 36 mois l'est", () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const cutoff = newsRetentionCutoff(now);
    expect(new Date("2023-10-05T00:00:00Z") < cutoff).toBe(false);
    expect(new Date("2023-10-03T00:00:00Z") < cutoff).toBe(true);
  });
});
