import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Mascot, type Track } from "../presentation/mascot";
import { ACT1, Backdrop, DotGrid, INK, JAKARTA, MONO, PB, Spot, glowMint, hero, label, rgba, support, title } from "../presentation/motion/kit";

/* ==========================================================================
 * LA PUBLICATION INSTAGRAM « QU'EST-CE QUE PHARMABOOST ? » (carrousel 4:5, 1080 × 1350, 7 pages).
 *
 * Le MÊME visuel que le film de présentation (fondateur, 16 oct. 2026) : son kit motion (src/presentation/motion/kit) —
 * l'encre #0B0F14 et ses deux halos sarcelle, la trame de points, le verre dépoli, Plus Jakarta Sans 800 et JetBrains Mono,
 * la menthe #36E8C8 des mots mis en valeur (soulignés), « Pharma » blanc et « Boost » menthe, le robot en blouse, les cartes
 * blanches et le bouton menthe « ✓ Vendu ». Comme le film : d'abord le problème, en gris (acte 1), puis la révélation.
 * Les étapes de la bannière sont de VRAIES captures de la bannière du poste (public/insta, la page /poste/ile jouée sur une vente
 * d'allergie : cétirizine → AllergiFlash, Stérimar Nez Allergique, Pranarôm Allergoforce, Azéol Gorge). Ni photo de boîte ni
 * prix (non vérifié), aucun chiffre promis, aucun prénom de robot.
 *
 * Rendu : npx remotion still src/index.ts InstaPost out/insta/pharmaboost-1.png --props='{"slide":1}' --frame=0
 * ======================================================================== */

export type InstaPostProps = { slide: number };

const TOTAL = 7;
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

// ---- Les vraies captures de la bannière du poste (public/insta) : la même page que les postes, jouée sur une vente d'allergie.
/** L'écran du logiciel de gestion, suggéré (lignes grises) ; la bannière flotte en haut, comme au comptoir. */
function Screen({ top, height, children }: { top: number; height: number; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 60, top, width: 960, height, borderRadius: 26, background: "#E9EEF1", overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.14)" }}>
      <div style={{ height: 52, background: "#1F4E79", display: "flex", alignItems: "center", gap: 22, padding: "0 26px", color: "rgba(255,255,255,.85)", fontFamily: JAKARTA, fontWeight: 700, fontSize: 18 }}>
        <span style={{ fontWeight: 800 }}>Logiciel de gestion</span>
        <span style={{ opacity: 0.7 }}>Vente</span>
        <span style={{ opacity: 0.7 }}>Stock</span>
        <span style={{ opacity: 0.7 }}>Patients</span>
      </div>
      <div style={{ position: "absolute", left: 30, right: 30, top: 80, display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} style={{ height: 34, borderRadius: 8, background: i === 2 ? "#CFEBD9" : "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>{children}</div>
    </div>
  );
}

/** Une capture de la bannière (2× : sa largeur affichée vaut la moitié des pixels, fois `zoom`). */
function Banner({ src, w, zoom = 1.8 }: { src: string; w: number; zoom?: number }) {
  return <Img src={staticFile(`insta/${src}`)} style={{ width: w * zoom, filter: "drop-shadow(0 24px 40px rgba(0,0,0,.35))" }} />;
}

// ---- 3. Vous bipez : la bannière analyse la boîte ---------------------------------------------------------------
function Scan() {
  return (
    <Frame index={3} mention>
      <div style={{ position: "absolute", top: 170, left: 72, right: 72, textAlign: "center", ...title(76), color: PB.white }}>
        Vous <span style={{ color: PB.mint }}>bipez</span>.
      </div>
      <Screen top={290} height={640}>
        <Banner src="1-analyse.png" w={388} zoom={2.2} />
      </Screen>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 140, textAlign: "center" }}>
        <Caption>
          Comme d&apos;habitude, à la douchette.
          <br />
          La bannière <M>analyse</M> la boîte aussitôt.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 4. PharmaBoost pense à tout ça, en 1 seconde ---------------------------------------------------------------
function Advice() {
  return (
    <Frame index={4} mention>
      <div style={{ position: "absolute", left: 60, right: 60, top: 170, display: "flex", gap: 12 }}>
        {["Associations", "Dates courtes", "Challenges", "Stock"].map((chip) => (
          <span key={chip} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", height: 58, borderRadius: 999, background: rgba(PB.mint, 0.12), border: `1px solid ${rgba(PB.mint, 0.45)}`, ...support(22), color: PB.mint2, whiteSpace: "nowrap" }}>
            ✓ {chip}
          </span>
        ))}
      </div>
      <Screen top={262} height={680}>
        <Banner src="2-replie.png" w={378} zoom={2.4} />
      </Screen>
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 130, textAlign: "center" }}>
        <Caption>
          PharmaBoost pense à <M>tout ça</M>, <M>en 1 seconde</M>.
          <br />
          CÉTIRIZINE bipée : 4 conseils allergie, en stock.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 5. Bipé, c'est vendu ------------------------------------------------------------------------------------------
function Decide() {
  return (
    <Frame index={5} mention>
      <div style={{ position: "absolute", top: 170, left: 0, right: 0, textAlign: "center", ...hero(140), color: "transparent", WebkitTextStroke: `3px ${rgba(PB.mint, 0.85)}`, filter: glowMint(0.35) }}>VENDU !</div>
      <Screen top={340} height={560}>
        <Banner src="4-vendu.png" w={418} zoom={2.1} />
        <div style={{ height: 18 }} />
        <Banner src="5-vendu-deploye.png" w={378} zoom={1.7} />
      </Screen>
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 140, textAlign: "center" }}>
        <Caption>
          Le client prend le conseil ? Vous le bipez :
          <br />
          il passe en <M>vendu</M>, tout seul.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 6. Vous validez la vente : le bilan, puis le client suivant ----------------------------------------------------
function Validate() {
  return (
    <Frame index={6} mention>
      <div style={{ position: "absolute", top: 170, left: 72, right: 72, textAlign: "center", ...title(70), color: PB.white }}>
        Vous <span style={{ color: PB.mint }}>validez</span> la vente.
      </div>
      <Screen top={280} height={700}>
        <Banner src="6-validee.png" w={448} zoom={1.62} />
        <div style={{ height: 8 }} />
        {/* Le « Bravo ! » seul : le résumé dessous se lit en page 6 par la légende. */}
        <div style={{ height: 150, overflow: "hidden" }}>
          <Banner src="7-terminee.png" w={388} zoom={1.45} />
        </div>
      </Screen>
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 140, textAlign: "center" }}>
        <Caption>
          Le <M>bilan</M> part au patient s&apos;il le souhaite,
          <br />
          et la bannière passe au client suivant.
        </Caption>
      </div>
    </Frame>
  );
}

// ---- 6. La signature du film --------------------------------------------------------------------------------------
function Outro() {
  return (
    <Frame index={7}>
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
  if (slide === 6) return <Validate />;
  if (slide === 7) return <Outro />;
  return <Cover />;
}
