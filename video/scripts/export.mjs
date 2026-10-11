// Rendu des films.
//   node scripts/export.mjs brouillon [Film…]  → out/brouillons/<film>-540p.mp4 (rapide, pour relire le montage)
//   node scripts/export.mjs final [Film…]      → master 4K, puis out/<film>-4k.mp4 et out/<film>-1080p.mp4
//   node scripts/export.mjs exports [Film…]    → seulement les fichiers finaux, depuis les masters existants
//   node scripts/export.mjs web [Film…]        → les fichiers du site : ../public/video/<film>.mp4 et son affiche <film>.jpg
// Sans nom de film : tous les films (en mode web : les films du site et Partenaires, sans Lancement).
// Les noms sont les identifiants de src/Root.tsx.
//
// Netteté : le final est calculé en 4K (échelle 2, images JPEG qualité 100) puis
// réduit en 1080p au filtre Lanczos — le texte des écrans est suréchantillonné.
// Le mode web calcule directement en 1080p : le site ne sert que ce format, et
// la compression web (CRF 26) efface l'écart avec un master 4K — 4 à 5 fois
// moins de temps de calcul.
// Son : normalisé en deux passes à −16 LUFS, crête −1,5 dBTP (niveau web).
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
};
/**
 * L'affiche de chaque film du site : une image du film (numéro d'image à 60/s),
 * prise sur un écran du produit, jamais sur un titre. C'est ce que le visiteur
 * voit avant de lancer la vidéo. Lancement n'est pas sur le site : pas d'affiche.
 */
const POSTERS = {
  // La bannière ouverte sur les deux conseils, pastilles entourées · « Choisi dans votre stock. »
  Presentation: 1103,
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
};
const SITE = "../public/video";

const films = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(mode === "web" ? POSTERS : FILES);
for (const film of films) if (!FILES[film]) throw new Error(`Film inconnu : ${film} (${Object.keys(FILES).join(", ")})`);
if (mode === "web") for (const film of films) if (POSTERS[film] === undefined) throw new Error(`${film} n'est pas un film du site : pas d'affiche prévue dans POSTERS.`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

function loudnorm(input) {
  // Première passe : mesure.
  // ffmpeg écrit la mesure sur la sortie d'erreur.
  const out = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = JSON.parse(out.slice(out.lastIndexOf("{"), out.lastIndexOf("}") + 1));
  return `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

function encode(input, output, { scale, crf, audioBitrate }) {
  const vf = scale ? ["-vf", `scale=${scale}:flags=lanczos`] : [];
  run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    ...vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high", "-pix_fmt", "yuv420p", ...COLOR,
    "-af", loudnorm(input), "-ar", "48000", "-c:a", "aac", "-b:a", audioBitrate,
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
    if (mode !== "exports") run("npx", ["remotion", "render", "src/index.ts", film, master, "--scale=2", "--jpeg-quality=100", "--crf=10", "--x264-preset=medium", "--audio-bitrate=320k", "--log=error"]);
    encode(master, `out/${name}-4k.mp4`, { crf: 16, audioBitrate: "256k" });
    encode(master, `out/${name}-1080p.mp4`, { scale: "1920:1080", crf: 16, audioBitrate: "192k" });
  }
}
