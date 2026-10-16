import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { FONT } from "../theme";
import { Mascot, type Track } from "../presentation/mascot";

/* ==========================================================================
 * LA PUBLICATION INSTAGRAM « QU'EST-CE QUE PHARMABOOST ? » (carrousel 4:5, 1080 × 1350).
 *
 * La direction artistique « Aurore » de la bannière du poste : vert très profond, liseré lumineux teal → vert → citron
 * (le dégradé de marque du site), le robot de PharmaBoost dessiné comme sur le site. Épuré : un titre, une phrase, une
 * image par page. Aucun chiffre promis, aucun nom de robot, le mot « vente » (jamais ordonnance ni délivrance).
 *
 * Rendu : npx remotion still src/index.ts InstaPost out/insta/pharmaboost-1.png --props='{"slide":1}' --frame=0
 * ======================================================================== */

export type InstaPostProps = { slide: number };

const A = {
  deep: "#03171A",
  green: "#072A25",
  mint: "#58F2D8",
  teal: "#5FA594",
  leaf: "#74D6A0",
  lemon: "#E8FF9C",
  text: "#ECFFF6",
  soft: "#9FCBBB",
};

const TOTAL = 5;

const still = (events: Track["events"]): Track => ({ id: "insta", seed: 7, events, until: 4 });
const HAPPY = still([{ t: 0, kind: "mood", mood: "happy" }]);
const CURIOUS = still([{ t: 0, kind: "mood", mood: "curious" }]);
const WAVE = still([{ t: 0, kind: "mood", mood: "happy" }, { t: 2.4, kind: "burst", burst: "wave" }]);

/** Le liseré d'un pixel en dégradé de marque, autour d'une carte arrondie. */
function Glow({ children, radius = 36, style }: { children: ReactNode; radius?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", borderRadius: radius, background: "linear-gradient(180deg,#0A332D 0%,#04201D 100%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 30px 80px -30px rgba(0,0,0,.7)", ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          padding: 2,
          background: `linear-gradient(115deg, rgba(95,165,148,.65), rgba(116,214,160,.35) 38%, ${A.lemon} 52%, rgba(116,214,160,.35) 66%, rgba(95,165,148,.65))`,
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
    <AbsoluteFill style={{ fontFamily: FONT, color: A.text, background: `radial-gradient(1200px 900px at 85% -10%, rgba(232,255,156,.10), transparent 60%), radial-gradient(1000px 800px at -10% 110%, rgba(88,242,216,.12), transparent 60%), linear-gradient(180deg, ${A.green} 0%, ${A.deep} 100%)` }}>
      {/* Une trame de points très discrète : la profondeur, sans bruit. */}
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(159,203,187,.10) 1.4px, transparent 1.4px)", backgroundSize: "36px 36px", maskImage: "linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.2))" }} />
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

function Kicker({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: A.mint }}>{children}</div>;
}

function Title({ children, size = 92 }: { children: ReactNode; size?: number }) {
  return <h1 style={{ margin: "22px 0 0", fontSize: size, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-0.035em" }}>{children}</h1>;
}

function Body({ children }: { children: ReactNode }) {
  return <p style={{ margin: "30px 0 0", fontSize: 38, lineHeight: 1.38, color: "rgba(236,255,246,.78)", maxWidth: 820 }}>{children}</p>;
}

const Lemon = ({ children }: { children: ReactNode }) => <span style={{ color: A.lemon }}>{children}</span>;

function Cover() {
  return (
    <Frame index={1}>
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -90, borderRadius: "50%", background: "radial-gradient(circle, rgba(88,242,216,.28), transparent 65%)" }} />
          <Mascot track={HAPPY} t={3} size={360} floating />
        </div>
      </div>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 190 }}>
        <Kicker>Le copilote du comptoir</Kicker>
        <Title size={104}>
          Qu&apos;est-ce que <Lemon>PharmaBoost</Lemon> ?
        </Title>
        <Body>Au comptoir, le bon conseil apparaît au bon moment. Vous gardez la main.</Body>
      </div>
    </Frame>
  );
}

function Barcode() {
  const bars = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2, 1, 3, 2, 1, 1, 4, 1, 2, 1, 1, 3, 2, 1, 2];
  let x = 0;
  return (
    <Glow style={{ width: 760, height: 360, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="560" height="210" viewBox="0 0 560 210">
        {bars.map((w, i) => {
          const rect = i % 2 === 0 ? <rect key={i} x={x * 6.4} y={0} width={w * 6.4} height={170} rx={2} fill={A.text} opacity={0.92} /> : null;
          x += w;
          return rect;
        })}
        <text x={280} y={204} textAnchor="middle" fill={A.soft} fontSize={26} letterSpacing={8} fontFamily={FONT}>
          3 400 9 · · · · · ·
        </text>
      </svg>
      {/* Le faisceau de la douchette. */}
      <div style={{ position: "absolute", left: 60, right: 60, top: "47%", height: 6, borderRadius: 6, background: `linear-gradient(90deg, transparent, ${A.lemon}, transparent)`, boxShadow: `0 0 36px 8px rgba(232,255,156,.45)` }} />
    </Glow>
  );
}

function Scan() {
  return (
    <Frame index={2}>
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Barcode />
      </div>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 190 }}>
        <Kicker>01 · Vous bipez</Kicker>
        <Title>Comme d&apos;habitude.</Title>
        <Body>La douchette, votre logiciel de gestion : rien ne change dans vos gestes.</Body>
      </div>
    </Frame>
  );
}

function AdviceCard({ name, why, sold, compact }: { name: string; why: string; sold?: boolean; compact?: boolean }) {
  return (
    <div style={{ borderRadius: 22, background: "#F5FAFC", color: "#10222F", padding: compact ? "16px 24px" : "20px 28px", display: "flex", alignItems: "center", gap: 22 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: compact ? 28 : 30, fontWeight: 800, letterSpacing: "-0.01em" }}>{name}</div>
        <div style={{ marginTop: 4, fontSize: compact ? 22 : 24, color: "#5A7280" }}>{why}</div>
        {!compact && <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700, color: "#087443" }}>● En stock</div>}
      </div>
      {sold ? (
        <div style={{ borderRadius: 999, padding: "14px 24px", background: "#22C88F", color: "#04261A", fontSize: 24, fontWeight: 800 }}>✓ Vendu</div>
      ) : (
        <div style={{ borderRadius: 999, padding: "14px 24px", border: "2px solid #DCE8EE", color: "#5A7280", fontSize: 22, fontWeight: 700 }}>à proposer</div>
      )}
    </div>
  );
}

function Island({ sold, count = 2 }: { sold: boolean; count?: number }) {
  return (
    <Glow radius={999} style={{ width: 760, padding: "22px 26px", display: "flex", alignItems: "center", gap: 20 }}>
      <Mascot track={sold ? HAPPY : CURIOUS} t={3} size={60} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 31, fontWeight: 700, whiteSpace: "nowrap" }}>
          <span style={{ width: 12, height: 12, borderRadius: 99, background: A.lemon, boxShadow: `0 0 14px ${A.lemon}` }} />{count} conseils suggérés
        </div>
        <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, letterSpacing: sold ? 0 : "0.16em", textTransform: sold ? "none" : "uppercase", color: sold ? A.lemon : A.soft }}>
          {sold ? "✓ 1 vendu" : "Survolez pour voir"}
        </div>
      </div>
      <div style={{ borderRadius: 999, padding: "12px 22px", border: "2px solid rgba(159,203,187,.45)", fontSize: 22, fontWeight: 700, whiteSpace: "nowrap" }}>Terminer la vente →</div>
    </Glow>
  );
}

/** Le médicament bipé, en tête : ce que la douchette a lu. */
function Scanned({ name, family }: { name: string; family: string }) {
  return (
    <Glow radius={32} style={{ width: 760, padding: "22px 28px", display: "flex", alignItems: "center", gap: 22 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(88,242,216,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={A.mint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
          <path d="m8.5 8.5 7 7" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: A.soft }}>Médicament bipé</div>
        <div style={{ marginTop: 4, fontSize: 36, fontWeight: 800, letterSpacing: "-0.015em" }}>{name}</div>
      </div>
      <div style={{ borderRadius: 999, padding: "10px 20px", background: "rgba(232,255,156,.14)", border: "1.5px solid rgba(232,255,156,.5)", color: A.lemon, fontSize: 22, fontWeight: 700 }}>{family}</div>
    </Glow>
  );
}

function Advice() {
  return (
    <Frame index={3}>
      <div style={{ position: "absolute", top: 160, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Scanned name="CÉTIRIZINE 10 mg" family="Allergie" />
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: A.mint }}>↓ 3 conseils dans votre rayon</div>
        <Glow radius={34} style={{ width: 760, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <AdviceCard compact name="Collyre anti-allergique" why="Les yeux qui piquent et qui pleurent" />
          <AdviceCard compact name="Eau de mer « nez allergique »" why="Rincer les pollens du nez" />
          <AdviceCard compact name="Pastilles pour la gorge" why="La gorge sèche sous antihistaminique" />
        </Glow>
      </div>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 190 }}>
        <Kicker>02 · Le robot cherche</Kicker>
        <Title size={84}>Le bon conseil, dans votre rayon.</Title>
        <Body>Pour chaque médicament, les produits utiles qui l&apos;accompagnent, pris dans votre stock.</Body>
      </div>
    </Frame>
  );
}

function Decide() {
  return (
    <Frame index={4}>
      <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
        <Island sold count={3} />
        <Glow radius={36} style={{ width: 760, padding: 26, display: "flex", flexDirection: "column", gap: 18 }}>
          <AdviceCard name="Collyre anti-allergique" why="Les yeux qui piquent et qui pleurent" sold />
        </Glow>
      </div>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 190 }}>
        <Kicker>03 · Vous décidez</Kicker>
        <Title>
          Bipé, c&apos;est <Lemon>vendu</Lemon>.
        </Title>
        <Body>Le client prend le conseil ? Vous le bipez, la bannière le note toute seule.</Body>
      </div>
    </Frame>
  );
}

function Outro() {
  return (
    <Frame index={5}>
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -80, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,255,156,.22), transparent 65%)" }} />
          <Mascot track={WAVE} t={3.0} size={320} floating />
        </div>
      </div>
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 190 }}>
        <Kicker>Scan · Conseil · Bilan</Kicker>
        <Title>
          Le pharmacien décide.
          <br />
          <Lemon>PharmaBoost</Lemon> l&apos;aide.
        </Title>
        <div style={{ marginTop: 44, display: "inline-flex", alignItems: "center", gap: 16, borderRadius: 999, padding: "22px 40px", background: A.lemon, color: "#03171A", fontSize: 34, fontWeight: 800 }}>
          Réservez une démo · pharmaboost.app
        </div>
      </div>
    </Frame>
  );
}

export function InstaPost({ slide }: InstaPostProps) {
  if (slide === 2) return <Scan />;
  if (slide === 3) return <Advice />;
  if (slide === 4) return <Decide />;
  if (slide === 5) return <Outro />;
  return <Cover />;
}
