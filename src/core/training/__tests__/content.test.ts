/**
 * Ce qu'on accepte de publier comme formation, et comment on l'affiche.
 *
 * Protège : un lien obligatoire pour une vidéo, un document ou un lien
 * officiel ; une fiche courte avec un vrai texte ; aucune adresse dangereuse
 * (javascript:, data:) ; le quiz annoncé mais non publiable ; des codes produit
 * vérifiés ; l'intégration vidéo réservée aux plateformes connues ; la
 * recherche sans accents et l'ordre du catalogue.
 */
import { describe, expect, it } from "vitest";
import { defaultSourceLabel, formatDuration, isSafeHttpUrl, normalizeTrainingDraft, splitProductCodes, TRAINING_KIND_LABELS } from "../content";
import { displayHost, videoEmbed } from "../video";
import { catalogFacets, filterCatalog, type CatalogItem } from "../catalog";

describe("validation d'un contenu", () => {
  it("accepte un lien officiel et nettoie les champs", () => {
    const result = normalizeTrainingDraft(
      { title: "  Effaclar :   la routine  ", kind: "EXTERNAL_LINK", url: "https://www.laroche-posay.fr/effaclar", laboratory: " L'Oréal ", brand: "La Roche-Posay", rangeName: "Effaclar", universe: "", durationMinutes: "12", sourceLabel: "Lien officiel du laboratoire" },
      "GLOBAL",
    );
    expect(result).toEqual({
      ok: true,
      data: {
        title: "Effaclar : la routine",
        summary: null,
        kind: "EXTERNAL_LINK",
        url: "https://www.laroche-posay.fr/effaclar",
        body: null,
        laboratory: "L'Oréal",
        brandKey: "la roche-posay",
        rangeName: "Effaclar",
        universe: null,
        productCodes: [],
        productIds: [],
        durationMinutes: 12,
        sourceLabel: "Lien officiel du laboratoire",
      },
    });
  });

  it("exige un lien pour une vidéo, un document ou un lien officiel", () => {
    for (const kind of ["VIDEO", "DOCUMENT", "EXTERNAL_LINK"]) {
      const result = normalizeTrainingDraft({ title: "Titre valable", kind }, "GLOBAL");
      expect(result.ok, kind).toBe(false);
      if (!result.ok) expect(result.fieldErrors.url, kind).toBeTruthy();
    }
  });

  it("refuse une adresse qui n'est pas une page web", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://exemple.fr/doc.pdf", "laroche-posay.fr"]) {
      const result = normalizeTrainingDraft({ title: "Titre valable", kind: "EXTERNAL_LINK", url }, "GLOBAL");
      expect(result.ok, url).toBe(false);
      expect(isSafeHttpUrl(url), url).toBe(false);
    }
    expect(isSafeHttpUrl("https://exemple.fr/doc.pdf")).toBe(true);
  });

  it("exige le texte d'une fiche courte et ne garde le texte que pour elle", () => {
    expect(normalizeTrainingDraft({ title: "Fiche magnésium", kind: "SHEET", body: "court" }, "PHARMACY").ok).toBe(false);
    const sheet = normalizeTrainingDraft({ title: "Fiche magnésium", kind: "SHEET", body: "Le magnésium marin se conseille en cure d'un mois." }, "PHARMACY");
    expect(sheet.ok && sheet.data.body).toBe("Le magnésium marin se conseille en cure d'un mois.");
    const link = normalizeTrainingDraft({ title: "Lien magnésium", kind: "EXTERNAL_LINK", url: "https://exemple.fr", body: "texte oublié dans le formulaire" }, "PHARMACY");
    expect(link.ok && link.data.body).toBeNull();
  });

  it("annonce le quiz sans le laisser publier", () => {
    const result = normalizeTrainingDraft({ title: "Quiz solaire", kind: "QUIZ" }, "GLOBAL");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.kind).toMatch(/bientôt/);
  });

  it("vérifie les codes produit d'un contenu PharmaBoost et ignore ceux d'un contenu d'officine", () => {
    expect(splitProductCodes("3400930000014, 3337875545778\n3000001 ;")).toEqual(["3400930000014", "3337875545778", "3000001"]);
    const global = normalizeTrainingDraft({ title: "Titre valable", kind: "EXTERNAL_LINK", url: "https://exemple.fr", productCodes: "3400930000014 3000001 3337875545778" }, "GLOBAL");
    expect(global.ok && global.data.productCodes).toEqual(["3400930000014", "3337875545778"]);
    const wrong = normalizeTrainingDraft({ title: "Titre valable", kind: "EXTERNAL_LINK", url: "https://exemple.fr", productCodes: "3400930000015" }, "GLOBAL");
    expect(!wrong.ok && wrong.fieldErrors.productCodes).toMatch(/3400930000015/);
    const local = normalizeTrainingDraft({ title: "Titre valable", kind: "EXTERNAL_LINK", url: "https://exemple.fr", productCodes: "3400930000014", productIds: ["p1", "p1", " "] }, "PHARMACY");
    expect(local.ok && [local.data.productCodes, local.data.productIds]).toEqual([[], ["p1"]]);
    const globalIds = normalizeTrainingDraft({ title: "Titre valable", kind: "EXTERNAL_LINK", url: "https://exemple.fr", productIds: ["p1"] }, "GLOBAL");
    expect(globalIds.ok && globalIds.data.productIds).toEqual([]);
  });

  it("refuse un univers inconnu et une durée absurde", () => {
    const result = normalizeTrainingDraft({ title: "Titre valable", kind: "EXTERNAL_LINK", url: "https://exemple.fr", universe: "INVENTE", durationMinutes: "0" }, "GLOBAL");
    expect(!result.ok && Object.keys(result.fieldErrors).sort()).toEqual(["durationMinutes", "universe"]);
  });

  it("affiche format, durée et provenance en français", () => {
    expect(TRAINING_KIND_LABELS.SHEET).toBe("Fiche courte");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(8)).toBe("8 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(75)).toBe("1 h 15");
    expect(defaultSourceLabel(true)).toBe("Publié par PharmaBoost");
    expect(defaultSourceLabel(false)).toBe("Ajouté par votre officine");
  });
});

describe("intégration d'une vidéo", () => {
  it("intègre YouTube, Vimeo et Dailymotion par leur lecteur officiel", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ platform: "YOUTUBE", embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.platform).toBe("YOUTUBE");
    expect(videoEmbed("https://vimeo.com/123456789")).toEqual({ platform: "VIMEO", embedUrl: "https://player.vimeo.com/video/123456789" });
    expect(videoEmbed("https://player.vimeo.com/video/123456789")?.platform).toBe("VIMEO");
    expect(videoEmbed("https://www.dailymotion.com/video/x8abc12_routine-peau-seche")).toEqual({ platform: "DAILYMOTION", embedUrl: "https://www.dailymotion.com/embed/video/x8abc12" });
    expect(videoEmbed("https://dai.ly/x8abc12")?.platform).toBe("DAILYMOTION");
  });

  it("n'intègre jamais une autre adresse, même déguisée", () => {
    for (const url of [
      "https://youtube.com.exemple.fr/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=<script>",
      "https://www.youtube.com/channel/UC123",
      "https://www.laboratoire.fr/videos/routine.mp4",
      "javascript:alert(1)",
      "https://vimeo.com/channels/staffpicks",
    ]) {
      expect(videoEmbed(url), url).toBeNull();
    }
  });

  it("affiche le domaine d'un lien externe", () => {
    expect(displayHost("https://www.laroche-posay.fr/effaclar")).toBe("laroche-posay.fr");
    expect(displayHost("pas une adresse")).toBeNull();
  });
});

describe("catalogue de formation", () => {
  const at = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T09:00:00Z`);
  const item = (overrides: Partial<CatalogItem>): CatalogItem => ({ id: "x", title: "Titre", summary: null, laboratory: null, brandKey: null, rangeName: null, universe: null, status: "TODO", updatedAt: at(1), ...overrides });
  const items = [
    item({ id: "fini", title: "Magnésium : les formes", status: "DONE", updatedAt: at(9), laboratory: "Arkopharma" }),
    item({ id: "neuf", title: "Probiotiques au comptoir", updatedAt: at(8), universe: "COMPLEMENTS_ALIMENTAIRES", laboratory: "arkopharma" }),
    item({ id: "ancien", title: "Douleur articulaire", updatedAt: at(2), universe: "DOULEUR" }),
    item({ id: "encours", title: "Préparateur : la peau sèche", status: "IN_PROGRESS", updatedAt: at(1), summary: "Routine émolliente", brandKey: "avene" }),
  ];

  it("met en tête ce qui est en cours, puis à faire (récent d'abord), puis terminé", () => {
    expect(filterCatalog(items, {}).map((i) => i.id)).toEqual(["encours", "neuf", "ancien", "fini"]);
  });

  it("cherche sans accents ni casse, le titre avant le reste", () => {
    expect(filterCatalog(items, { q: "preparateur" }).map((i) => i.id)).toEqual(["encours"]);
    expect(filterCatalog(items, { q: "EMOLLIENTE" }).map((i) => i.id)).toEqual(["encours"]);
    expect(filterCatalog(items, { q: "complements" }).map((i) => i.id)).toEqual(["neuf"]);
    expect(filterCatalog(items, { q: "magn" }).map((i) => i.id)).toEqual(["fini"]);
    expect(filterCatalog(items, { q: "rien de tel" })).toEqual([]);
  });

  it("filtre par laboratoire (sans casse), univers et statut", () => {
    expect(filterCatalog(items, { laboratory: "ARKOPHARMA" }).map((i) => i.id)).toEqual(["neuf", "fini"]);
    expect(filterCatalog(items, { universe: "DOULEUR" }).map((i) => i.id)).toEqual(["ancien"]);
    expect(filterCatalog(items, { status: "DONE" }).map((i) => i.id)).toEqual(["fini"]);
    expect(filterCatalog(items, { status: "nimporte" })).toHaveLength(4);
  });

  it("ne propose dans les filtres que les valeurs présentes", () => {
    expect(catalogFacets(items)).toEqual({ laboratories: ["Arkopharma"], universes: ["COMPLEMENTS_ALIMENTAIRES", "DOULEUR"] });
  });
});
