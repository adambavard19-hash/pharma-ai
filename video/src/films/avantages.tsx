import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { BANNER } from "../../../agent/src/banner-design";
import { C, EASE_IN_OUT, SHADOW, beats, sp, tw, useF } from "../theme";
import type { FilmSpec } from "../FilmShell";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words, type Word } from "../ui/kinetic";
import { LgoWindow } from "../ui/counter";
import { EXAMPLE, ProductTile } from "../ui/product";
import { CalendarBanner, PLANS, Phone, PlanScreen, TeamPanel } from "../ui/panels";
import { EndCard, LabsPanel, Panel } from "../ui/common";
import { BannerPill, IllustrationNote, SALES, answerTree, type Pill } from "../ui/banner";
import { BannerPlay, notSold, sold } from "../scenes/comptoir";
import { Sfx } from "../ui/sfx";

/* ==========================================================================
 * « Les avantages » — 38 s, 128 BPM. Huit avantages, deux mesures chacun,
 * coupés sur le temps. Chaque avantage montre l'écran qui le prouve : au
 * comptoir, la bannière du poste de caisse (scan, conseils, question, Vendu /
 * Non vendu) ; dans l'application, les laboratoires, le plan conseil, « Mon
 * équipe ». Produits, prix, noms et chiffres : des exemples, dits à l'écran.
 * ======================================================================== */

const B = beats(128);
const BAR = B(4);
const ITEM = 2 * BAR;
const T = BANNER.text;

type Item = { title: Word[][]; size?: number; sub: string; visual: () => ReactNode };

const H = (a: string, b: string) => [words(a), words(b, C.brand600)];

const ITEMS: Item[] = [
  { title: H("Votre logiciel", "*ne change pas.*"), sub: "Même scan, même comptoir. PharmaBoost travaille à côté.", visual: () => <VisualSoftware /> },
  { title: H("Le conseil arrive", "*au scan.*"), sub: "En haut à droite de votre écran, il reste là jusqu'à la fin de la vente.", visual: () => <VisualScreen /> },
  { title: H("Une question,", "*puis le conseil.*"), sub: "Pourquoi ? Où ? Le produit de la bonne zone n'arrive qu'après la réponse.", visual: () => <VisualQuestion /> },
  { title: H("Choisi", "*dans votre stock.*"), sub: "Uniquement ce que vous avez en rayon, avec le prix et le stock.", visual: () => <VisualStock /> },
  { title: [words("Le pharmacien"), words("et le préparateur"), words("*gardent la décision.*", C.brand600)], size: 76, sub: "Vendu ou non vendu : un clic, au comptoir.", visual: () => <VisualDecision /> },
  { title: H("Vos laboratoires préférés", "*passent en premier.*"), size: 76, sub: "Quand deux produits répondent aussi bien au besoin, le vôtre est proposé en premier.", visual: () => <VisualLabs /> },
  // Le plan se fait sur l'écran de vente, quand le pharmacien choisit de le remettre : jamais « pour chaque patient ».
  { title: [words("Un plan conseil,"), words("*quand vous*", C.brand600), words("*le remettez.*", C.brand600)], size: 76, sub: "QR code, e-mail ou papier. Les rappels dans son agenda.", visual: () => <VisualPlan /> },
  // Le logiciel de gestion ne dit pas qui a scanné : un résultat revient à la personne attribuée au comptoir (les mots du site).
  { title: [words("Un comptoir,"), words("une personne."), words("*Les résultats*", C.brand600), words("*de chacun.*", C.brand600)], size: 72, sub: "Proposés, validés, taux. Et la progression de chaque challenge.", visual: () => <At x={960} y={150}><TeamPanel at={0} /></At> },
];

function Intro({ intro }: { intro: number }) {
  const f = useF();
  const exit = tw(f, [BAR - 10, BAR + 4], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: (intro ? tw(f, [-intro, 0], [0, 1]) : 1) * (1 - exit), transform: `scale(${1 + 0.3 * exit})` }}>
      <DarkStage>
        <At x={0} y={360} w={1920}>
          <Kinetic at={4} size={136} color={C.white} align="center" stagger={3} lines={[words(`*${ITEMS.length} avantages*`, C.accent300), words("pour votre comptoir.")]} />
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
          <div style={{ fontSize: 200, fontWeight: 700, letterSpacing: "-0.05em", lineHeight: 1, color: C.brand600, fontVariantNumeric: "tabular-nums", transform: `translateY(${(1 - num) * 105}%)` }}>
            0{k + 1}
          </div>
          <div style={{ paddingBottom: 26, fontSize: 30, fontWeight: 600, color: C.ink300, fontVariantNumeric: "tabular-nums", opacity: tw(f, [4, 12], [0, 1]) }}>/ 0{ITEMS.length}</div>
        </At>
        <At x={120} y={420} w={800}>
          <Kinetic at={0} size={item.size ?? 86} lines={item.title} stagger={2} />
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

/** La mention des plans de la bannière, en bas à gauche, sous le texte de l'avantage. */
function Note({ text }: { text?: string }) {
  return (
    <At x={120} y={1020} w={1100}>
      <IllustrationNote text={text} />
    </At>
  );
}

/** 01 · Le logiciel de gestion, une ligne scannée ; la bannière, à côté, passe de « En attente de scan… » à « Scan détecté ! ». */
function VisualSoftware() {
  const [amox] = SALES.ordonnance.lines;
  return (
    <>
      <At x={980} y={360}>
        <LgoWindow w={840} lines={[{ text: amox.lgo, qty: amox.qty, price: amox.price, at: 22 }]} />
      </At>
      <BannerPlay sale={SALES.ordonnance} start="idle" acts={[{ at: 24, patch: { view: "scan" } }]} place={{ zoom: 1.5, right: 100, top: 150 }} />
      <Note />
      <Sfx at={22} name="bip" volume={0.6} />
    </>
  );
}

/**
 * 02 · Un écran de comptoir : le logiciel en plein écran, la bannière en haut à
 * droite, qui passe de « Scan détecté ! » à « 2 conseils disponibles ».
 */
function VisualScreen() {
  const S = { x: 960, y: 200, w: 900, h: 560, bezel: 14 };
  const lines = SALES.ordonnance.lines.map((l, i) => ({ text: l.lgo, qty: l.qty, price: l.price, at: i === 0 ? -999 : 6 }));
  return (
    <>
      <At x={S.x} y={S.y}>
        <div style={{ width: S.w, height: S.h, boxSizing: "border-box", borderRadius: 22, background: C.ink900, padding: S.bezel, boxShadow: SHADOW.lift }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 10, overflow: "hidden", background: "#DCE3E8" }}>
            <LgoWindow w={S.w - 2 * S.bezel} h={S.h - 2 * S.bezel} lines={lines} />
          </div>
        </div>
        <div style={{ width: 150, height: 54, margin: "0 auto", background: `linear-gradient(180deg, ${C.ink400}, ${C.ink300})`, clipPath: "polygon(18% 0, 82% 0, 100% 100%, 0 100%)" }} />
        <div style={{ width: 300, height: 12, margin: "0 auto", borderRadius: 6, background: C.ink300 }} />
      </At>
      <BannerPlay sale={SALES.ordonnance} start="scan" acts={[{ at: 22, patch: { view: "ready" } }]} place={{ zoom: 1.3, right: 1920 - (S.x + S.w - S.bezel) + 16, top: S.y + S.bezel + 16 }} />
      <Note />
      <Sfx at={6} name="bip" volume={0.5} />
      <Sfx at={22} name="pop" volume={0.65} />
    </>
  );
}

/**
 * 03 · DOLIPRANE seul : la bannière demande pourquoi (« Douleur localisée »),
 * puis où (« Dos ») ; la poche chaud/froid du dos n'apparaît qu'après la
 * réponse (src/core/counter/question-tree.ts).
 */
function VisualQuestion() {
  return (
    <>
      <BannerPlay
        sale={SALES.douleur}
        start="expanded"
        acts={[
          { at: 32, patch: answerTree("why", "PAIN"), click: "qa:why:PAIN" },
          { at: 64, patch: answerTree("where", "BACK"), click: "qa:where:BACK" },
        ]}
        place={{ zoom: 1.4, right: 100, top: 110 }}
      />
      <Note />
      <Sfx at={66} name="pop" volume={0.5} />
    </>
  );
}

const TILES = [
  { n: "vitamine-c-1000" }, { n: "creme-solaire-spf50", pick: true }, { n: "spray-nasal-marin" }, { n: "magnesium-marin-b6" },
  { n: "probio-enfant", empty: true }, { n: "pastilles-gorge" }, { n: "probio-confort", match: true }, { n: "calcium-vitamine-d" },
  { n: "brumisateur" }, { n: "zinc-selenium" }, { n: "gel-hydroalcoolique" }, { n: "thermometre-frontal" },
];

/** Ce qui reste après le filtre du stock, avec les pastilles de la bannière (stock exact). */
const KEPT: { name: string; price: string; pill: Pill }[] = [
  { name: EXAMPLE.product, price: EXAMPLE.price, pill: { kind: "stock", text: `${T.inStock} · ${EXAMPLE.stock}` } },
  { name: "Probiotique", price: "14,90 €", pill: { kind: "low", text: `${T.lowStock} · 3` } },
];

/** 04 · Le rayon : ce qui n'est pas en stock s'efface, le produit retenu s'entoure ; prix et stock exact dessous. */
function VisualStock() {
  const f = useF();
  const filter = tw(f, [30, 42], [0, 1]);
  const pick = sp(f, 46, { damping: 13, stiffness: 170 });
  return (
    <>
      <At x={1000} y={170}>
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
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            {KEPT.map((r, i) => {
              const p = sp(f, 46 + i * 6, { damping: 20, stiffness: 180 });
              return (
                <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 16, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
                  <span style={{ fontSize: 25, fontWeight: 600, color: C.ink900 }}>{r.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 25, fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums" }}>{r.price}</span>
                  <BannerPill {...r.pill} zoom={1.6} />
                </div>
              );
            })}
          </div>
        </Panel>
      </At>
      <Note text="Produits, prix et stocks : exemples" />
      <Sfx at={30} name="swish" volume={0.35} />
      <Sfx at={46} name="pop" volume={0.6} />
    </>
  );
}

/** 05 · La bannière ouverte sur deux conseils : « Vendu » sur le probiotique, « Non vendu » sur l'antiseptique. */
function VisualDecision() {
  return (
    <>
      <BannerPlay
        sale={SALES.ordonnance}
        start="expanded"
        acts={[
          { at: 40, patch: sold("a"), click: "sold:a" },
          { at: 70, patch: notSold("b"), click: "not:b" },
        ]}
        place={{ zoom: 1.45, right: 100, top: 130 }}
      />
      <Note />
      <Sfx at={42} name="pop" volume={0.5} />
    </>
  );
}

/**
 * 06 · Paramètres → Laboratoires (« Mettre en avant · écarter »), puis les
 * pastilles de la bannière : à conseil égal, après les laboratoires préférés,
 * la date courte, puis le challenge en cours (l'ordre de
 * src/core/ai/engines/tiebreak.ts).
 */
function VisualLabs() {
  const f = useF();
  const pills = sp(f, 58, { damping: 20, stiffness: 170 });
  return (
    <>
      <At x={980} y={170}>
        <LabsPanel at={0} />
      </At>
      <At x={980} y={660} style={{ opacity: pills, transform: `translateY(${(1 - pills) * 30}px)` }}>
        <div style={{ width: 860, boxSizing: "border-box", background: C.white, borderRadius: 16, border: `1px solid ${C.ink200}`, boxShadow: SHADOW.card, padding: "20px 28px 22px" }}>
          <div style={{ fontSize: 19, color: C.ink500 }}>Au comptoir, sur la bannière :</div>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <BannerPill kind="challenge" text={T.challenge} zoom={1.8} />
            <BannerPill kind="date" text={`${T.shortDate} 30/11/26`} zoom={1.8} />
            <BannerPill kind="stock" text={`${T.inStock} · 12`} zoom={1.8} />
          </div>
          <div style={{ marginTop: 14, fontSize: 19, lineHeight: 1.4, color: C.ink600 }}>À conseil égal, après vos laboratoires préférés : la date courte, puis le challenge en cours.</div>
        </div>
      </At>
      <Sfx at={58} name="pop" volume={0.5} />
    </>
  );
}

/** 07 · Le plan conseil sur le téléphone du patient (doxycycline et sa crème solaire), et le rappel de prise. */
function VisualPlan() {
  const f = useF();
  const n = sp(f, 34, { damping: 18, stiffness: 170 });
  return (
    <>
      <At x={1270} y={150}>
        <Phone h={800}>
          <PlanScreen plan={PLANS.doxycycline} show={(i) => sp(f, 4 + i * 5, { damping: 200, stiffness: 150 })} />
        </Phone>
      </At>
      <At x={1150} y={200} w={600} style={{ opacity: n, transform: `translateY(${(1 - n) * -40}px) scale(${0.96 + 0.04 * n})` }}>
        <CalendarBanner {...PLANS.doxycycline.reminder} />
      </At>
      <Sfx at={34} name="notif" volume={0.6} />
    </>
  );
}

function End({ intro }: { intro: number }) {
  // Aucun résultat promis : « Plus de conseils proposés » se lisait aussi « plus aucun conseil », et rien ne le mesure.
  return <EndCard intro={intro} lead={[words("Le bon conseil, au bon moment."), words("*Vous gardez la main.*", C.brand300)]} />;
}

const advantageScenes = ITEMS.map((_, k) => {
  const Scene = ({ intro }: { intro: number }) => <Advantage k={k} intro={intro} />;
  Object.defineProperty(Scene, "name", { value: `Avantage${k + 1}` });
  return { C: Scene, at: BAR + k * ITEM };
});

export const AVANTAGES: FilmSpec = {
  tag: "Les avantages",
  scenes: [{ C: Intro, at: 0 }, ...advantageScenes, { C: End, at: BAR + ITEMS.length * ITEM }],
  end: BAR + ITEMS.length * ITEM + 3 * BAR,
  overlap: B(0.5),
  speed: 1,
  music: "music/avantages.wav",
};
