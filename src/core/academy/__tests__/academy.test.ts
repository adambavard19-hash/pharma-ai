import { describe, expect, it } from "vitest";
import { audienceMatches, contentVisibleWhere, isContentVisible, isModuleVisible, isNewStaff, type AcademyViewer } from "../visibility";
import { cleanChoice, isCorrect, normalizeQuestions, scoreQuiz, type QuizQuestionData } from "../quiz";
import { afterEdit, applyReview, checkPublish, onlineState } from "../review";
import { checkUpload, isHostedPoster, mediaPath, parseRange, sniffMime, videoMaxBytes } from "../media";
import { completesOnWatch, moduleBadgeKey, moduleProgress, passportShareText, quizBadgeKey } from "../passport";
import { formatSeconds, hasMaterial, normalizeAcademyDraft } from "../content";

const NOW = new Date("2026-10-11T10:00:00Z");
const DAY = 86_400_000;

/** Un petit interprète des filtres Prisma utilisés par `contentVisibleWhere` : pour vérifier qu'il dit la même chose que la règle pure. */
function matches(row: Record<string, unknown>, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  return Object.entries(where as Record<string, unknown>).every(([key, condition]) => {
    if (key === "AND") return (condition as unknown[]).every((part) => matches(row, part));
    if (key === "OR") return (condition as unknown[]).some((part) => matches(row, part));
    const value = row[key];
    if (condition === null || typeof condition !== "object" || condition instanceof Date) return condition instanceof Date ? value instanceof Date && value.getTime() === condition.getTime() : value === condition;
    const ops = condition as Record<string, unknown>;
    if ("not" in ops && ops.not === null && (value === null || value === undefined)) return false;
    if ("lte" in ops && !(value instanceof Date && value.getTime() <= (ops.lte as Date).getTime())) return false;
    if ("gt" in ops && !(value instanceof Date && value.getTime() > (ops.gt as Date).getTime())) return false;
    return true;
  });
}

const base = { isActive: true, reviewStatus: "APPROVED", publishedAt: new Date(NOW.getTime() - DAY) as Date | null, validUntil: null as Date | null, pharmacyId: null as string | null, isFreeAccess: true };
const free: Pick<AcademyViewer, "pharmacyId"> = { pharmacyId: null };
const staff: Pick<AcademyViewer, "pharmacyId"> = { pharmacyId: "ph1" };

describe("visibilité des contenus de l'Académie", () => {
  const cases: [string, typeof base, Pick<AcademyViewer, "pharmacyId">, boolean][] = [
    ["approuvé, publié, gratuit → compte gratuit", base, free, true],
    ["brouillon → personne", { ...base, reviewStatus: "DRAFT" }, staff, false],
    ["en relecture → personne", { ...base, reviewStatus: "IN_REVIEW" }, staff, false],
    ["refusé → personne", { ...base, reviewStatus: "REJECTED" }, free, false],
    ["archivé → personne", { ...base, reviewStatus: "ARCHIVED" }, free, false],
    ["approuvé mais jamais publié → personne", { ...base, publishedAt: null }, staff, false],
    ["publication programmée demain → pas encore", { ...base, publishedAt: new Date(NOW.getTime() + DAY) }, staff, false],
    ["échu hier → plus visible", { ...base, validUntil: new Date(NOW.getTime() - DAY) }, staff, false],
    ["valable jusqu'à demain → visible", { ...base, validUntil: new Date(NOW.getTime() + DAY) }, staff, true],
    ["désactivé → personne", { ...base, isActive: false }, staff, false],
    ["réservé aux équipes → pas le compte gratuit", { ...base, isFreeAccess: false }, free, false],
    ["réservé aux équipes → l'équipe cliente", { ...base, isFreeAccess: false }, staff, true],
    ["contenu de SON officine → l'équipe", { ...base, pharmacyId: "ph1", isFreeAccess: false }, staff, true],
    ["contenu d'une AUTRE officine → jamais", { ...base, pharmacyId: "ph2" }, staff, false],
    ["contenu d'officine, même gratuit → jamais un compte gratuit", { ...base, pharmacyId: "ph1" }, free, false],
  ];
  for (const [label, content, viewer, expected] of cases) {
    it(label, () => {
      expect(isContentVisible(content, viewer, NOW)).toBe(expected);
      // Le filtre de base de données dit exactement la même chose.
      expect(matches(content, contentVisibleWhere(viewer, NOW))).toBe(expected);
    });
  }
});

describe("parcours : public et accès", () => {
  const viewer = (over: Partial<AcademyViewer>): AcademyViewer => ({ userId: "u", pharmacyId: "ph1", profession: null, role: "TECHNICIAN", memberSince: new Date(NOW.getTime() - 400 * DAY), ...over });
  const mod = { isActive: true, reviewStatus: "APPROVED", publishedAt: new Date(NOW.getTime() - DAY), isFreeAccess: true, audience: "NEW_STAFF" };

  it("« Nouveaux collaborateurs » : l'arrivant récent, le compte gratuit et le titulaire ; pas l'ancien", () => {
    expect(isNewStaff(viewer({ memberSince: new Date(NOW.getTime() - 10 * DAY) }), NOW)).toBe(true);
    expect(isModuleVisible(mod, viewer({ memberSince: new Date(NOW.getTime() - 10 * DAY) }), NOW)).toBe(true);
    expect(isModuleVisible(mod, viewer({ pharmacyId: null, role: null, memberSince: null }), NOW)).toBe(true);
    expect(isModuleVisible(mod, viewer({ role: "OWNER" }), NOW)).toBe(true);
    expect(isModuleVisible(mod, viewer({}), NOW)).toBe(false);
  });

  it("un parcours non gratuit n'est jamais montré à un compte gratuit, ni un parcours non publié à personne", () => {
    expect(isModuleVisible({ ...mod, isFreeAccess: false, audience: "ALL" }, viewer({ pharmacyId: null, role: null }), NOW)).toBe(false);
    expect(isModuleVisible({ ...mod, audience: "ALL", publishedAt: null }, viewer({}), NOW)).toBe(false);
    expect(isModuleVisible({ ...mod, audience: "ALL", reviewStatus: "IN_REVIEW" }, viewer({}), NOW)).toBe(false);
  });

  it("public par métier ou par rôle", () => {
    expect(audienceMatches("STUDENT", viewer({ pharmacyId: null, role: null, profession: "PHARMACY_STUDENT" }), NOW)).toBe(true);
    expect(audienceMatches("PHARMACIST", viewer({ role: "TECHNICIAN" }), NOW)).toBe(false);
    expect(audienceMatches("PHARMACIST", viewer({ role: "PHARMACIST" }), NOW)).toBe(true);
    expect(audienceMatches("TECHNICIAN", viewer({}), NOW)).toBe(true);
  });
});

describe("notation du quiz", () => {
  const single: QuizQuestionData = { id: "q1", prompt: "?", choices: ["a", "b", "c"], correctIndexes: [1], explanation: "b" };
  const multiple: QuizQuestionData = { id: "q2", prompt: "?", choices: ["a", "b", "c", "d"], correctIndexes: [0, 2], explanation: "a et c" };

  it("choix unique : juste seulement la bonne réponse", () => {
    expect(isCorrect(single, [1])).toBe(true);
    expect(isCorrect(single, [0])).toBe(false);
    expect(isCorrect(single, [1, 2])).toBe(false);
  });

  it("choix multiples : exactement l'ensemble des bonnes réponses (pas de demi-point), dans n'importe quel ordre", () => {
    expect(isCorrect(multiple, [2, 0])).toBe(true);
    expect(isCorrect(multiple, [0])).toBe(false);
    expect(isCorrect(multiple, [0, 2, 3])).toBe(false);
  });

  it("les réponses absurdes sont nettoyées (hors bornes, doublons, non entiers)", () => {
    expect(cleanChoice([1, 1, 9, -1, 1.5, "2"], 3)).toEqual([1]);
    expect(cleanChoice("nimporte", 3)).toEqual([]);
  });

  it("score, seuil, question sans réponse = fausse, réponse à une question inconnue ignorée", () => {
    const result = scoreQuiz([single, multiple], { q1: [1], inconnue: [0] }, 70);
    expect(result).toMatchObject({ correctCount: 1, totalCount: 2, score: 50, passed: false, passPercent: 70 });
    expect(scoreQuiz([single, multiple], { q1: [1], q2: [0, 2] }, 70)).toMatchObject({ score: 100, passed: true });
    expect(scoreQuiz([single, multiple], { q1: [1] }, 50).passed).toBe(true);
  });

  it("un quiz vide ne se réussit pas ; un seuil absurde retombe sur 70 %", () => {
    expect(scoreQuiz([], {}).passed).toBe(false);
    expect(scoreQuiz([single], { q1: [1] }, 0).passPercent).toBe(70);
  });

  it("la console : questions valides, choix vides retirés et bonnes réponses recalées", () => {
    const ok = normalizeQuestions([{ prompt: "Quelle réponse ?", choices: ["", "Oui", "", "Non"], correctIndexes: [3], explanation: "Parce que c'est écrit." }]);
    expect(ok).toEqual({ ok: true, questions: [{ prompt: "Quelle réponse ?", choices: ["Oui", "Non"], correctIndexes: [1], explanation: "Parce que c'est écrit.", sourceLabel: null }] });
  });

  it("la console : refus d'une question sans bonne réponse, toute bonne, sans explication, ou avec des doublons", () => {
    const q = { prompt: "Quelle réponse ?", choices: ["Oui", "Non"], explanation: "Explication suffisante." };
    expect(normalizeQuestions([{ ...q, correctIndexes: [] }])).toMatchObject({ ok: false });
    expect(normalizeQuestions([{ ...q, correctIndexes: [0, 1] }])).toMatchObject({ ok: false });
    expect(normalizeQuestions([{ ...q, correctIndexes: [0], explanation: "" }])).toMatchObject({ ok: false });
    expect(normalizeQuestions([{ ...q, choices: ["Oui", "oui"], correctIndexes: [0] }])).toMatchObject({ ok: false });
    expect(normalizeQuestions([{ ...q, choices: ["Oui"], correctIndexes: [0] }])).toMatchObject({ ok: false });
  });
});

describe("relecture et publication", () => {
  const material = { hasMaterial: true };

  it("brouillon → en relecture, seulement avec une vidéo, un lien ou un texte", () => {
    expect(applyReview({ reviewStatus: "DRAFT", ...material }, { type: "SUBMIT" }, NOW)).toMatchObject({ ok: true, change: { reviewStatus: "IN_REVIEW" } });
    expect(applyReview({ reviewStatus: "DRAFT", hasMaterial: false }, { type: "SUBMIT" }, NOW).ok).toBe(false);
    expect(applyReview({ reviewStatus: "APPROVED", ...material }, { type: "SUBMIT" }, NOW).ok).toBe(false);
  });

  it("on n'approuve qu'un contenu en relecture, avec le nom du relecteur", () => {
    expect(applyReview({ reviewStatus: "DRAFT", ...material }, { type: "APPROVE", reviewerName: "Dr X", reviewerIsPharmacist: true }, NOW).ok).toBe(false);
    expect(applyReview({ reviewStatus: "IN_REVIEW", ...material }, { type: "APPROVE", reviewerName: " ", reviewerIsPharmacist: false }, NOW).ok).toBe(false);
    const approved = applyReview({ reviewStatus: "IN_REVIEW", ...material }, { type: "APPROVE", reviewerName: "Équipe PharmaBoost", reviewerIsPharmacist: false }, NOW);
    expect(approved).toMatchObject({ ok: true, change: { reviewStatus: "APPROVED", reviewedBy: "Équipe PharmaBoost", reviewedAt: NOW, reviewerIsPharmacist: false } });
  });

  it("un contenu sur le médicament exige un relecteur pharmacien", () => {
    const subject = { reviewStatus: "IN_REVIEW", academyTopic: "MEDICINES", ...material };
    expect(applyReview(subject, { type: "APPROVE", reviewerName: "Équipe PharmaBoost", reviewerIsPharmacist: false }, NOW).ok).toBe(false);
    expect(applyReview(subject, { type: "APPROVE", reviewerName: "Dr Donna Martin", reviewerIsPharmacist: true }, NOW).ok).toBe(true);
  });

  it("un refus porte un motif", () => {
    expect(applyReview({ reviewStatus: "IN_REVIEW", ...material }, { type: "REJECT", note: "" }, NOW).ok).toBe(false);
    expect(applyReview({ reviewStatus: "IN_REVIEW", ...material }, { type: "REJECT", note: "Source manquante" }, NOW)).toMatchObject({ ok: true, change: { reviewStatus: "REJECTED", reviewNote: "Source manquante", publishedAt: null } });
  });

  it("rien ne se publie sans APPROUVÉ ; la fin de validité suit la mise en ligne", () => {
    expect(checkPublish({ reviewStatus: "IN_REVIEW" }, { publishAt: null, validUntil: null }, NOW).ok).toBe(false);
    expect(checkPublish({ reviewStatus: "DRAFT" }, { publishAt: null, validUntil: null }, NOW).ok).toBe(false);
    expect(checkPublish({ reviewStatus: "APPROVED" }, { publishAt: null, validUntil: null }, NOW)).toEqual({ ok: true, publishedAt: NOW, validUntil: null });
    expect(checkPublish({ reviewStatus: "APPROVED" }, { publishAt: null, validUntil: new Date(NOW.getTime() - DAY) }, NOW).ok).toBe(false);
  });

  it("toute modification renvoie au brouillon, hors ligne, relecture effacée", () => {
    expect(afterEdit()).toEqual({ reviewStatus: "DRAFT", reviewedBy: null, reviewedAt: null, reviewerIsPharmacist: false, publishedAt: null });
  });

  it("l'état en ligne lisible par la console", () => {
    const item = { reviewStatus: "APPROVED", publishedAt: new Date(NOW.getTime() - DAY), validUntil: null, isActive: true };
    expect(onlineState(item, NOW)).toBe("ONLINE");
    expect(onlineState({ ...item, publishedAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe("SCHEDULED");
    expect(onlineState({ ...item, validUntil: new Date(NOW.getTime() - 1) }, NOW)).toBe("EXPIRED");
    expect(onlineState({ ...item, reviewStatus: "DRAFT" }, NOW)).toBe("OFFLINE");
  });
});

describe("vidéos hébergées", () => {
  it("plages d'octets", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6", 100)).toBe("invalid");
    expect(parseRange("octets=0-1", 100)).toBe("invalid");
  });

  it("types et tailles acceptés", () => {
    const max = videoMaxBytes(undefined);
    expect(max).toBe(200 * 1024 * 1024);
    expect(videoMaxBytes("50")).toBe(50 * 1024 * 1024);
    expect(checkUpload("video", { type: "video/mp4", size: 1000 }, max)).toMatchObject({ ok: true, extension: "mp4" });
    expect(checkUpload("video", { type: "video/quicktime", size: 1000 }, max).ok).toBe(false);
    expect(checkUpload("video", { type: "video/mp4", size: max + 1 }, max).ok).toBe(false);
    expect(checkUpload("poster", { type: "image/png", size: 1000 }, max).ok).toBe(true);
    expect(checkUpload("poster", { type: "image/svg+xml", size: 1000 }, max).ok).toBe(false);
  });

  it("la signature du fichier fait foi, pas le type annoncé", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0, 0, 0, 0x18, ...Array.from("ftypmp42", (c) => c.charCodeAt(0))]))).toBe("video/mp4");
    expect(sniffMime(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });

  it("l'image d'attente hébergée se reconnaît à son adresse de route contrôlée", () => {
    expect(isHostedPoster(mediaPath("c1", "poster", 3), "c1")).toBe(true);
    expect(isHostedPoster(mediaPath("c2", "poster", 3), "c1")).toBe(false);
    expect(isHostedPoster("https://exemple.fr/a.jpg", "c1")).toBe(false);
  });
});

describe("passeport et parcours", () => {
  it("les clés de badge ne dépendent que de la personne et du contenu (pas de l'officine)", () => {
    expect(quizBadgeKey("c1")).toBe("QUIZ:c1");
    expect(moduleBadgeKey("m1")).toBe("MODULE:m1");
  });

  it("avancement d'un parcours : seules les étapes obligatoires visibles comptent", () => {
    const items = [
      { contentId: "a", position: 1, isRequired: true, visible: true, done: true },
      { contentId: "b", position: 2, isRequired: true, visible: true, done: false },
      { contentId: "c", position: 3, isRequired: false, visible: true, done: false },
      { contentId: "d", position: 4, isRequired: true, visible: false, done: false },
    ];
    expect(moduleProgress(items)).toEqual({ required: 2, doneRequired: 1, percent: 50, complete: false, nextContentId: "b" });
    expect(moduleProgress(items.map((item) => (item.contentId === "b" ? { ...item, done: true } : item)))).toMatchObject({ complete: true, percent: 100, nextContentId: "c" });
    expect(moduleProgress([]).complete).toBe(false);
  });

  it("sans quiz, 90 % vus terminent ; avec quiz, c'est le quiz", () => {
    expect(completesOnWatch(false, 90)).toBe(true);
    expect(completesOnWatch(false, 89)).toBe(false);
    expect(completesOnWatch(true, 100)).toBe(false);
  });

  it("le résumé partageable ne contient ni lien ni officine, et dit « hors DPC »", () => {
    const text = passportShareText({ firstName: "Léa", badges: [{ title: "Qui garde la décision ?" }], completedCount: 3 });
    expect(text).toContain("Léa");
    expect(text).toContain("3 formations suivies");
    expect(text).toContain("hors DPC");
    expect(text).not.toMatch(/https?:/);
  });
});

describe("saisie d'un contenu", () => {
  it("l'auteur est obligatoire ; un contenu sponsorisé nomme son partenaire ; une micro-vidéo dure 180 s au plus", () => {
    const result = normalizeAcademyDraft({ title: "Titre", kind: "MICRO_VIDEO", isSponsored: true, durationSeconds: "240" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["authorName", "durationSeconds", "partnerId"]);
  });

  it("un lien vidéo doit être intégrable (YouTube, Vimeo, Dailymotion)", () => {
    expect(normalizeAcademyDraft({ title: "Titre", kind: "VIDEO", authorName: "A", url: "https://exemple.fr/video" }).ok).toBe(false);
    expect(normalizeAcademyDraft({ title: "Titre", kind: "VIDEO", authorName: "A", url: "https://youtu.be/dQw4w9WgXcQ" }).ok).toBe(true);
  });

  it("de quoi relire : un fichier, un lien intégrable ou un texte", () => {
    expect(hasMaterial({ kind: "MICRO_VIDEO", url: null, body: null, videoAssetKey: "k" })).toBe(true);
    expect(hasMaterial({ kind: "MICRO_VIDEO", url: null, body: null, videoAssetKey: null })).toBe(false);
    expect(hasMaterial({ kind: "SHEET", url: null, body: "Un texte suffisamment long pour une fiche.", videoAssetKey: null })).toBe(true);
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(150)).toBe("2 min 30");
  });
});
