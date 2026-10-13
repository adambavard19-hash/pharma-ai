/**
 * Le bandeau des e-mails PharmaBoost : l'hélice d'ADN qui lâche son encre sur le fond menthe — la même scène que le fond
 * des pages de connexion (src/components/app/helix/), filmée image par image dans un Chromium sans fenêtre.
 *
 *   npm run emails:bandeau-adn
 *
 * Produit, servis par le site public (les e-mails les chargent en adresse absolue) :
 *   public/email/bandeau-adn.gif   l'image animée (boucle sans couture, ≈ 600 × 200) — Gmail, Apple Mail, iOS ;
 *   public/email/bandeau-adn.png   l'image fixe en 2× (1200 × 400) — repli, et ce que montre Outlook bureau, qui
 *                                   n'affiche que la première image d'un GIF : la première image du GIF est donc la plus belle
 *                                   (l'encre pleinement sortie), la même que l'image fixe.
 *
 * Fidélité : la scène n'est pas réécrite. Le script empaquette les vrais modules (helix-scene.ts, helix-shaders.ts,
 * helix-config.ts) avec esbuild, les monte sur un canvas, et remplace seulement l'horloge (`performance.now`) par une
 * horloge pilotée (chaque image avance d'exactement 1/fps de seconde, quelle que soit la vitesse de la machine) et le
 * hasard (`Math.random`) par un tirage semé : le résultat est reproductible (au pixel près : le GPU arrondit à sa façon).
 * La boucle est rendue sans couture par un fondu enchaîné de ses dernières images sur les premières (l'encre de la scène
 * n'est pas périodique à l'échelle de 3 à 4 s).
 *
 * Le nom « PharmaBoost » et le robot sont posés à gauche, en HTML, dans la page filmée : ils font partie de l'image.
 * Outils : Playwright (Chrome installé, sinon le Chromium de Playwright) et ffmpeg.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/email");

/** Taille affichée dans l'e-mail (px CSS) ; l'image fixe est rendue en 2×. */
const WIDTH = 600;
const HEIGHT = 200;
/** La boucle : durée, cadence, et la part fondue sur le début. */
const FPS = 12;
const LOOP_SECONDS = 3.5;
const CROSSFADE_SECONDS = 0.8;
/** Vitesse de la scène dans le bandeau : un peu plus vive qu'à l'écran, pour que l'encre bouge en 3,5 s. */
const SPEED = 1.6;
/** Temps de scène laissé avant la première image : l'encre a quitté l'hélice et remplit le cadre. */
const WARMUP_SECONDS = 6;
/** Recul de la caméra (12 à l'écran) : le bandeau montre l'hélice entière, couchée, et non un gros plan. */
const CAM_DIST = 24;
/** Palette du GIF : assez de nuances pour l'encre, assez peu pour le poids. */
const GIF_COLORS = 64;
/** Écart (0–255, par canal) sous lequel un pixel garde la valeur de l'image précédente — voir plus bas. */
const HOLD_THRESHOLD = 26;

async function bundleScene(): Promise<string> {
  const helix = path.join(ROOT, "src/components/app/helix");
  const result = await build({
    stdin: {
      contents: `
        import { DnaInkScene } from ${JSON.stringify(path.join(helix, "helix-scene.ts"))};
        import { DNA_INK_CONFIG } from ${JSON.stringify(path.join(helix, "helix-config.ts"))};
        window.__bandeau = { DnaInkScene, DNA_INK_CONFIG };
      `,
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  return result.outputFiles[0].text;
}

function pageHtml(robotDataUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;600&display=block" rel="stylesheet">
<style>
  html,body{margin:0;background:#eff4f2}
  #stage{position:relative;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#eff4f2}
  /* L'hélice couchée en travers du bandeau, décalée à droite du nom (comme le héros de la connexion : texte à gauche). */
  #scene{position:absolute;left:50%;top:50%;width:${HEIGHT * 2.2}px;height:${WIDTH * 1.5}px;transform:translate(-50%,-50%) translateX(${WIDTH * 0.2}px) rotate(-90deg)}
  canvas{display:block;width:100%;height:100%}
  #brand{position:absolute;left:30px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:12px;
    font-family:"Google Sans Flex","Google Sans","Helvetica Neue",Arial,sans-serif;color:#111a18}
  #brand img{width:52px;height:52px;display:block}
  #brand .nom{font-size:30px;font-weight:600;letter-spacing:-0.02em;line-height:1}
  #brand .nom b{font-weight:600;color:#246f65}
  #brand .sous{margin-top:5px;font-size:13px;color:#4f5755;letter-spacing:0}
  /* Un voile menthe sous le nom : il reste lisible quand l'encre passe derrière. */
  #veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(239,244,242,.92) 0%,rgba(239,244,242,.75) 30%,rgba(239,244,242,0) 52%)}
</style></head><body>
<div id="stage">
  <div id="scene"><canvas id="c"></canvas></div>
  <div id="veil"></div>
  <div id="brand"><img src="${robotDataUrl}" alt=""><div><div class="nom">Pharma<b>Boost</b></div><div class="sous">Le copilote intelligent de l'officine</div></div></div>
</div>
</body></html>`;
}

/** L'horloge pilotée et le hasard semé, posés avant la scène. */
const FAKE_CLOCK = `
  (() => {
    let now = 0;
    performance.now = () => now;
    window.__advance = (ms) => { now += ms; };
    // Le tirage des points (Math.random dans la scène), semé : la même encre à chaque exécution.
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
`;

async function launch(): Promise<Browser> {
  const args = ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"];
  try {
    return await chromium.launch({ channel: "chrome", headless: true, args });
  } catch {
    return await chromium.launch({ headless: true, args });
  }
}

async function main() {
  const [bundle, robot] = await Promise.all([bundleScene(), readFileSync(path.join(OUT_DIR, "robot-192.png"))]);
  const robotDataUrl = `data:image/png;base64,${robot.toString("base64")}`;

  const browser = await launch();
  const work = mkdtempSync(path.join(tmpdir(), "bandeau-adn-"));
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
    await page.setContent(pageHtml(robotDataUrl), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Avant la scène : elle lit l'horloge dès sa construction.
    await page.addScriptTag({ content: FAKE_CLOCK });
    await page.addScriptTag({ content: bundle });

    // La scène, montée comme par HelixBackdrop : taille en px CSS, densité plafonnée par la configuration.
    await page.evaluate((CAM_DIST) => {
      const w = window as unknown as {
        __bandeau: { DnaInkScene: new (c: HTMLCanvasElement, cfg: unknown) => { setSize(w: number, h: number): void; render(): boolean }; DNA_INK_CONFIG: Record<string, unknown> };
        __scene: { setSize(w: number, h: number): void; render(): boolean };
      };
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      const config = { ...w.__bandeau.DNA_INK_CONFIG, maxPixelRatio: 2, camDist: CAM_DIST };
      w.__scene = new w.__bandeau.DnaInkScene(canvas, config);
      w.__scene.setSize(canvas.clientWidth, canvas.clientHeight);
    }, CAM_DIST);
    await page.waitForFunction(() => (window as unknown as { __scene: { render(): boolean } }).__scene.render(), undefined, { timeout: 30_000, polling: 100 });

    // Pas fixes de 40 ms (sous le plafond de 50 ms de la scène) : l'encre avance exactement du temps voulu.
    const step = (sceneSeconds: number) =>
      page.evaluate((seconds) => {
        const w = window as unknown as { __advance(ms: number): void; __scene: { render(): boolean } };
        const slices = Math.max(1, Math.ceil(seconds / 0.04));
        for (let i = 0; i < slices; i++) {
          w.__advance((seconds * 1000) / slices);
          w.__scene.render();
        }
      }, sceneSeconds);

    await step(WARMUP_SECONDS);

    const loopFrames = Math.round(LOOP_SECONDS * FPS);
    const fadeFrames = Math.round(CROSSFADE_SECONDS * FPS);
    const raw: string[] = [];
    for (let i = 0; i < loopFrames + fadeFrames; i++) {
      if (i > 0) await step((SPEED * 1) / FPS);
      const file = path.join(work, `raw-${String(i).padStart(3, "0")}.png`);
      await page.locator("#stage").screenshot({ path: file });
      raw.push(file);
    }

    // Fondu enchaîné : les `fadeFrames` dernières images se fondent dans les premières, la boucle n'a pas de saut.
    // Image i de la boucle (i < fadeFrames) = mélange de raw[loopFrames + i] (suite naturelle) et raw[i].
    const frames: string[] = [];
    for (let i = 0; i < loopFrames; i++) {
      const file = path.join(work, `f-${String(i).padStart(3, "0")}.png`);
      if (i < fadeFrames) {
        const t = (i + 1) / (fadeFrames + 1); // part de l'image « début »
        const [tail, head] = await Promise.all([sharp(raw[loopFrames + i]).raw().toBuffer({ resolveWithObject: true }), sharp(raw[i]).raw().toBuffer()]);
        const mixed = Buffer.alloc(tail.data.length);
        for (let k = 0; k < mixed.length; k++) mixed[k] = Math.round(tail.data[k] * (1 - t) + head[k] * t);
        await sharp(mixed, { raw: { width: tail.info.width, height: tail.info.height, channels: tail.info.channels } }).png().toFile(file);
      } else {
        writeFileSync(file, readFileSync(raw[i]));
      }
      frames.push(file);
    }
    // La boucle commence là où le fondu est terminé : la première image du GIF est une vraie image de la scène
    // (Outlook bureau n'affiche qu'elle). On fait tourner la liste pour que l'image d'ouverture soit raw[fadeFrames].
    const ordered = [...frames.slice(fadeFrames), ...frames.slice(0, fadeFrames)];

    // Le poids : l'encre est faite de milliers de points qui bougent un peu partout, ce qu'un GIF compresse mal. Ramenée
    // à 1×, chaque image reprend la précédente là où elle n'a presque pas changé (écart sous HOLD_THRESHOLD) : ces pixels
    // deviennent identiques, le GIF ne les réécrit pas. La première image, elle, est entière.
    let previous: Buffer | null = null;
    for (let i = 0; i < ordered.length; i++) {
      const { data, info } = await sharp(ordered[i]).resize(WIDTH, HEIGHT, { kernel: "lanczos3" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      if (previous) {
        for (let k = 0; k < data.length; k += 3) {
          const delta = Math.max(Math.abs(data[k] - previous[k]), Math.abs(data[k + 1] - previous[k + 1]), Math.abs(data[k + 2] - previous[k + 2]));
          if (delta < HOLD_THRESHOLD) {
            data[k] = previous[k];
            data[k + 1] = previous[k + 1];
            data[k + 2] = previous[k + 2];
          }
        }
      }
      previous = data;
      await sharp(data, { raw: info }).png().toFile(path.join(work, `g-${String(i).padStart(3, "0")}.png`));
    }

    mkdirSync(OUT_DIR, { recursive: true });
    const gif = path.join(OUT_DIR, "bandeau-adn.gif");
    const png = path.join(OUT_DIR, "bandeau-adn.png");
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(work, "g-%03d.png"),
      "-vf", `split[a][b];[a]palettegen=max_colors=${GIF_COLORS}:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
      "-loop", "0", gif,
    ]);
    await sharp(ordered[0]).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(png);

    const kb = (file: string) => `${Math.round(statSync(file).size / 1024)} Ko`;
    console.log(`✓ ${path.relative(ROOT, gif)} — ${WIDTH} × ${HEIGHT}, ${loopFrames} images à ${FPS} i/s (${LOOP_SECONDS} s), ${kb(gif)}`);
    console.log(`✓ ${path.relative(ROOT, png)} — ${WIDTH * 2} × ${HEIGHT * 2}, ${kb(png)}`);
    if (statSync(gif).size > 600 * 1024) console.warn("⚠ le GIF dépasse 600 Ko : relever HOLD_THRESHOLD ou baisser GIF_COLORS.");
  } finally {
    await browser.close();
    if (process.env.BANDEAU_GARDER) console.log(`images gardées : ${work}`);
    else rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
