// Rendu des films.
//   node scripts/export.mjs brouillon [Film…]  → out/brouillons/<film>-540p.mp4 (rapide, pour relire le montage)
//   node scripts/export.mjs final [Film…]      → master 4K, puis out/<film>-4k.mp4 et out/<film>-1080p.mp4
//   node scripts/export.mjs exports [Film…]    → seulement les fichiers finaux, depuis les masters existants
//   node scripts/export.mjs web [Film…]        → les fichiers du site : ../public/video/<film>.mp4 et son affiche <film>.jpg
// Sans nom de film : tous les films (en mode web : les films du site, Partenaires et Tarif, sans Lancement).
// Les noms sont les identifiants de src/Root.tsx.
//
// Netteté : le final est calculé en 4K (échelle 2, images JPEG qualité 100) puis
// réduit en 1080p au filtre Lanczos — le texte des écrans est suréchantillonné.
// Le mode web calcule directement en 1080p : le site ne sert que ce format, et
// la compression web (CRF 26) efface l'écart avec un master 4K — 4 à 5 fois
// moins de temps de calcul.
// Son : −16 LUFS intégrés (niveau web), crête d'échantillon −2 dBFS (≈ −1,5 dBTP). Un gain CONSTANT, mesuré en deux passes,
// puis un limiteur à anticipation : jamais loudnorm, qui repasse en contrôle automatique de gain (fenêtre de 3 s) dès que
// la crête l'empêche de rester linéaire et aplatit les contrastes voulus (silence de l'éveil, chute, fête).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const mode = process.argv[2] ?? "final";
const FILES = {
  Presentation: "pharmaboost-presentation",
  Lancement: "pharmaboost-lancement",
  CommentCaMarche: "pharmaboost-comment-ca-marche",
  Pourquoi: "pharmaboost-pourquoi",
  Avantages: "pharmaboost-avantages",
  SansOrdonnance: "pharmaboost-sans-ordonnance",
  Partenaires: "pharmaboost-partenaires",
  Tarif: "pharmaboost-tarif",
  Robot: "pharmaboost-robot",
  PriseEnMain: "pharmaboost-prise-en-main",
};
/**
 * L'affiche de chaque film du site : une image du film (numéro d'image à 60/s),
 * prise sur un écran du produit, jamais sur un titre. C'est ce que le visiteur
 * voit avant de lancer la vidéo. Lancement n'est pas sur le site : pas d'affiche.
 */
const POSTERS = {
  // L'île du poste ouverte sur les deux conseils, avant tout clic (raison, stock, Challenge, date courte) · « Puis deux
  // conseils : ». La durée du film suit la voix : après une nouvelle voix, revérifier cette image.
  Presentation: 1080,
  // Le logiciel de gestion et la bannière « 2 conseils disponibles » · « Les conseils arrivent sur la bannière. »
  CommentCaMarche: 574,
  // « Avec PharmaBoost » : la bannière sur l'amoxicilline, probiotique « Vendu » · « Le patient repart avec le bon conseil. »
  Pourquoi: 910,
  // 05 · la bannière ouverte, « Vendu » / « Non vendu », pastilles Challenge, Date courte, stock · « …gardent la décision. »
  Avantages: 1213,
  // La demande comprise : besoins reconnus, « À vérifier avant de proposer », deux produits en rayon avec prix et stock.
  SansOrdonnance: 800,
  // L'écran de vente : le conseil du moteur, « Délivrance », puis à part la carte « À découvrir · gamme partenaire » entourée.
  Partenaires: 880,
  // Les deux barres à la même échelle : 3 500 € de chiffre d'affaires estimé contre 126 € HT d'abonnement, la petite barre
  // entourée · « de 126 € HT ». La durée du film suit la voix : après une nouvelle voix, revérifier cette image.
  Tarif: 1600,
  // L'île du poste ouverte sur les deux conseils (Crème solaire SPF 50+, Flore Équilibre : raison, Challenge, Date courte,
  // stock), avant le premier clic, sans sous-titre. La durée suit la voix (public/voix/robot) : après une nouvelle voix,
  // revérifier cette image.
  Robot: 792,
};
const SITE = "../public/video";

const films = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(mode === "web" ? POSTERS : FILES);
for (const film of films) if (!FILES[film]) throw new Error(`Film inconnu : ${film} (${Object.keys(FILES).join(", ")})`);
if (mode === "web") for (const film of films) if (POSTERS[film] === undefined) throw new Error(`${film} n'est pas un film du site : pas d'affiche prévue dans POSTERS.`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

const TARGET_I = -16;
// Limite 0,79 = −2 dBFS d'échantillon ; retard d'anticipation compensé (latency) : le son reste calé sur l'image.
const LIMITER = "alimiter=limit=0.79:attack=1:release=60:level=0:latency=1";

/** Sonie intégrée (LUFS), crête vraie (dBTP) et crête d'échantillon (dBFS) du son de `input` passé dans `filters`. */
function measure(input, filters) {
  // ffmpeg écrit la mesure sur la sortie d'erreur.
  const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-vn", "-af", `${filters},ebur128=framelog=verbose:peak=true+sample`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 }).stderr;
  const summary = err.slice(err.lastIndexOf("Summary:"));
  const num = (re) => Number(summary.match(re)?.[1]);
  const m = { I: num(/I:\s+(-?[\d.]+) LUFS/), tp: num(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/), sp: num(/Sample peak:\s+Peak:\s+(-?[\d.]+) dBFS/) };
  if (!Number.isFinite(m.I)) throw new Error(`${input} : sonie illisible (ffmpeg ebur128)`);
  return m;
}

/**
 * Le réglage du son d'un master : passe 1, la sonie telle quelle ; passe 2, la sonie après gain et limiteur (le limiteur en
 * retire un peu), d'où le gain corrigé. Mémorisé : les deux exports d'un même master partagent la mesure.
 */
const levels = new Map();
function audioFilter(input) {
  if (levels.has(input)) return levels.get(input);
  const raw = measure(input, "anull");
  let gain = TARGET_I - raw.I;
  const trial = measure(input, `volume=${gain.toFixed(2)}dB,${LIMITER}`);
  gain += TARGET_I - trial.I;
  const af = `volume=${gain.toFixed(2)}dB,${LIMITER}`;
  const done = measure(input, af);
  const squash = raw.sp + gain + 2; // dB que le limiteur retire sur la plus haute crête
  console.log(`  son : ${raw.I.toFixed(1)} LUFS → ${done.I.toFixed(1)} LUFS (gain ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB), crête ${done.tp.toFixed(1)} dBTP, limiteur ${Math.max(0, squash).toFixed(1)} dB au plus fort`);
  if (squash > 6) console.warn(`  ⚠ le limiteur retire ${squash.toFixed(1)} dB sur les crêtes : une frappe est trop forte dans le mix (motion/sound.tsx).`);
  if (raw.sp >= -0.05) console.warn(`  ⚠ le mix de Remotion touche 0 dBFS (${raw.sp} dBFS) : il a peut-être écrêté avant le limiteur.`);
  levels.set(input, af);
  return af;
}

function encode(input, output, { scale, crf, audioBitrate }) {
  const vf = scale ? ["-vf", `scale=${scale}:flags=lanczos`] : [];
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    ...vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", ...COLOR,
    "-af", audioFilter(input), "-ar", "48000", "-c:a", "aac", "-b:a", audioBitrate,
    "-movflags", "+faststart", output,
  ]);
  console.log(`✓ ${output}`);
}

/** L'affiche : l'image `frame` exactement (pas une recherche approchée dans le temps), réduite en 1280×720. */
function poster(input, output, frame) {
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    "-vf", `select=eq(n\\,${frame}),scale=1280:720:flags=lanczos`, "-frames:v", "1", "-q:v", "2", output,
  ]);
  console.log(`✓ ${output} (image ${frame})`);
}

mkdirSync("out/brouillons", { recursive: true });
mkdirSync("out/masters", { recursive: true });
mkdirSync("out/web", { recursive: true });
for (const film of films) {
  const name = FILES[film];
  if (mode === "brouillon") {
    run("npx", ["remotion", "render", "src/index.ts", film, "out/brut.mp4", "--scale=0.5", "--crf=24", "--audio-bitrate=256k", "--log=error"]);
    encode("out/brut.mp4", `out/brouillons/${name}-540p.mp4`, { crf: 22, audioBitrate: "128k" });
    rmSync("out/brut.mp4");
  } else if (mode === "web") {
    // Un 1080p presque sans perte d'abord (gardé dans out/web pour reprendre l'affiche ou l'encodage sans tout recalculer),
    // puis le fichier du site : H.264 High, CRF 26, AAC 128k — les réglages des vidéos déjà en ligne.
    const brut = `out/web/${name}-1080p.mp4`;
    run("npx", ["remotion", "render", "src/index.ts", film, brut, "--scale=1", "--jpeg-quality=100", "--crf=12", "--x264-preset=medium", "--audio-bitrate=320k", "--log=error"]);
    encode(brut, `${SITE}/${name}.mp4`, { crf: 26, audioBitrate: "128k" });
    poster(brut, `${SITE}/${name}.jpg`, POSTERS[film]);
  } else {
    const master = `out/masters/${name}-4k.mp4`;
    if (mode !== "exports") run("npx", ["remotion", "render", "src/index.ts", film, master, "--scale=2", "--jpeg-quality=100", "--crf=10", "--x264-preset=medium", "--audio-bitrate=320k", "--timeout=240000", "--concurrency=4", "--log=error"]);
    encode(master, `out/${name}-4k.mp4`, { crf: 16, audioBitrate: "256k" });
    encode(master, `out/${name}-1080p.mp4`, { scale: "1920:1080", crf: 16, audioBitrate: "192k" });
  }
}
