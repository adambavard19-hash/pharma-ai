import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "../theme";
import { displayWord, type FilmKey, type SceneKey } from "../prise-en-main/script";
import { FPS, timeline, wordAt, type Timed } from "../prise-en-main/timeline";

/**
 * LES FILMS « PRISE EN MAIN » (17 oct. 2026) — un pour le titulaire, un pour le pharmacien, chacun avec SON espace : PharmaBoost
 * à côté du LGO, la bannière du comptoir (analyse, conseils, pastilles, vendu au scan, ligne supprimée dans LGPI, fin de vente),
 * puis les onglets que chacun voit vraiment, et son bilan du matin. Toutes les images sont de VRAIES captures (bannière :
 * /poste/ile ; logiciel : la pharmacie de démonstration Saint-Michel, ventes de test locales passées par le vrai moteur, défaites
 * après le tournage). Le LGO n'est jamais montré : un écran neutre le représente.
 *
 * Le son n'est PAS dans le rendu : scripts/guide-mix.mjs fait la bande-son (voix posées à l'échantillon près, musique continue),
 * ajoutée à l'image après coup. Les sous-titres suivent les mots minutés par ElevenLabs. 1920×1080 à 30 i/s, rendu à l'échelle 2.
 */

export const PEM_FPS = FPS;
const DEEP = "#03171A";
const GREEN = "#072A25";
const MINT = "#22C995";
const MINT_SOFT = "#58F2D8";
const LIME = "#E4F98A";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const tw = (t: number, a: number, b: number, from: number, to: number, easing = EASE) => interpolate(t, [a, b], [from, to], { ...clamp, easing });

/** Le temps (s) dans le film. */
function useT() {
  return useCurrentFrame() / PEM_FPS;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Le décor                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

function Backdrop() {
  const t = useT();
  const x = 70 + Math.sin(t / 9) * 8;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(60% 55% at ${x}% 28%, #0E3B34 0%, transparent 70%), linear-gradient(165deg, ${GREEN} 0%, ${DEEP} 78%)` }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "36px 36px", maskImage: "radial-gradient(70% 60% at 50% 40%, black, transparent)" }} />
    </AbsoluteFill>
  );
}

function Brand({ opacity = 1 }: { opacity?: number }) {
  return (
    <div style={{ position: "absolute", left: 64, top: 44, display: "flex", alignItems: "center", gap: 14, opacity, fontFamily: FONT, fontWeight: 700, fontSize: 30, color: "#fff", letterSpacing: "-0.015em" }}>
      <Img src={staticFile("prise-en-main/logo-robot.svg")} style={{ width: 46, height: 46 }} />
      <span>
        Pharma<span style={{ color: MINT_SOFT }}>Boost</span>
      </span>
    </div>
  );
}


function SceneChip({ label, t0 }: { label: string; t0: number }) {
  const t = useT();
  const k = tw(t, t0, t0 + 0.6, 0, 1);
  return (
    <div style={{ position: "absolute", right: 64, top: 48, opacity: k, transform: `translateY(${(1 - k) * -12}px)`, fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: MINT_SOFT, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.05)", borderRadius: 999, padding: "10px 20px" }}>
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les briques visuelles                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Un cadre lumineux qui entoure une zone (coordonnées dans l'espace de l'élément parent). */
function Ring({ x, y, w, h, t0, radius = 18 }: { x: number; y: number; w: number; h: number; t0: number; radius?: number }) {
  const t = useT();
  const k = tw(t, t0, t0 + 0.5, 0, 1);
  const pulse = 0.55 + 0.45 * Math.sin((t - t0) * 4);
  return (
    <div style={{ position: "absolute", left: x - 8, top: y - 8, width: w + 16, height: h + 16, borderRadius: radius, border: `5px solid ${LIME}`, opacity: k, transform: `scale(${1.08 - 0.08 * k})`, boxShadow: `0 0 ${24 + 18 * pulse}px rgba(228,249,138,${0.45 * pulse})` }} />
  );
}

/** Les repères des écrans ont été relevés sur les captures affichées à 2000 px de large : ramenés aux 1920 px CSS. */
const K = 1920 / 2000;

/** Une capture du logiciel dans une fenêtre de navigateur, avec un zoom (caméra) qui suit la scène. */
function AppWindow({ src, cam, rings = [] }: { src: string; cam: { t: number; x: number; y: number; z: number }[]; rings?: { x: number; y: number; w: number; h: number; t0: number }[] }) {
  const t = useT();
  // Les coordonnées de caméra et des cadres sont celles de la capture (1920 × 1080, pixels CSS).
  const at = (key: "x" | "y" | "z") => interpolate(t, cam.map((c) => c.t), cam.map((c) => c[key]), { ...clamp, easing: EASE_IO });
  const W = 1600;
  const H = 900;
  const s = W / 1920;
  const z = cam.length > 1 ? at("z") : cam[0].z;
  const cx = cam.length > 1 ? at("x") : cam[0].x;
  const cy = cam.length > 1 ? at("y") : cam[0].y;
  // La caméra ne montre jamais au-delà de la capture.
  const tx = Math.min(0, Math.max(W - 1920 * s * z, W / 2 - cx * K * s * z));
  const ty = Math.min(0, Math.max(H - 1080 * s * z, H / 2 - cy * K * s * z));
  return (
    <div style={{ position: "absolute", left: (1920 - W) / 2, top: 128, width: W, height: H + 44, borderRadius: 26, overflow: "hidden", background: "#fff", boxShadow: "0 50px 120px -30px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.08)" }}>
      <div style={{ height: 44, background: "#EEF3F2", display: "flex", alignItems: "center", gap: 10, padding: "0 20px" }}>
        {["#F26B5E", "#F5BE4F", "#5FC454"].map((c) => (
          <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />
        ))}
        <span style={{ marginLeft: 18, fontFamily: FONT, fontSize: 17, color: "#6B7C79", background: "#fff", borderRadius: 9, padding: "5px 18px" }}>pharmaboost.app</span>
      </div>
      <div style={{ position: "relative", width: W, height: H, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s * z})` }}>
          <Img src={staticFile(src)} style={{ width: 1920, height: 1080, display: "block" }} />
          {rings.map((r, i) => (
            <Ring key={i} x={r.x * K} y={r.y * K} w={r.w * K} h={r.h * K} t0={r.t0} radius={12} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Un écran neutre qui représente le LGO de la pharmacie (jamais un vrai logiciel tiers). */
function LgoScreen({ children, label = "Votre logiciel de pharmacie (LGO)" }: { children?: ReactNode; label?: string }) {
  const rows = [0.92, 0.7, 0.84, 0.6, 0.76, 0.66, 0.88];
  return (
    <div style={{ position: "absolute", left: 300, top: 150, width: 1320, height: 760, borderRadius: 28, background: "#E9EEF0", boxShadow: "0 50px 120px -30px rgba(0,0,0,.7)", overflow: "hidden" }}>
      <div style={{ height: 56, background: "#CBD5DA", display: "flex", alignItems: "center", gap: 10, padding: "0 26px" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: 99, background: "#AEBBC1" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 30, bottom: 26, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: "#46555C", background: "#fff", borderRadius: 999, padding: "10px 22px" }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 24, padding: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 34, borderRadius: 8, background: i === 1 ? "#B9C6CC" : "#D6DEE2" }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ height: 52, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", padding: "0 20px", gap: 16 }}>
            <div style={{ width: 160, height: 14, borderRadius: 7, background: "#C4CFD4" }} />
            <div style={{ width: 90, height: 14, borderRadius: 7, background: "#DCE3E6" }} />
          </div>
          {rows.map((w, i) => (
            <div key={i} style={{ height: 40, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", padding: "0 20px", gap: 20 }}>
              <div style={{ width: `${w * 50}%`, height: 12, borderRadius: 6, background: "#D3DBDF" }} />
              <div style={{ marginLeft: "auto", width: 70, height: 12, borderRadius: 6, background: "#DCE3E6" }} />
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Une capture de la bannière (île du poste), qui entre en douceur. */
function Island({ src, t0, t1 = 1e9, width, left, top, style }: { src: string; t0: number; t1?: number; width: number; left: number; top: number; style?: CSSProperties }) {
  const t = useT();
  const { fps } = useVideoConfig();
  if (t < t0 - 0.05 || t > t1 + 0.4) return null;
  const k = spring({ frame: Math.round((t - t0) * fps), fps, config: { damping: 16, stiffness: 120 } });
  const out = tw(t, t1, t1 + 0.35, 1, 0);
  return <Img src={staticFile(src)} style={{ position: "absolute", left, top, width, opacity: Math.min(k, out), transform: `translateY(${(1 - k) * -40}px) scale(${0.96 + 0.04 * k})`, filter: "drop-shadow(0 40px 60px rgba(0,0,0,.5))", ...style }} />;
}

function Cursor({ path }: { path: { t: number; x: number; y: number }[] }) {
  const t = useT();
  if (t < path[0].t - 0.2) return null;
  const x = interpolate(t, path.map((p) => p.t), path.map((p) => p.x), { ...clamp, easing: EASE_IO });
  const y = interpolate(t, path.map((p) => p.t), path.map((p) => p.y), { ...clamp, easing: EASE_IO });
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.4))" }}>
      <path d="M4 2l15 9-6.5 1.6L9.8 19z" fill="#fff" stroke="#03171A" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** Le « bip » : une onde qui part de la douchette (dessinée simplement). */
function ScanPulse({ t0, x, y }: { t0: number; x: number; y: number }) {
  const t = useT();
  if (t < t0 || t > t0 + 1.4) return null;
  const k = (t - t0) / 1.4;
  return <div style={{ position: "absolute", left: x - 90 * k, top: y - 90 * k, width: 180 * k, height: 180 * k, borderRadius: 999, border: `4px solid ${MINT}`, opacity: 1 - k }} />;
}

function Scanner({ t0 }: { t0: number }) {
  const t = useT();
  const k = tw(t, t0, t0 + 0.6, 0, 1);
  return (
    <div style={{ position: "absolute", left: 90, top: 640, opacity: k, transform: `translateX(${(1 - k) * -40}px)`, fontFamily: FONT }}>
      <svg width="180" height="180" viewBox="0 0 64 64">
        <path d="M14 18h26l6 12-8 4-4-6H22l-4 20h-8l4-30z" fill="#1B4A44" stroke={MINT_SOFT} strokeWidth="2" strokeLinejoin="round" />
        <path d="M46 30l12 -6" stroke={LIME} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p style={{ color: "#C4D8D2", fontSize: 24, fontWeight: 600, marginTop: 6, textAlign: "center" }}>Le scan</p>
    </div>
  );
}

function Confetti({ t0 }: { t0: number }) {
  const t = useT();
  if (t < t0) return null;
  const pieces = Array.from({ length: 46 }, (_, i) => i);
  return (
    <>
      {pieces.map((i) => {
        const a = (i * 137.5 * Math.PI) / 180;
        const d = (t - t0) * (260 + (i % 7) * 40);
        const x = 960 + Math.cos(a) * d;
        const y = 420 + Math.sin(a) * d * 0.7 + (t - t0) ** 2 * 160;
        const o = tw(t, t0 + 1.2, t0 + 2.4, 1, 0);
        const colors = [LIME, MINT, "#F5B83D", MINT_SOFT, "#fff"];
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: 14, height: 8, borderRadius: 2, background: colors[i % colors.length], opacity: o, transform: `rotate(${i * 40 + (t - t0) * 300}deg)` }} />;
      })}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les sous-titres : les mots réellement prononcés, par groupes de 2 à 4, les mots clés en anis                         */
/* ------------------------------------------------------------------------------------------------------------------ */

type Chunk = { words: { text: string; key: boolean }[]; s: number; e: number };

/** Les groupes de mots d'une phrase : on coupe après une ponctuation, ou à 4 mots / 28 caractères. */
function chunksOf(line: Timed): Chunk[] {
  // La ponctuation isolée (« ? », « : », « « ») se rattache au mot d'avant ; « Pharma Boost » s'écrit en un mot.
  const tokens: { text: string; s: number; e: number }[] = [];
  for (const w of line.words) {
    const text = displayWord(w.w);
    if (!text) continue;
    const prev = tokens[tokens.length - 1];
    if (prev && /^[?!:;,.»]+$/.test(text)) {
      prev.text += text === "," || text === "." ? text : ` ${text}`;
      prev.e = w.e;
    } else if (prev && prev.text === "Pharma" && /^Boost/.test(text)) {
      prev.text = `Pharma${text}`;
      prev.e = w.e;
    } else tokens.push({ text, s: w.s, e: w.e });
  }
  const keys = line.keys.map((k) => k.toLowerCase());
  const isKey = (i: number) => keys.some((k) => {
    const parts = k.split(" ");
    for (let j = 0; j < parts.length; j++) {
      const at = i - j;
      if (at < 0) continue;
      if (parts.every((p, n) => (tokens[at + n]?.text ?? "").toLowerCase().replace(/[«»,.:;?!  ]/g, "").startsWith(p.replace(/[,.]/g, "")))) return true;
    }
    return false;
  });
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  tokens.forEach((tok, i) => {
    if (!cur) cur = { words: [], s: tok.s, e: tok.e };
    cur.words.push({ text: tok.text, key: isKey(i) });
    cur.e = tok.e;
    const len = cur.words.map((w) => w.text).join(" ").length;
    if (/[,.:;?!]\s*»?$/.test(tok.text) || cur.words.length >= 4 || len >= 28) {
      chunks.push(cur);
      cur = null;
    }
  });
  if (cur) chunks.push(cur);
  return chunks;
}

function Caption({ line }: { line: Timed }) {
  const t = useT();
  const chunks = chunksOf(line);
  // Un groupe reste affiché jusqu'au début du suivant (ou jusqu'à la fin du silence de la phrase).
  const i = chunks.findIndex((c, n) => t >= c.s - 0.05 && t < (chunks[n + 1]?.s ?? line.end + line.gapAfter) - 0.05);
  if (i < 0) return null;
  const c = chunks[i];
  const k = tw(t, c.s - 0.05, c.s + 0.12, 0, 1);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", justifyContent: "center" }}>
      <div style={{ opacity: k, transform: `translateY(${(1 - k) * 8}px)`, fontFamily: FONT, fontSize: 46, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff", background: "rgba(3,23,26,.74)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 22, padding: "14px 30px", boxShadow: "0 20px 60px -20px rgba(0,0,0,.6)" }}>
        {c.words.map((w, n) => (
          <span key={n} style={{ color: w.key ? LIME : "#fff" }}>
            {n > 0 ? " " : ""}
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les scènes                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Le centre de chaque onglet du menu (pixels des captures lues à 2000 px de large) : il diffère entre titulaire et pharmacien. */
const MENU: Record<FilmKey, Record<string, number>> = {
  titulaire: { comptoir: 104, associations: 187, stock: 235, dates: 283, performances: 331, historique: 379, equipe: 427 },
  pharmacien: { comptoir: 104, associations: 187, dates: 235, historique: 283 },
};
const SUPPORT_Y = 1047;
const menuRing = (film: FilmKey, key: string, t0: number) => ({ x: 14, y: MENU[film][key] - 23, w: 292, h: 46, t0 });

function SceneContent({ film, scene, lines }: { film: FilmKey; scene: SceneKey; lines: Timed[] }) {
  const t = useT();
  const first = lines[0];
  const second = lines[1] ?? lines[0];
  const W = (needle: string, line: Timed = first) => wordAt(line, needle);
  const pre = film === "titulaire" ? "t-" : "p-";
  switch (scene) {
    case "intro": {
      const a = Math.max(0, first.start - 0.7);
      const k = tw(t, a, a + 1, 0, 1);
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff" }}>
          <Img src={staticFile("prise-en-main/logo-robot.svg")} style={{ width: 170, height: 170, opacity: k, transform: `scale(${0.8 + 0.2 * k})` }} />
          <p style={{ marginTop: 26, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: MINT_SOFT, opacity: tw(t, a + 0.3, a + 1.1, 0, 1) }}>
            Prise en main · {film === "titulaire" ? "Titulaire" : "Pharmacien"}
          </p>
          <h1 style={{ marginTop: 10, fontSize: 118, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1, opacity: tw(t, a + 0.5, a + 1.3, 0, 1), transform: `translateY(${tw(t, a + 0.5, a + 1.3, 30, 0)}px)` }}>
            Pharma<span style={{ color: MINT_SOFT }}>Boost</span>
          </h1>
          <p style={{ marginTop: 22, fontSize: 36, color: "#C4D8D2", opacity: tw(t, a + 1, a + 1.8, 0, 1) }}>
            Le bon conseil, <span style={{ color: LIME, fontWeight: 700 }}>à chaque vente.</span>
          </p>
        </AbsoluteFill>
      );
    }
    case "lgo": {
      const scan = W("scann", second);
      return (
        <>
          <LgoScreen>
            <div style={{ position: "absolute", right: 30, bottom: 26, fontFamily: FONT, fontSize: 22, fontWeight: 700, color: "#1B4A44", background: "#D8F3E8", borderRadius: 999, padding: "10px 22px", opacity: tw(t, W("même"), W("même") + 0.5, 0, 1) }}>✓ Inchangé</div>
          </LgoScreen>
          <Scanner t0={scan - 0.4} />
          <ScanPulse t0={scan + 0.2} x={270} y={700} />
          <ScanPulse t0={scan + 0.5} x={270} y={700} />
          <Island src="prise-en-main/ile-2-replie.png" t0={W("conseil", second) - 0.3} width={760} left={580} top={152} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 268, textAlign: "center", fontFamily: FONT, fontSize: 28, fontWeight: 800, color: DEEP, opacity: tw(t, W("côté") - 0.1, W("côté") + 0.4, 0, 1) }}>
            <span style={{ background: LIME, borderRadius: 999, padding: "10px 24px" }}>PharmaBoost, à côté de votre logiciel</span>
          </div>
        </>
      );
    }
    case "analyse": {
      const g5 = second.start;
      const hover = W("souris", second);
      return (
        <>
          <LgoScreen />
          <Island src="prise-en-main/ile-1-analyse.png" t0={first.start + 0.2} t1={g5 - 0.2} width={740} left={590} top={152} />
          <Island src="prise-en-main/ile-2-replie.png" t0={g5 + 0.05} t1={hover + 0.9} width={820} left={550} top={152} />
          <Cursor path={[{ t: hover - 0.9, x: 1500, y: 700 }, { t: hover + 0.7, x: 900, y: 205 }]} />
          <Island src="prise-en-main/ile-2-conseil.png" t0={hover + 1.0} width={760} left={580} top={152} />
        </>
      );
    }
    case "conseils": {
      const Wd = 1080;
      const r = Wd / 1240;
      return (
        <div style={{ position: "absolute", left: (1920 - Wd) / 2, top: 150, width: Wd }}>
          <Island src="prise-en-main/ile-2-agrandi.png" t0={first.start - 0.3} width={Wd} left={0} top={0} />
          <Ring x={125 * r} y={185 * r} w={650 * r} h={80 * r} t0={W("produit")} radius={14} />
          <Ring x={125 * r} y={285 * r} w={550 * r} h={125 * r} t0={W("pastilles", second)} radius={14} />
        </div>
      );
    }
    case "vendu": {
      const scan = W("scann");
      const sold = W("vendu");
      const Wd = 1080;
      const r = Wd / 1240;
      return (
        <>
          <Scanner t0={scan - 0.5} />
          <ScanPulse t0={scan} x={270} y={700} />
          <div style={{ position: "absolute", left: (1920 - Wd) / 2, top: 150, width: Wd }}>
            <Island src="prise-en-main/ile-2-agrandi.png" t0={first.start - 0.3} t1={sold - 0.35} width={Wd} left={0} top={0} />
            <Island src="prise-en-main/ile-3-vendu.png" t0={sold - 0.3} width={Wd} left={0} top={0} />
            <Ring x={835 * r} y={335 * r} w={200 * r} h={75 * r} t0={sold} radius={40} />
          </div>
        </>
      );
    }
    case "fin": {
      const del = W("suppr");
      const auto = W("fin");
      return (
        <>
          {t < auto - 0.2 && <LgoDelete t0={del} />}
          <Island src="prise-en-main/ile-4-validee.png" t0={auto - 0.2} t1={second.start - 0.3} width={1180} left={370} top={170} />
          <Island src="prise-en-main/ile-5-terminee.png" t0={second.start - 0.1} width={1180} left={370} top={160} />
          <Confetti t0={W("célébré", second)} />
        </>
      );
    }
    case "comptoir": {
      const a = first.start;
      const live = W("direct");
      const done = W("terminées");
      const rings =
        film === "titulaire"
          ? [menuRing(film, "comptoir", W("comptoir")), { x: 790, y: 330, w: 760, h: 170, t0: live }, { x: 790, y: 540, w: 760, h: 450, t0: done }]
          : [menuRing(film, "comptoir", W("comptoir")), { x: 790, y: 232, w: 760, h: 172, t0: live }, { x: 790, y: 445, w: 760, h: 560, t0: done }];
      return <AppWindow src={`prise-en-main/${pre}vente_nouvelle.jpg`} cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: live - 1.2, x: 960, y: 540, z: 1 }, { t: live + 0.6, x: 1160, y: film === "titulaire" ? 560 : 480, z: 1.45 }]} rings={rings} />;
    }
    case "historique": {
      const a = first.start;
      const k = W("conseils");
      return <AppWindow src={`prise-en-main/${pre}historique.jpg`} cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: k - 1.4, x: 960, y: 540, z: 1 }, { t: k + 0.4, x: 1170, y: 520, z: 1.35 }]} rings={[menuRing(film, "historique", W("historique")), { x: 505, y: 460, w: 1320, h: 95, t0: k }]} />;
    }
    case "performances": {
      const a = first.start;
      const c = W("classement");
      return <AppWindow src="prise-en-main/t-pilotage.jpg" cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: c - 0.8, x: 960, y: 540, z: 1 }, { t: c + 0.8, x: 1160, y: 640, z: 1.3 }]} rings={[menuRing(film, "performances", W("performances")), { x: 480, y: 480, w: 1373, h: 495, t0: c }]} />;
    }
    case "resultats": {
      const a = first.start;
      return <AppWindow src="prise-en-main/t-resultats.jpg" cam={[{ t: a, x: 1160, y: 560, z: 1.25 }, { t: W("pdf") - 1, x: 1160, y: 560, z: 1.25 }, { t: W("pdf") + 0.3, x: 1400, y: 500, z: 1.5 }]} rings={[{ x: 1172, y: 537, w: 210, h: 95, t0: W("chiffre") }, { x: 1658, y: 400, w: 170, h: 40, t0: W("pdf") }]} />;
    }
    case "stock": {
      const a = first.start;
      const rayon = W("rayon");
      return <AppWindow src="prise-en-main/t-stock.jpg" cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: W("jour") - 0.3, x: 960, y: 540, z: 1 }, { t: rayon, x: 1160, y: 560, z: 1.4 }]} rings={[menuRing(film, "stock", W("stock")), { x: 810, y: 270, w: 712, h: 58, t0: W("jour") }, { x: 1410, y: 640, w: 115, h: 460, t0: rayon }]} />;
    }
    case "dates": {
      const a = first.start;
      const scan = W("scann");
      const prio = W("priorité");
      return <AppWindow src={`prise-en-main/${pre}stock_dates-courtes.jpg`} cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: scan, x: 960, y: 540, z: 1 }, { t: prio, x: 1170, y: 470, z: 1.35 }]} rings={[menuRing(film, "dates", W("dates")), { x: 1622, y: 254, w: 190, h: 44, t0: scan }, { x: 480, y: 440, w: 1373, h: 235, t0: prio }]} />;
    }
    case "associations": {
      const a = first.start;
      const k = W("quand");
      return <AppWindow src={`prise-en-main/${pre}associations.jpg`} cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: k - 1.2, x: 960, y: 540, z: 1 }, { t: k + 0.4, x: 1166, y: 600, z: 1.35 }]} rings={[menuRing(film, "associations", W("associations")), { x: 505, y: 545, w: 1323, h: 65, t0: k }]} />;
    }
    case "equipe": {
      const a = first.start;
      return <AppWindow src="prise-en-main/t-equipe.jpg" cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: W("chacun") - 1, x: 960, y: 540, z: 1 }, { t: W("chacun") + 0.6, x: 1166, y: 560, z: 1.3 }]} rings={[menuRing(film, "equipe", W("équipe")), { x: 1444, y: 496, w: 189, h: 42, t0: W("ajoutez") }, { x: 700, y: 650, w: 933, h: 225, t0: W("chacun") }]} />;
    }
    case "bilan": {
      const a = first.start;
      const b = lines[lines.length - 1].end;
      const src = film === "titulaire" ? "prise-en-main/bilan-email.png" : "prise-en-main/bilan-email-membre.png";
      const subject = film === "titulaire" ? "Votre bilan d'hier — Pharmacie Saint-Michel" : "Votre performance d'hier — Pharmacie Saint-Michel";
      const scroll = film === "titulaire" ? -560 : -360;
      const y = tw(t, a + 1.4, b, 0, scroll, EASE_IO);
      const k = tw(t, a - 0.3, a + 0.5, 0, 1);
      return (
        <div style={{ position: "absolute", left: 560, top: 140, width: 800, height: 840, borderRadius: 30, overflow: "hidden", background: "#F4F6F8", opacity: k, transform: `translateY(${(1 - k) * 40}px)`, boxShadow: "0 50px 120px -30px rgba(0,0,0,.7)" }}>
          <div style={{ height: 70, background: "#fff", borderBottom: "1px solid #E3EBE8", display: "flex", alignItems: "center", gap: 16, padding: "0 26px", fontFamily: FONT }}>
            <Img src={staticFile("prise-en-main/logo-robot.svg")} style={{ width: 40, height: 40 }} />
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: "#0D1F1D" }}>{subject}</p>
              <p style={{ fontSize: 15, color: "#6B7C79" }}>PharmaBoost · 📎 bilan-du-jour.pdf</p>
            </div>
          </div>
          <Img src={staticFile(src)} style={{ width: 800, transform: `translateY(${y}px)` }} />
        </div>
      );
    }
    case "outro": {
      const a = first.start;
      const end = first.end;
      const card = tw(t, end - 2.4, end - 1.4, 0, 1);
      const sup = W("contact");
      return (
        <>
          <div style={{ opacity: 1 - card }}>
            <AppWindow src={`prise-en-main/${pre}vente_nouvelle.jpg`} cam={[{ t: a, x: 960, y: 540, z: 1 }, { t: sup - 1, x: 960, y: 540, z: 1 }, { t: sup + 0.4, x: 420, y: 880, z: 1.8 }]} rings={[{ x: 12, y: SUPPORT_Y - 21, w: 308, h: 42, t0: sup }]} />
          </div>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff", opacity: card }}>
            <Img src={staticFile("prise-en-main/logo-robot.svg")} style={{ width: 150, height: 150 }} />
            <h1 style={{ marginTop: 22, fontSize: 104, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1 }}>
              Pharma<span style={{ color: MINT_SOFT }}>Boost</span>
            </h1>
            <p style={{ marginTop: 22, fontSize: 38, color: "#C4D8D2" }}>
              Le bon conseil, <span style={{ color: LIME, fontWeight: 700 }}>à chaque vente.</span>
            </p>
            <p style={{ marginTop: 40, fontSize: 26, color: "#8FB0A8" }}>pharmaboost.app · Contact@pharmaboost.app</p>
          </AbsoluteFill>
        </>
      );
    }
  }
  return null;
}

/** Une ligne supprimée dans le LGO (touche Suppr) : elle s'efface, et la bannière perd la boîte en même temps. */
function LgoDelete({ t0 }: { t0: number }) {
  const t = useT();
  const k = tw(t, t0 + 0.3, t0 + 1.0, 0, 1);
  return (
    <>
      <LgoScreen>
        <div style={{ position: "absolute", left: 312, top: 206, width: 980, height: 44, borderRadius: 8, background: `rgba(242,107,94,${0.4 * (1 - k)})`, border: `3px solid rgba(242,107,94,${1 - k})`, transform: `scaleY(${1 - k})`, transformOrigin: "center" }} />
        <div style={{ position: "absolute", right: 40, top: 120, fontFamily: FONT, fontSize: 26, fontWeight: 800, color: "#fff", background: "#C2463B", borderRadius: 12, padding: "10px 20px", opacity: tw(t, t0 - 0.1, t0 + 0.2, 0, 1) * (1 - tw(t, t0 + 1.6, t0 + 2.0, 0, 1)) }}>Suppr</div>
      </LgoScreen>
      <Island src="prise-en-main/ile-3-vendu-replie.png" t0={t0 - 0.6} t1={t0 + 0.9} width={760} left={580} top={152} />
      <Island src="prise-en-main/ile-2-replie.png" t0={t0 + 1.1} width={760} left={580} top={152} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Le film                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const SCENE_LABEL: Partial<Record<SceneKey, string>> = {
  lgo: "Votre logiciel", analyse: "La bannière", conseils: "La bannière", vendu: "La bannière", fin: "Fin de la vente", comptoir: "Au comptoir", historique: "Historique",
  performances: "Performances", resultats: "Performances", stock: "Mon stock", dates: "Dates courtes", associations: "Mes associations", equipe: "Mon équipe", bilan: "Le bilan du matin", outro: "Besoin d'aide ?",
};

const shift = (line: Timed, d: number): Timed => ({ ...line, start: line.start - d, end: line.end - d, words: line.words.map((w) => ({ ...w, s: w.s - d, e: w.e - d })) });

export function PriseEnMainFilm({ film }: { film: FilmKey }) {
  const { lines, total } = timeline(film);
  const order: SceneKey[] = [];
  for (const l of lines) if (!order.includes(l.scene)) order.push(l.scene);
  const spans = order.map((scene, i) => {
    const own = lines.filter((l) => l.scene === scene);
    const from = i === 0 ? 0 : own[0].start - 0.45;
    const next = order[i + 1];
    const to = next ? lines.find((l) => l.scene === next)!.start - 0.45 : total;
    return { scene, from, to, own };
  });
  return (
    <AbsoluteFill style={{ backgroundColor: DEEP }}>
      <Backdrop />
      {spans.map(({ scene, from, to, own }) => (
        <Sequence key={scene} from={Math.round(from * FPS)} durationInFrames={Math.max(1, Math.round((to - from) * FPS))} layout="none">
          <SceneFade from={from} to={to}>
            <SceneContent film={film} scene={scene} lines={own.map((l) => shift(l, from))} />
            {SCENE_LABEL[scene] && <SceneChip label={SCENE_LABEL[scene]!} t0={0.2} />}
          </SceneFade>
        </Sequence>
      ))}
      <Brand opacity={1} />
      {lines
        .filter((l) => l.scene !== "intro")
        .map((line) => {
          const from = Math.round(line.start * FPS) - 3;
          return (
            <Sequence key={line.id} from={from} durationInFrames={Math.round((line.end - line.start + line.gapAfter) * FPS) + 3} layout="none">
              <Caption line={shift(line, from / FPS)} />
            </Sequence>
          );
        })}
    </AbsoluteFill>
  );
}

export const PriseEnMainTitulaire = () => <PriseEnMainFilm film="titulaire" />;
export const PriseEnMainPharmacien = () => <PriseEnMainFilm film="pharmacien" />;

function SceneFade({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  const t = useT();
  const d = to - from;
  const o = Math.min(tw(t, 0, 0.45, 0, 1), tw(t, d - 0.45, d, 1, 0));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}
