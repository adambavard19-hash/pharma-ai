import { describe, expect, it } from "vitest";
import {
  CONSENT_REQUIRED,
  CV_MAX_BYTES,
  cvFileProblem,
  cvStorageKey,
  inspectCv,
  isPlausiblePhone,
  salesApplicationSchema,
  sanitizeCvFileName,
} from "../form";
import { buildSalesApplicationAcknowledgement } from "../emails";
import { DEFAULT_EMAIL_CONTEXT } from "@/core/platform/email-layout";

const VALID = {
  firstName: " Claire ",
  lastName: "Martin",
  email: " Claire.Martin@Exemple.FR ",
  phone: "06 12 34 56 78",
  city: "Lyon",
  zone: "Rhône-Alpes",
  currentStatus: "FREELANCE",
  salesExperience: "Dix ans de vente en B2B, dont quatre auprès de TPE.",
  healthExperience: "",
  message: "Je veux développer un produit utile aux pharmacies.",
  consent: true,
};

function issuesOf(payload: Record<string, unknown>): Record<string, string> {
  const parsed = salesApplicationSchema.safeParse(payload);
  if (parsed.success) return {};
  // Comme le formulaire et l'action : le premier message d'un champ est celui qui s'affiche.
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

describe("candidature commerciale : règles de saisie", () => {
  it("accepte une candidature complète, nettoie les espaces et met l'e-mail en minuscules", () => {
    const parsed = salesApplicationSchema.parse(VALID);
    expect(parsed.firstName).toBe("Claire");
    expect(parsed.email).toBe("claire.martin@exemple.fr");
    expect(parsed.consent).toBe(true);
  });

  it("l'expérience avec les pharmacies et le CV sont facultatifs", () => {
    const { healthExperience: _omitted, ...rest } = VALID;
    void _omitted;
    expect(salesApplicationSchema.safeParse(rest).success).toBe(true);
  });

  it("sans consentement, rien n'est accepté, avec le message attendu", () => {
    expect(issuesOf({ ...VALID, consent: false }).consent).toBe(CONSENT_REQUIRED);
    expect(issuesOf({ ...VALID, consent: undefined }).consent).toBe(CONSENT_REQUIRED);
  });

  it("chaque champ obligatoire a son message en français", () => {
    const errors = issuesOf({ ...VALID, firstName: "", lastName: " ", email: "pas-un-mail", phone: "", city: "", zone: "", currentStatus: "", salesExperience: "court", message: "" });
    expect(errors).toMatchObject({
      firstName: "Votre prénom est requis.",
      lastName: "Votre nom est requis.",
      email: "Adresse e-mail invalide.",
      phone: "Votre numéro de téléphone est requis.",
      city: "Indiquez votre ville ou votre secteur.",
      zone: "Indiquez la zone où vous souhaitez travailler.",
      currentStatus: "Choisissez la situation qui vous correspond.",
    });
    expect(errors.salesExperience).toMatch(/10 caractères au moins/);
    expect(errors.message).toMatch(/10 caractères au moins/);
  });

  it("refuse une situation qui n'est pas dans la liste", () => {
    expect(issuesOf({ ...VALID, currentStatus: "PIRATE" }).currentStatus).toBeDefined();
    for (const status of ["SALARIED", "FREELANCE", "JOB_SEEKING", "STUDENT", "OTHER"]) {
      expect(issuesOf({ ...VALID, currentStatus: status }).currentStatus).toBeUndefined();
    }
  });

  it("garde les longueurs de la création d'un commercial (téléphone 30, zone 120, prénom 80)", () => {
    expect(issuesOf({ ...VALID, zone: "z".repeat(121) }).zone).toBeDefined();
    expect(issuesOf({ ...VALID, firstName: "p".repeat(81) }).firstName).toBeDefined();
    expect(issuesOf({ ...VALID, phone: `0${"1".repeat(30)}` }).phone).toBeDefined();
    expect(issuesOf({ ...VALID, salesExperience: "x".repeat(2001) }).salesExperience).toBeDefined();
  });

  it("téléphone : des chiffres et des séparateurs, pas de lettres", () => {
    expect(isPlausiblePhone("06 12 34 56 78")).toBe(true);
    expect(isPlausiblePhone("+33 6 12 34 56 78")).toBe(true);
    expect(isPlausiblePhone("01.23.45.67.89")).toBe(true);
    expect(isPlausiblePhone("12345")).toBe(false);
    expect(isPlausiblePhone("appelez-moi")).toBe(false);
    expect(isPlausiblePhone("06 12 34 56 78 poste 4")).toBe(false);
    expect(issuesOf({ ...VALID, phone: "abc" }).phone).toMatch(/invalide/);
  });
});

describe("CV : nom, taille, signature", () => {
  const pdf = (size = 100) => {
    const bytes = new Uint8Array(size);
    bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
    return bytes;
  };

  it("la clé de stockage ne ressemble jamais à celle d'une officine", () => {
    expect(cvStorageKey("abc123")).toBe("sales-applications/abc123/cv.pdf");
  });

  it("nettoie le nom : pas de chemin, pas de balise, toujours .pdf", () => {
    expect(sanitizeCvFileName("CV Claire Martin.pdf")).toBe("CV Claire Martin.pdf");
    expect(sanitizeCvFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeCvFileName("C:\\Users\\claire\\cv final.PDF")).toBe("cv final.pdf");
    expect(sanitizeCvFileName("cv<script>alert(1)</script>.pdf")).not.toMatch(/[<>/]/);
    expect(sanitizeCvFileName("CV été 2026 (v2).pdf")).toBe("CV été 2026 (v2).pdf");
    expect(sanitizeCvFileName("...pdf")).toBe("cv.pdf");
    expect(sanitizeCvFileName("")).toBe("cv.pdf");
    expect(sanitizeCvFileName("x".repeat(300) + ".pdf").length).toBeLessThanOrEqual(104);
    expect(sanitizeCvFileName("cv\u0000\u202e.pdf")).not.toMatch(/[\u0000\u202e]/);
  });

  it("contrôle rapide du navigateur : taille et type", () => {
    expect(cvFileProblem({ name: "cv.pdf", size: 1000, type: "application/pdf" })).toBeNull();
    expect(cvFileProblem({ name: "cv.pdf", size: 1000, type: "" })).toBeNull();
    expect(cvFileProblem({ name: "cv.docx", size: 1000, type: "application/msword" })).toMatch(/PDF/);
    expect(cvFileProblem({ name: "cv.pdf", size: CV_MAX_BYTES + 1, type: "application/pdf" })).toMatch(/3 Mo/);
    expect(cvFileProblem({ name: "cv.pdf", size: CV_MAX_BYTES, type: "application/pdf" })).toBeNull();
    expect(cvFileProblem({ name: "cv.pdf", size: 0, type: "application/pdf" })).toMatch(/vide/);
  });

  it("serveur : la signature %PDF- fait foi, pas le nom ni le type annoncé", () => {
    expect(inspectCv(pdf(), "cv.pdf")).toEqual({ ok: true, fileName: "cv.pdf", sizeBytes: 100 });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(inspectCv(png, "cv.pdf")).toMatchObject({ ok: false });
    expect(inspectCv(new TextEncoder().encode("MZ exécutable"), "cv.pdf").ok).toBe(false);
    expect(inspectCv(new TextEncoder().encode("  %PDF-1.4"), "cv.pdf").ok).toBe(false);
    expect(inspectCv(new Uint8Array(0), "cv.pdf")).toEqual({ ok: false, error: "Ce fichier est vide." });
    expect(inspectCv(new Uint8Array(3), "cv.pdf").ok).toBe(false);
  });

  it("serveur : 3 Mo au plus, relus sur les octets reçus", () => {
    expect(inspectCv(pdf(CV_MAX_BYTES), "cv.pdf").ok).toBe(true);
    const tooBig = inspectCv(pdf(CV_MAX_BYTES + 1), "cv.pdf");
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toMatch(/3 Mo/);
  });

  it("serveur : le nom retourné est nettoyé", () => {
    expect(inspectCv(pdf(), "../cv <b>.pdf")).toMatchObject({ ok: true, fileName: "cv b.pdf" });
  });
});

describe("accusé de réception", () => {
  it("dit ce qui a été reçu, sans promesse de réponse, de délai ni de conditions", () => {
    const mail = buildSalesApplicationAcknowledgement(DEFAULT_EMAIL_CONTEXT, { firstName: "Claire", hasCv: true });
    expect(mail.subject).toMatch(/bien reçue/);
    expect(mail.text).toContain("Bonjour Claire,");
    expect(mail.text).toContain("Si votre profil est retenu");
    expect(mail.text).toContain("votre CV");
    // Aucun montant, aucun délai, aucune promesse d'embauche.
    expect(mail.text).not.toMatch(/€|euro|commission|fixe|garanti|sous \d|48 ?h|jours? ouvr/i);
  });

  it("ne parle du CV que s'il a été gardé", () => {
    const mail = buildSalesApplicationAcknowledgement(DEFAULT_EMAIL_CONTEXT, { firstName: "Claire", hasCv: false });
    expect(mail.text).not.toContain("CV");
  });
});
