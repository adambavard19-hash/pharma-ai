import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { C, EASE_IN_OUT, beats, sp, tw, useF } from "../theme";
import type { FilmSpec } from "../FilmShell";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words, type Word } from "../ui/kinetic";
import { LgoWindow } from "../ui/counter";
import { AdviceCard, Cursor, ProductTile, Toast } from "../ui/product";
import { CalendarBanner, Phone, PilotagePanel, PlanScreen } from "../ui/panels";
import { EndCard, LabsPanel, Panel } from "../ui/common";
import { Sfx } from "../ui/sfx";

/* ==========================================================================
 * « Les avantages » — 34 s, 128 BPM. Sept avantages, deux mesures chacun,
 * coupés sur le temps. Chaque avantage montre l'écran réel qui le prouve.
 * ======================================================================== */

const B = beats(128);
const BAR = B(4);
const ITEM = 2 * BAR;

type Item = { title: Word[][]; sub: string; visual: () => ReactNode };

const T = (a: string, b: string) => [words(a), words(b, C.brand600)];

const ITEMS: Item[] = [
  { title: T("Votre logiciel", "*ne change pas.*"), sub: "Même scan, même comptoir. PharmaBoost travaille à côté.", visual: () => <VisualSoftware /> },
  { title: T("Le conseil arrive", "*au bip.*"), sub: "Quelques secondes après la dernière boîte, en coin d'écran.", visual: () => <VisualToast /> },
  { title: T("Choisi", "*dans votre stock.*"), sub: "Uniquement ce que vous avez en rayon, avec le prix et la marge.", visual: () => <VisualStock /> },
  { title: T("Vous gardez", "*la décision.*"), sub: "Proposer, changer ou ignorer : un clic.", visual: () => <VisualDecision /> },
  { title: T("Vos laboratoires", "*en avant.*"), sub: "À conseil égal, leurs produits passent devant.", visual: () => <At x={980} y={250}><LabsPanel at={0} /></At> },
  { title: T("Un plan", "*pour chaque patient.*"), sub: "QR code, e-mail ou papier. Les rappels dans son agenda.", visual: () => <VisualPlan /> },
  { title: T("Vos résultats,", "*par collaborateur.*"), sub: "Proposés, acceptés, refusés : par jour, semaine, mois.", visual: () => <At x={930} y={170} style={{ transformOrigin: "0 0", transform: "scale(0.95)" }}><PilotagePanel at={0} /></At> },
];

function Intro({ intro }: { intro: number }) {
  const f = useF();
  const exit = tw(f, [BAR - 10, BAR + 4], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: (intro ? tw(f, [-intro, 0], [0, 1]) : 1) * (1 - exit), transform: `scale(${1 + 0.3 * exit})` }}>
      <DarkStage>
        <At x={0} y={360} w={1920}>
          <Kinetic at={4} size={136} color={C.white} align="center" stagger={3} lines={[words("*7 avantages*", C.accent300), words("pour votre comptoir.")]} />
        </At>
        {[4, 7, 10, 13, 16].map((a) => <Sfx key={a} at={a} name="tic" volume={0.5} />)}
      </DarkStage>
    </AbsoluteFill>
  );
}

function Advantage({ k, intro }: { k: number; intro: number }) {
  const f = useF();
  const item = ITEMS[k];
  const enter = tw(f, [-intro, 3], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [ITEM - 8, ITEM + intro], [0, 1], EASE_IN_OUT);
  const num = sp(f, 0, { damping: 14, stiffness: 170 });
  const visual = sp(f, 0, { damping: 22, stiffness: 150 });
  return (
    <AbsoluteFill style={{ opacity: Math.min(1, enter * 1.6), transform: `translateY(${(1 - enter) * 90 - exit * 90}px)` }}>
      <LightStage>
        <At x={108} y={150} style={{ overflow: "hidden", height: 210, display: "flex", alignItems: "flex-end", gap: 22 }}>
          <div style={{ fontSize: 200, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1, color: C.brand600, fontVariantNumeric: "tabular-nums", transform: `translateY(${(1 - num) * 105}%)` }}>
            0{k + 1}
          </div>
          <div style={{ paddingBottom: 26, fontSize: 30, fontWeight: 600, color: C.ink300, fontVariantNumeric: "tabular-nums", opacity: tw(f, [4, 12], [0, 1]) }}>/ 07</div>
        </At>
        <At x={120} y={420} w={820}>
          <Kinetic at={0} size={86} lines={item.title} stagger={2} />
          <div style={{ marginTop: 30, fontSize: 31, lineHeight: 1.35, color: C.ink600, maxWidth: 680, opacity: tw(f, [16, 28], [0, 1]), transform: `translateY(${(1 - tw(f, [16, 28], [0, 1])) * 12}px)` }}>{item.sub}</div>
        </At>
        <AbsoluteFill style={{ opacity: visual, transform: `translateX(${(1 - visual) * 120}px)` }}>{item.visual()}</AbsoluteFill>
        <Sfx at={0} name="swish" volume={0.55} />
        <Sfx at={2} name="impact" volume={0.22} />
        <Sfx at={4} name="tic" volume={0.45} />
        <Sfx at={8} name="tic" volume={0.4} />
      </LightStage>
    </AbsoluteFill>
  );
}

function VisualSoftware() {
  const f = useF();
  const chip = sp(f, 40, { damping: 16, stiffness: 180 });
  return (
    <>
      <At x={980} y={260}>
        <LgoWindow w={820} lines={[{ text: "AMOXICILLINE 1 g cp disp. — 1 boîte", at: 22 }]} />
      </At>
      <At x={1300} y={700} style={{ opacity: chip, transform: `translateY(${(1 - chip) * 30}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", borderRadius: 999, background: C.brand900, color: C.white, fontSize: 24, fontWeight: 600, boxShadow: "0 20px 40px -18px rgba(0,64,59,.6)" }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: C.brand300 }} /> PharmaBoost · boîte reçue
        </div>
      </At>
      <Sfx at={22} name="bip" volume={0.6} />
      <Sfx at={40} name="pop" volume={0.5} />
    </>
  );
}

function VisualToast() {
  const f = useF();
  const t = sp(f, 22, { damping: 20, stiffness: 200 });
  return (
    <>
      <At x={960} y={230}>
        <LgoWindow w={820} lines={[{ text: "AMOXICILLINE 1 g cp disp. — 1 boîte", at: -999 }, { text: "PARACÉTAMOL 1000 mg cp — 1 boîte", at: -999 }]} />
      </At>
      <At x={1200} y={520} style={{ opacity: t, transform: `translateY(${(1 - t) * 40}px) scale(${0.94 + 0.06 * t})` }}>
        <Toast w={600} />
      </At>
      <Sfx at={22} name="pop" volume={0.65} />
    </>
  );
}

const TILES = [
  { n: "vitamine-c-1000" }, { n: "probio-flore-10", pick: true }, { n: "spray-nasal-marin" }, { n: "magnesium-marin-b6" },
  { n: "probio-enfant", empty: true }, { n: "pastilles-gorge" }, { n: "probio-confort", match: true }, { n: "calcium-vitamine-d" },
  { n: "brumisateur" }, { n: "zinc-selenium" }, { n: "gel-hydroalcoolique" }, { n: "thermometre-frontal" },
];

function VisualStock() {
  const f = useF();
  const filter = tw(f, [30, 42], [0, 1]);
  const pick = sp(f, 46, { damping: 13, stiffness: 170 });
  return (
    <At x={1000} y={200}>
      <Panel style={{ width: 780, padding: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {TILES.map((t, i) => {
            const p = sp(f, 6 + i * 1.5, { damping: 18, stiffness: 210 });
            const keep = t.pick || t.match;
            return (
              <div key={t.n} style={{ position: "relative", opacity: p * (keep ? 1 : 1 - 0.75 * filter), transform: `scale(${0.7 + 0.3 * p + (t.pick ? 0.1 * pick : 0)})` }}>
                <ProductTile name={t.n} size={160} style={{ boxShadow: t.pick ? `0 0 0 ${5 * pick}px ${C.accent400}, 0 16px 30px -10px rgba(231,182,45,.55)` : "none" }} />
                {t.empty && filter > 0 && <span style={{ position: "absolute", right: -6, top: -8, fontSize: 18, fontWeight: 600, color: C.white, background: C.ink500, borderRadius: 999, padding: "3px 11px", opacity: filter }}>0</span>}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14, opacity: pick }}>
          <span style={{ fontSize: 26, fontWeight: 600, color: C.ink900 }}>Flore Équilibre 10 milliards</span>
          <span style={{ fontSize: 26, fontWeight: 600, color: C.ink900, marginLeft: "auto" }}>14,90 €</span>
          <span style={{ fontSize: 18, fontWeight: 500, color: C.success700, background: C.success50, borderRadius: 999, padding: "6px 14px" }}>En stock : 34</span>
        </div>
      </Panel>
      <Sfx at={30} name="swish" volume={0.35} />
      <Sfx at={46} name="pop" volume={0.6} />
    </At>
  );
}

function VisualDecision() {
  const f = useF();
  const CLICK = 54;
  const accepted = tw(f, [CLICK + 2, CLICK + 12], [0, 1]);
  const press = tw(f, [CLICK - 4, CLICK], [0, 1]) - tw(f, [CLICK + 2, CLICK + 8], [0, 1]);
  // La carte est réduite à 0,7 ; le bouton « Proposer ce produit » tombe vers (1110, 535).
  const p = tw(f, [18, 48], [0, 1], EASE_IN_OUT);
  const cx = 1780 + (1110 - 1780) * p;
  const cy = 1000 + (540 - 1000) * p;
  return (
    <>
      <At x={960} y={180} style={{ transformOrigin: "0 0", transform: "scale(0.7)" }}>
        <AdviceCard w={1180} show={() => 1} accepted={accepted} press={press} />
      </At>
      <Cursor x={cx} y={cy} press={press} click={f >= CLICK && f < CLICK + 16 ? (f - CLICK) / 16 : -1} opacity={Math.min(tw(f, [14, 20], [0, 1]), 1 - tw(f, [CLICK + 24, CLICK + 32], [0, 1]))} />
      <Sfx at={CLICK} name="clic" volume={0.9} />
      <Sfx at={CLICK + 2} name="pop" volume={0.55} />
    </>
  );
}

function VisualPlan() {
  const f = useF();
  const n = sp(f, 34, { damping: 18, stiffness: 170 });
  return (
    <>
      <At x={1270} y={150}>
        <Phone h={800}>
          <PlanScreen show={(i) => sp(f, 4 + i * 5, { damping: 200, stiffness: 150 })} />
        </Phone>
      </At>
      <At x={1150} y={200} w={600} style={{ opacity: n, transform: `translateY(${(1 - n) * -40}px) scale(${0.96 + 0.04 * n})` }}>
        <CalendarBanner title="Matin — traitement" body="AMOXICILLINE 1 g — 1 comprimé" time="08:00" />
      </At>
      <Sfx at={34} name="notif" volume={0.6} />
    </>
  );
}

function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Plus de conseils proposés."), words("*Vous gardez la main.*", C.brand300)]} />;
}

const advantageScenes = ITEMS.map((_, k) => {
  const Scene = ({ intro }: { intro: number }) => <Advantage k={k} intro={intro} />;
  Object.defineProperty(Scene, "name", { value: `Avantage${k + 1}` });
  return { C: Scene, at: BAR + k * ITEM };
});

export const AVANTAGES: FilmSpec = {
  tag: "Les avantages",
  scenes: [{ C: Intro, at: 0 }, ...advantageScenes, { C: End, at: BAR + 7 * ITEM }],
  end: BAR + 7 * ITEM + 3 * BAR,
  overlap: B(0.5),
  speed: 1,
  music: "music/avantages.wav",
};
