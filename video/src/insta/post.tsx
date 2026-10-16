import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { FONT } from "../theme";
import { Mascot, type Track } from "../presentation/mascot";

/* ==========================================================================
 * LA PUBLICATION INSTAGRAM « QU'EST-CE QUE PHARMABOOST ? » (carrousel 4:5, 1080 × 1350, 7 pages).
 *
 * La direction artistique de la première publication, recolorée en bleu nuit (fondateur, 16 oct. 2026 : rien qui rappelle
 * le vert et le citron d'un concurrent) : lumières pervenche et menthe, liseré d'un pixel en dégradé de marque, le robot de PharmaBoost, beaucoup d'air. Une idée par
 * page : une étiquette, un titre, une phrase, une image.
 *
 * Les images de la bannière sont de VRAIES captures de la bannière du poste (public/insta : la page /poste/ile, jouée sur une
 * vente d'allergie — cétirizine → AllergiFlash, Stérimar Nez Allergique, Pranarôm Allergoforce, Azéol Gorge), posées seules,
 * sans logiciel de gestion derrière (fondateur, 16 oct. 2026). Ni photo de boîte ni prix, aucun chiffre promis hormis « en une
 * seconde » demandé par le fondateur, aucun prénom de robot, le mot « vente ».
 *
 * Rendu : npx remotion still src/index.ts InstaPost out/insta/pharmaboost-1.png --props='{"slide":1}' --frame=0
 * ======================================================================== */

export type InstaPostProps = { slide: number };

// Bleu nuit, menthe du robot et pervenche (fondateur, 16 oct. 2026 : rien qui rappelle le vert et le citron d'un concurrent).
const A = {
  deep: "#04061A",
  green: "#0C1438",
  mint: "#A5B4FF",
  teal: "#6D7FD8",
  leaf: "#5CF2D6",
  lemon: "#5CF2D6",
  text: "#EEF2FF",
  soft: "#9AA6D6",
};

const TOTAL = 7;

const still = (events: Track["events"]): Track => ({ id: "insta", seed: 7, events, until: 4 });
const HAPPY = still([{ t: 0, kind: "mood", mood: "happy" }]);
const WAVE = still([{ t: 0, kind: "mood", mood: "happy" }, { t: 2.4, kind: "burst", burst: "wave" }]);

/** Le liseré d'un pixel en dégradé de marque, autour d'une forme arrondie. */
function Glow({ children, radius = 36, style }: { children: ReactNode; radius?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", borderRadius: radius, background: "linear-gradient(180deg,#141D4A 0%,#0A1030 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 30px 80px -30px rgba(0,0,0,.7)", ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          padding: 2,
          background: `linear-gradient(115deg, rgba(109,127,216,.7), rgba(165,180,255,.35) 38%, ${A.lemon} 52%, rgba(165,180,255,.35) 66%, rgba(109,127,216,.7))`,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}

function Frame({ index, children }: { index: number; children: ReactNode }) {
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: A.text, background: `radial-gradient(1200px 900px at 85% -10%, rgba(140,120,255,.22), transparent 60%), radial-gradient(1000px 800px at -10% 110%, rgba(92,242,214,.14), transparent 60%), linear-gradient(180deg, ${A.green} 0%, ${A.deep} 100%)` }}>
      {/* Une trame de points très discrète : la profondeur, sans bruit. */}
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(154,166,214,.12) 1.4px, transparent 1.4px)", backgroundSize: "36px 36px", maskImage: "linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.2))" }} />
      <div style={{ position: "absolute", top: 72, left: 84, right: 84, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mascot track={HAPPY} t={3} size={46} />
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>PharmaBoost</span>
        </div>
        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "0.18em", color: A.soft }}>
          {String(index).padStart(2, "0")} / {String(TOTAL).padStart(2, "0")}
        </span>
      </div>
      {children}
      <div style={{ position: "absolute", bottom: 72, left: 84, right: 84, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: A.soft, letterSpacing: "0.04em" }}>
        <span>pharmaboost.app</span>
        {index < TOTAL && <span style={{ color: A.lemon, fontWeight: 700 }}>Glissez →</span>}
      </div>
    </AbsoluteFill>
  );
}

/** Le bloc de texte, toujours au même endroit : étiquette, titre, phrase. */
function Text({ kicker, children, body, size = 92 }: { kicker: string; children: ReactNode; body?: ReactNode; size?: number }) {
  return (
    <div style={{ position: "absolute", left: 84, right: 84, bottom: 180 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: A.mint }}>{kicker}</div>
      <h1 style={{ margin: "22px 0 0", fontSize: size, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-0.035em" }}>{children}</h1>
      {body && <p style={{ margin: "28px 0 0", fontSize: 36, lineHeight: 1.38, color: "rgba(236,255,246,.76)", maxWidth: 860 }}>{body}</p>}
    </div>
  );
}

const Lemon = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <span style={{ color: A.lemon, ...style }}>{children}</span>;

/** La scène du haut : une lumière douce, et ce qu'on y pose au centre. */
function Stage({ top = 190, height = 560, glow = A.mint, children }: { top?: number; height?: number; glow?: string; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: 900, height: 620, borderRadius: "50%", background: `radial-gradient(closest-side, ${glow === A.lemon ? "rgba(92,242,214,.16)" : "rgba(140,120,255,.22)"}, transparent)` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>{children}</div>
    </div>
  );
}

/** Une vraie capture de la bannière du poste (2× : sa largeur CSS fois `zoom`). */
function Banner({ src, w, zoom = 2, style }: { src: string; w: number; zoom?: number; style?: CSSProperties }) {
  return <Img src={staticFile(`insta/${src}`)} style={{ width: w * zoom, filter: "drop-shadow(0 30px 60px rgba(0,0,0,.45))", ...style }} />;
}

const FOUR = ["Associations", "Dates courtes", "Challenges", "Stock"];

// ---- 1. Couverture -------------------------------------------------------------------------------------------------
function Cover() {
  return (
    <Frame index={1}>
      <Stage top={170} height={600}>
        <Mascot track={HAPPY} t={3} size={360} floating />
      </Stage>
      <Text kicker="Le copilote du comptoir" size={104} body="Le bon conseil, au bon moment, à chaque vente.">
        Qu&apos;est-ce que <Lemon>PharmaBoost</Lemon> ?
      </Text>
    </Frame>
  );
}

// ---- 2. Le problème ------------------------------------------------------------------------------------------------
function Problem() {
  return (
    <Frame index={2}>
      <Stage top={190} height={540}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, width: 820 }}>
          {FOUR.map((word) => (
            <Glow key={word} radius={30} style={{ height: 150, display: "flex", alignItems: "center", gap: 22, padding: "0 30px" }}>
              <span style={{ width: 56, height: 56, borderRadius: 999, border: "2px solid rgba(154,166,214,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: A.soft }}>?</span>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em" }}>{word}</span>
            </Glow>
          ))}
        </div>
      </Stage>
      <Text kicker="Le problème" body="Toutes les associations, les dates courtes, les challenges, le stock… et la file qui s'allonge.">
        Au comptoir, impossible de <Lemon>penser à tout</Lemon>.
      </Text>
    </Frame>
  );
}

// ---- 3. Vous bipez -------------------------------------------------------------------------------------------------
function Scan() {
  return (
    <Frame index={3}>
      <Stage>
        <Banner src="1-analyse.png" w={388} zoom={2.15} />
      </Stage>
      <Text kicker="01 · Vous bipez" body="À la douchette, comme d'habitude. La bannière lit la boîte et vérifie votre stock.">
        Rien ne change.
      </Text>
    </Frame>
  );
}

// ---- 4. Tout ça, en une seconde ------------------------------------------------------------------------------------
function Advice() {
  return (
    <Frame index={4}>
      <Stage top={180} height={580}>
        <Banner src="2-replie.png" w={378} zoom={2.3} />
        <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
          {FOUR.map((word) => (
            <span key={word} style={{ display: "inline-flex", alignItems: "center", height: 50, padding: "0 20px", borderRadius: 999, background: "rgba(92,242,214,.1)", border: "1.5px solid rgba(92,242,214,.45)", color: A.lemon, fontSize: 22, fontWeight: 700, whiteSpace: "nowrap" }}>
              ✓ {word}
            </span>
          ))}
        </div>
      </Stage>
      <Text kicker="02 · PharmaBoost y pense" body="Cétirizine bipée : quatre conseils allergie, pris dans votre rayon.">
        Tout ça, <Lemon style={{ whiteSpace: "nowrap" }}>en 1 seconde</Lemon>.
      </Text>
    </Frame>
  );
}

// ---- 5. Bipé, c'est vendu ------------------------------------------------------------------------------------------
function Decide() {
  return (
    <Frame index={5}>
      <Stage glow={A.lemon}>
        <Banner src="4-vendu.png" w={418} zoom={2.3} />
      </Stage>
      <Text kicker="03 · Vous décidez" body="Le client prend le conseil ? Vous le bipez : la bannière le passe en vendu, toute seule.">
        Bipé, c&apos;est <Lemon>vendu</Lemon>.
      </Text>
    </Frame>
  );
}

// ---- 6. Vous validez la vente --------------------------------------------------------------------------------------
function Validate() {
  return (
    <Frame index={6}>
      <Stage top={170} height={600}>
        <Banner src="6-validee.png" w={448} zoom={1.9} />
      </Stage>
      <Text kicker="04 · Vente validée" body="Le bilan part au patient s'il le souhaite. Sinon, la bannière passe seule au client suivant.">
        Le <Lemon>bilan</Lemon>, puis
        <br />
        le client suivant.
      </Text>
    </Frame>
  );
}

// ---- 7. Fin --------------------------------------------------------------------------------------------------------
function Outro() {
  return (
    <Frame index={7}>
      <Stage top={170} height={600} glow={A.lemon}>
        <Mascot track={WAVE} t={3} size={330} floating />
      </Stage>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 180 }}>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: A.mint }}>Scan · Conseil · Bilan</div>
        <h1 style={{ margin: "22px 0 0", fontSize: 92, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-0.035em" }}>
          Le pharmacien décide.
          <br />
          <Lemon>PharmaBoost</Lemon> l&apos;aide.
        </h1>
        <div style={{ marginTop: 44, display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "22px 40px", background: A.lemon, color: A.deep, fontSize: 34, fontWeight: 800 }}>
          Réservez une démo · pharmaboost.app
        </div>
      </div>
    </Frame>
  );
}

export function InstaPost({ slide }: InstaPostProps) {
  if (slide === 2) return <Problem />;
  if (slide === 3) return <Scan />;
  if (slide === 4) return <Advice />;
  if (slide === 5) return <Decide />;
  if (slide === 6) return <Validate />;
  if (slide === 7) return <Outro />;
  return <Cover />;
}
