import type { OCRProvider, OcrInput, ProviderInfo } from "../ports";
import type { ExtractedField, ExtractedPrescription, ExtractedPrescriptionLine } from "../types";

/**
 * Fournisseur OCR SIMULÉ.
 *
 * ⚠️ Il ne lit AUCUNE image. Il restitue un scénario fictif prédéfini afin de
 * dérouler le parcours complet en démonstration. `isSimulated` est à `true` et
 * l'interface l'affiche explicitement : aucune donnée produite ici ne doit être
 * présentée comme le résultat d'une lecture réelle d'ordonnance.
 *
 * Le branchement d'un OCR réel consiste à écrire un adaptateur implémentant la
 * même interface `OCRProvider`, sans toucher au moteur métier.
 */

function field<T>(value: T | null, confidence: number, unreadable = false): ExtractedField<T> {
  return { value, confidence, unreadable };
}

export type DemoScenario = {
  id: string;
  label: string;
  description: string;
  prescriberName: string;
  prescriberRpps: string;
  lines: {
    drugName: string;
    dosage: string | null;
    form: string | null;
    posology: string | null;
    durationDays: number | null;
    quantity: number | null;
    instructions: string | null;
    /** Confiance simulée sur le nom du médicament. */
    nameConfidence?: number;
    /** Champs volontairement illisibles, pour montrer le garde-fou. */
    unreadable?: ("dosage" | "posology" | "form" | "instructions")[];
  }[];
};

/** Scénarios fictifs de démonstration — aucun patient réel, aucune ordonnance réelle. */
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "antibio-amoxicilline",
    label: "Antibiothérapie — Amoxicilline",
    description:
      "Ordonnance fictive : angine bactérienne. Illustre le conseil de tolérance digestive et un champ posologie partiellement lisible.",
    prescriberName: "Dr CamilleRousseau",
    prescriberRpps: "10001234567",
    lines: [
      {
        drugName: "Amoxicilline",
        dosage: "1 g",
        form: "Comprimé dispersible",
        posology: "1 comprimé matin et soir",
        durationDays: 6,
        quantity: 12,
        instructions: "Au cours des repas",
        nameConfidence: 0.97,
      },
      {
        drugName: "Paracétamol",
        dosage: "1 g",
        form: "Comprimé",
        posology: null,
        durationDays: 5,
        quantity: 16,
        instructions: null,
        nameConfidence: 0.94,
        unreadable: ["posology"],
      },
    ],
  },
  {
    id: "dermato-eczema",
    label: "Dermatologie — poussée d'eczéma",
    description:
      "Ordonnance fictive : dermocorticoïde. Illustre le conseil d'accompagnement cutané.",
    prescriberName: "Dr Antoine Mercier",
    prescriberRpps: "10007654321",
    lines: [
      {
        drugName: "Bétaméthasone",
        dosage: "0,05 %",
        form: "Crème",
        posology: "1 application par jour le soir",
        durationDays: 10,
        quantity: 1,
        instructions: "Sur les zones atteintes uniquement",
        nameConfidence: 0.92,
      },
      {
        drugName: "Cétirizine",
        dosage: "10 mg",
        form: "Comprimé",
        posology: "1 comprimé le soir",
        durationDays: 14,
        quantity: 14,
        instructions: null,
        nameConfidence: 0.96,
      },
    ],
  },
  {
    id: "cycline-acne",
    label: "Dermatologie — traitement par cycline",
    description:
      "Ordonnance fictive : illustre un conseil de sécurité (photosensibilisation) prioritaire sur un conseil de confort.",
    prescriberName: "Dr Sophie Lemaire",
    prescriberRpps: "10002223334",
    lines: [
      {
        drugName: "Doxycycline",
        dosage: "100 mg",
        form: "Comprimé",
        posology: "1 comprimé par jour",
        durationDays: 60,
        quantity: 30,
        instructions: "Avec un grand verre d'eau, ne pas s'allonger après la prise",
        nameConfidence: 0.95,
      },
    ],
  },
  {
    id: "fer-anemie",
    label: "Supplémentation martiale",
    description:
      "Ordonnance fictive : illustre le conseil d'accompagnement du transit et une lecture incertaine du dosage.",
    prescriberName: "Dr Nadia Bouchard",
    prescriberRpps: "10009998887",
    lines: [
      {
        drugName: "Fumarate de fer",
        dosage: null,
        form: "Gélule",
        posology: "1 gélule par jour à jeun",
        durationDays: 90,
        quantity: 30,
        instructions: "À distance du thé et du café",
        nameConfidence: 0.88,
        unreadable: ["dosage"],
      },
    ],
  },
  {
    id: "ains-lombalgie",
    label: "Anti-inflammatoire — lombalgie",
    description:
      "Ordonnance fictive : illustre le conseil de confort gastrique et la vérification d'une protection déjà prescrite.",
    prescriberName: "Dr Julien Petit",
    prescriberRpps: "10005556667",
    lines: [
      {
        drugName: "Ibuprofène",
        dosage: "400 mg",
        form: "Comprimé",
        posology: "1 comprimé 3 fois par jour",
        durationDays: 5,
        quantity: 30,
        instructions: "Au cours des repas",
        nameConfidence: 0.96,
      },
      {
        drugName: "Thiocolchicoside",
        dosage: "4 mg",
        form: "Comprimé",
        posology: "1 comprimé matin et soir",
        durationDays: 5,
        quantity: 10,
        instructions: null,
        nameConfidence: 0.83,
      },
    ],
  },
];

export class MockOCRProvider implements OCRProvider {
  readonly info: ProviderInfo = {
    id: "mock-ocr",
    label: "OCR simulé (démonstration)",
    capability: "SIMULATED",
    description:
      "Aucune image n'est analysée. Un scénario fictif prédéfini est restitué pour dérouler le parcours complet.",
  };

  async extract(input: OcrInput): Promise<ExtractedPrescription> {
    const scenario =
      DEMO_SCENARIOS.find((s) => s.id === input.demoScenarioId) ??
      pickScenarioFromFileName(input.fileName) ??
      DEMO_SCENARIOS[0];

    const lines: ExtractedPrescriptionLine[] = scenario.lines.map((line, index) => {
      const unreadable = new Set(line.unreadable ?? []);
      const nameConfidence = line.nameConfidence ?? 0.95;

      return {
        position: index,
        rawText: [line.drugName, line.dosage, line.posology].filter(Boolean).join(" — "),
        drugName: field(line.drugName, nameConfidence),
        dosage: unreadable.has("dosage")
          ? field<string>(null, 0, true)
          : field(line.dosage, line.dosage ? 0.93 : 0),
        form: unreadable.has("form")
          ? field<string>(null, 0, true)
          : field(line.form, line.form ? 0.91 : 0),
        posology: unreadable.has("posology")
          ? field<string>(null, 0, true)
          : field(line.posology, line.posology ? 0.9 : 0),
        durationDays: field(line.durationDays, line.durationDays ? 0.87 : 0),
        quantity: field(line.quantity, line.quantity ? 0.89 : 0),
        instructions: unreadable.has("instructions")
          ? field<string>(null, 0, true)
          : field(line.instructions, line.instructions ? 0.86 : 0),
      };
    });

    const confidences = lines.flatMap((line) =>
      [line.drugName, line.dosage, line.posology]
        .filter((f) => !f.unreadable && f.value !== null)
        .map((f) => f.confidence),
    );
    const overallConfidence = confidences.length
      ? Number((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(3))
      : 0;

    const warnings = ["Extraction simulée : aucune image n'a été analysée."];
    const unreadableCount = lines.reduce(
      (sum, line) =>
        sum +
        [line.dosage, line.form, line.posology, line.instructions].filter(
          (f) => f.unreadable,
        ).length,
      0,
    );
    if (unreadableCount > 0) {
      warnings.push(
        `${unreadableCount} champ(s) marqué(s) illisible(s) : aucune valeur n'a été supposée.`,
      );
    }

    return {
      prescriberName: field(scenario.prescriberName, 0.9),
      prescriberRpps: field(scenario.prescriberRpps, 0.82),
      prescribedAt: field(new Date().toISOString().slice(0, 10), 0.85),
      patientName: field<string>(null, 0, true),
      lines,
      overallConfidence,
      providerId: this.info.id,
      isSimulated: true,
      warnings,
    };
  }
}

function pickScenarioFromFileName(fileName: string | null): DemoScenario | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  return (
    DEMO_SCENARIOS.find((s) => lower.includes(s.id)) ??
    DEMO_SCENARIOS.find((s) =>
      s.lines.some((l) => lower.includes(l.drugName.toLowerCase().slice(0, 6))),
    ) ??
    null
  );
}
