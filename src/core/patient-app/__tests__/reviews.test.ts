import { describe, expect, it } from "vitest";
import { averageRating, cleanReview, testimonialSentence } from "../reviews";

describe("avis des patients", () => {
  it("refuse une note hors 1 à 5", () => {
    expect(cleanReview({ rating: 0, tags: [], staffUserId: null, publicConsent: false, publicName: "" }).ok).toBe(false);
    expect(cleanReview({ rating: 6, tags: [], staffUserId: null, publicConsent: false, publicName: "" }).ok).toBe(false);
  });

  it("ne garde que les mots de la liste, sans doublon", () => {
    const result = cleanReview({ rating: 5, tags: ["conseil", "conseil", "j'ai de l'eczéma", "ecoute"], staffUserId: null, publicConsent: false, publicName: "" });
    expect(result.ok && result.review.tags).toEqual(["conseil", "ecoute"]);
  });

  it("n'accepte la publication qu'à partir de 4 étoiles, avec un prénom nettoyé", () => {
    const low = cleanReview({ rating: 3, tags: ["conseil"], staffUserId: null, publicConsent: true, publicName: "Marie" });
    expect(low.ok && low.review.publicConsent).toBe(false);
    expect(low.ok && low.review.publicName).toBeNull();
    const high = cleanReview({ rating: 5, tags: ["conseil"], staffUserId: null, publicConsent: true, publicName: " Marie 06 12 <b> " });
    expect(high.ok && high.review.publicName).toBe("Marie b");
  });

  it("fait une phrase de témoignage avec les seuls mots positifs", () => {
    expect(testimonialSentence(["conseil", "attente", "ecoute"])).toBe("Très bon conseil, à l'écoute.");
    expect(testimonialSentence(["attente"])).toBeNull();
  });

  it("calcule la moyenne au dixième", () => {
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([])).toBeNull();
  });
});
