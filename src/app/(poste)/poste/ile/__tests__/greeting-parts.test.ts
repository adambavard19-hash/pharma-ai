import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { greetingParts } = await import("../poste-island");

/** Le bonjour du poste, habillé comme « Bravo ! » : un titre doré, puis le reste du message (fondateur, 15 oct. 2026). */
describe("le bonjour du poste : titre et texte", () => {
  it("avec le prénom", () => {
    expect(greetingParts("Bonjour Léa, comment vas-tu ? Bon courage pour tes conseils ! N’hésite pas si tu as besoin de quoi que ce soit 😊")).toEqual({
      title: "Bonjour Léa !",
      body: "Comment vas-tu ? Bon courage pour tes conseils ! N’hésite pas si tu as besoin de quoi que ce soit 😊",
    });
  });

  it("sans prénom", () => {
    expect(greetingParts("Bonjour, comment vas-tu ?").title).toBe("Bonjour !");
  });

  it("un autre texte reste entier en titre", () => {
    expect(greetingParts("Bienvenue")).toEqual({ title: "Bienvenue", body: "" });
  });
});
