import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Mascot, type Track } from "../presentation/mascot";
import { ACT1, Backdrop, DotGrid, Glass, INK, JAKARTA, MONO, PB, Spot, glowMint, hero, label, rgba, support, title } from "../presentation/motion/kit";

/* ==========================================================================
 * LA PUBLICATION INSTAGRAM « QU'EST-CE QUE PHARMABOOST ? » (carrousel 4:5, 1080 × 1350, 6 pages).
 *
 * Le MÊME visuel que le film de présentation (fondateur, 16 oct. 2026) : son kit motion (src/presentation/motion/kit) —
 * l'encre #0B0F14 et ses deux halos sarcelle, la trame de points, le verre dépoli, Plus Jakarta Sans 800 et JetBrains Mono,
 * la menthe #36E8C8 des mots mis en valeur (soulignés), « Pharma » blanc et « Boost » menthe, le robot en blouse, les cartes
 * blanches et le bouton menthe « ✓ Vendu ». Comme le film : d'abord le problème, en gris (acte 1), puis la révélation.
 * L'exemple : l'allergie, avec les vrais produits conseils de la pharmacie (boîtes détourées de la photo du fondateur,
 * public/produits/insta). Aucun prix (non vérifié), aucun chiffre promis, aucun prénom de robot.
 *
 * Rendu : npx remotion still src/index.ts InstaPost out/insta/pharmaboost-1.png --props='{"slide":1}' --frame=0
 * ======================================================================== */

export type InstaPostProps = { slide: number };

const TOTAL = 6;
const T = 2.4;
const STOCK = PB.stock;

const still = (events: Track["events"]): Track => ({ id: "insta", seed: 7, events, until: 4 });
const HAPPY = still([{ t: 0, kind: "mood", mood: "happy" }]);
const CURIOUS = still([{ t: 0, kind: "mood", mood: "curious" }]);
const PROUD = still([{ t: 0, kind: "mood", mood: "celebrate" }]);

/** Un mot mis en valeur, comme dans les sous-titres du film : menthe, souligné. */
const M = ({ children }: { children: ReactNode }) => <span style={{ color: PB.mint, textDecoration: "underline", textDecorationThickness: "0.08em", textUnderlineOffset: "0.16em" }}>{children}</span>;

/** « Pharma » blanc, « Boost » menthe : la signature du film. */
function Wordmark({ size, glow = false }: { size: number; glow?: boolean }) {
  return (
    <span style={{ ...title(size), whiteSpace: "nowrap" }}>
      <span style={{ color: PB.white }}>Pharma</span>
      <span style={{ color: PB.mint, filter: glow ? glowMint(0.7) : undefined }}>Boost</span>
    </span>
  );
}

/** La ligne de sous-titre du film : blanc 700, mots en menthe soulignés. */
function Caption({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...support(40), color: PB.white, lineHeight: 1.3, textShadow: "0 2px 20px rgba(0,0,0,.6)", ...style }}>{children}</div>;
}

function Frame({ index, mention = false, rays = false, act1 = false, children }: { index: number; mention?: boolean; rays?: boolean; act1?: boolean; children: ReactNode }) {
  return (
    <AbsoluteFill style={{ fontFamily: JAKARTA, color: PB.white, overflow: "hidden" }}>
      <Backdrop t={T} kind={act1 ? "act1" : "brand"} halo={1.15} />
      {rays && (
        // Les rayons de la révélation « Voici PharmaBoost ».
        <AbsoluteFill style={{ background: `repeating-conic-gradient(from 0deg at 50% 36%, ${rgba(PB.mint, 0.06)} 0deg 4deg, transparent 4deg 12deg)`, maskImage: "radial-gradient(circle at 50% 36%, #000 0%, transparent 62%)" }} />
      )}
      <DotGrid t={T} opacity={act1 ? 0.05 : 0.07} spacing={44} mask />
      <div style={{ position: "absolute", top: 64, left: 72, right: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mascot track={HAPPY} t={3} size={44} />
          <Wordmark size={36} />
        </div>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: "rgba(255,255,255,.55)" }}>
          {String(index).padStart(2, "0")} / {String(TOTAL).padStart(2, "0")}
        </span>
      </div>
      {mention && <div style={{ position: "absolute", top: 128, right: 72, ...label(15), color: "rgba(255,255,255,.4)" }}>Illustration · exemples</div>}
      {children}
      <div style={{ position: "absolute", bottom: 60, left: 72, right: 72, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...label(18), color: "rgba(255,255,255,.45)" }}>pharmaboost.app</span>
        {index < TOTAL && <span style={{ ...label(18), color: PB.mint }}>Glissez →</span>}
      </div>
    </AbsoluteFill>
  );
}

// ---- 1. La couverture : la révélation ------------------------------------------------------------------------------
function Cover() {
  return (
    <Frame index={1} rays>
      <Spot x={540} y={460} r={460} color={PB.mint} alpha={0.22} />
      <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Mascot track={HAPPY} t={3} size={400} floating />
      </div>
      <div style={{ position: "absolute", left: 40, right: 40, top: 790, textAlign: "center" }}>
        <div style={{ ...support(54), color: "rgba(255,255,255,.85)" }}>Qu&apos;est-ce que</div>
        <div style={{ marginTop: 14, whiteSpace: "nowrap" }}>
          <Wordmark size={128} glow />
          <span style={{ ...title(128), color: PB.white }}>&nbsp;?</span>
        </div>
        <Caption style={{ marginTop: 34 }}>
          Le <M>bon conseil</M>, à chaque vente.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 2. Le problème : au comptoir, impossible de penser à tout (acte 1 du film, gris sur encre) ----------------------
const OUBLIS = [
  { title: "Toutes les associations possibles", detail: "Pour chaque médicament, le produit qui l'accompagne." },
  { title: "Les dates courtes", detail: "Les boîtes à écouler avant qu'elles ne périment." },
  { title: "Les challenges du moment", detail: "Les produits que l'équipe met en avant." },
  { title: "Ce qu'il reste en stock", detail: "Ce qui est vraiment en rayon, aujourd'hui." },
];

function Problem() {
  return (
    <Frame index={2} act1>
      {/* La bulle « CONSEIL ? » du film. */}
      <div style={{ position: "absolute", top: 170, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", padding: "30px 64px", borderRadius: 999, background: ACT1.g2, boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
          <span style={{ ...hero(112), color: ACT1.g4 }}>
            CONSEIL <span style={{ color: PB.mint }}>?</span>
          </span>
          <div style={{ position: "absolute", left: 120, bottom: -26, width: 52, height: 52, background: ACT1.g2, transform: "rotate(45deg)", borderRadius: 8 }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 410 }}>
        <div style={{ ...title(64), color: PB.white, lineHeight: 1.08 }}>
          Au comptoir, personne ne peut <span style={{ color: PB.mint }}>penser à tout</span>.
        </div>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 18 }}>
          {OUBLIS.map((o) => (
            <div key={o.title} style={{ display: "flex", alignItems: "center", gap: 24, padding: "22px 28px", borderRadius: 24, background: ACT1.g1, border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: ACT1.g2, display: "flex", alignItems: "center", justifyContent: "center", color: ACT1.g3, fontFamily: MONO, fontWeight: 700, fontSize: 30 }}>?</div>
              <div>
                <div style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, letterSpacing: "-0.015em", color: ACT1.g4 }}>{o.title}</div>
                <div style={{ marginTop: 4, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: ACT1.g3 }}>{o.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 130, textAlign: "center" }}>
        <Caption style={{ color: ACT1.g4 }}>
          La file s&apos;allonge… et le <M>conseil</M> s&apos;oublie.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 3. Vous bipez : le comptoir, comme d'habitude ------------------------------------------------------------------
function Scan() {
  const bars = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 4, 1, 1, 2, 1, 3, 2, 1, 1, 4, 1, 2, 1, 1, 3, 2, 1, 2];
  let x = 0;
  return (
    <Frame index={3}>
      {/* Le mot héros du film, avec son reflet. */}
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ ...hero(150), color: PB.white }}>COMPTOIR</div>
        <div style={{ margin: "10px auto 0", width: 820, height: 3, background: "rgba(255,255,255,.75)" }} />
        <div style={{ ...hero(150), color: PB.white, transform: "scaleY(-1)", opacity: 0.16, maskImage: "linear-gradient(0deg, #000, transparent 70%)" }}>COMPTOIR</div>
      </div>
      {/* L'île de PharmaBoost qui attend la boîte, et le faisceau de la douchette. */}
      <Glass tone="dark" active={0.6} radius={999} style={{ left: 140, top: 640, width: 800, height: 100, display: "flex", alignItems: "center", gap: 22, padding: "0 30px" }}>
        <Mascot track={CURIOUS} t={3} size={64} />
        <span style={{ width: 12, height: 12, borderRadius: 12, background: PB.mint, boxShadow: `0 0 14px ${PB.mint}` }} />
        <span style={{ ...support(32), color: "rgba(255,255,255,.85)" }}>En attente d&apos;une boîte…</span>
      </Glass>
      <div style={{ position: "absolute", top: 790, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 560, height: 170 }}>
          <svg width="560" height="170" viewBox="0 0 560 170">
            {bars.map((w, i) => {
              const rect = i % 2 === 0 ? <rect key={i} x={x * 6.4} y={0} width={w * 6.4} height={170} rx={2} fill="rgba(255,255,255,.9)" /> : null;
              x += w;
              return rect;
            })}
          </svg>
          <div style={{ position: "absolute", left: -40, right: -40, top: 80, height: 6, borderRadius: 6, background: `linear-gradient(90deg, transparent, ${PB.mint2}, transparent)`, boxShadow: `0 0 34px 8px ${rgba(PB.mint, 0.5)}` }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 150, textAlign: "center" }}>
        <Caption>
          Vous <M>bipez</M>, comme d&apos;habitude.
          <br />
          Rien ne change dans votre logiciel.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 4. Le bon conseil : l'allergie, avec les vrais produits du rayon -----------------------------------------------
function Thumb({ src, size }: { src: string; size: number }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 16, background: "linear-gradient(160deg, #F4F8FA, #E6EEF2)", overflow: "hidden" }}>
      <Img src={staticFile(`produits/insta/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

function InStock() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 12px", borderRadius: 999, background: rgba(STOCK, 0.12), color: "#1B794A", fontFamily: JAKARTA, fontWeight: 600, fontSize: 17, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: STOCK }} />
      En stock
    </span>
  );
}

const CONSEILS = [
  { img: "allergiflash.jpg", name: "AllergiFlash", detail: "Collyre anti-allergique", why: "Les yeux qui piquent et qui pleurent" },
  { img: "sterimar.jpg", name: "Stérimar Nez Allergique", detail: "Eau de mer", why: "Rincer les pollens du nez" },
  { img: "pranarom.jpg", name: "Pranarôm Allergoforce", detail: "Spray nasal", why: "Le nez bouché de la rhinite allergique" },
  { img: "azeol.jpg", name: "Azéol Gorge", detail: "Miel citron", why: "La gorge sèche sous antihistaminique" },
];

function Advice() {
  return (
    <Frame index={4} mention>
      <Glass tone="dark" active={0.8} radius={32} style={{ left: 72, top: 172, width: 936, height: 830 }}>
        {/* L'en-tête de l'île : le médicament bipé, et le nombre de conseils. */}
        <div style={{ position: "absolute", left: 28, right: 28, top: 26, display: "flex", alignItems: "center", gap: 16 }}>
          <Mascot track={HAPPY} t={3} size={56} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 20px", borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", ...support(24), color: PB.white }}>
            <span style={{ ...label(14), color: "rgba(255,255,255,.55)" }}>Bipé</span> CÉTIRIZINE 10 mg
          </span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, height: 46, padding: "0 20px", borderRadius: 999, background: rgba(PB.mint, 0.14), border: `1px solid ${rgba(PB.mint, 0.5)}`, ...support(22), color: PB.mint }}>
            ✦ 4 conseils
          </span>
        </div>
        {/* Ce à quoi personne ne peut penser au comptoir (page 2) : PharmaBoost l'a vérifié, en une seconde. */}
        <div style={{ position: "absolute", left: 28, right: 28, top: 98, display: "flex", gap: 10 }}>
          {["Associations", "Dates courtes", "Challenges", "Stock"].map((chip) => (
            <span key={chip} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 999, background: rgba(PB.mint, 0.1), border: `1px solid ${rgba(PB.mint, 0.35)}`, ...support(19), color: PB.mint2, whiteSpace: "nowrap" }}>
              ✓ {chip}
            </span>
          ))}
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, top: 160, display: "flex", flexDirection: "column", gap: 12 }}>
          {CONSEILS.map((c) => (
            <div key={c.name} style={{ height: 150, borderRadius: 22, background: "#FFFFFF", display: "flex", alignItems: "center", gap: 22, padding: "0 22px", boxShadow: "0 18px 40px rgba(0,0,0,.35)" }}>
              <Thumb src={c.img} size={116} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...label(13), color: PB.teal2 }}>Conseil associé · {c.detail}</div>
                <div style={{ marginTop: 6, fontFamily: JAKARTA, fontWeight: 800, fontSize: 32, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ marginTop: 6, fontFamily: JAKARTA, fontWeight: 600, fontSize: 21, color: "#46555C" }}>{c.why}</div>
              </div>
              <InStock />
            </div>
          ))}
        </div>
      </Glass>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 140, textAlign: "center" }}>
        <Caption>
          PharmaBoost pense à <M>tout ça</M>, <M>en 1 seconde</M>.
          <br />
          Le bon conseil, pris dans votre rayon.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 5. Bipé, c'est vendu ------------------------------------------------------------------------------------------
function Decide() {
  return (
    <Frame index={5} mention>
      {/* Le mot en contour du film (« PROPOSEZ »). */}
      <div style={{ position: "absolute", top: 172, left: 0, right: 0, textAlign: "center", ...hero(150), color: "transparent", WebkitTextStroke: `3px ${rgba(PB.mint, 0.85)}`, filter: glowMint(0.35) }}>VENDU !</div>
      {/* Le compteur « Conseils vendus ». */}
      <Glass tone="dark" radius={999} style={{ left: 640, top: 360, width: 368, height: 64 }}>
        <span style={{ position: "absolute", left: 28, top: 19, ...support(22), color: "rgba(255,255,255,.75)" }}>Conseils vendus</span>
        <span style={{ position: "absolute", right: 30, top: 14, fontFamily: MONO, fontWeight: 700, fontSize: 32, color: PB.mint }}>1</span>
      </Glass>
      {/* La carte vendue, liseré vert et coche, comme dans le film. */}
      <div style={{ position: "absolute", left: 72, top: 460, width: 936, height: 300, borderRadius: 26, background: "#FFFFFF", boxShadow: `0 0 0 3px ${STOCK}, 0 0 48px ${rgba(STOCK, 0.5)}, 0 30px 80px rgba(0,0,0,.45)` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: `linear-gradient(90deg, ${rgba(STOCK, 0.12)}, ${rgba(STOCK, 0.05)})` }} />
        <div style={{ position: "absolute", left: 30, top: 38 }}>
          <Thumb src="allergiflash.jpg" size={224} />
        </div>
        <div style={{ position: "absolute", left: 286, top: 46, ...label(15), color: PB.teal2 }}>Conseil associé · CÉTIRIZINE 10 mg</div>
        <div style={{ position: "absolute", left: 286, top: 78, fontFamily: JAKARTA, fontWeight: 800, fontSize: 46, letterSpacing: "-0.02em", color: INK }}>AllergiFlash</div>
        <div style={{ position: "absolute", left: 286, top: 140, fontFamily: JAKARTA, fontWeight: 600, fontSize: 26, color: "#2A333D" }}>Collyre anti-allergique</div>
        <div style={{ position: "absolute", left: 286, top: 196 }}>
          <InStock />
        </div>
        <svg width={84} height={84} viewBox="0 0 76 76" style={{ position: "absolute", right: -26, top: -36, filter: `drop-shadow(0 8px 18px ${rgba(STOCK, 0.55)})` }}>
          <circle cx={38} cy={38} r={34} fill="#FFFFFF" stroke={STOCK} strokeWidth={4} />
          <path d="M 23 39 L 34 50 L 54 28" fill="none" stroke={STOCK} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {/* Le bouton menthe « ✓ Vendu » et le robot fier. */}
      <div style={{ position: "absolute", left: 72, top: 820, width: 360, height: 92, borderRadius: 999, background: PB.mint, boxShadow: `0 0 36px ${rgba(PB.mint, 0.55)}, 0 14px 30px rgba(0,0,0,.35)`, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: INK, fontFamily: JAKARTA, fontWeight: 800, fontSize: 34 }}>
        ✓ Vendu
      </div>
      <div style={{ position: "absolute", right: 90, top: 780 }}>
        <Mascot track={PROUD} t={3} size={200} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 140, textAlign: "center" }}>
        <Caption>
          Le client le prend ? Vous le bipez :
          <br />
          et hop, <M>vendu</M> !
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 6. La signature du film --------------------------------------------------------------------------------------
function Outro() {
  return (
    <Frame index={6}>
      <Spot x={540} y={430} r={420} color={PB.mint} alpha={0.2} />
      {/* L'orbite pointillée de la signature. */}
      <svg width={1080} height={1350} style={{ position: "absolute", inset: 0 }}>
        <ellipse cx={540} cy={640} rx={470} ry={250} fill="none" stroke={rgba(PB.mint, 0.35)} strokeWidth={2} strokeDasharray="4 12" transform="rotate(-8 540 640)" />
        <circle cx={130} cy={560} r={9} fill={PB.mint} opacity={0.8} />
        <circle cx={960} cy={720} r={7} fill={PB.gold} opacity={0.9} />
      </svg>
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Mascot track={HAPPY} t={3} size={330} floating />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 750, textAlign: "center" }}>
        <Wordmark size={132} glow />
        <Caption style={{ marginTop: 26, fontSize: 46 }}>
          Le <M>bon conseil</M>, <M>à chaque vente</M>.
        </Caption>
        <div style={{ marginTop: 50, display: "inline-flex", alignItems: "center", height: 92, padding: "0 48px", borderRadius: 999, background: PB.mint, boxShadow: `0 0 40px ${rgba(PB.mint, 0.5)}`, color: INK, fontFamily: JAKARTA, fontWeight: 800, fontSize: 40 }}>
          pharmaboost.app
        </div>
        <div style={{ marginTop: 22, ...support(28), color: "rgba(255,255,255,.7)" }}>Réservez une démo</div>
      </div>
    </Frame>
  );
}

export function InstaPost({ slide }: InstaPostProps) {
  if (slide === 2) return <Problem />;
  if (slide === 3) return <Scan />;
  if (slide === 4) return <Advice />;
  if (slide === 5) return <Decide />;
  if (slide === 6) return <Outro />;
  return <Cover />;
}
