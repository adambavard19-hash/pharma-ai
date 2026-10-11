import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * L'Académie côté serveur, base simulée : progression hors officine, badges idempotents, quiz noté sur le serveur,
 * relecture exigée avant publication, et la route des vidéos (session + droit de voir le contenu).
 */

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    trainingContent: { findFirst: fn(), findMany: fn(), findUnique: fn(), update: fn(), create: fn(), count: fn() },
    trainingProgress: { findFirst: fn(), findMany: fn(), create: fn(), update: fn() },
    quizQuestion: { findMany: fn() },
    quizAttempt: { create: fn(), findMany: fn() },
    skillBadge: { findUnique: fn(), create: fn() },
    trainingModule: { findMany: fn() },
    storage: { read: fn(), put: fn(), delete: fn() },
    getUserSession: fn(),
    getPlatformSession: fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: { trainingContent: m.trainingContent, trainingProgress: m.trainingProgress, quizQuestion: m.quizQuestion, quizAttempt: m.quizAttempt, skillBadge: m.skillBadge, trainingModule: m.trainingModule, membership: { findFirst: vi.fn(async () => null) } } }));
vi.mock("@/server/ai/registry", () => ({ getStorageProvider: () => m.storage }));
vi.mock("@/server/auth/user-session", () => ({ getUserSession: m.getUserSession }));
vi.mock("@/server/auth/platform-session", () => ({ getPlatformSession: m.getPlatformSession }));

import * as academy from "../academy";
import * as admin from "../academy-admin";
import { readAcademyMedia } from "../academy-media";
import { GET as mediaRoute } from "@/app/api/academie/media/[contentId]/[kind]/route";

const NOW = new Date("2026-10-11T10:00:00Z");
const free = { userId: "u-free", pharmacyId: null, profession: "PHARMACY_STUDENT", role: null, memberSince: null };
const staff = { userId: "u-staff", pharmacyId: "ph1", profession: null, role: "TECHNICIAN", memberSince: new Date("2026-01-01") };

beforeEach(() => {
  vi.clearAllMocks();
  m.trainingModule.findMany.mockResolvedValue([]);
});

describe("progression d'une personne sans officine", () => {
  it("lit puis crée la ligne hors officine (pharmacyId vide), sans upsert sur la clé composée", async () => {
    m.trainingProgress.findFirst.mockResolvedValue(null);
    m.trainingProgress.create.mockResolvedValue({});
    const saved = await academy.writeProgress(free, "c1", { status: "IN_PROGRESS", percent: 40 }, NOW);
    expect(m.trainingProgress.findFirst.mock.calls[0][0].where).toEqual({ contentId: "c1", userId: "u-free", pharmacyId: null });
    expect(m.trainingProgress.create.mock.calls[0][0].data).toMatchObject({ contentId: "c1", userId: "u-free", pharmacyId: null, status: "IN_PROGRESS", progressPercent: 40 });
    expect(saved).toEqual({ status: "IN_PROGRESS", percent: 40 });
  });

  it("une collaboratrice écrit dans SON officine active", async () => {
    m.trainingProgress.findFirst.mockResolvedValue(null);
    await academy.writeProgress(staff, "c1", { status: "DONE", percent: 100 }, NOW);
    expect(m.trainingProgress.create.mock.calls[0][0].data).toMatchObject({ userId: "u-staff", pharmacyId: "ph1", status: "DONE", completedAt: NOW });
  });

  it("une progression ne recule jamais, et un contenu terminé le reste", async () => {
    m.trainingProgress.findFirst.mockResolvedValue({ id: "p1", status: "DONE", progressPercent: 100, completedAt: new Date("2026-10-01") });
    const saved = await academy.writeProgress(free, "c1", { status: "IN_PROGRESS", percent: 10 }, NOW);
    expect(saved.status).toBe("DONE");
    expect(m.trainingProgress.update.mock.calls[0][0].data).toMatchObject({ status: "DONE", completedAt: new Date("2026-10-01") });
  });

  it("deux écritures croisées (index unique partiel) : une seconde tentative met à jour", async () => {
    m.trainingProgress.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "p1", status: "IN_PROGRESS", progressPercent: 20, completedAt: null });
    m.trainingProgress.create.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "P2002" }));
    const saved = await academy.writeProgress(free, "c1", { status: "IN_PROGRESS", percent: 50 }, NOW);
    expect(saved.percent).toBe(50);
    expect(m.trainingProgress.update).toHaveBeenCalledTimes(1);
  });
});

describe("badges du passeport", () => {
  it("un badge déjà acquis n'est pas recréé", async () => {
    m.skillBadge.findUnique.mockResolvedValue({ id: "b1" });
    expect(await academy.grantBadge("u", { kind: "QUIZ_PASSED", dedupeKey: "QUIZ:c1", title: "T", contentId: "c1" })).toBe(false);
    expect(m.skillBadge.create).not.toHaveBeenCalled();
  });

  it("deux réussites simultanées : la contrainte unique tranche, un seul badge, pas d'erreur", async () => {
    m.skillBadge.findUnique.mockResolvedValue(null);
    m.skillBadge.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await academy.grantBadge("u", { kind: "QUIZ_PASSED", dedupeKey: "QUIZ:c1", title: "T" })).toBe(false);
  });

  it("le premier gain rend vrai", async () => {
    m.skillBadge.findUnique.mockResolvedValue(null);
    m.skillBadge.create.mockResolvedValue({});
    expect(await academy.grantBadge("u", { kind: "MODULE_COMPLETED", dedupeKey: "MODULE:m1", title: "Parcours", moduleId: "m1" })).toBe(true);
    expect(m.skillBadge.create.mock.calls[0][0].data).toMatchObject({ userId: "u", dedupeKey: "MODULE:m1", kind: "MODULE_COMPLETED" });
  });
});

describe("quiz noté sur le serveur", () => {
  const questions = [
    { id: "q1", prompt: "?", choices: ["a", "b"], correctIndexes: [1], explanation: "b", sourceLabel: null },
    { id: "q2", prompt: "?", choices: ["a", "b", "c"], correctIndexes: [0, 2], explanation: "a, c", sourceLabel: null },
  ];

  beforeEach(() => {
    m.trainingContent.findMany.mockResolvedValue([{ id: "c1" }]);
    m.quizQuestion.findMany.mockResolvedValue(questions);
    m.trainingContent.findUnique.mockResolvedValue({ title: "Qui garde la décision ?", quizPassPercent: 70 });
    m.trainingProgress.findFirst.mockResolvedValue(null);
    m.skillBadge.findUnique.mockResolvedValue(null);
    m.skillBadge.create.mockResolvedValue({});
  });

  it("le contenu doit être visible pour la personne (compte gratuit : filtre gratuit)", async () => {
    m.trainingContent.findMany.mockResolvedValue([]);
    expect(await academy.submitQuiz(free, "c1", { q1: [1] }, NOW)).toBeNull();
    expect(JSON.stringify(m.trainingContent.findMany.mock.calls[0][0].where)).toContain('"pharmacyId":null,"isFreeAccess":true');
    expect(m.quizAttempt.create).not.toHaveBeenCalled();
  });

  it("réussi : tentative enregistrée, contenu terminé, badge du quiz", async () => {
    const outcome = await academy.submitQuiz(free, "c1", { q1: [1], q2: [2, 0] }, NOW);
    expect(outcome).toMatchObject({ score: 100, passed: true, newBadges: [{ kind: "QUIZ_PASSED", title: "Qui garde la décision ?" }] });
    expect(m.quizAttempt.create.mock.calls[0][0].data).toMatchObject({ userId: "u-free", contentId: "c1", pharmacyId: null, score: 100, passed: true });
    expect(m.trainingProgress.create.mock.calls[0][0].data).toMatchObject({ status: "DONE", pharmacyId: null });
  });

  it("échoué : tentative enregistrée, rien d'autre", async () => {
    const outcome = await academy.submitQuiz(staff, "c1", { q1: [0], q2: [0] }, NOW);
    expect(outcome).toMatchObject({ score: 0, passed: false, newBadges: [] });
    expect(m.quizAttempt.create.mock.calls[0][0].data).toMatchObject({ pharmacyId: "ph1", passed: false });
    expect(m.trainingProgress.create).not.toHaveBeenCalled();
    expect(m.skillBadge.create).not.toHaveBeenCalled();
  });

  it("la correction d'une réponse ne révèle rien d'une autre question et n'enregistre rien", async () => {
    const feedback = await academy.checkAnswer(free, "c1", "q2", [0], NOW);
    expect(feedback).toMatchObject({ questionId: "q2", correct: false, correctIndexes: [0, 2] });
    expect(m.quizAttempt.create).not.toHaveBeenCalled();
  });
});

describe("console : relecture exigée", () => {
  it("un contenu sur le médicament ne s'approuve pas sans relecteur pharmacien (rien n'est écrit)", async () => {
    m.trainingContent.findFirst.mockResolvedValue({ title: "T", kind: "MICRO_VIDEO", url: null, body: null, videoAssetKey: "k", reviewStatus: "IN_REVIEW", academyTopic: "MEDICINES" });
    const result = await admin.reviewAcademyContent("c1", { type: "APPROVE", reviewerName: "Équipe PharmaBoost", reviewerIsPharmacist: false }, NOW);
    expect(result.ok).toBe(false);
    expect(m.trainingContent.update).not.toHaveBeenCalled();
  });

  it("on ne publie pas un contenu non approuvé", async () => {
    m.trainingContent.findFirst.mockResolvedValue({ title: "T", reviewStatus: "IN_REVIEW" });
    expect((await admin.publishAcademyContent("c1", { publishAt: null, validUntil: null }, NOW)).ok).toBe(false);
    expect(m.trainingContent.update).not.toHaveBeenCalled();
  });

  it("la console ne touche jamais un contenu d'officine", async () => {
    m.trainingContent.findFirst.mockResolvedValue(null);
    await admin.reviewAcademyContent("c1", { type: "SUBMIT" }, NOW);
    expect(m.trainingContent.findFirst.mock.calls[0][0].where).toMatchObject({ id: "c1", pharmacyId: null });
  });
});

describe("route des vidéos : session et droit de voir", () => {
  const params = (contentId: string, kind: string) => ({ params: Promise.resolve({ contentId, kind }) });
  const sessionFree = { user: { id: "u-free", profession: null }, activePharmacy: null, role: null };

  it("sans session : 401", async () => {
    m.getUserSession.mockResolvedValue(null);
    m.getPlatformSession.mockResolvedValue(null);
    const response = await mediaRoute(new Request("http://x/api/academie/media/c1/video"), params("c1", "video"));
    expect(response.status).toBe(401);
  });

  it("contenu invisible pour la personne (ex. réservé aux équipes) : 404, et le filtre gratuit est bien appliqué", async () => {
    m.getUserSession.mockResolvedValue(sessionFree);
    m.getPlatformSession.mockResolvedValue(null);
    m.trainingContent.findFirst.mockResolvedValue(null);
    const response = await mediaRoute(new Request("http://x/api/academie/media/c1/video"), params("c1", "video"));
    expect(response.status).toBe(404);
    expect(JSON.stringify(m.trainingContent.findFirst.mock.calls[0][0].where)).toContain('"pharmacyId":null,"isFreeAccess":true');
    expect(m.storage.read).not.toHaveBeenCalled();
  });

  it("type inconnu ou identifiant suspect : 404 sans toucher la base", async () => {
    m.getUserSession.mockResolvedValue(sessionFree);
    expect((await mediaRoute(new Request("http://x"), params("c1", "transcript"))).status).toBe(404);
    expect((await mediaRoute(new Request("http://x"), params("../etc", "video"))).status).toBe(404);
    expect(m.trainingContent.findFirst).not.toHaveBeenCalled();
  });

  it("visible : la clé vient de la fiche, plages d'octets servies (206), plage impossible (416)", async () => {
    m.getUserSession.mockResolvedValue(sessionFree);
    m.getPlatformSession.mockResolvedValue(null);
    m.trainingContent.findFirst.mockResolvedValue({ id: "c1", videoAssetKey: "academie/c1/video-1.mp4", posterUrl: null });
    m.storage.read.mockResolvedValue(new Uint8Array(Array.from({ length: 100 }, (_, i) => i)));
    const partial = await mediaRoute(new Request("http://x", { headers: { range: "bytes=10-19" } }), params("c1", "video"));
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(partial.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await partial.arrayBuffer())[0]).toBe(10);
    expect(m.storage.read).toHaveBeenCalledWith("academie/c1/video-1.mp4");
    const invalid = await mediaRoute(new Request("http://x", { headers: { range: "bytes=500-" } }), params("c1", "video"));
    expect(invalid.status).toBe(416);
  });

  it("une image d'attente externe n'est jamais lue dans le stockage", async () => {
    m.trainingContent.findFirst.mockResolvedValue({ id: "c9", videoAssetKey: null, posterUrl: "https://exemple.fr/a.jpg" });
    expect(await readAcademyMedia({ type: "viewer", viewer: free }, "c9", "poster", NOW)).toBeNull();
    expect(m.storage.read).not.toHaveBeenCalled();
  });
});
