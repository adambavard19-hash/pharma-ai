import { describe, expect, it, vi } from "vitest";
import { VisionOCRProvider, type MessagesCreate } from "../ocr-vision";
import { chooseOCRProvider } from "../ocr-factory";
import { EXTRACTION_TOOL_NAME } from "../../../extraction";

/**
 * L'adaptateur transporte, il ne décide pas. Ces tests vérifient qu'il envoie
 * la bonne requête, qu'il ne lève jamais, et qu'aucun échec ne se transforme en
 * ordonnance vide silencieuse. Aucun test n'appelle le réseau.
 */

const CONFIG = { apiKey: "cle-de-test", model: "claude-opus-5" };
const IMAGE = new Uint8Array([137, 80, 78, 71]);

function reponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: EXTRACTION_TOOL_NAME, input }],
    stop_reason: "tool_use",
  };
}

const LECTURE = {
  prescripteur: { valeur: "Dr Martin", lu_tel_quel: "Dr MARTIN", confiance: 0.9 },
  rpps: { valeur: null, lu_tel_quel: null, confiance: null },
  date_prescription: { valeur: "2026-08-01", lu_tel_quel: "01/08/2026", confiance: 0.95 },
  patient: { valeur: null, lu_tel_quel: null, confiance: null },
  lignes: [
    {
      medicament: { valeur: "Amoxicilline", lu_tel_quel: "AMOXICILLINE 1g", confiance: 0.96 },
      dosage: { valeur: "1 g", lu_tel_quel: "1g", confiance: 0.94 },
      forme: { valeur: null, lu_tel_quel: null, confiance: null },
      posologie: { valeur: "1 matin et soir", lu_tel_quel: "1 cp matin et soir", confiance: 0.9 },
      duree_jours: { valeur: "6", lu_tel_quel: "pendant 6 jours", confiance: 0.92 },
      quantite: { valeur: null, lu_tel_quel: null, confiance: null },
      instructions: { valeur: null, lu_tel_quel: null, confiance: null },
    },
  ],
};

describe("lecture par modèle de vision", () => {
  it("envoie l'image et impose le schéma strict", async () => {
    const create = vi.fn(async () => reponse(LECTURE)) as unknown as MessagesCreate;
    const provider = new VisionOCRProvider(CONFIG, create);

    const result = await provider.extract({
      fileKey: "k",
      mimeType: "image/png",
      fileName: "ordo.png",
      bytes: IMAGE,
    });

    const params = (create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    const image = (params.messages[0] as { content: { type: string }[] }).content[0] as {
      type: string;
      source: { type: string; media_type: string; data: string };
    };
    expect(image.type).toBe("image");
    expect(image.source.media_type).toBe("image/png");
    expect(image.source.data).toBe(Buffer.from(IMAGE).toString("base64"));

    const tool = params.tools[0] as { name: string; strict: boolean };
    expect(tool.name).toBe(EXTRACTION_TOOL_NAME);
    expect(tool.strict).toBe(true);
    expect(params.tool_choice).toEqual({ type: "tool", name: EXTRACTION_TOOL_NAME });

    expect(result.lines[0].drugName.value).toBe("Amoxicilline");
    expect(result.isSimulated).toBe(false);
  });

  it("n'appelle rien quand aucune image n'est disponible", async () => {
    const create = vi.fn() as unknown as MessagesCreate;
    const result = await new VisionOCRProvider(CONFIG, create).extract({
      fileKey: null,
      mimeType: null,
      fileName: null,
    });
    expect(create).not.toHaveBeenCalled();
    expect(result.lines).toEqual([]);
    expect(result.warnings[0]).toContain("Aucune image");
  });

  it("refuse un format non pris en charge plutôt que de tenter sa chance", async () => {
    const create = vi.fn() as unknown as MessagesCreate;
    const result = await new VisionOCRProvider(CONFIG, create).extract({
      fileKey: "k",
      mimeType: "application/pdf",
      fileName: "ordo.pdf",
      bytes: IMAGE,
    });
    expect(create).not.toHaveBeenCalled();
    expect(result.warnings[0]).toContain("application/pdf");
  });

  it("ne lève jamais sur une panne : l'ordonnance repart en saisie manuelle", async () => {
    const create = (async () => {
      throw new Error("503 service indisponible");
    }) as unknown as MessagesCreate;

    const result = await new VisionOCRProvider(CONFIG, create).extract({
      fileKey: "k",
      mimeType: "image/jpeg",
      fileName: "ordo.jpg",
      bytes: IMAGE,
    });
    expect(result.lines).toEqual([]);
    expect(result.warnings[0]).toContain("503");
    expect(result.warnings[0]).toContain("saisie manuellement");
  });

  it("traite un refus du modèle comme un échec explicite", async () => {
    const create = (async () => ({
      content: [],
      stop_reason: "refusal",
      stop_details: { category: "other", explanation: "image illisible" },
    })) as unknown as MessagesCreate;

    const result = await new VisionOCRProvider(CONFIG, create).extract({
      fileKey: "k",
      mimeType: "image/jpeg",
      fileName: "ordo.jpg",
      bytes: IMAGE,
    });
    expect(result.warnings[0]).toContain("refusé");
    expect(result.warnings[0]).toContain("image illisible");
  });

  it("ne se contente pas d'une réponse sans outil", async () => {
    const create = (async () => ({
      content: [{ type: "text" }],
      stop_reason: "end_turn",
    })) as unknown as MessagesCreate;

    const result = await new VisionOCRProvider(CONFIG, create).extract({
      fileKey: "k",
      mimeType: "image/png",
      fileName: "ordo.png",
      bytes: IMAGE,
    });
    expect(result.lines).toEqual([]);
    expect(result.warnings[0]).toContain("aucune lecture exploitable");
  });

  it("ne laisse pas fuir la clé dans un message d'erreur", async () => {
    const create = (async () => {
      throw new Error("authentification refusée");
    }) as unknown as MessagesCreate;

    const provider = new VisionOCRProvider(CONFIG, create);
    const result = await provider.extract({
      fileKey: "k",
      mimeType: "image/png",
      fileName: "o.png",
      bytes: IMAGE,
    });
    expect(`${provider.info.description}${result.warnings.join(" ")}`).not.toContain(
      "cle-de-test",
    );
  });

  it("rapporte ce qui a été écarté, pour le journal", async () => {
    const create = (async () =>
      reponse({
        ...LECTURE,
        lignes: [
          {
            ...LECTURE.lignes[0],
            posologie: { valeur: "1 matin et soir", lu_tel_quel: null, confiance: 0.99 },
          },
        ],
      })) as unknown as MessagesCreate;

    const { rejected, extraction } = await new VisionOCRProvider(CONFIG, create).extractDetailed({
      fileKey: "k",
      mimeType: "image/png",
      fileName: "o.png",
      bytes: IMAGE,
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].field).toBe("posologie");
    expect(extraction.lines[0].posology.value).toBeNull();
  });
});

describe("autorisation de sortie de l'image", () => {
  it("sans clé ET sans autorisation, rien ne part et l'écran le dit", () => {
    const provider = chooseOCRProvider({ provider: "anthropic" });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("ANTHROPIC_API_KEY");
    expect(provider.info.description).toContain("OCR_SEND_IMAGES_EXTERNALLY");
    expect(provider.info.description).toContain("Aucune image n'est transmise");
  });

  it("une clé seule ne suffit PAS à faire sortir une ordonnance", () => {
    // Le point du lot : choisir un fournisseur n'est pas trancher où va une
    // donnée de santé.
    const provider = chooseOCRProvider({ provider: "anthropic", apiKey: "cle" });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("OCR_SEND_IMAGES_EXTERNALLY");
  });

  it("une autorisation sans clé ne suffit pas davantage", () => {
    const provider = chooseOCRProvider({ provider: "anthropic", sendImagesExternally: true });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("ANTHROPIC_API_KEY");
  });

  it("les deux réunies activent la lecture réelle", () => {
    const provider = chooseOCRProvider({
      provider: "anthropic",
      apiKey: "cle",
      sendImagesExternally: true,
      model: "claude-opus-5",
    });
    expect(provider.info.capability).toBe("LIVE");
    expect(provider.info.id).toBe("anthropic:claude-opus-5");
  });

  it("un fournisseur non implémenté ne devient jamais une lecture silencieuse", () => {
    const provider = chooseOCRProvider({
      provider: "tesseract",
      apiKey: "cle",
      sendImagesExternally: true,
    });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.description).toContain("tesseract");
  });

  it("le mode démonstration reste le défaut, sans avertissement inutile", () => {
    const provider = chooseOCRProvider({ provider: "mock" });
    expect(provider.info.capability).toBe("SIMULATED");
    expect(provider.info.label).toBe("OCR simulé (démonstration)");
  });
});
