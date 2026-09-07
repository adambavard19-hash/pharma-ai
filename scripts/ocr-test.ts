/**
 * Test ISOLÉ du lecteur d'ordonnance : une vraie image → le provider → le JSON.
 *
 * Ne touche ni à la base, ni au stockage, ni au reste de l'application. Son but
 * est de répondre à une seule question, sans ambiguïté : est-ce que le modèle de
 * vision lit réellement cette ordonnance ?
 *
 *   npm run ocr:test -- /chemin/vers/ordonnance.jpg
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { getOCRProvider } from "@/server/ai/registry";
import { getEnv } from "@/config/env";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

function titre(texte: string) {
  console.log(`\n${"─".repeat(64)}\n${texte}\n${"─".repeat(64)}`);
}

async function main() {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error("Usage : npm run ocr:test -- /chemin/vers/ordonnance.jpg");
    process.exit(1);
  }

  const env = getEnv();

  titre("1. CONFIGURATION");
  console.log(`  OCR_PROVIDER                 : ${env.OCR_PROVIDER}`);
  console.log(`  OCR_MODEL                    : ${env.OCR_MODEL}`);
  console.log(
    `  ANTHROPIC_API_KEY            : ${
      env.ANTHROPIC_API_KEY ? `présente (${env.ANTHROPIC_API_KEY.length} caractères)` : "ABSENTE"
    }`,
  );
  console.log(`  OCR_SEND_IMAGES_EXTERNALLY   : ${env.OCR_SEND_IMAGES_EXTERNALLY}`);

  const provider = getOCRProvider();
  titre("2. PROVIDER RÉELLEMENT SÉLECTIONNÉ");
  console.log(`  id          : ${provider.info.id}`);
  console.log(`  libellé     : ${provider.info.label}`);
  console.log(`  capacité    : ${provider.info.capability}`);
  console.log(`  description : ${provider.info.description}`);

  if (provider.info.capability !== "LIVE") {
    titre("ARRÊT — AUCUNE LECTURE RÉELLE N'EST POSSIBLE");
    console.log("  Le provider sélectionné ne lit pas les images.");
    console.log("  Aucun appel réseau n'a été tenté, aucune donnée inventée.");
    console.log("\n  À configurer dans .env :");
    console.log('    OCR_PROVIDER="anthropic"');
    console.log('    ANTHROPIC_API_KEY="sk-ant-…"');
    console.log('    OCR_SEND_IMAGES_EXTERNALLY="true"');
    process.exit(2);
  }

  titre("3. FICHIER");
  const bytes = new Uint8Array(readFileSync(chemin));
  const mimeType = TYPES[extname(chemin).toLowerCase()] ?? "";
  console.log(`  nom     : ${basename(chemin)}`);
  console.log(`  taille  : ${(bytes.length / 1024).toFixed(0)} Ko`);
  console.log(`  type    : ${mimeType || "INCONNU"}`);
  console.log(`  entête  : ${Buffer.from(bytes.slice(0, 4)).toString("hex")}`);
  if (bytes.length === 0) {
    console.error("  Fichier vide — arrêt.");
    process.exit(1);
  }

  titre("4. APPEL DU MODÈLE DE VISION");
  const debut = Date.now();
  const extraction = await provider.extract({
    fileKey: null,
    mimeType,
    fileName: basename(chemin),
    bytes,
  });
  console.log(`  durée : ${((Date.now() - debut) / 1000).toFixed(1)} s`);

  titre("5. RÉSULTAT BRUT");
  console.log(JSON.stringify(extraction, null, 2));

  titre("6. SYNTHÈSE");
  console.log(`  patient       : ${extraction.patientName.value ?? "—"}`);
  console.log(`  prescripteur  : ${extraction.prescriberName.value ?? "—"}`);
  console.log(`  date          : ${extraction.prescribedAt.value ?? "—"}`);
  console.log(`  MÉDICAMENTS   : ${extraction.lines.length}`);
  for (const ligne of extraction.lines) {
    console.log(
      `    • ${ligne.drugName.value ?? "(non lu)"} ${ligne.dosage.value ?? ""} — ${
        ligne.posology.value ?? "posologie non lue"
      }`,
    );
  }
  if (extraction.warnings.length > 0) {
    console.log("\n  AVERTISSEMENTS :");
    for (const w of extraction.warnings) console.log(`    ⚠ ${w}`);
  }

  if (extraction.lines.length === 0) {
    console.log("\n  ZÉRO MÉDICAMENT — causes possibles, dans l'ordre :");
    console.log("    1. le modèle n'a rien pu lire (image floue, trop sombre, illisible)");
    console.log("    2. le validateur a écarté chaque champ faute de citation");
    console.log("    3. le modèle a refusé de traiter l'image");
    console.log("  Le résultat brut ci-dessus tranche : regardez `warnings`.");
  }
}

main().catch((error) => {
  console.error("\nÉCHEC :", error);
  process.exit(1);
});
