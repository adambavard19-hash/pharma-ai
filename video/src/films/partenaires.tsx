import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { ShieldCheck } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { C, EASE_IN_OUT, MONO, beats, sp, tw, useF } from "../theme";
import type { FilmSpec } from "../FilmShell";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { EndCard, TitleBlock } from "../ui/common";
import { Cursor } from "../ui/product";
import { IllustrationNote, SALES } from "../ui/banner";
import { CounterStage, nb } from "../scenes/comptoir";
import { Sfx } from "../ui/sfx";
import { AppWindow, BrandPage, InScreen, ORDER_MODES, OrderCard, SalePage, StatsPanel } from "../ui/partner";

/* ==========================================================================
 * « Partenaires » — 44 s, 120 BPM (22 mesures). Pour les laboratoires et les
 * marques : ce qu'une gamme gagne à être sur PharmaBoost. La promesse, décidée
 * par le fondateur : de la VISIBILITÉ, le conseil INTACT.
 *
 * Au comptoir, on scanne ; la bannière retient un besoin (le probiotique
 * pendant l'antibiotique) — elle ne montre jamais de gamme partenaire. Sur
 * l'écran de vente, à part, sous les conseils, la carte « À découvrir · gamme
 * partenaire » que le sélecteur de l'application calcule APRÈS le moteur
 * (src/core/partners/counter-card.ts) → « Voir la gamme » : la vitrine de la
 * marque (gammes, produits, conditions professionnelles, formations) → la
 * commande selon les outils du laboratoire, avec l'identifiant d'attribution
 * → des statistiques agrégées → ce qui fait la crédibilité : le conseil reste
 * indépendant (public : src/app/(public)/decouvrir/partenaires/page.tsx).
 *
 * Aucun partenaire réel : « Marque A », « Laboratoire A », produits, prix et
 * conditions d'exemple, dits à l'écran ; aucun chiffre de statistiques (ils se
 * liraient comme des résultats). Jamais « recommandée », jamais « comme
 * conseil », aucune promesse de ventes : la gamme « peut » apparaître.
 * ======================================================================== */

const B = beats(120);
const BAR = B(4); // 60 images de scène, 2 s

/** Les scènes, en mesures (voir le preset « partenaires » de scripts/musique.mjs). */
const AT = { open: 0, counter: 2 * BAR, sale: 5 * BAR, vitrine: 9 * BAR, order: 12 * BAR, stats: 14.5 * BAR, trust: 16.5 * BAR, end: 19 * BAR };
const END = 22 * BAR;

/** La fenêtre de l'application, à droite de l'image ; la page en pixels de l'application, agrandie 1,6 fois. */
const WIN = { x: 770, y: 80, w: 1100, h: 920, zoom: 1.6 };
/** Le texte de chaque plan, à gauche. */
const LEFT = { x: 110, w: 610 };

/**
 * La mention d'illustration, en bas à gauche. Elle n'arrive qu'une fois la
 * scène posée : celle de la scène précédente est déjà effacée (pas deux
 * mentions l'une sur l'autre pendant le fondu).
 */
function Note({ text }: { text: string }) {
  const f = useF();
  return (
    <At x={LEFT.x} y={1030} w={1700} style={{ opacity: tw(f, [2, 14], [0, 1]) }}>
      <IllustrationNote text={text} />
    </At>
  );
}

/** Le voile de sortie : `VEIL` images avant la fin d'une scène claire, son contenu s'efface dans le fond clair. */
const VEIL = 22;

/**
 * Le fond clair, posé par-dessus le contenu d'une scène qui sort : avant que la
 * scène suivante n'entre à moitié, il ne reste qu'un fond clair (jamais deux
 * écrans lisibles l'un sur l'autre, jamais le fond sombre du film entre deux
 * scènes claires). Dernier enfant de la scène.
 */
function Veil({ len }: { len: number }) {
  const f = useF();
  const o = tw(f, [len - VEIL, len - 4], [0, 1], EASE_IN_OUT);
  return o > 0 ? (
    <AbsoluteFill style={{ opacity: o }}>
      <LightStage />
    </AbsoluteFill>
  ) : null;
}

/**
 * Une scène claire : elle entre en fondu PAR-DESSUS la précédente, qui s'est
 * déjà effacée dans son fond (<Veil>). Seul le contenu floute en sortant : un
 * fond flouté laisserait voir le fond sombre du film sur les bords de l'image.
 */
function LightScene({ intro, len, children }: { intro: number; len: number; children: ReactNode }) {
  const f = useF();
  const enter = tw(f, [-intro, 4], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [len - VEIL, len - 4], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <LightStage>
        <AbsoluteFill style={{ filter: exit > 0 ? `blur(${exit * 6}px)` : undefined }}>{children}</AbsoluteFill>
        <Veil len={len} />
      </LightStage>
    </AbsoluteFill>
  );
}

// ---- 1. Ouverture ----------------------------------------------------------------

function Opening({ intro }: { intro: number }) {
  const f = useF();
  const len = AT.counter;
  const exit = tw(f, [len - 14, len + 8], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: (intro ? tw(f, [-intro, 0], [0, 1]) : 1) * (1 - exit), transform: `scale(${1 + 0.05 * tw(f, [0, len - 14], [0, 1]) + 0.22 * exit})` }}>
      <DarkStage>
        <At x={0} y={330} w={1920}>
          <Kinetic at={8} size={104} color={C.white} align="center" stagger={3} lines={[words("Votre marque,"), words("*au comptoir des pharmacies.*", C.brand300)]} />
        </At>
        <At x={0} y={640} w={1920}>
          <Kinetic at={40} size={46} color={C.brand100} weight={500} align="center" tracking="-0.01em" stagger={2} lines={[words("Pour les laboratoires et les marques.")]} />
        </At>
        <Sfx at={8} name="impact" volume={0.45} />
        {[11, 17, 23, 29].map((a) => <Sfx key={a} at={a} name="tic" volume={0.4} />)}
        <Sfx at={40} name="pop" volume={0.35} />
        <Sfx at={len - 14} name="whoosh" volume={0.5} />
      </DarkStage>
    </AbsoluteFill>
  );
}

// ---- 2. Au comptoir : un scan, un besoin ----------------------------------------

const SCAN = 28;

/**
 * Le logiciel de gestion, l'amoxicilline au scan ; la bannière passe de « En
 * attente de scan… » à « 1 conseil disponible », puis s'ouvre : le moteur a
 * retenu le besoin (le probiotique, raison de la règle). Aucune gamme
 * partenaire sur la bannière : elle n'en montre jamais. Le pointeur clique
 * « Voir le détail », qui ouvre la vente dans PharmaBoost : la scène suivante.
 */
function Counter({ intro }: { intro: number }) {
  const len = AT.sale - AT.counter;
  const READY = 74;
  const OPEN = READY + 33; // « 1 conseil disponible » reste seul readyPauseMs (1,1 s)
  const DETAIL = len - VEIL - 10;
  return (
    <>
      <CounterStage
        intro={intro}
        len={len}
        sale={SALES.antibiotique}
        start="idle"
        acts={[
          { at: SCAN + 2, patch: { view: "scan" } },
          { at: READY, patch: { view: "ready" } },
          { at: OPEN, patch: { view: "expanded" } },
          { at: DETAIL, patch: {}, click: "detail" },
        ]}
        scans={[{ at: SCAN, name: "AMOXICILLINE 1 g", form: "comprimé" }]}
        rowsAt={[SCAN]}
        veilAt={OPEN - 12}
        captions={[
          // Le moteur cherche un besoin à chaque scan ; il n'en retient pas à chaque fois (aucune promesse de fréquence).
          { at: 2, out: OPEN - 14, lines: [words("À chaque scan,"), words("le moteur *cherche un besoin.*", C.brand600)] },
          { at: OPEN + 2, y: 330, w: 820, size: 64, lines: [words("Le moteur retient"), words("*le besoin.*", C.brand600)], sub: "Ici : la flore intestinale, pendant l'antibiotique." },
        ]}
      />
      <Veil len={len} />
      <Sfx at={READY} name="pop" volume={0.55} />
      <Sfx at={OPEN} name="swish" volume={0.4} />
    </>
  );
}

// ---- 3. L'écran de vente : la carte « gamme partenaire » ------------------------

/** Défilement de la page de vente jusqu'à la carte partenaire, en pixels de l'application. */
const SALE_SCROLL = 506;
const SALE_CLICK = 186;

function SaleScene({ intro }: { intro: number }) {
  const len = AT.vitrine - AT.sale;
  const f = useF();
  const win = sp(f, -8, { damping: 22, stiffness: 130 });
  const scroll = SALE_SCROLL * tw(f, [62, 108], [0, 1], EASE_IN_OUT);
  const partner = sp(f, 100, { damping: 15, stiffness: 160 });
  const ring = Math.min(tw(f, [118, 130], [0, 1]), 1 - tw(f, [len - 30, len - 16], [0, 1]));
  const press = tw(f, [SALE_CLICK - 4, SALE_CLICK], [0, 1]) - tw(f, [SALE_CLICK + 2, SALE_CLICK + 8], [0, 1]);
  const p = tw(f, [SALE_CLICK - 28, SALE_CLICK - 2], [0, 1], EASE_IN_OUT);
  const cursorOpacity = Math.min(tw(f, [SALE_CLICK - 34, SALE_CLICK - 26], [0, 1]), 1 - tw(f, [SALE_CLICK + 22, SALE_CLICK + 32], [0, 1]));
  const cursor =
    cursorOpacity > 0 ? (
      <InScreen zoom={WIN.zoom}>
        <Cursor x={-2 - (1 - p) * 300} y={-2 + (1 - p) * 70} press={press} click={f >= SALE_CLICK && f <= SALE_CLICK + 16 ? (f - SALE_CLICK) / 16 : -1} opacity={cursorOpacity} />
      </InScreen>
    ) : undefined;
  return (
    <LightScene intro={intro} len={len}>
      <At x={LEFT.x} y={250} w={LEFT.w}>
        {/* « peut » : une marque par besoin, et jamais si l'officine l'a masquée ou refusée (counter-card.ts ; « Cette marque peut apparaître… », [slug]/page.tsx). */}
        <TitleBlock chip="L'écran de vente" chipAt={2} at={6} size={72} lines={[words("Votre gamme"), words("peut apparaître,"), words("*au bon moment.*", C.brand600)]} sub={`Quand le besoin retenu entre dans votre univers, si l'officine ne l'a pas masquée : à part, sous ${nb("les conseils.")}`} subAt={110} subWidth={580} />
      </At>
      <AppWindow x={WIN.x + (1 - win) * 160} y={WIN.y} w={WIN.w} h={WIN.h} title="Écran de vente" zoom={WIN.zoom} scroll={scroll} style={{ opacity: Math.min(1, win * 1.6) }}>
        <SalePage show={(i) => sp(f, 10 + i * 7, { damping: 200, stiffness: 140 })} partner={partner} ring={ring} press={press} cursor={cursor} />
      </AppWindow>
      <Note text="Illustration de l'écran de vente · marque, produit et prix : exemples" />
      <Sfx at={0} name="swish" volume={0.45} />
      {[10, 17, 24, 31].map((a) => <Sfx key={a} at={a} name="tic" volume={0.3} />)}
      <Sfx at={62} name="whoosh" volume={0.35} />
      <Sfx at={100} name="pop" volume={0.6} />
      <Sfx at={118} name="tic" volume={0.45} />
      <Sfx at={SALE_CLICK} name="clic" volume={0.85} />
    </LightScene>
  );
}

// ---- 4. La vitrine de la marque ----------------------------------------------------

/** Les arrêts du défilement de la page de la marque : en haut, sur la gamme, sur les conditions et les formations. */
const VITRINE_STOPS = { ranges: 300, end: 668 };
const VITRINE_LIT = { ranges: 52, offers: 112, trainings: 130 } as const;

function VitrineScene({ intro }: { intro: number }) {
  const len = AT.order - AT.vitrine;
  const f = useF();
  const scroll = VITRINE_STOPS.ranges * tw(f, [34, 58], [0, 1], EASE_IN_OUT) + (VITRINE_STOPS.end - VITRINE_STOPS.ranges) * tw(f, [92, 120], [0, 1], EASE_IN_OUT);
  const lit = (k: keyof typeof VITRINE_LIT) => Math.min(tw(f, [VITRINE_LIT[k], VITRINE_LIT[k] + 10], [0, 1]), k === "ranges" ? 1 - tw(f, [96, 106], [0, 1]) : 1);
  const items: { k: keyof typeof VITRINE_LIT; label: string }[] = [
    { k: "ranges", label: "Gammes et produits" },
    { k: "offers", label: "Conditions professionnelles" },
    { k: "trainings", label: "Formations" },
  ];
  return (
    <LightScene intro={intro} len={len}>
      <At x={LEFT.x} y={250} w={LEFT.w}>
        <TitleBlock chip="Voir la gamme" chipAt={2} at={6} size={110} lines={[words("Votre"), words("*vitrine.*", C.brand600)]} />
      </At>
      <At x={LEFT.x} y={590} w={LEFT.w}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {items.map((it, i) => {
            const inP = sp(f, 18 + i * 6, { damping: 20, stiffness: 170 });
            const on = tw(f, [VITRINE_LIT[it.k], VITRINE_LIT[it.k] + 10], [0, 1]);
            return (
              <div key={it.k} style={{ display: "flex", alignItems: "center", gap: 18, opacity: inP, transform: `translateX(${(1 - inP) * -30}px)` }}>
                <span style={{ width: 44, height: 44, borderRadius: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on > 0.5 ? C.brand600 : C.white, border: `2px solid ${on > 0.5 ? C.brand600 : C.ink200}`, transform: `scale(${1 + 0.12 * Math.sin(Math.PI * on)})` }}>
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: on > 0.5 ? C.white : C.ink300 }} />
                </span>
                <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", color: on > 0.5 ? C.ink900 : C.ink400 }}>{it.label}</span>
              </div>
            );
          })}
        </div>
      </At>
      <AppWindow x={WIN.x} y={WIN.y} w={WIN.w} h={WIN.h} title={"Gamme partenaire · Marque A"} zoom={WIN.zoom} scroll={scroll}>
        <BrandPage lit={lit} />
      </AppWindow>
      <Note text="Illustration · marque, produits, prix, conditions et formations : exemples" />
      <Sfx at={34} name="whoosh" volume={0.3} />
      {Object.values(VITRINE_LIT).map((a) => <Sfx key={a} at={a} name="pop" volume={0.45} />)}
      <Sfx at={92} name="whoosh" volume={0.3} />
    </LightScene>
  );
}

// ---- 5. Commander, simplement ------------------------------------------------------

const ORDER_CLICK = 62;
const ORDER_ZOOM = 1.9;

function OrderScene({ intro }: { intro: number }) {
  const len = AT.stats - AT.order;
  const f = useF();
  const cardIn = sp(f, -6, { damping: 22, stiffness: 140 });
  const press = tw(f, [ORDER_CLICK - 4, ORDER_CLICK], [0, 1]) - tw(f, [ORDER_CLICK + 2, ORDER_CLICK + 8], [0, 1]);
  const ack = sp(f, ORDER_CLICK + 6, { damping: 18, stiffness: 170 });
  const codeRing = Math.min(tw(f, [ORDER_CLICK + 20, ORDER_CLICK + 30], [0, 1]), 1 - tw(f, [len - 20, len - 8], [0, 1]));
  const p = tw(f, [ORDER_CLICK - 26, ORDER_CLICK - 2], [0, 1], EASE_IN_OUT);
  const cursorOpacity = Math.min(tw(f, [ORDER_CLICK - 32, ORDER_CLICK - 24], [0, 1]), 1 - tw(f, [ORDER_CLICK + 22, ORDER_CLICK + 32], [0, 1]));
  const cursor =
    cursorOpacity > 0 ? (
      <InScreen zoom={ORDER_ZOOM}>
        <Cursor x={-2 + (1 - p) * 220} y={-2 + (1 - p) * 240} press={press} click={f >= ORDER_CLICK && f <= ORDER_CLICK + 16 ? (f - ORDER_CLICK) / 16 : -1} opacity={cursorOpacity} />
      </InScreen>
    ) : undefined;
  return (
    <LightScene intro={intro} len={len}>
      <At x={LEFT.x} y={200} w={LEFT.w + 100}>
        <TitleBlock chip="Selon vos outils" chipAt={2} at={6} size={96} lines={[words("Commander,"), words("*simplement.*", C.brand600)]} />
      </At>
      <At x={LEFT.x} y={560} w={LEFT.w + 60}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {ORDER_MODES.map((m, i) => {
            const inP = sp(f, 20 + i * 7, { damping: 20, stiffness: 170 });
            const active = i === 0 ? tw(f, [ORDER_CLICK - 10, ORDER_CLICK], [0, 1]) : 0;
            return (
              <div key={m.label} style={{ borderLeft: `4px solid ${active > 0.5 ? C.brand500 : C.ink200}`, paddingLeft: 22, opacity: inP, transform: `translateX(${(1 - inP) * -30}px)` }}>
                <div style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: active > 0.5 ? C.brand700 : C.ink500 }}>{m.label}</div>
                <div style={{ marginTop: 6, fontSize: 27, lineHeight: 1.35, color: C.ink800 }}>{m.line}</div>
              </div>
            );
          })}
        </div>
      </At>
      <At x={1110} y={210} style={{ opacity: Math.min(1, cardIn * 1.6), transform: `translateY(${(1 - cardIn) * 40}px)` }}>
        <div style={{ zoom: ORDER_ZOOM }}>
          <OrderCard press={press} ack={ack} codeRing={codeRing} cursor={cursor} />
        </div>
      </At>
      <Note text="Illustration · identifiant d'attribution : exemple" />
      <Sfx at={2} name="swish" volume={0.4} />
      {[20, 27, 34].map((a) => <Sfx key={a} at={a} name="tic" volume={0.4} />)}
      <Sfx at={ORDER_CLICK} name="clic" volume={0.85} />
      <Sfx at={ORDER_CLICK + 6} name="pop" volume={0.55} />
    </LightScene>
  );
}

// ---- 6. Des chiffres d'ensemble -----------------------------------------------------

function StatsScene({ intro }: { intro: number }) {
  const len = AT.trust - AT.stats;
  const f = useF();
  const panel = sp(f, -6, { damping: 22, stiffness: 140 });
  return (
    <LightScene intro={intro} len={len}>
      <At x={LEFT.x} y={250} w={LEFT.w}>
        {/* Les compteurs sont anonymes ; une demande ou une commande, elle, porte le nom de l'officine qui la passe (partner-actions.tsx) : COMMITMENTS du site. */}
        <TitleBlock chip="Ce que vous recevez" chipAt={2} at={6} size={96} lines={[words("Des chiffres"), words("*d'ensemble.*", C.brand600)]} sub={`Rien sur les patients. Une demande ou une commande ne vous parvient que si l'officine ${nb("la passe.")}`} subAt={26} subWidth={600} />
      </At>
      <At x={900} y={190} style={{ opacity: Math.min(1, panel * 1.6), transform: `translateX(${(1 - panel) * 60}px)` }}>
        <div style={{ zoom: 1.55 }}>
          <StatsPanel grow={(i) => sp(f, 22 + i * 6, { damping: 30, stiffness: 80 })} />
        </div>
      </At>
      <Note text="Illustration · marque : exemple, aucun chiffre montré" />
      <Sfx at={2} name="swish" volume={0.4} />
      {[22, 28, 34, 40].map((a) => <Sfx key={a} at={a} name="tic" volume={0.4} />)}
    </LightScene>
  );
}

// ---- 7. Ce qui fait votre crédibilité -------------------------------------------------

/**
 * Les engagements du site (decouvrir/partenaires : COMMITMENTS, FOR_PHARMACY,
 * FOR_PATIENT), en quatre cases : une phrase courte chacune, lisible pendant
 * les deux secondes qui suivent son arrivée.
 */
const TRUST = [
  ["Un espace distinct", "Votre gamme, à part, signalée comme\u00A0partenaire."],
  ["Un moteur indépendant", "Une gamme ne remplace jamais un\u00A0conseil."],
  ["Le choix de l'officine", "Le titulaire peut masquer une\u00A0marque."],
  ["Aucune donnée patient", "Rien sur un patient n'est\u00A0transmis."],
];

function Trust({ intro }: { intro: number }) {
  const f = useF();
  const len = AT.end - AT.trust;
  const enter = tw(f, [-intro, 0], [0, 1]);
  const exit = tw(f, [len - 18, len - 2], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${1 + 0.12 * exit})` }}>
      <DarkStage>
        <At x={0} y={150} w={1920}>
          <Kinetic at={4} size={52} color={BANNER.colors.muted} weight={600} align="center" tracking="-0.015em" stagger={2} lines={[words("Ce qui fait votre crédibilité :")]} />
        </At>
        <At x={0} y={230} w={1920}>
          <Kinetic at={12} size={92} color={C.white} align="center" stagger={2} lines={[words("le conseil reste *indépendant.*", C.brand300)]} />
        </At>
        <At x={230} y={470} w={1460}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {TRUST.map(([label, value], i) => {
              const p = sp(f, 32 + i * 10, { damping: 16, stiffness: 170 });
              return (
                <div key={label} style={{ borderRadius: 16, padding: "28px 34px 32px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 60}px)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <ShieldCheck size={32} color={C.brand300} />
                    <span style={{ fontFamily: MONO, fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand200 }}>{label}</span>
                  </div>
                  <div style={{ marginTop: 16, fontSize: 36, lineHeight: 1.22, fontWeight: 700, letterSpacing: "-0.015em", color: C.white }}>{value}</div>
                </div>
              );
            })}
          </div>
        </At>
        <Sfx at={4} name="impact" volume={0.35} />
        {TRUST.map((_, i) => <Sfx key={i} at={32 + i * 10} name="pop" volume={0.45} />)}
        <Sfx at={len - 18} name="whoosh" volume={0.5} />
      </DarkStage>
    </AbsoluteFill>
  );
}

// ---- 8. Carte de fin ---------------------------------------------------------------

function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Votre marque, visible."), words("*Le conseil, indépendant.*", C.brand300)]} cta="Devenir partenaire" />;
}

export const PARTENAIRES: FilmSpec = {
  tag: "PharmaBoost Partenaires",
  scenes: [
    { C: Opening, at: AT.open },
    { C: Counter, at: AT.counter },
    { C: SaleScene, at: AT.sale },
    { C: VitrineScene, at: AT.vitrine },
    { C: OrderScene, at: AT.order },
    { C: StatsScene, at: AT.stats },
    { C: Trust, at: AT.trust },
    { C: End, at: AT.end },
  ],
  end: END,
  overlap: 12,
  speed: 1,
  music: "music/partenaires.wav",
  // La musique s'efface un instant sous le son du scan (posé dans la scène du comptoir).
  duck: [AT.counter + SCAN],
  cues: [
    { at: AT.sale - 14, name: "whoosh", volume: 0.5 },
    { at: AT.vitrine - 10, name: "whoosh", volume: 0.45 },
    { at: AT.order - 10, name: "whoosh", volume: 0.4 },
    { at: AT.stats - 10, name: "whoosh", volume: 0.4 },
    { at: AT.trust - 12, name: "montee", volume: 0.35 },
  ],
};
