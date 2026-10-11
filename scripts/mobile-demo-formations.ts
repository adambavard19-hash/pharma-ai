/**
 * PharmaBoost Mobile — l'EXEMPLE de l'Académie pour l'aperçu local (étape Formations).
 *
 * Un parcours « Bien démarrer avec PharmaBoost » (nouveaux collaborateurs, ouvert aux comptes gratuits), fait
 * UNIQUEMENT de ce que PharmaBoost dit de lui-même : le reel vertical (video/out/reel) et les films du site
 * (public/video). Chaque quiz ne demande que ce que le film montre ou dit, mot pour mot (citations dans les
 * explications). Aucun fait sur un médicament, aucun conseil de santé : ce parcours apprend à se servir de l'outil.
 *
 * Auteur et relecteur : « Équipe PharmaBoost » (pas un pharmacien — et ce n'est pas un contenu sur le médicament).
 * Les vidéos passent par le vrai port de stockage (le même chemin qu'un envoi depuis la console).
 *
 *   node --env-file=.env --conditions=react-server --import tsx scripts/mobile-demo-formations.ts
 *   node --env-file=.env --conditions=react-server --import tsx scripts/mobile-demo-formations.ts --supprimer
 *
 * Refuse de tourner ailleurs que sur une base locale. Idempotent : relancé, il remet l'exemple d'aplomb.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/server/db/client";
import { getStorageProvider } from "@/server/ai/registry";
import { mediaPath, posterKey, videoKey } from "@/core/academy/media";
import { moduleBadgeKey, quizBadgeKey } from "@/core/academy/passport";

const PREFIX = "demo-academie-";
const MODULE_ID = `${PREFIX}parcours`;
const MODULE_SLUG = "bien-demarrer-avec-pharmaboost";
const ROOT = process.cwd();
const AUTHOR = "Équipe PharmaBoost";
const SOURCE = "Exemple (aperçu local) · films de pharmaboost.app";

type Q = { prompt: string; choices: string[]; correct: number[]; explanation: string };
type Item = { slug: string; title: string; summary: string; file: string; poster: string | null; seconds: number; vertical: boolean; required: boolean; quiz: Q[] };

const ITEMS: Item[] = [
  {
    slug: "reel",
    title: "PharmaBoost en 30 secondes",
    summary: "Le film vertical de PharmaBoost : au comptoir, vous scannez comme d'habitude, et le bon conseil s'affiche.",
    file: "video/out/reel/pharmaboost-reel-instagram.mp4",
    poster: null,
    seconds: 27,
    vertical: true,
    required: true,
    quiz: [
      {
        prompt: "Avec PharmaBoost, comment le conseil arrive-t-il au comptoir ?",
        choices: ["Vous scannez comme d'habitude, et le conseil s'affiche, pris dans votre rayon", "Vous recopiez l'ordonnance dans un nouveau logiciel", "Le patient le reçoit avant de venir à la pharmacie"],
        correct: [0],
        explanation: "Le film le dit : « Avec PharmaBoost, vous scannez comme d'habitude. Et le bon conseil s'affiche, pris dans votre rayon. »",
      },
      {
        prompt: "Une fois le conseil proposé, que faites-vous en un clic ?",
        choices: ["Vous indiquez « Vendu » ou « Non vendu »", "Vous commandez le produit au laboratoire", "Vous envoyez l'ordonnance au médecin"],
        correct: [0],
        explanation: "« Une question si besoin. Vendu, non vendu : un clic. »",
      },
    ],
  },
  {
    slug: "comment-ca-marche",
    title: "Comment ça marche : du scan au conseil, en trois étapes",
    summary: "Les trois étapes, telles que le site les présente : vous scannez les boîtes, la bannière propose, le patient repart avec ses conseils.",
    file: "public/video/pharmaboost-comment-ca-marche.mp4",
    poster: "public/video/pharmaboost-comment-ca-marche.jpg",
    seconds: 44,
    vertical: false,
    required: true,
    quiz: [
      {
        prompt: "Quelles sont les trois étapes, dans l'ordre ?",
        choices: ["Vous scannez les boîtes, la bannière propose, le patient repart avec ses conseils", "La bannière propose, vous scannez, le patient paie", "Le patient remplit un questionnaire, vous scannez, la bannière commande"],
        correct: [0],
        explanation: "Le film annonce les étapes une à une : « 01 Vous scannez les boîtes », « 02 La bannière propose », « 03 Le patient repart avec ses conseils ».",
      },
      {
        prompt: "Que fait la bannière au moment du scan ?",
        choices: ["Elle propose des conseils (« 2 conseils disponibles »)", "Elle valide l'ordonnance à la place du pharmacien", "Elle passe une commande au grossiste"],
        correct: [0],
        explanation: "Après « Scan détecté ! », la bannière affiche « 2 conseils disponibles » : elle PROPOSE, vous décidez.",
      },
      {
        prompt: "Le bilan envoyé au patient contient-il la posologie ?",
        choices: ["Non : la bannière n'envoie jamais de posologie", "Oui, à chaque fois", "Seulement si le patient la demande"],
        correct: [0],
        explanation: "Le film le précise : le patient reçoit son bilan (par e-mail, avec son accord) ; la bannière n'envoie jamais de posologie.",
      },
    ],
  },
  {
    slug: "presentation",
    title: "Scan. Conseil. Bilan.",
    summary: "La présentation du site : la bannière s'ouvre sur les conseils, vous répondez « Vendu » ou « Non vendu », le patient repart avec son bilan.",
    file: "public/video/pharmaboost-presentation.mp4",
    poster: "public/video/pharmaboost-presentation.jpg",
    seconds: 48,
    vertical: false,
    required: true,
    quiz: [
      {
        prompt: "Que signifie « Vendu / Non vendu » dans la bannière ?",
        choices: ["Vous indiquez si le conseil proposé a été vendu ou non", "Le stock du produit est épuisé ou non", "Le patient a payé ou non son ordonnance"],
        correct: [0],
        explanation: "Dans le film, sur chaque conseil, le pharmacien répond « Vendu » ou « Non vendu » : c'est ce qui permet de suivre ce que l'équipe apporte.",
      },
      {
        prompt: "À quelle condition l'e-mail du patient est-il ajouté ?",
        choices: ["Avec son accord", "Toujours, automatiquement", "Jamais : le bilan est seulement imprimé"],
        correct: [0],
        explanation: "Le film montre le pharmacien ajouter l'e-mail du patient avec son accord, puis « Vente terminée ! ».",
      },
    ],
  },
  {
    slug: "avantages",
    title: "Qui garde la décision ?",
    summary: "Le pharmacien et le préparateur gardent la décision. Un comptoir, une personne : les résultats de chacun.",
    file: "public/video/pharmaboost-avantages.mp4",
    poster: "public/video/pharmaboost-avantages.jpg",
    seconds: 38,
    vertical: false,
    required: true,
    quiz: [
      {
        prompt: "Avec PharmaBoost, qui garde la décision au comptoir ?",
        choices: ["Le pharmacien et le préparateur", "Le logiciel, automatiquement", "Le laboratoire partenaire"],
        correct: [0],
        explanation: "« Le pharmacien et le préparateur gardent la décision. » PharmaBoost propose ; l'équipe choisit.",
      },
      {
        prompt: "« Un comptoir, une personne » : qu'est-ce que cela permet ?",
        choices: ["De voir les résultats de chacun", "De fermer les autres comptoirs", "De partager un seul mot de passe pour toute l'équipe"],
        correct: [0],
        explanation: "Le film le dit : « Un comptoir, une personne. Les résultats de chacun. »",
      },
    ],
  },
  {
    slug: "sans-ordonnance",
    title: "Sans ordonnance : le client décrit, vous tapez",
    summary: "Pas d'ordonnance ? Vous tapez ce que dit le client : besoin reconnu, questions à poser, produits en rayon.",
    file: "public/video/pharmaboost-sans-ordonnance.mp4",
    poster: "public/video/pharmaboost-sans-ordonnance.jpg",
    seconds: 25,
    vertical: false,
    required: true,
    quiz: [
      {
        prompt: "Sans ordonnance, que saisissez-vous dans PharmaBoost ?",
        choices: ["Ce que dit le client", "Le numéro de sécurité sociale du client", "Le nom du médecin traitant"],
        correct: [0],
        explanation: "« Vous tapez ce que dit le client. » PharmaBoost reconnaît le besoin, propose les questions à poser et les produits en rayon.",
      },
      {
        prompt: "Que rappelle le film quand la situation le demande ?",
        choices: ["Le médecin d'abord", "Toujours vendre un produit", "Ne jamais poser de question"],
        correct: [0],
        explanation: "« Quand il le faut, le médecin d'abord. »",
      },
    ],
  },
  {
    slug: "tarif",
    title: "Le tarif, en clair",
    summary: "Un seul abonnement, tout est inclus. Pour aller plus loin : la vidéo du calcul sur la page Tarif du site.",
    file: "public/video/pharmaboost-tarif.mp4",
    poster: "public/video/pharmaboost-tarif.jpg",
    seconds: 39,
    vertical: false,
    required: false,
    quiz: [
      {
        prompt: "Combien d'abonnements PharmaBoost propose-t-il ?",
        choices: ["Un seul, tout est inclus", "Trois formules, avec des options payantes", "Aucun : on paie à chaque conseil"],
        correct: [0],
        explanation: "« Un seul abonnement. Tout est inclus. »",
      },
    ],
  },
];

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? "";
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refus : ce script ne s'exécute que sur une base locale (hôte lu : « ${host || "inconnu"} »).`);
  }
}

async function remove() {
  const storage = getStorageProvider();
  const contents = await prisma.trainingContent.findMany({ where: { id: { startsWith: PREFIX } }, select: { id: true, videoAssetKey: true } });
  for (const content of contents) {
    if (content.videoAssetKey) await storage.delete(content.videoAssetKey).catch(() => undefined);
    await storage.delete(posterKey(content.id)).catch(() => undefined);
  }
  const badges = await prisma.skillBadge.deleteMany({ where: { dedupeKey: { in: [...contents.map((content) => quizBadgeKey(content.id)), moduleBadgeKey(MODULE_ID)] } } });
  await prisma.trainingModule.deleteMany({ where: { id: MODULE_ID } });
  // Progression, tentatives, questions et étapes partent avec les contenus (suppression en cascade).
  const removed = await prisma.trainingContent.deleteMany({ where: { id: { startsWith: PREFIX } } });
  console.log(`✓ Exemple retiré : ${removed.count} contenu(s), le parcours, ${badges.count} badge(s).`);
}

function posterFromVideo(file: string): Buffer {
  const dir = mkdtempSync(path.join(os.tmpdir(), "academie-"));
  const out = path.join(dir, "poster.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "3", "-i", file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", out]);
  return readFileSync(out);
}

async function seed() {
  const storage = getStorageProvider();
  const now = new Date();
  const reviewedAt = now;
  const stamp = now.getTime();

  for (const [index, item] of ITEMS.entries()) {
    const id = `${PREFIX}${item.slug}`;
    const file = path.join(ROOT, item.file);
    if (!existsSync(file)) throw new Error(`Fichier introuvable : ${item.file}`);
    const existing = await prisma.trainingContent.findUnique({ where: { id }, select: { videoAssetKey: true } });

    const key = videoKey(id, "mp4", stamp);
    await storage.put(key, readFileSync(file), "video/mp4");
    if (existing?.videoAssetKey && existing.videoAssetKey !== key) await storage.delete(existing.videoAssetKey).catch(() => undefined);
    const poster = item.poster ? readFileSync(path.join(ROOT, item.poster)) : posterFromVideo(file);
    await storage.put(posterKey(id), poster, "image/jpeg");

    const data = {
      title: item.title,
      summary: item.summary,
      kind: "MICRO_VIDEO" as const,
      url: null,
      body: null,
      orientation: item.vertical ? ("VERTICAL" as const) : ("HORIZONTAL" as const),
      videoAssetKey: key,
      posterUrl: mediaPath(id, "poster", stamp),
      durationSeconds: item.seconds,
      durationMinutes: 1,
      authorName: AUTHOR,
      authorRole: "Films de présentation de PharmaBoost",
      academyTopic: "NEW_STAFF" as const,
      isSponsored: false,
      partnerId: null,
      isFreeAccess: true,
      isActive: true,
      reviewStatus: "APPROVED" as const,
      reviewedBy: AUTHOR,
      reviewedAt,
      reviewerIsPharmacist: false,
      reviewNote: null,
      // Publiés du plus ancien au plus récent dans l'ordre du parcours (quelques secondes d'écart).
      publishedAt: new Date(now.getTime() - (ITEMS.length - index) * 1000),
      validUntil: null,
      quizPassPercent: 70,
      sourceLabel: SOURCE,
      laboratory: null,
      pharmacyId: null,
    };
    await prisma.trainingContent.upsert({ where: { id }, update: data, create: { id, ...data } });
    await prisma.quizQuestion.deleteMany({ where: { contentId: id } });
    for (const [position, question] of item.quiz.entries()) {
      // La bonne réponse n'est pas toujours la première : rotation fixe des choix (même résultat à chaque lancement).
      const shift = (index + position + 1) % question.choices.length;
      const choices = question.choices.map((_, at) => question.choices[(at + shift) % question.choices.length]);
      const correctIndexes = question.correct.map((at) => (at - shift + question.choices.length) % question.choices.length);
      await prisma.quizQuestion.create({
        data: { contentId: id, position: position + 1, prompt: question.prompt, choices, correctIndexes, explanation: question.explanation, sourceLabel: `Film « ${item.title} », PharmaBoost` },
      });
    }
    console.log(`  · ${item.title} (${item.seconds} s, ${item.quiz.length} question${item.quiz.length > 1 ? "s" : ""})`);
  }

  const mod = {
    slug: MODULE_SLUG,
    title: "Bien démarrer avec PharmaBoost",
    summary: "Exemple de parcours : six vidéos courtes pour comprendre ce que fait PharmaBoost au comptoir, avec un quiz après chacune. Rien sur les médicaments : l'outil, seulement.",
    audience: "NEW_STAFF" as const,
    isFreeAccess: true,
    isSponsored: false,
    partnerId: null,
    reviewStatus: "APPROVED" as const,
    reviewedBy: AUTHOR,
    reviewedAt,
    publishedAt: now,
    sortOrder: 0,
    isActive: true,
  };
  await prisma.trainingModule.upsert({ where: { id: MODULE_ID }, update: mod, create: { id: MODULE_ID, ...mod } });
  await prisma.trainingModuleItem.deleteMany({ where: { moduleId: MODULE_ID } });
  for (const [index, item] of ITEMS.entries()) {
    await prisma.trainingModuleItem.create({ data: { moduleId: MODULE_ID, contentId: `${PREFIX}${item.slug}`, position: index + 1, isRequired: item.required } });
  }
  console.log(`✓ Parcours « ${mod.title} » : ${ITEMS.length} étapes, stockage « ${storage.info.id} ».`);
  console.log("  Ouvrir : http://localhost:3000/m/formations (compte gratuit etudiant.demo@pharmaboost.test, ou une équipe).");
}

async function main() {
  assertLocalDatabase();
  if (process.argv.includes("--supprimer")) await remove();
  else await seed();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
