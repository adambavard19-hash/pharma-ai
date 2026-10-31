import { useId, type CSSProperties, type ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { ArrowUp, BellRing, CalendarCheck, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Home, Hourglass, Mail, Pill, Quote, ScanLine, Search, Star, Store, Trophy, User, Users } from "lucide-react";
import { EXIT, F, IN_OUT, LINEAR, POP, SNAP, WHIP, clamp01, keys, lerp, prog, pulse, ressort, squash, wobble } from "../../presentation/motion/kit/ease";
import { Odometer } from "../../presentation/motion/kit/odometer";
import { Sparkle } from "./fx";
import { JAKARTA, MONO, PB, rgba } from "./brand";

/* ==========================================================================
 * LES ÉCRANS PHARMABOOST DU FILM — fidèles au VRAI logiciel, redessinés en fonctions du temps du film `t` (secondes) :
 * aucun état, aucune animation CSS. Les chiffres montrés sont des EXEMPLES (la scène pose « Illustration · exemples »).
 * Sources : src/components/island/mix-island.tsx (bannière), island-theme.ts / island-adn.ts (couleurs, ADN « noir
 * vivant »), src/components/performance/sold-counter.tsx (compteur), robot-apercu/appli-patient/patient-app.tsx (appli),
 * src/core/counter/patient-report.ts (e-mail du bilan), src/components/app/logo.tsx (le robot + « Pharma·Boost »).
 *
 * PLACEMENT (commun) : les cartes prennent `x y` = CENTRE dans le cadre 1920 × 1080 (sinon elles restent dans le flux du
 * parent), `scale` (1 = taille film, déjà lisible), `rot` (degrés), `style`. Dimensions à scale 1 entre crochets.
 *
 * FONDS ET MARQUE
 *   <AdnBackdrop t tone="paper"|"night" width=1500 focus=[.6,.48] drift=1 opacity=1 wash=0 />   remplit son parent
 *        l'hélice d'ADN (images/adn-helice.jpg, ≤ 1920 px de large) qui dérive ; "night" = le noir vivant de la bannière
 *   <PBLogo t at? size=120 variant="full"|"icon"|"wordmark" tone="dark"|"light" boost? grad? />  le robot + « PharmaBoost »
 *        `at` : il CLAQUE (robot qui jaillit en tournant, mot en coup de poing, reflet à at+0,35) ; sinon déjà là, il cligne
 *   <LogoRobot t size=64 winkAt? seed? />   le robot en blouse (logo-robot.svg), qui respire et sautille au clin d'œil
 *
 * LA BANNIÈRE DU COMPTOIR (mix-island.tsx)
 *   <Chip t kind="stock"|"marge"|"challenge"|"date"|"plain" text at? size=24 onDark? />   POP à `at`, reflet à at+0,12
 *        stock vert (point qui bat) · marge citron · challenge OR (★, reflet toutes les 2,2 s) · date courte ROUGE BRIQUE (⧗)
 *   <BannerHead t lines={[{ n, drug, product, chips?, at }]} highlight?={{ n, at }} pressed?={{ n, at }} width=920 />
 *        [920 × 100 → 36 + 140/ligne] capsule noire à l'hélice verte. Avant la 1re ligne : « En attente de scan… ».
 *        Chaque ligne glisse à son `at` (la capsule grandit en ressort) : pastille n, produit en gras, « pour {drug} »,
 *        pastilles (à line.at + 0,22 + 0,1·k si leur `at` manque). highlight : surlignage citron + étincelle ;
 *        pressed : la ligne s'enfonce (−3,5 %) et une onde part. Le centre de la ligne n : bannerRowCenter(lines, n, t).
 *   <BannerCard t product for tab={(t) => "questions"|"discours"|"fiche"} questions={[{ text, at? }]}
 *        discours={{ text, at?, dur? }} chips={[…]} sold?={at} at? price? fiche? count=2 />   [920 × 860]
 *        la grande carte dépliée (essai « L ») : `at` = elle se DÉPLIE (ressort), onglet qui glisse et s'allume au
 *        changement de `tab`, questions qui arrivent, discours qui s'écrit (curseur citron), bouton « Vendu » enfoncé à
 *        `sold` puis la ligne « ✓ Vendu ». Les pastilles passent sur deux rangées si besoin (le corps rétrécit). Repères
 *        (px depuis le coin haut gauche, scale 1) : BANNER_CARD.vendu, BANNER_CARD.tab("discours", chips).
 *
 * LES PERFORMANCES (sold-counter.tsx)
 *   <SoldCounterCard t value={(t) => n} at? periods period={i | (t) => i} revenue withAdvice? goal={0..1 | (t) => …}
 *        title subtitle />   [1200 × 560] carte sarcelle, grand nombre qui DÉFILE (rouleaux), « +1 » citron à chaque
 *        nouvel entier, onglets de période, CA ajouté, barre « Objectif : 10 % des ventes » (goal = part de l'objectif).
 *   <TeamRank t at rows? climber=2 />   [600 × 330] 3 avatars à initiales ; à `at` le 3e prend +1 et passe 2e (+1 place)
 *   <LiveDot t at? label="EN DIRECT" />   pastille au point rouge qui pulse
 *
 * LE TÉLÉPHONE ET L'APPLI (patient-app.tsx) — tous les écrans « App… » et MailBilan remplissent l'écran du <Phone>
 *   <Phone t x y scale tilt? pitch? rot? buzz? statusTone="dark"|"light" float? screen? >{écran}</Phone>
 *        [375 × 812] générique, aucun logo, barre d'état 9:41 ; tilt = rotation 3D (Y) ; buzz = il VIBRE à ce temps (0,6 s)
 *   <Notification t at title body icon="mail"|"bell"|"calendar"|"robot" app? until? />   descend en ressort ; sans x/y,
 *        elle se pose en haut de l'écran du téléphone
 *   <MailBilan t at />   l'e-mail « Votre bilan conseil » (aucun nom de patient) : fiche Probiotique, « Pourquoi avec votre
 *        traitement », 3 points clés (arrivées de at à at + 1,1)
 *   <CalendarCure t at days=7 step=.11 />   [360 × 400] les jours se cochent (cureTicks(at, days, step) → { ticks, end }),
 *        les deux derniers restent : la fin de cure s'allume (cloche) à `end`
 *   <AppWelcome t at? />  bienvenue (robot, « Votre pharmacie, dans la poche. »)  ·  <AppHome t at? />  accueil
 *   <AppScan t at box? />  viseur, laser, verrouillage à at + 0,9 (APP_SCAN_LOCK), fiche
 *   <AppCures t at />  « Mes cures », anneaux qui se remplissent (at + 0,2 → at + 1,5)
 *   <AppOffer t at />  « Mes offres » : <OfferCard t at /> « Offre partenaire · −2 € sur votre prochaine cure » qui jaillit
 *   <SoonBadge t at text="BIENTÔT" />   la pastille citron (obligatoire en S11), qui respire
 *
 * CHAPITRES ET GESTES
 *   <ChapterTitle t at n="1/3" text="POUR *L'ÉQUIPE*" exitAt? bg? tag? />   plein cadre : le vert profond balaie, « 1/3 »
 *        en pastille citron, le titre monte (mots entre *…* en citron) ; à `exitAt` le panneau file à gauche, le titre
 *        rétrécit vers le coin et reste en petite étiquette en haut à gauche (si tag). Même gabarit pour S9, S10, S12.
 *   <Cursor t x y clickAt? />   pointeur (pointe en x, y), enfoncé et onde citron à chaque clic (nombre ou liste)
 * ======================================================================== */

/** Les couleurs du vrai logiciel, en un endroit. */
export const SCREEN_UI = {
  night: "#07090A", // le « noir vivant » de la bannière (island-adn.ts)
  paper: "#EFF3F2", // le papier de l'hélice d'ADN
  ink: "#0F2B26", // carte ouverte (mix-island.tsx : L.ink)
  head: "#F2FFF9", // texte clair de la bannière
  green: "#0E8A7B", // L.green
  pick: "#247061", // « Vendu », choisi
  muted: "#5B6B66",
  soft: "#F3F7F5",
  tabLine: "#B9D8CE",
  reason: "#5E9C8C",
  raised: "#0F2F2A",
  brand600: "#297669",
  brand700: "#246F65",
  brandDeep: "#0B5560",
  brand800: "#054038",
  appBg: "#F3F8F6",
  appInk: "#0F2F2A",
  appSoft: "#4B6A62",
  appMute: "#94A3A0",
  appLine: "#E3ECE9",
  appTint: "#E8F3EF",
  grad: "linear-gradient(135deg, #0E8A7B 0%, #0796B4 100%)",
  bezel: "#0B1513",
  live: "#FF4D5E",
} as const;
const U = SCREEN_UI;

// ---- Petits outils ----------------------------------------------------------------------------------------------------

type Place = { x?: number; y?: number; scale?: number; rot?: number; style?: CSSProperties };

/** Centre en (x, y) si donnés, sinon dans le flux. */
function Placed({ x, y, scale = 1, rot = 0, style, children }: Place & { children: ReactNode }) {
  const abs = x !== undefined && y !== undefined;
  return (
    <div
      style={{
        position: abs ? "absolute" : "relative",
        left: abs ? x : undefined,
        top: abs ? y : undefined,
        width: "max-content",
        transform: `${abs ? "translate(-50%, -50%) " : ""}scale(${scale}) rotate(${rot}deg)`,
        transformOrigin: "50% 50%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type Timed<T> = T | ((t: number) => T);
const asFn = <T,>(v: Timed<T>): ((t: number) => T) => (typeof v === "function" ? (v as (t: number) => T) : () => v);

/** Depuis quand la valeur a changé (recherche image par image, jusqu'à `max` s) ; Infinity si rien n'a changé. */
function sinceChange<T>(t: number, f: (tt: number) => T, max = 0.6): { since: number; prev: T } {
  const now = f(t);
  for (let k = 1; k * F <= max + 1e-9; k++) {
    const p = f(t - k * F);
    if (p !== now) return { since: (k - 1) * F, prev: p };
  }
  return { since: Infinity, prev: now };
}

/** Entrée commune : 0 → 1 (SNAP) ; toujours 1 sans `at`. */
const enter = (t: number, at: number | undefined, dur = 0.38) => (at === undefined ? 1 : prog(t, at, dur, SNAP));

/** Un reflet qui traverse (bande blanche inclinée), k de 0 à 1. */
function Sheen({ k, alpha = 0.7, width = "38%" }: { k: number; alpha?: number; width?: string }) {
  if (k <= 0 || k >= 1) return null;
  return <span style={{ position: "absolute", top: "-20%", bottom: "-20%", left: `${-45 + k * 160}%`, width, background: `linear-gradient(100deg, transparent, rgba(255,255,255,${alpha}), transparent)`, transform: "skewX(-18deg)", pointerEvents: "none" }} />;
}

// ---- La boîte générique (photo de la carte, e-mail, viseur) ------------------------------------------------------------

const BOX_TONES: [RegExp, string, string][] = [
  [/probio/i, "#22C88F", "#0E8A7B"],
  [/amoxi/i, "#5B8DEF", "#2F5FC4"],
  [/parac/i, "#F29A4A", "#C9661F"],
  [/pastill|gorge/i, "#9B7BF2", "#6A4BC9"],
];

/** Une boîte de médicament GÉNÉRIQUE (aucune marque) : face, dessus, côté, bandeau de couleur, nom en deux lignes. */
function MiniBox({ name, w = 100 }: { name: string; w?: number }) {
  const tone = BOX_TONES.find(([re]) => re.test(name));
  const [a, b] = tone ? [tone[1], tone[2]] : ["#36E8C8", "#0E8A7B"];
  const [first, ...rest] = name.split(" ");
  const second = rest.join(" ");
  return (
    <svg width={w} height={w * 1.1} viewBox="0 0 100 110" style={{ display: "block", overflow: "visible" }}>
      <path d="M8 22 L20 10 L92 10 L80 22 Z" fill="#E4ECE9" />
      <path d="M80 22 L92 10 L92 92 L80 104 Z" fill="#C3D2CD" />
      <rect x="8" y="22" width="72" height="82" rx="2.5" fill="#FFFFFF" stroke="#D3DFDA" strokeWidth="1" />
      <rect x="8" y="64" width="72" height="20" fill={a} />
      <rect x="8" y="84" width="72" height="5" fill={b} />
      <circle cx="71" cy="56" r="3.6" fill={a} opacity=".9" />
      <text x="14" y="42" fontFamily={JAKARTA} fontWeight={800} fontSize="12" fill="#0F2F2A" textLength={first.length > 8 ? 58 : undefined} lengthAdjust="spacingAndGlyphs">
        {first}
      </text>
      {second && (
        <text x="14" y="56" fontFamily={JAKARTA} fontWeight={700} fontSize="10" fill="#3F5E57">
          {second}
        </text>
      )}
      <rect x="14" y="94" width="30" height="2" rx="1" fill="#C3D2CD" />
    </svg>
  );
}

// ---- L'hélice d'ADN --------------------------------------------------------------------------------------------------

/** Le noir vivant de la bannière : l'encre du papier retournée en lumière (island-adn.ts). */
const GLOW = "invert(1) hue-rotate(180deg) brightness(1.15) contrast(1.25) saturate(1.3)";

export function AdnBackdrop({
  t,
  tone = "paper",
  width = 1500,
  focus = [0.6, 0.48],
  drift = 1,
  opacity = 1,
  wash = 0,
  style,
}: {
  t: number;
  tone?: "paper" | "night";
  /** Largeur de l'image en px (bornée : jamais plus de 1920 px affichés). */
  width?: number;
  /** Où tombe le centre de l'image dans le parent (fractions). */
  focus?: [number, number];
  drift?: number;
  opacity?: number;
  /** Voile blanc (papier) ou noir (night) pour la lisibilité, 0..1. */
  wash?: number;
  style?: CSSProperties;
}) {
  const w = Math.min(1800, width);
  const s = Math.min(1920 / w, 1 + 0.035 * drift * (0.5 + 0.5 * Math.sin(t * 0.23)));
  const dx = drift * 46 * Math.sin(t * 0.21 + 0.6);
  const dy = drift * 26 * Math.sin(t * 0.17 + 1.9);
  const r = drift * 2.4 * Math.sin(t * 0.13 + 0.4);
  const night = tone === "night";
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: night ? U.night : U.paper, pointerEvents: "none", ...style }}>
      <Img
        src={staticFile("rembobine/images/adn-helice.jpg")}
        style={{
          position: "absolute",
          left: `${focus[0] * 100}%`,
          top: `${focus[1] * 100}%`,
          width: w,
          height: (w * 750) / 900,
          transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${r}deg) scale(${s})`,
          filter: night ? GLOW : undefined,
          mixBlendMode: night ? "screen" : undefined,
          opacity: (night ? 0.85 : 1) * opacity,
        }}
      />
      {wash > 0 && <div style={{ position: "absolute", inset: 0, background: night ? `rgba(7,9,10,${wash})` : `rgba(255,255,255,${wash})` }} />}
    </div>
  );
}

// ---- Le robot, le logo -----------------------------------------------------------------------------------------------

/**
 * Le robot de la marque (public/rembobine/images/logo-robot.svg) : le robot EN BLOUSE, tablette en main (fondateur, 31 oct.
 * 2026 : « je ne veux plus voir l'ancien robot au casque »). Il respire doucement et sautille au clin d'œil (`winkAt`).
 */
export function LogoRobot({ t, size = 64, winkAt, seed = 0, style }: { t: number; size?: number; winkAt?: number; seed?: number; style?: CSSProperties }) {
  const breath = 1 + 0.018 * Math.sin(((t + seed * 0.83) * 2 * Math.PI) / 2.6);
  const hop = winkAt === undefined ? 0 : pulse(t, winkAt, 0.08, 0.3, 0.14);
  return (
    <div style={{ width: size, height: size, display: "block", overflow: "visible", ...style }}>
      <Img
        src={staticFile("rembobine/images/logo-robot.svg")}
        style={{ width: "100%", height: "100%", display: "block", transform: `translateY(${-size * 0.06 * hop}px) scale(${breath + 0.05 * hop}) rotate(${-4 * hop}deg)`, transformOrigin: "50% 90%" }}
      />
    </div>
  );
}

/** Le texte avec un reflet qui le traverse (k de 0 à 1) ; hors du passage, couleur pleine. */
function shine(color: string, k: number): CSSProperties {
  if (k <= 0 || k >= 1) return { color };
  const p = -20 + k * 140;
  return { color: "transparent", backgroundImage: `linear-gradient(100deg, ${color} ${p - 14}%, #FFFFFF ${p}%, ${color} ${p + 14}%)`, WebkitBackgroundClip: "text", backgroundClip: "text" };
}

export function PBLogo({
  t,
  at,
  size = 120,
  variant = "full",
  tone = "dark",
  boost,
  grad = false,
  x,
  y,
  scale = 1,
  rot,
  style,
}: Place & {
  t: number;
  /** Il claque à ce temps (sinon déjà là). */
  at?: number;
  /** Hauteur des lettres (px) ; le robot fait 1,3 × size. */
  size?: number;
  variant?: "full" | "icon" | "wordmark";
  /** Le fond SOUS le logo : "dark" (vert profond) → Pharma blanc, Boost citron ; "light" → encre, Boost sarcelle. */
  tone?: "dark" | "light";
  boost?: string;
  /** Boost au dégradé du titre du site (sarcelle → cyan), pour fond clair. */
  grad?: boolean;
}) {
  const ink = tone === "dark" ? "#FFFFFF" : PB.green;
  const boostColor = boost ?? (tone === "dark" ? PB.citron : PB.brand);
  const a = at ?? -100;
  const robotS = at === undefined ? 1 : keys(t, [[a, 0], [a + 0.17, 1.2, POP], [a + 0.36, 1, IN_OUT]]);
  const robotR = at === undefined ? 0 : -28 * (1 - prog(t, a, 0.32, SNAP));
  const wp = at === undefined ? 1 : prog(t, a + 0.05, 0.22, SNAP);
  const sq = squash(t, a + 0.22, 6 * F);
  const sh = prog(t, a + 0.36, 0.55, IN_OUT);
  const bob = wobble(t, 3, size * 0.03, 1.1);
  if (at !== undefined && t < a) return null;
  const robot = (
    <div style={{ transform: `translateY(${bob}px) scale(${robotS}) rotate(${robotR}deg)`, transformOrigin: "50% 60%", filter: tone === "dark" ? `drop-shadow(0 ${size * 0.08}px ${size * 0.2}px rgba(0,0,0,.35))` : `drop-shadow(0 ${size * 0.08}px ${size * 0.16}px rgba(15,47,42,.22))` }}>
      <LogoRobot t={t} size={size * (variant === "icon" ? 1.6 : 1.32)} winkAt={at === undefined ? undefined : a + 0.55} />
    </div>
  );
  const boostStyle: CSSProperties = grad ? { color: "transparent", backgroundImage: `linear-gradient(90deg, ${PB.brand} 0%, ${PB.cyan} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text" } : shine(boostColor, sh);
  const word = (
    <div
      style={{
        fontFamily: JAKARTA,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: "-0.035em",
        lineHeight: 1.08,
        whiteSpace: "nowrap",
        paddingBottom: size * 0.04,
        opacity: clamp01(wp * 2),
        transform: `scale(${lerp(1.9, 1, wp) * sq.sx}, ${lerp(1.9, 1, wp) * sq.sy})`,
        transformOrigin: "30% 60%",
        filter: wp < 1 ? `blur(${(1 - wp) * 14}px)` : undefined,
      }}
    >
      <span style={{ display: "inline-block", transform: `translateX(${(1 - wp) * -size * 0.6}px)`, ...shine(ink, sh) }}>Pharma</span>
      <span style={{ display: "inline-block", transform: `translateX(${(1 - wp) * size * 0.6}px)`, ...boostStyle }}>Boost</span>
    </div>
  );
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: size * 0.24 }}>
        {variant !== "wordmark" && robot}
        {variant !== "icon" && word}
      </div>
    </Placed>
  );
}

// ---- Les pastilles ---------------------------------------------------------------------------------------------------

export type ChipKind = "stock" | "marge" | "challenge" | "date" | "plain";
export type ChipSpec = { kind: ChipKind; text: string; at?: number };

/**
 * Couleurs : le stock vert de la petite bannière (#7BE0B0) ; la marge prend le CITRON de la bannière (la direction réserve
 * l'or au challenge) ; le challenge en OR métal avec ★ ; la date courte en ROUGE BRIQUE.
 */
function chipLook(kind: ChipKind, onDark: boolean): { bg: string; fg: string; ring: string } {
  // Les couleurs de la bannière d'aujourd'hui (mix-island.tsx, 30 oct. 2026) : stock vert, marge jaune, challenge citron,
  // date courte rouge.
  switch (kind) {
    case "stock":
      return { bg: "#E3F6EC", fg: "#0E7A4E", ring: "inset 0 0 0 2px rgba(14,122,78,.14)" };
    case "marge":
      return { bg: "#FFE58A", fg: "#4A3500", ring: "inset 0 0 0 2px rgba(74,53,0,.12)" };
    case "challenge":
      return { bg: "#EEFFC2", fg: "#3F5A00", ring: "inset 0 0 0 2px rgba(63,90,0,.14)" };
    case "date":
      return { bg: "#FFE4E0", fg: "#C23A2B", ring: "inset 0 0 0 2px rgba(194,58,43,.16)" };
    default:
      return onDark ? { bg: "rgba(255,255,255,0.14)", fg: U.head, ring: "none" } : { bg: "rgba(15,47,42,0.08)", fg: PB.ink, ring: "none" };
  }
}

export function Chip({ t, kind, text, at, size = 24, onDark = false, x, y, scale, rot, style }: Place & { t: number; kind: ChipKind; text: string; at?: number; size?: number; onDark?: boolean }) {
  const r = at === undefined ? 1 : ressort(t, at, { damping: 10, stiffness: 300, mass: 0.5 });
  const since = at === undefined ? 10 + t : t - at;
  const look = chipLook(kind, onDark);
  const sweepAt = kind === "challenge" && since > 1.2 ? 0.12 + Math.floor((since - 0.12) / 2.2) * 2.2 : 0.12;
  const sw = clamp01((since - sweepAt) / 0.55);
  const beat = ((since % 1.3) + 1.3) % 1.3 / 1.3;
  const icon =
    kind === "stock" ? (
      <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: "#14A374", boxShadow: `0 0 0 ${size * 0.28 * beat}px rgba(20,163,116,${0.35 * (1 - beat)})`, flexShrink: 0 }} />
    ) : kind === "challenge" ? (
      <Star size={size * 0.9} fill={look.fg} strokeWidth={0} style={{ flexShrink: 0, transform: `rotate(${wobble(t, 8, 10, 1.4)}deg)` }} />
    ) : kind === "date" ? (
      <Hourglass size={size * 0.82} strokeWidth={2.6} style={{ flexShrink: 0, transform: `rotate(${180 * prog(since % 2.4, 1.6, 0.5, IN_OUT)}deg)` }} />
    ) : null;
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: size * 0.32,
          height: Math.round(size * 1.72),
          padding: `0 ${size * 0.62}px`,
          borderRadius: 999,
          background: look.bg,
          color: look.fg,
          boxShadow: look.ring,
          fontFamily: JAKARTA,
          fontWeight: 700,
          fontSize: size,
          letterSpacing: "-0.005em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textShadow: "none",
          opacity: at !== undefined && t < at ? 0 : clamp01(r * 4),
          transform: `scale(${Math.max(0, r)}) rotate(${(1 - clamp01(r)) * -10}deg)`,
          transformOrigin: "30% 50%",
        }}
      >
        {icon}
        <span style={{ position: "relative" }}>{text}</span>
        <Sheen k={sw} alpha={kind === "challenge" ? 0.85 : 0.6} />
      </span>
    </Placed>
  );
}

// ---- La bannière repliée ---------------------------------------------------------------------------------------------
//
// La bannière d'aujourd'hui (fondateur, 30 oct. 2026 : « que ce soit la nouvelle bannière qui soit affichée ») :
// src/components/island/scan-capsule.tsx (la petite bannière blanche, la croix verte) et mix-island.tsx (les cartes menthe).

export type BannerLine = { n: number; drug: string; product: string; /** La vraie photo studio du produit (public/rembobine/images) ; absente : ses initiales. */ image?: string; /** Une ligne de routine : les photos de ses étapes, en petites vignettes qui se chevauchent. */ routine?: string[]; chips?: ChipSpec[]; at: number; price?: string; challenge?: boolean; shortDate?: boolean };

const HEAD = { padX: 22, padY: 18, row: 140, idle: 100, top: 58 } as const;
const headSpring = (t: number, at: number) => ressort(t, at, { damping: 13, stiffness: 190, mass: 0.7 });
/** Le nom de chaque conseil s'affiche dans la petite bannière à son `at` ; les cartes s'ouvrent ensuite. */
export const bannerOpenAt = (lines: BannerLine[]) => (lines.length ? Math.max(...lines.map((l) => l.at)) + 0.34 : Infinity);
const rowAt = (lines: BannerLine[], i: number) => bannerOpenAt(lines) + 0.09 * i;
/** La hauteur de la bannière à l'instant t (scale 1) : la petite bannière, puis les cartes qui arrivent en ressort. */
export function bannerHeadHeight(t: number, lines: BannerLine[]) {
  return Math.max(HEAD.idle, 36 + lines.reduce((s, _l, i) => s + HEAD.row * headSpring(t, rowAt(lines, i)), 0));
}

/** Le centre (px, relatif au coin haut gauche de la bannière, scale 1) de la carte n à l'instant t. */
export function bannerRowCenter(lines: BannerLine[], n: number, t: number, width = 920): { x: number; y: number } {
  let top = HEAD.padY;
  for (const [i, l] of lines.entries()) {
    if (l.n === n) return { x: width / 2, y: top + HEAD.row / 2 };
    top += HEAD.row * headSpring(t, rowAt(lines, i));
  }
  return { x: width / 2, y: top };
}

/** La croix de pharmacie verte : ses bras s'allument un à un pendant l'analyse (scan-capsule.tsx, GreenCross). */
function PillCross({ lit = 4, size = 24, heart = 1 }: { lit?: number; size?: number; heart?: number }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size, flexShrink: 0 }}>
      {[{ x: 14, y: 2 }, { x: 26, y: 14 }, { x: 14, y: 26 }, { x: 2, y: 14 }].map((a, i) => (
        <rect key={i} x={a.x} y={a.y} width={12} height={12} rx={2.5} fill={i < lit ? "#0E8A7B" : "rgba(14,138,123,.16)"} />
      ))}
      <rect x={14} y={14} width={12} height={12} rx={2.5} fill="#0E8A7B" opacity={heart} />
    </svg>
  );
}

const MINT = { frame: "linear-gradient(160deg, #BDEBD7 0%, #8FDDBE 100%)", ring: "#3DBF8E", ink: "#0F2B26", green: "#0E8A7B", muted: "#5B6B66", line: "#E3EBE8", active: "#EAF6F0", soft: "#F1FAF6" } as const;

/** Le cadre menthe et son hélice d'ADN (crd-frame : l'hélice en « multiply » à 75 %). */
function MintFrame({ t, radius, children, style }: { t: number; radius: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", overflow: "hidden", borderRadius: radius, background: MINT.frame, boxShadow: `0 0 0 3px ${MINT.ring}, 0 44px 90px -34px rgba(14,124,90,.55)`, ...style }}>
      <AdnBackdrop t={t} tone="paper" width={1300} focus={[0.62, 0.45]} style={{ mixBlendMode: "multiply", opacity: 0.75, background: "transparent" }} />
      {children}
    </div>
  );
}

/** « PHARMABOOST » et le bouton « – Réduire » en haut du cadre menthe. */
function MintHeader({ size = 1, close = false }: { size?: number; close?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 * size, height: "100%" }}>
      <PillCross size={30 * size} />
      <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 21 * size, letterSpacing: "0.2em", color: MINT.ink }}>
        PHARMA<span style={{ color: MINT.green }}>BOOST</span>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 * size, height: 46 * size, padding: `0 ${18 * size}px`, borderRadius: 999, background: "rgba(255,255,255,.88)", boxShadow: `0 0 0 2px ${rgba(MINT.green, 0.25)}`, fontFamily: JAKARTA, fontWeight: 700, fontSize: 21 * size, color: "#0E7A4E" }}>
        <span style={{ width: 16 * size, height: 4 * size, borderRadius: 2, background: "#0E7A4E" }} />
        Réduire
      </span>
      {close && (
        <span style={{ display: "inline-flex", width: 46 * size, height: 46 * size, borderRadius: 99, alignItems: "center", justifyContent: "center", background: "#E9F0ED", color: MINT.muted, fontFamily: JAKARTA, fontWeight: 700, fontSize: 26 * size }}>×</span>
      )}
    </div>
  );
}

/** La photo studio du produit, comme la vraie bannière (fondateur, 31 oct. 2026 : « la vraie photo, pas les initiales ») ; sinon ses initiales. */
export function ProductPic({ name, image, size, radius }: { name: string; image?: string; size: number; radius: number }) {
  if (!image) return <Monogram name={name} size={size} radius={radius} />;
  return (
    <span style={{ display: "inline-flex", flexShrink: 0, width: size, height: size, borderRadius: radius, overflow: "hidden", background: "#FFFFFF", boxShadow: "inset 0 0 0 2px #E3EBE8", alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile(`rembobine/images/${image}`)} style={{ width: "88%", height: "88%", objectFit: "contain" }} />
    </span>
  );
}

/** Les initiales du produit quand il n'a pas de photo studio (mix-island.tsx, Monogram). */
export function Monogram({ name, size = 92, radius = 22 }: { name: string; size?: number; radius?: number }) {
  const words = name.replace(/[^A-Za-zÀ-ÿ ]/g, " ").split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  return (
    <span style={{ display: "inline-flex", width: size, height: size, flexShrink: 0, borderRadius: radius, alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #14A374 0%, #0A5C46 100%)", color: "#FFFFFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: size * 0.36, letterSpacing: "0.02em", boxShadow: "0 0 0 2px #FFFFFF, 0 0 0 4px #E3EBE8" }}>
      {initials}
    </span>
  );
}

/** Le nom court du conseil dans la petite bannière (scan-capsule.tsx, shortAdviceName). */
const shortName = (name: string) => name.split(/,|\s[-–]\s|\(/)[0].trim().slice(0, 22);

/** La petite bannière blanche au repos (croix + PHARMABOOST), au scan (les bras s'allument), puis le nom des conseils. */
function WhitePillContent({ t, lines, width }: { t: number; lines: BannerLine[]; width: number }) {
  const first = lines[0]?.at ?? Infinity;
  const scanFrom = first - 0.5;
  const scanning = t >= scanFrom && t < first;
  // La routine n'a pas de nom dans la petite bannière (comme la vraie : elle attend sous les cartes) ; à trois noms, ils rapetissent.
  const found = lines.filter((l) => t >= l.at && !l.routine);
  const small = lines.filter((l) => !l.routine).length >= 3;
  const lit = scanning ? Math.min(4, Math.floor((t - scanFrom) / 0.1) + 1) : 4;
  const heart = 0.6 + 0.4 * Math.cos((t * Math.PI * 2) / 1);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, height: "100%", width, padding: "0 30px", boxSizing: "border-box" }}>
      <PillCross lit={lit} size={56} heart={scanning ? heart : 1} />
      {found.length > 0 ? (
        <span style={{ display: "flex", alignItems: "center", gap: small ? 12 : 22, whiteSpace: "nowrap" }}>
          {found.map((l, i) => {
            const k = prog(t, l.at, 0.26, SNAP);
            return (
              <span key={l.n} style={{ display: "inline-flex", alignItems: "center", gap: 10, opacity: k, transform: `translateY(${(1 - k) * 10}px) scale(${0.9 + 0.1 * k})` }}>
                {i > 0 && <span style={{ width: 2, height: 30, marginRight: small ? 6 : 12, background: rgba(MINT.green, 0.25) }} />}
                {l.challenge ? <Star size={30} fill="#B8D400" color="#8AA000" strokeWidth={1.4} /> : l.shortDate ? <Hourglass size={28} color="#C23A2B" strokeWidth={2.4} /> : null}
                <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: small ? 24 : 30, color: MINT.ink }}>{shortName(l.product)}</span>
              </span>
            );
          })}
        </span>
      ) : scanning ? (
        <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 27, letterSpacing: "0.14em", textTransform: "uppercase", color: MINT.ink, whiteSpace: "nowrap" }}>{lines[0]?.drug}</span>
      ) : (
        <span style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 28, letterSpacing: "0.22em", color: MINT.ink, whiteSpace: "nowrap" }}>
          PHARMA<span style={{ color: MINT.green }}>BOOST</span>
        </span>
      )}
    </div>
  );
}

export function BannerHead({
  t,
  lines,
  highlight,
  pressed,
  width = 920,
  x,
  y,
  scale,
  rot,
  style,
}: Place & { t: number; lines: BannerLine[]; highlight?: { n: number; at: number }; pressed?: { n: number; at: number }; width?: number; idle?: string }) {
  const open = bannerOpenAt(lines);
  const rs = lines.map((_l, i) => headSpring(t, rowAt(lines, i)));
  const H = bannerHeadHeight(t, lines);
  const k0 = prog(t, open, 0.3, SNAP);
  // La boîte garde la hauteur FINALE : la bannière part du haut et grandit vers le bas.
  const boxH = Math.max(HEAD.idle, HEAD.padY * 2 + HEAD.row * lines.length);
  const pillW = Math.min(width, 640 + 210 * Math.max(0, lines.filter((l) => t >= l.at).length - 1));
  let top = HEAD.padY;
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div style={{ position: "relative", width, height: boxH }}>
        {/* La petite bannière blanche, au repos puis au scan. */}
        {k0 < 1 && (
          <div style={{ position: "absolute", left: (width - pillW) / 2, top: 0, width: pillW, height: HEAD.idle, borderRadius: 999, overflow: "hidden", background: "#FFFFFF", boxShadow: `0 28px 60px -26px rgba(15,43,38,.5), 0 0 0 2px ${rgba(MINT.green, 0.25)}`, opacity: 1 - k0, transform: `scale(${1 + 0.06 * k0})` }}>
            <AdnBackdrop t={t} tone="paper" width={900} focus={[0.62, 0.4]} style={{ mixBlendMode: "multiply", opacity: 0.42, background: "transparent" }} />
            <div style={{ position: "relative", height: "100%" }}>
              <WhitePillContent t={t} lines={lines} width={pillW} />
            </div>
          </div>
        )}
        {/* Les cartes menthe : l'en-tête, la feuille blanche, une carte par conseil. */}
        {k0 > 0 && (
          <MintFrame t={t} radius={40} style={{ left: 0, top: -HEAD.top, width, height: H + HEAD.top, opacity: clamp01(k0 * 1.6), transform: `scale(${0.96 + 0.04 * k0})`, transformOrigin: "50% 0%" }}>
            <div style={{ position: "absolute", left: 24, right: 20, top: 8, height: HEAD.top - 12 }}>
              <MintHeader size={0.95} />
            </div>
            <div style={{ position: "absolute", left: 12, right: 12, top: HEAD.top, bottom: 12, borderRadius: 30, background: "#FFFFFF", boxShadow: "0 18px 40px -26px rgba(15,43,38,.6)" }} />
            {lines.map((l, i) => {
              const rowTop = top + HEAD.top;
              top += HEAD.row * rs[i];
              const at = rowAt(lines, i);
              if (t < at) return null;
              const p = prog(t, at, 0.34, SNAP);
              const hl = highlight && highlight.n === l.n ? prog(t, highlight.at, 0.22, SNAP) : 0;
              const pr = pressed && pressed.n === l.n ? keys(t, [[pressed.at - 0.06, 1], [pressed.at + 0.03, 0.965, SNAP], [pressed.at + 0.17, 1.012, SNAP], [pressed.at + 0.36, 1, IN_OUT]]) : 1;
              const rip = pressed && pressed.n === l.n ? prog(t, pressed.at, 0.5, SNAP) : 0;
              return (
                <div key={l.n} style={{ position: "absolute", left: 22, top: rowTop - 6, width: width - 44, height: HEAD.row - 6, opacity: clamp01(p * 1.6), transform: `translateY(${(1 - p) * -18}px) scale(${pr})`, transformOrigin: "40% 50%" }}>
                  {i > 0 && <div style={{ position: "absolute", left: 12, right: 12, top: -3, height: 2, background: MINT.line }} />}
                  {(hl > 0 || rip > 0) && (
                    <div style={{ position: "absolute", inset: "4px 0", borderRadius: 26, overflow: "hidden", background: rgba("#EAF6F0", hl), boxShadow: `inset 0 0 0 2px ${rgba(MINT.ring, 0.6 * hl)}` }}>
                      <Sheen k={prog(t, (highlight?.at ?? 0) + 0.04, 0.6, IN_OUT)} alpha={0.5} width="30%" />
                      {rip > 0 && rip < 1 && <div style={{ position: "absolute", left: "50%", top: "50%", width: 900 * rip, height: 900 * rip, marginLeft: -450 * rip, marginTop: -450 * rip, borderRadius: "50%", background: `rgba(14,138,123,${0.16 * (1 - rip)})` }} />}
                    </div>
                  )}
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 22, height: "100%", padding: "0 18px 0 14px" }}>
                    {l.routine ? (
                      <span style={{ display: "inline-flex", flexShrink: 0, width: 96, alignItems: "center" }}>
                        {l.routine.map((img, k) => (
                          <span key={img} style={{ marginLeft: k ? -22 : 0, display: "inline-flex", width: 46, height: 46, borderRadius: 12, overflow: "hidden", background: "#FFFFFF", boxShadow: "0 0 0 3px #FFFFFF, inset 0 0 0 1.5px #E3EBE8", alignItems: "center", justifyContent: "center" }}>
                            <Img src={staticFile(`rembobine/images/${img}`)} style={{ width: "86%", height: "86%", objectFit: "contain" }} />
                          </span>
                        ))}
                      </span>
                    ) : (
                      <ProductPic name={l.product} image={l.image} size={96} radius={24} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 35, letterSpacing: "-0.015em", color: MINT.ink, whiteSpace: "nowrap" }}>{l.product}</div>
                      <div style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, color: MINT.muted, whiteSpace: "nowrap" }}>pour {l.drug}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", height: 38 }}>
                        {(l.chips ?? []).map((c, k) => (
                          <Chip key={k} t={t} kind={c.kind} text={c.text} at={c.at ?? at + 0.22 + 0.1 * k} size={21} />
                        ))}
                      </div>
                    </div>
                    {l.price && <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 38, color: MINT.green, fontVariantNumeric: "tabular-nums" }}>{l.price}</span>}
                  </div>
                  {hl > 0 && <Sparkle t={t} at={(highlight?.at ?? 0) + 0.05} x={width - 90} y={30} size={64} color="#3DBF8E" />}
                </div>
              );
            })}
          </MintFrame>
        )}
      </div>
    </Placed>
  );
}

// ---- La fiche du conseil ouverte ---------------------------------------------------------------------------------------

export type BannerTab = "questions" | "discours" | "fiche";
export type BannerQuestion = { text: string; at?: number };

const CARD = { W: 920, H: 860, pad: 18, top: 62, gap: 12, lPad: 18, padX: 30, padY: 26, photo: 112, sp: 14, chip: 22, chipRow: 38, chipGap: 10, act: 66 } as const;
/** La feuille blanche : coin haut gauche et taille, dans la fiche. */
const WHITE = { x: CARD.pad + CARD.lPad, y: CARD.pad + CARD.top + CARD.gap + CARD.lPad, w: CARD.W - 2 * CARD.pad - 2 * CARD.lPad, h: CARD.H - 2 * CARD.pad - CARD.top - CARD.gap - 2 * CARD.lPad } as const;
const WHITE_IN = WHITE.w - 2 * CARD.padX;
/** Les deux parties de la fiche (mix-island.tsx, AdviceIsland) : « À dire au patient », puis les deux questions. */
const SAY = { y: 372, h: 112 } as const;
const ASK = { y: 494, h: 214 } as const;

/** Largeur estimée d'une pastille (Jakarta 700), un peu large exprès : la rangée passe à la ligne plutôt que de déborder. */
function chipWidth(c: ChipSpec, size: number) {
  return Array.from(c.text).length * size * 0.56 + 2 * 0.62 * size + (c.kind === "marge" || c.kind === "plain" ? 0 : size * 1.15);
}
/** Les rangées de pastilles de la fiche (1 ou 2), toutes les pastilles comptées même avant leur arrivée. */
function chipRows(chips: ChipSpec[]) {
  let rows = chips.length ? 1 : 0;
  let w = 0;
  for (const c of chips) {
    const cw = chipWidth(c, CARD.chip);
    if (w > 0 && w + CARD.chipGap + cw > WHITE_IN) {
      rows++;
      w = cw;
    } else w += (w > 0 ? CARD.chipGap : 0) + cw;
  }
  return Math.min(2, Math.max(1, rows));
}

/** Repères de la fiche (px, relatifs à son coin haut gauche, scale 1). */
export const BANNER_CARD = {
  W: CARD.W,
  H: CARD.H,
  /** Le centre de la ligne du bas (« ✓ Vendu » une fois la vente validée). */
  vendu: { x: WHITE.x + WHITE.w / 2, y: WHITE.y + WHITE.h - CARD.padY - CARD.act / 2 },
  /** Le titre d'une partie : « Questions à poser » (questions) ou « À dire au patient » (discours, fiche). */
  tab: (id: BannerTab, _chips: ChipSpec[] = []) => (id === "questions" ? { x: WHITE.x + CARD.padX + 120, y: ASK.y + 16 } : { x: WHITE.x + CARD.padX + 110, y: SAY.y + 16 }),
  /** Les deux parties, pour les entourer (px depuis le coin haut gauche). */
  say: { x: WHITE.x + 14, y: SAY.y - 8, w: WHITE.w - 28, h: SAY.h + 12 },
  ask: { x: WHITE.x + 14, y: ASK.y - 8, w: WHITE.w - 28, h: ASK.h + 12 },
};

const DEFAULT_QUESTIONS: BannerQuestion[] = [{ text: "Avez-vous déjà eu des troubles digestifs avec un antibiotique ?" }, { text: "Prenez-vous déjà un probiotique ?" }];
const DEFAULT_DISCOURS = { text: "Avec un antibiotique, la flore intestinale peut être perturbée. Je vous conseille un probiotique pendant le traitement." };

function SectionTitle({ children, glow = 0 }: { children: ReactNode; glow?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 32, padding: "0 10px", marginLeft: -10, borderRadius: 10, background: rgba(MINT.ring, 0.22 * glow), boxShadow: glow > 0 ? `0 0 0 2px ${rgba(MINT.ring, 0.7 * glow)}` : undefined, fontFamily: JAKARTA, fontWeight: 700, fontSize: 19, letterSpacing: "0.14em", textTransform: "uppercase", color: MINT.green }}>
      {children}
    </div>
  );
}

export function BannerCard({
  t,
  product = "Probiotique",
  image,
  for: drug = "Amoxicilline 1 g",
  tab = "questions",
  questions = DEFAULT_QUESTIONS,
  discours = DEFAULT_DISCOURS,
  chips = [],
  sold,
  at,
  price,
  x,
  y,
  scale,
  rot,
  style,
}: Place & {
  t: number;
  product?: string;
  image?: string;
  for?: string;
  tab?: Timed<BannerTab>;
  questions?: BannerQuestion[];
  discours?: { text: string; at?: number; dur?: number };
  chips?: ChipSpec[];
  /** La vente est validée à ce temps : « ✓ Vendu » se trace. */
  sold?: number;
  /** La fiche se DÉPLIE à ce temps (sinon déjà ouverte ; rien avant `at`). */
  at?: number;
  price?: string;
  rank?: string;
  fiche?: { reason?: string; posology?: string; tell?: string[] };
  count?: number;
}) {
  if (at !== undefined && t < at - F) return null;
  const unfold = at === undefined ? 1 : clamp01(ressort(t, at, { damping: 15, stiffness: 170, mass: 0.75 }));
  const st = (d: number, dur = 0.34) => (at === undefined ? 1 : prog(t, at + d, dur, SNAP));
  const tabFn = asFn(tab);
  const cur = tabFn(t);
  const { since } = sinceChange(t, tabFn, 0.5);
  const flash = since === Infinity ? 0 : pulse(since, 0, 0.05, 0.06, 0.6);
  const glowAsk = cur === "questions" ? Math.max(0.35, flash) : 0;
  const glowSay = cur !== "questions" ? Math.max(0.35, flash) : 0;
  const soldK = sold === undefined ? 0 : prog(t, sold + 0.16, 0.3, SNAP);
  const soldGlow = sold === undefined ? 0 : pulse(t, sold, 0.08, 0.12, 0.7);
  const tick = sold === undefined ? 0 : ressort(t, sold + 0.2, { damping: 10, stiffness: 300, mass: 0.5 });
  const draw = sold === undefined ? 0 : prog(t, sold + 0.28, 0.22, SNAP);
  const rows = chipRows(chips);
  // « À dire au patient » s'écrit (discours.at, dur) ; sans temps, déjà écrit.
  const sayK = discours.at === undefined ? 1 : clamp01((t - discours.at) / (discours.dur ?? 1.2));
  const sayText = discours.text.slice(0, Math.round(discours.text.length * sayK));
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div style={{ position: "relative", width: CARD.W, height: CARD.H, clipPath: unfold < 1 ? `inset(0 0 ${(1 - unfold) * 86}% 0 round 46px)` : undefined }}>
        <MintFrame t={t} radius={46} style={{ inset: 0, boxShadow: `0 0 0 3px ${MINT.ring}, 0 0 ${60 * soldGlow}px ${rgba(MINT.ring, soldGlow)}, 0 50px 100px -40px rgba(14,124,90,.6)` }}>
          <div style={{ position: "absolute", left: CARD.pad + 10, right: CARD.pad + 4, top: CARD.pad, height: CARD.top, opacity: st(0) }}>
            <MintHeader close />
          </div>
          <div
            style={{
              position: "absolute",
              left: WHITE.x,
              top: WHITE.y,
              width: WHITE.w,
              height: WHITE.h,
              boxSizing: "border-box",
              padding: `${CARD.padY}px ${CARD.padX}px`,
              borderRadius: 36,
              background: "#FFFFFF",
              boxShadow: "0 24px 60px -34px rgba(15,43,38,.6)",
              color: MINT.ink,
            }}
          >
            {/* Photo (ou initiales) + « pour … » + nom et prix. */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, height: CARD.photo, opacity: st(0.08), transform: `translateY(${(1 - st(0.08)) * 24}px)` }}>
              <ProductPic name={product} image={image} size={CARD.photo} radius={26} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: JAKARTA, fontWeight: 700, fontSize: 19, letterSpacing: "0.14em", textTransform: "uppercase", color: MINT.green }}>pour {drug}</div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 14, fontFamily: JAKARTA, fontWeight: 700, fontSize: 46, lineHeight: 1.05, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>
                  {product}
                  {price && <span style={{ color: MINT.green, fontVariantNumeric: "tabular-nums" }}>{price}</span>}
                  {soldK > 0 && (
                    <span style={{ display: "inline-flex", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 99, background: MINT.green, transform: `scale(${Math.max(0, tick)})` }}>
                      <svg width={28} height={28} viewBox="0 0 26 26">
                        <path d="M6 13.5 L11 18.5 L20.5 8" fill="none" stroke="#FFF" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - draw)} />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Les pastilles (une ou deux rangées). */}
            <div style={{ display: "flex", flexWrap: "wrap", columnGap: CARD.chipGap, rowGap: 8, marginTop: CARD.sp, height: rows * CARD.chipRow + (rows - 1) * 8, alignContent: "flex-start", alignItems: "center" }}>
              {chips.map((c, k) => (
                <Chip key={k} t={t} kind={c.kind} text={c.text} at={c.at ?? (at === undefined ? undefined : at + 0.2 + 0.08 * k)} size={CARD.chip} />
              ))}
            </div>
          </div>
          {/* « À dire au patient » : la phrase, qui s'écrit. */}
          <div style={{ position: "absolute", left: WHITE.x + CARD.padX, right: WHITE.x + CARD.padX, top: SAY.y, height: SAY.h, opacity: st(0.2) }}>
            <SectionTitle glow={glowSay}>
              <Quote size={20} strokeWidth={2.6} /> À dire au patient
            </SectionTitle>
            <div style={{ marginTop: 8, fontFamily: JAKARTA, fontWeight: 500, fontSize: 25, lineHeight: 1.32, color: MINT.ink }}>
              « {sayText}
              {sayK < 1 && <span style={{ display: "inline-block", width: 3, height: 26, marginLeft: 2, verticalAlign: "-4px", background: MINT.green }} />}
              {sayK >= 1 && " »"}
            </div>
          </div>
          {/* Les deux questions, chacune avec ses réponses. */}
          <div style={{ position: "absolute", left: WHITE.x + CARD.padX, right: WHITE.x + CARD.padX, top: ASK.y, height: ASK.h, opacity: st(0.26) }}>
            <SectionTitle glow={glowAsk}>Questions à poser</SectionTitle>
            {questions.slice(0, 2).map((q, i) => {
              const k = q.at === undefined ? 1 : prog(t, q.at, 0.3, SNAP);
              return (
                <div key={i} style={{ marginTop: 12, opacity: k, transform: `translateX(${(1 - k) * 30}px)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: JAKARTA, fontWeight: 600, fontSize: 24, color: MINT.ink, whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", width: 30, height: 30, flexShrink: 0, borderRadius: 99, alignItems: "center", justifyContent: "center", background: MINT.green, color: "#FFF", fontWeight: 800, fontSize: 18 }}>{i + 1}</span>
                    {q.text}
                  </div>
                  <div style={{ marginTop: 6, marginLeft: 42, display: "flex", gap: 10 }}>
                    {(i === 0 ? ["Oui, déjà", "Pas encore"] : ["Oui", "Non"]).map((a) => (
                      <span key={a} style={{ height: 34, padding: "0 16px", display: "inline-flex", alignItems: "center", borderRadius: 999, boxShadow: "inset 0 0 0 2px #CFE3DA", fontFamily: JAKARTA, fontWeight: 600, fontSize: 19, color: MINT.ink }}>{a}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* La ligne du bas : « Une question du patient ? » (l'aide), puis « ✓ Vendu » une fois la vente validée. */}
          <div style={{ position: "absolute", left: WHITE.x + CARD.padX, right: WHITE.x + CARD.padX, top: WHITE.y + WHITE.h - CARD.padY - CARD.act, height: CARD.act, opacity: st(0.32) }}>
            {soldK < 1 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 14, padding: "0 8px 0 22px", borderRadius: 999, background: MINT.soft, boxShadow: `inset 0 0 0 2px #BFE6D4`, opacity: 1 - soldK }}>
                <Quote size={24} color={MINT.green} strokeWidth={2.4} />
                <span style={{ flex: 1, fontFamily: JAKARTA, fontWeight: 500, fontSize: 23, color: MINT.muted }}>Une question du patient ?</span>
                <span style={{ height: 50, padding: "0 24px", display: "inline-flex", alignItems: "center", borderRadius: 999, background: MINT.green, color: "#FFF", fontFamily: JAKARTA, fontWeight: 700, fontSize: 22 }}>Demander</span>
              </div>
            )}
            {soldK > 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 14, padding: "0 22px", borderRadius: 999, background: "#E3F6EC", boxShadow: `inset 0 0 0 2px ${rgba(MINT.green, 0.35)}`, opacity: soldK, transform: `translateY(${(1 - soldK) * 18}px)` }}>
                <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 99, background: MINT.green, transform: `scale(${Math.max(0, tick)})` }}>
                  <svg width={26} height={26} viewBox="0 0 26 26">
                    <path d="M6 13.5 L11 18.5 L20.5 8" fill="none" stroke="#FFF" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={24} strokeDashoffset={24 * (1 - draw)} />
                  </svg>
                </span>
                <span style={{ flex: 1, fontFamily: JAKARTA, fontWeight: 800, fontSize: 28, color: "#0E7A4E" }}>Vendu</span>
              </div>
            )}
          </div>
        </MintFrame>
      </div>
    </Placed>
  );
}

// ---- Le compteur des conseils vendus ---------------------------------------------------------------------------------

export function SoldCounterCard({
  t,
  value,
  at,
  periods = ["Aujourd'hui", "Cette semaine", "Ce mois-ci"],
  period = 0,
  revenue = "+ 1 254 €",
  withAdvice,
  goal = 0.8,
  title = "Toute l'officine",
  subtitle = "Conseils vendus au comptoir, déclarés « Vendu »",
  x,
  y,
  scale,
  rot,
  style,
}: Place & {
  t: number;
  value: Timed<number>;
  at?: number;
  periods?: string[];
  period?: Timed<number>;
  revenue?: Timed<string>;
  /** La 3e tuile « Ventes avec un conseil vendu » (absente sans valeur). */
  withAdvice?: string;
  /** Part de l'objectif atteinte (1 = 10 % des ventes). */
  goal?: Timed<number>;
  title?: string;
  subtitle?: string;
}) {
  if (at !== undefined && t < at - F) return null;
  const e = enter(t, at, 0.5);
  const r = at === undefined ? 1 : ressort(t, at, { damping: 14, stiffness: 180, mass: 0.7 });
  const st = (d: number) => (at === undefined ? 1 : prog(t, at + d, 0.4, SNAP));
  const vf = asFn(value);
  const intOf = (tt: number) => Math.floor(vf(tt) + 1e-4);
  const ch = sinceChange(t, intOf, 0.9);
  const bump = ch.since === Infinity ? 0 : pulse(ch.since, 0, 0.05, 0.08, 0.5);
  const plus = ch.since === Infinity ? -1 : ch.since;
  const pf = asFn(period);
  const pi = pf(t);
  const pc = sinceChange(t, pf, 0.4);
  const pk = pc.since === Infinity ? 1 : SNAP(clamp01(pc.since / 0.25));
  const g = asFn(goal)(t) * (at === undefined ? 1 : prog(t, at + 0.35, 1.0, IN_OUT));
  const share = g * 0.1;
  const reached = g >= 1;
  const tiles: { dt: string; dd: ReactNode }[] = [{ dt: "Chiffre d'affaires ajouté", dd: <span style={{ fontVariantNumeric: "tabular-nums" }}>{asFn(revenue)(t)}</span> }];
  if (withAdvice) tiles.push({ dt: "Ventes avec un conseil vendu", dd: withAdvice });
  const n = vf(t);
  const plural = Math.floor(n + 1e-4) > 1;
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div
        style={{
          position: "relative",
          width: 1200,
          boxSizing: "border-box",
          padding: 46,
          borderRadius: 48,
          overflow: "hidden",
          color: "#FFFFFF",
          background: `linear-gradient(135deg, ${U.brand600} 0%, ${U.brand700} 50%, ${U.brandDeep} 100%)`,
          boxShadow: `inset 0 0 0 2px rgba(205,228,220,.35), 0 50px 100px -40px rgba(0,0,0,.6)`,
          opacity: clamp01(e * 1.6),
          transform: `translateY(${(1 - e) * 70}px) scale(${lerp(0.9, 1, r)})`,
        }}
      >
        <Sheen k={((t * 0.18) % 1.6) / 1.2} alpha={0.07} width="30%" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, opacity: st(0.05) }}>
          <div>
            <div style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>{title}</div>
            <div style={{ marginTop: 8, fontFamily: JAKARTA, fontWeight: 500, fontSize: 22, color: "rgba(255,255,255,.82)", whiteSpace: "nowrap" }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex", gap: 4, padding: 6, borderRadius: 999, background: "rgba(255,255,255,.1)" }}>
            {periods.map((label, i) => {
              const on = i === pi ? pk : i === pc.prev && pc.since !== Infinity ? 1 - pk : 0;
              return (
                <span key={label} style={{ position: "relative", height: 50, padding: "0 19px", display: "inline-flex", alignItems: "center", borderRadius: 999, fontFamily: JAKARTA, fontWeight: 600, fontSize: 22, whiteSpace: "nowrap", background: `rgba(255,255,255,${on})`, color: on > 0.5 ? U.brand800 : "rgba(255,255,255,.8)" }}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ position: "relative", marginTop: 26, display: "flex", alignItems: "flex-end", justifyContent: "space-between", opacity: st(0.1) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
            <span style={{ position: "relative", display: "inline-block", transform: `scale(${1 + 0.08 * bump})`, transformOrigin: "0 80%", filter: bump > 0 ? `drop-shadow(0 0 ${22 * bump}px ${rgba(PB.citron, 0.8)})` : undefined }}>
              <Odometer t={t} value={vf} size={156} color={bump > 0.15 ? PB.citron : "#FFFFFF"} style={{ fontFamily: JAKARTA, fontWeight: 700, letterSpacing: "-0.04em" }} />
              {plus >= 0 && plus < 0.9 && (
                <span style={{ position: "absolute", right: -78, top: 34 - 34 * SNAP(clamp01(plus / 0.6)), fontFamily: JAKARTA, fontWeight: 800, fontSize: 52, color: PB.citron, opacity: 1 - clamp01((plus - 0.45) / 0.4), transform: `scale(${keys(plus, [[0, 0.4], [0.12, 1.25, POP], [0.3, 1, IN_OUT]])})`, textShadow: `0 0 18px ${rgba(PB.citron, 0.8)}` }}>+1</span>
              )}
            </span>
            <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 32, color: "rgba(255,255,255,.86)" }}>conseil{plural ? "s" : ""} vendu{plural ? "s" : ""}</span>
          </div>
          <Trophy size={70} color="#FCD34D" strokeWidth={2} style={{ marginBottom: 18, transform: `rotate(${wobble(t, 2, 4, 1)}deg) scale(${1 + 0.15 * bump})` }} />
        </div>
        <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: `repeat(${tiles.length + 1}, 1fr)`, gap: 22 }}>
          {tiles.map((tile, i) => (
            <div key={tile.dt} style={{ borderRadius: 30, padding: 26, background: "rgba(255,255,255,.1)", opacity: st(0.18 + 0.08 * i), transform: `translateY(${(1 - st(0.18 + 0.08 * i)) * 30}px)` }}>
              <div style={{ fontFamily: JAKARTA, fontWeight: 500, fontSize: 22, color: "rgba(255,255,255,.72)" }}>{tile.dt}</div>
              <div style={{ marginTop: 6, fontFamily: JAKARTA, fontWeight: 600, fontSize: 40, letterSpacing: "-0.01em" }}>{tile.dd}</div>
            </div>
          ))}
          <div style={{ borderRadius: 30, padding: 26, background: "rgba(255,255,255,.1)", opacity: st(0.34), transform: `translateY(${(1 - st(0.34)) * 30}px)` }}>
            <div style={{ fontFamily: JAKARTA, fontWeight: 500, fontSize: 22, color: "rgba(255,255,255,.72)" }}>Objectif : 10 % des ventes</div>
            <div style={{ marginTop: 16, height: 18, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,.15)" }}>
              <div style={{ position: "relative", width: `${Math.min(100, g * 100)}%`, height: "100%", borderRadius: 99, overflow: "hidden", background: reached ? "#6EE7B7" : "#FCD34D" }}>
                <Sheen k={((t * 0.6) % 1.4) / 1.1} alpha={0.6} />
              </div>
            </div>
            <div style={{ marginTop: 10, fontFamily: JAKARTA, fontWeight: 500, fontSize: 22, color: "rgba(255,255,255,.82)" }}>{reached ? "Objectif atteint" : `${Math.round(share * 100)} % sur 10 %`}</div>
          </div>
        </div>
      </div>
    </Placed>
  );
}

// ---- Le classement de l'équipe, le direct ----------------------------------------------------------------------------

export type TeamRow = { initials: string; value: number; color?: string };
const DEFAULT_TEAM: TeamRow[] = [
  { initials: "SB", value: 36, color: "#0E8A7B" },
  { initials: "ML", value: 31, color: "#0796B4" },
  { initials: "JD", value: 31, color: "#22C88F" },
];

export function TeamRank({ t, at, rows = DEFAULT_TEAM, climber = 2, title = "Mon équipe", x, y, scale, rot, style }: Place & { t: number; at: number; rows?: TeamRow[]; climber?: number; title?: string }) {
  const ROW = 76;
  const W = 600;
  const e = prog(t, at - 0.6, 0.45, SNAP);
  const sw = prog(t, at + 0.12, 0.5, IN_OUT);
  const lift = Math.sin(Math.PI * sw);
  const max = Math.max(...rows.map((r) => r.value)) + 1;
  const badge = ressort(t, at + 0.45, { damping: 9, stiffness: 260, mass: 0.5 });
  const glow = prog(t, at, 0.3, SNAP);
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div style={{ position: "relative", width: W, boxSizing: "border-box", padding: "24px 26px 26px", borderRadius: 34, background: "#FFFFFF", boxShadow: "0 40px 80px -36px rgba(0,0,0,.55)", opacity: clamp01(e * 1.5), transform: `translateY(${(1 - e) * 40}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users size={26} color={U.green} strokeWidth={2.4} />
          <span style={{ flex: 1, fontFamily: JAKARTA, fontWeight: 800, fontSize: 21, letterSpacing: "0.1em", textTransform: "uppercase", color: U.ink }}>{title}</span>
          <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 18, color: U.muted }}>Conseils vendus</span>
        </div>
        <div style={{ position: "relative", marginTop: 14, height: rows.length * ROW }}>
          {rows.map((_, i) => (
            <div key={`n${i}`} style={{ position: "absolute", left: 0, top: i * ROW, height: ROW, display: "flex", alignItems: "center", fontFamily: MONO, fontWeight: 700, fontSize: 26, color: U.muted }}>{i + 1}</div>
          ))}
          {rows.map((r, i) => {
            const isC = i === climber;
            const isUp = i === climber - 1;
            const yy = isC ? lerp(i, i - 1, sw) * ROW : isUp ? lerp(i, i + 1, sw) * ROW : i * ROW;
            const v = isC ? (tt: number) => r.value + prog(tt, at, 0.3, SNAP) : r.value;
            const val = isC ? r.value + prog(t, at, 0.3, SNAP) : r.value;
            return (
              <div key={r.initials} style={{ position: "absolute", left: 36, right: 0, top: yy, height: ROW, display: "flex", alignItems: "center", gap: 16, zIndex: isC ? 2 : 1, transform: isC ? `translateX(${22 * lift}px) scale(${1 + 0.05 * lift})` : undefined }}>
                {isC && <div style={{ position: "absolute", inset: "6px -10px 6px -12px", borderRadius: 20, background: rgba(PB.citron, 0.5 * glow), boxShadow: lift > 0 ? `0 18px 30px -16px rgba(0,0,0,${0.5 * lift})` : undefined }} />}
                <span style={{ position: "relative", display: "inline-flex", width: 54, height: 54, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 99, background: `linear-gradient(135deg, ${r.color ?? U.green}, ${PB.green})`, color: "#FFF", fontFamily: JAKARTA, fontWeight: 800, fontSize: 21 }}>{r.initials}</span>
                <div style={{ position: "relative", flex: 1, height: 14, borderRadius: 99, background: U.appTint, overflow: "hidden" }}>
                  <div style={{ width: `${(val / max) * 100 * prog(t, at - 0.45 + 0.08 * i, 0.7, SNAP)}%`, height: "100%", borderRadius: 99, background: U.grad }} />
                </div>
                <span style={{ position: "relative", width: 56, textAlign: "right" }}>
                  <Odometer t={t} value={v} size={30} color={U.ink} />
                </span>
              </div>
            );
          })}
        </div>
        {badge > 0.01 && (
          <div style={{ position: "absolute", left: W - 22, top: 24 + 14 + (climber - 1) * ROW + 8, display: "inline-flex", alignItems: "center", gap: 6, height: 44, padding: "0 16px", borderRadius: 99, background: PB.citron, color: PB.green, fontFamily: JAKARTA, fontWeight: 800, fontSize: 21, whiteSpace: "nowrap", boxShadow: `0 10px 24px -10px ${rgba(PB.green, 0.6)}`, transform: `scale(${badge}) rotate(${(1 - clamp01(badge)) * 14 - 4}deg)` }}>
            <ArrowUp size={22} strokeWidth={3} />
            +1 place
          </div>
        )}
      </div>
    </Placed>
  );
}

export function LiveDot({ t, at, label = "EN DIRECT", x, y, scale, rot, style }: Place & { t: number; at?: number; label?: string }) {
  const r = at === undefined ? 1 : ressort(t, at, { damping: 10, stiffness: 280, mass: 0.5 });
  if (at !== undefined && t < at) return null;
  const u = (t % 1.1) / 1.1;
  const glow = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI / 1.1);
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 14, height: 54, padding: "0 22px 0 18px", borderRadius: 99, background: "rgba(7,9,10,.62)", boxShadow: "inset 0 0 0 2px rgba(255,255,255,.14), 0 12px 30px -14px rgba(0,0,0,.6)", transform: `scale(${r})`, transformOrigin: "20% 50%" }}>
        <span style={{ position: "relative", width: 18, height: 18 }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: 99, border: `2px solid ${U.live}`, transform: `scale(${1 + 1.6 * u})`, opacity: 1 - u }} />
          <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: U.live, boxShadow: `0 0 ${10 + 10 * glow}px ${U.live}` }} />
        </span>
        <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 22, letterSpacing: "0.16em", color: "#FFF" }}>{label}</span>
      </div>
    </Placed>
  );
}

// ---- Le téléphone ----------------------------------------------------------------------------------------------------

export const PHONE_SIZE = { W: 375, H: 812, bezel: 10, radius: 52, status: 44 } as const;

function StatusIcons({ color }: { color: string }) {
  return (
    <svg width={68} height={13} viewBox="0 0 68 13">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 4.6} y={9.5 - i * 2.6} width={3.2} height={3 + i * 2.6} rx={0.8} fill={color} />
      ))}
      <path d="M25.5 4.6a8.4 8.4 0 0 1 11.6 0M27.9 7.1a5 5 0 0 1 6.8 0" stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      <circle cx={31.3} cy={10} r={1.4} fill={color} />
      <rect x={42.5} y={1.5} width={21} height={10} rx={2.6} stroke={color} strokeOpacity={0.45} fill="none" />
      <rect x={44.2} y={3.2} width={15.5} height={6.6} rx={1.4} fill={color} />
      <rect x={64.4} y={4.8} width={1.7} height={3.4} rx={0.8} fill={color} fillOpacity={0.45} />
    </svg>
  );
}

export function Phone({
  t,
  x,
  y,
  scale = 1,
  tilt = 0,
  pitch = 0,
  rot = 0,
  buzz,
  statusTone = "dark",
  float = true,
  screen = U.appBg,
  children,
  style,
}: {
  t: number;
  x: number;
  y: number;
  scale?: number;
  /** Rotation 3D autour de l'axe vertical (degrés). */
  tilt?: number;
  pitch?: number;
  rot?: number;
  /** Il vibre à ce temps (deux secousses, 0,6 s). */
  buzz?: number;
  /** "light" : barre d'état blanche (écran sombre, AppScan). */
  statusTone?: "dark" | "light";
  float?: boolean;
  screen?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const { W, H, bezel, radius } = PHONE_SIZE;
  const u = buzz === undefined ? -1 : t - buzz;
  const env = u < 0 || u > 0.62 ? 0 : (u < 0.26 ? 1 : u > 0.34 ? 1 : 0) * Math.exp(-2.2 * u);
  const bx = 6 * env * Math.sin(2 * Math.PI * 34 * u);
  const br = 1.4 * env * Math.sin(2 * Math.PI * 34 * u + 1.3);
  const fy = float ? wobble(t, 7, 7, 0.75) : 0;
  const fr = float ? wobble(t, 11, 0.8, 0.6) : 0;
  const ink = statusTone === "light" ? "#FFFFFF" : U.bezel;
  const glare = 32 + tilt * 0.9;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: W,
        height: H,
        transform: `translate(-50%, -50%) translate(${bx}px, ${fy}px) perspective(2400px) rotateY(${tilt}deg) rotateX(${pitch}deg) rotate(${rot + br + fr}deg) scale(${scale})`,
        transformOrigin: "50% 50%",
        ...style,
      }}
    >
      {/* Boutons latéraux. */}
      <div style={{ position: "absolute", left: -4, top: 150, width: 5, height: 36, borderRadius: 3, background: "#1B2725" }} />
      <div style={{ position: "absolute", left: -4, top: 200, width: 5, height: 60, borderRadius: 3, background: "#1B2725" }} />
      <div style={{ position: "absolute", left: -4, top: 272, width: 5, height: 60, borderRadius: 3, background: "#1B2725" }} />
      <div style={{ position: "absolute", right: -4, top: 220, width: 5, height: 96, borderRadius: 3, background: "#1B2725" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background: U.bezel,
          boxShadow: `0 60px 110px -46px rgba(11,21,19,.75), 0 24px 44px -24px rgba(0,0,0,.45), inset 0 0 0 2px #26302E, inset 0 0 0 4px #0B1513`,
        }}
      >
        <div style={{ position: "absolute", inset: bezel, borderRadius: radius - bezel, overflow: "hidden", background: screen }}>
          {children}
          {/* Barre d'état, île noire, barre d'accueil. */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: PHONE_SIZE.status, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 26px 7px 30px", boxSizing: "border-box", fontFamily: JAKARTA, fontWeight: 700, fontSize: 15, color: ink, zIndex: 20 }}>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>9:41</span>
            <StatusIcons color={ink} />
          </div>
          <div style={{ position: "absolute", left: "50%", top: 9, width: 116, height: 32, marginLeft: -58, borderRadius: 99, background: "#000", zIndex: 21 }} />
          <div style={{ position: "absolute", left: "50%", bottom: 8, width: 128, height: 5, marginLeft: -64, borderRadius: 99, background: ink, opacity: 0.85, zIndex: 21 }} />
          <div style={{ position: "absolute", inset: 0, zIndex: 22, pointerEvents: "none", background: `linear-gradient(115deg, transparent ${glare}%, rgba(255,255,255,.16) ${glare + 9}%, transparent ${glare + 22}%)` }} />
        </div>
      </div>
    </div>
  );
}

// ---- Les petites pièces de l'appli -----------------------------------------------------------------------------------

const appText = (size: number, weight = 600, color: string = U.appInk): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: weight, fontSize: size, color, letterSpacing: size >= 24 ? "-0.03em" : "-0.005em" });

function Screen({ children, bg = U.appBg, style }: { children: ReactNode; bg?: string; style?: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: bg, ...style }}>{children}</div>;
}

/** L'hélice en filigrane en haut des écrans (patient-app.tsx : Dna). */
function DnaTop({ t, h = 260, opacity = 0.4 }: { t: number; h?: number; opacity?: number }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, overflow: "hidden", opacity, WebkitMaskImage: "linear-gradient(180deg, #000 30%, transparent)", maskImage: "linear-gradient(180deg, #000 30%, transparent)" }}>
      <Img src={staticFile("rembobine/images/adn-helice.jpg")} style={{ position: "absolute", left: -40 + wobble(t, 5, 8, 0.3), top: -120 + wobble(t, 9, 6, 0.25), width: 460, height: 383 }} />
    </div>
  );
}

function AppCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 22, background: "#FFF", padding: 16, boxShadow: "0 8px 24px -16px rgba(15,47,42,.35)", ...style }}>{children}</div>;
}

function AppSection({ children }: { children: ReactNode }) {
  return <div style={{ margin: "18px 0 9px", fontFamily: JAKARTA, fontWeight: 800, fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: U.appInk }}>{children}</div>;
}

function Example() {
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, background: U.appTint, color: "#3F5E57", fontFamily: JAKARTA, fontWeight: 700, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>Exemple</span>;
}

function AppTabs({ active = "accueil" }: { active?: "accueil" | "scan" | "pharmacie" | "profil" }) {
  const tabs = [
    { id: "accueil", label: "Accueil", Icon: Home },
    { id: "scan", label: "Scanner", Icon: ScanLine },
    { id: "pharmacie", label: "Ma pharmacie", Icon: Store },
    { id: "profil", label: "Profil", Icon: User },
  ] as const;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", padding: "9px 12px 26px", background: "rgba(255,255,255,.94)", borderTop: `1px solid ${U.appLine}`, zIndex: 5 }}>
      {tabs.map(({ id, label, Icon }) => (
        <div key={id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: id === active ? U.green : U.appMute, fontFamily: JAKARTA, fontWeight: 600, fontSize: 11 }}>
          <Icon size={21} strokeWidth={2.1} />
          {label}
        </div>
      ))}
    </div>
  );
}

/** Une entrée échelonnée (montée + fondu). */
function stag(t: number, at: number | undefined, i: number, step = 0.07): CSSProperties {
  const e = at === undefined ? 1 : prog(t, at + i * step, 0.42, SNAP);
  return { opacity: clamp01(e * 1.5), transform: `translateY(${(1 - e) * 26}px)` };
}

// ---- Les écrans de l'appli -------------------------------------------------------------------------------------------

export function AppHome({ t, at }: { t: number; at?: number }) {
  const bar = at === undefined ? 0.71 : 0.71 * prog(t, at + 0.45, 0.9, SNAP);
  return (
    <Screen>
      <DnaTop t={t} />
      <div style={{ position: "absolute", inset: 0, padding: "56px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...stag(t, at, 0) }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 99, background: "#FFF", boxShadow: "0 1px 3px rgba(15,47,42,.12)", ...appText(13.5, 700) }}>
            <Users size={16} color={U.green} />
            Moi
            <ChevronDown size={16} color={U.appMute} />
          </span>
          <span style={{ position: "relative", display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 99, background: "#FFF", boxShadow: "0 1px 3px rgba(15,47,42,.12)" }}>
            <BellRing size={19} color={U.appInk} style={{ transform: `rotate(${12 * Math.sin(t * 9) * pulse((t % 2.4) / 2.4, 0.7, 0.04, 0.15, 0.1)}deg)` }} />
            <span style={{ position: "absolute", top: 8, right: 10, width: 8, height: 8, borderRadius: 99, background: PB.cyan }} />
          </span>
        </div>
        <div style={{ marginTop: 18, lineHeight: 1.08, ...appText(30, 800), ...stag(t, at, 1) }}>Bonjour !</div>
        <div style={{ marginTop: 4, ...appText(14.5, 500, U.appSoft), ...stag(t, at, 1) }}>Besoin d'une info sur un médicament ?</div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, ...stag(t, at, 2) }}>
          <div style={{ flex: 1, height: 48, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderRadius: 16, background: "#FFF", boxShadow: "0 1px 3px rgba(15,47,42,.1)", ...appText(14, 500, U.appMute) }}>
            <Search size={16} />
            Paracétamol, crème…
          </div>
          <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: U.grad, boxShadow: "0 6px 14px -6px rgba(14,138,123,.8)" }}>
            <ScanLine size={24} color="#FFF" />
          </div>
        </div>
        <div style={stag(t, at, 3)}>
          <AppSection>Ma pharmacie</AppSection>
          <AppCard style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "inline-flex", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 16, background: U.grad }}>
              <Store size={20} color="#FFF" />
            </span>
            <div style={{ flex: 1 }}>
              <div style={appText(15, 700)}>Pharmacie du Centre</div>
              <div style={appText(12.5, 600, U.green)}>● Ouverte jusqu'à 19 h 30</div>
            </div>
            <ChevronRight size={20} color={U.appMute} />
          </AppCard>
        </div>
        <div style={stag(t, at, 4)}>
          <AppSection>Ma cure</AppSection>
          <AppCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={appText(15, 700)}>Probiotique</span>
              <span style={{ padding: "4px 10px", borderRadius: 99, background: "#FFF4E5", ...appText(11.5, 700, "#B45309") }}>2 jours restants</span>
            </div>
            <div style={{ position: "relative", marginTop: 12, height: 8, borderRadius: 99, background: U.appTint, overflow: "hidden" }}>
              <div style={{ position: "relative", width: `${bar * 100}%`, height: "100%", borderRadius: 99, background: U.grad, overflow: "hidden" }}>
                <Sheen k={((t * 0.5) % 1.3) / 1} alpha={0.7} />
              </div>
            </div>
            <div style={{ marginTop: 8, ...appText(12.5, 500, U.appSoft) }}>Pensez à repasser à votre pharmacie pour la renouveler.</div>
          </AppCard>
        </div>
        <div style={stag(t, at, 5)}>
          <AppSection>Mes médicaments en cours</AppSection>
          <AppCard style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
            <span style={{ display: "inline-flex", width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 12, background: U.appTint }}>
              <Pill size={17} color={U.green} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={appText(14, 700)}>AMOXICILLINE 1 g</div>
              <div style={appText(12, 500, "#64748B")}>Matin et soir · 7 jours</div>
            </div>
            <ChevronRight size={17} color={U.appMute} />
          </AppCard>
        </div>
        <div style={stag(t, at, 6)}>
          <AppSection>De la part de votre pharmacie</AppSection>
          <AppCard style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: U.grad }}>
            <span style={{ ...appText(24, 800, "#FFF"), letterSpacing: "-0.04em" }}>−2 €</span>
            <span style={{ flex: 1, lineHeight: 1.25, ...appText(12.5, 600, "rgba(255,255,255,.9)") }}>Offre partenaire sur votre prochaine cure</span>
            <ChevronRight size={17} color="#FFF" />
          </AppCard>
        </div>
      </div>
      <AppTabs active="accueil" />
    </Screen>
  );
}

/** L'écran de bienvenue de l'appli (patient-app.tsx : Welcome) : le robot, PharmaBoost, « Votre pharmacie, dans la poche. ». */
export function AppWelcome({ t, at }: { t: number; at?: number }) {
  const r = at === undefined ? 1 : ressort(t, at, { damping: 10, stiffness: 220, mass: 0.6 });
  return (
    <Screen>
      <DnaTop t={t} h={420} opacity={0.6} />
      <div style={{ position: "absolute", inset: 0, padding: "92px 24px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ transform: `scale(${Math.max(0, r)}) translateY(${wobble(t, 3, 4, 1)}px)` }}>
          <LogoRobot t={t} size={120} winkAt={at === undefined ? undefined : at + 0.7} />
        </div>
        <div style={{ marginTop: 10, ...appText(16, 800), ...stag(t, at, 2) }}>
          Pharma<span style={{ color: U.green }}>Boost</span>
        </div>
        <div style={{ marginTop: 22, lineHeight: 1.08, ...appText(32, 800), ...stag(t, at, 3) }}>
          Votre pharmacie,
          <br />
          <span style={{ color: "transparent", backgroundImage: U.grad, WebkitBackgroundClip: "text", backgroundClip: "text" }}>dans la poche.</span>
        </div>
        <div style={{ marginTop: 12, lineHeight: 1.45, ...appText(15, 500, U.appSoft), ...stag(t, at, 4) }}>Scannez un médicament, retrouvez vos conseils et vos cures.</div>
      </div>
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 44, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, background: U.grad, color: "#FFF", boxShadow: "0 12px 24px -12px rgba(14,138,123,.8)", ...stag(t, at, 5) }}>
          <Mail size={24} />
          <span style={{ flex: 1, textAlign: "left" }}>
            <span style={{ display: "block", ...appText(16, 700, "#FFF") }}>Je viens de ma pharmacie</span>
            <span style={{ display: "block", ...appText(12.5, 500, "rgba(255,255,255,.82)") }}>J'ai reçu mon bilan par e-mail</span>
          </span>
          <ChevronRight size={20} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, background: "#FFF", boxShadow: "0 8px 24px -16px rgba(15,47,42,.35)", ...stag(t, at, 6) }}>
          <ScanLine size={24} color={U.green} />
          <span style={{ flex: 1, textAlign: "left" }}>
            <span style={{ display: "block", ...appText(16, 700) }}>Découvrir l'appli</span>
            <span style={{ display: "block", ...appText(12.5, 500, U.appSoft) }}>Scanner un produit, trouver une pharmacie</span>
          </span>
          <ChevronRight size={20} color={U.appMute} />
        </div>
      </div>
    </Screen>
  );
}

/** Le verrouillage du viseur, après `at`. */
export const APP_SCAN_LOCK = 0.9;

export function AppScan({ t, at = 0, box = "Amoxicilline 1 g", kind = "Antibiotique · sur ordonnance" }: { t: number; at?: number; box?: string; kind?: string }) {
  const lockAt = at + APP_SCAN_LOCK;
  const lock = prog(t, lockAt, 0.22, SNAP);
  const flash = pulse(t, lockAt, 0.03, 0.02, 0.25);
  const sheet = ressort(t, lockAt + 0.2, { damping: 14, stiffness: 190, mass: 0.7 });
  const laserY = 12 + 72 * (0.5 - 0.5 * Math.cos(((t - at) * 2 * Math.PI) / 1.3));
  const shake = 1 - lock;
  const ok = ressort(t, lockAt + 0.05, { damping: 9, stiffness: 300, mass: 0.5 });
  const corner = lerp(0, 16, lock);
  const cc = lock > 0.5 ? PB.citron : "#5EEAD4";
  const corners: CSSProperties[] = [
    { top: corner, left: corner, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 28 },
    { top: corner, right: corner, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 28 },
    { bottom: corner, left: corner, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 28 },
    { bottom: corner, right: corner, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 28 },
  ];
  return (
    <Screen bg="#0B1513">
      <div style={{ position: "absolute", left: 0, right: 0, top: 130, textAlign: "center", ...appText(15.5, 600, "#FFF") }}>Placez le code-barres dans le cadre</div>
      <div style={{ position: "absolute", left: "50%", top: 196, width: 290, height: 226, marginLeft: -145, borderRadius: 28, border: "2px solid rgba(255,255,255,.28)", boxSizing: "border-box", background: "radial-gradient(circle at 50% 45%, #22302D, #0E1816 75%)" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) translate(${shake * wobble(t, 3, 7, 2.2)}px, ${shake * wobble(t, 5, 5, 2.6)}px) rotate(${-6 + shake * wobble(t, 7, 3, 1.8)}deg)` }}>
          <MiniBox name={box} w={132} />
        </div>
        {lock < 1 && <div style={{ position: "absolute", left: 22, right: 22, top: `${laserY}%`, height: 3, borderRadius: 99, background: "#5EEAD4", boxShadow: "0 0 18px #5EEAD4", opacity: 1 - lock }} />}
        {corners.map((c, i) => (
          <span key={i} style={{ position: "absolute", width: 40, height: 40, borderColor: cc, borderStyle: "solid", borderWidth: 0, boxShadow: lock > 0.5 ? `0 0 14px ${rgba(PB.citron, 0.6)}` : undefined, ...c }} />
        ))}
        {flash > 0 && <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: `rgba(255,255,255,${0.55 * flash})` }} />}
        {ok > 0.01 && (
          <span style={{ position: "absolute", right: -14, top: -14, display: "inline-flex", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 99, background: PB.citron, transform: `scale(${ok})`, boxShadow: `0 0 20px ${rgba(PB.citron, 0.7)}` }}>
            <Check size={26} color={PB.green} strokeWidth={3.4} />
          </span>
        )}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 446, textAlign: "center", ...appText(13.5, 600, lock > 0.5 ? PB.citron : "rgba(255,255,255,.6)") }}>{lock > 0.5 ? "Boîte reconnue" : "Lecture du code…"}</div>
      {/* La fiche qui monte. */}
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 30, borderRadius: 26, background: "#FFF", padding: 16, transform: `translateY(${(1 - sheet) * 300}px)`, boxShadow: "0 -10px 40px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: U.appTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MiniBox name={box} w={44} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={appText(17, 800)}>{box}</div>
            <div style={appText(12.5, 500, U.appSoft)}>{kind}</div>
          </div>
        </div>
        <div style={{ marginTop: 14, height: 46, borderRadius: 99, background: U.grad, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...appText(14.5, 700, "#FFF") }}>
          Voir la fiche
          <ChevronRight size={18} />
        </div>
      </div>
    </Screen>
  );
}

function Ring({ frac, size = 64, stroke = 7, id }: { frac: number; size?: number; stroke?: number; id: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0E8A7B" />
          <stop offset="1" stopColor="#0796B4" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={U.appTint} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamp01(frac))} />
    </svg>
  );
}

export function AppCures({ t, at = 0 }: { t: number; at?: number }) {
  const uid = `ac${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const cures = [
    { name: "Probiotique", day: 5, of: 7, left: "2 jours restants" },
    { name: "Vitamine D", day: 18, of: 30, left: "12 jours restants" },
    { name: "Magnésium", day: 9, of: 30, left: "21 jours restants" },
  ];
  const toggle = prog(t, at + 1.2, 0.25, SNAP);
  return (
    <Screen>
      <DnaTop t={t} />
      <div style={{ position: "absolute", inset: 0, padding: "60px 20px 0" }}>
        <div style={{ lineHeight: 1.08, ...appText(30, 800), ...stag(t, at, 0) }}>Mes cures</div>
        <div style={{ marginTop: 4, ...appText(14.5, 500, U.appSoft), ...stag(t, at, 0) }}>Votre pharmacie vous prévient avant la fin.</div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {cures.map((c, i) => {
            const f = (c.day / c.of) * prog(t, at + 0.2 + i * 0.18, 0.95, SNAP);
            return (
              <AppCard key={c.name} style={{ display: "flex", alignItems: "center", gap: 14, ...stag(t, at, i + 1, 0.1) }}>
                <div style={{ position: "relative", width: 64, height: 64 }}>
                  <Ring frac={f} id={`${uid}${i}`} />
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...appText(13, 800) }}>
                    {Math.round(f * c.of)}/{c.of}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={appText(16, 800)}>{c.name}</div>
                  <div style={{ marginTop: 2, ...appText(12.5, 500, "#64748B") }}>
                    Jour {c.day} sur {c.of}
                  </div>
                </div>
                <span style={{ padding: "4px 9px", borderRadius: 99, background: i === 0 ? "#FFF4E5" : U.appTint, ...appText(11, 700, i === 0 ? "#B45309" : "#3F5E57") }}>{c.left}</span>
              </AppCard>
            );
          })}
        </div>
        <AppCard style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, ...stag(t, at, 4, 0.1) }}>
          <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 14, background: U.grad }}>
            <BellRing size={19} color="#FFF" style={{ transform: `rotate(${14 * Math.sin(t * 10) * pulse(t, at + 1.3, 0.05, 0.3, 0.2)}deg)` }} />
          </span>
          <span style={{ flex: 1, ...appText(13.5, 700) }}>Rappel avant la fin de la cure</span>
          <span style={{ position: "relative", width: 46, height: 28, borderRadius: 99, background: toggle > 0.5 ? U.green : "#D5E3DF" }}>
            <span style={{ position: "absolute", top: 3, left: 3 + 18 * toggle, width: 22, height: 22, borderRadius: 99, background: "#FFF", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
          </span>
        </AppCard>
      </div>
      <AppTabs active="accueil" />
    </Screen>
  );
}

export function OfferCard({ t, at, width = 323, notch = U.appBg, x, y, scale = 1, rot = 0, style }: Place & { t: number; at?: number; width?: number; notch?: string }) {
  const r = at === undefined ? 1 : ressort(t, at, { damping: 9, stiffness: 230, mass: 0.6 });
  if (at !== undefined && t < at) return null;
  const since = at === undefined ? 10 + t : t - at;
  const sh = ((since - 0.25) % 2.2) / 0.7;
  return (
    <Placed x={x} y={y} scale={scale * lerp(0.3, 1, r)} rot={rot + (1 - clamp01(r)) * -16 + wobble(t, 4, 0.8, 0.9)} style={{ opacity: clamp01(r * 3), ...style }}>
      <div style={{ position: "relative", width, boxSizing: "border-box", borderRadius: 26, padding: "18px 20px 16px", background: U.grad, color: "#FFF", overflow: "hidden", boxShadow: "0 24px 50px -20px rgba(7,150,180,.6)" }}>
        <Sheen k={sh} alpha={0.35} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ padding: "4px 10px", borderRadius: 99, background: "rgba(255,255,255,.2)", fontFamily: JAKARTA, fontWeight: 800, fontSize: 11.5, letterSpacing: "0.1em" }}>OFFRE PARTENAIRE</span>
          <span style={{ padding: "3px 8px", borderRadius: 99, background: "rgba(255,255,255,.2)", fontFamily: JAKARTA, fontWeight: 700, fontSize: 10, letterSpacing: "0.06em" }}>EXEMPLE</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: JAKARTA, fontWeight: 800, fontSize: 66, lineHeight: 1, letterSpacing: "-0.045em" }}>−2 €</div>
        <div style={{ marginTop: 4, fontFamily: JAKARTA, fontWeight: 700, fontSize: 19 }}>sur votre prochaine cure</div>
        <div style={{ position: "relative", margin: "16px -20px 12px", borderTop: "2px dashed rgba(255,255,255,.45)" }}>
          <span style={{ position: "absolute", left: -12, top: -13, width: 24, height: 24, borderRadius: 99, background: notch }} />
          <span style={{ position: "absolute", right: -12, top: -13, width: 24, height: 24, borderRadius: 99, background: notch }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontFamily: JAKARTA, fontWeight: 600, fontSize: 12.5, color: "rgba(255,255,255,.88)" }}>À utiliser dans votre pharmacie</span>
          <span style={{ padding: "8px 14px", borderRadius: 99, background: "#FFF", color: U.green, fontFamily: JAKARTA, fontWeight: 800, fontSize: 13 }}>Ajouter</span>
        </div>
      </div>
      {at !== undefined && (
        <>
          <Sparkle t={t} at={at + 0.08} x={-6} y={10} size={44} color={PB.citron} />
          <Sparkle t={t} at={at + 0.16} x={width + 4} y={60} size={34} color="#FFFFFF" />
          <Sparkle t={t} at={at + 0.24} x={width - 40} y={-10} size={28} color={PB.citron} />
        </>
      )}
    </Placed>
  );
}

export function AppOffer({ t, at = 0 }: { t: number; at?: number }) {
  return (
    <Screen>
      <DnaTop t={t} />
      <div style={{ position: "absolute", inset: 0, padding: "60px 20px 0" }}>
        <div style={{ lineHeight: 1.08, ...appText(30, 800), ...stag(t, at - 0.4, 0) }}>Mes offres</div>
        <div style={{ marginTop: 4, ...appText(14.5, 500, U.appSoft), ...stag(t, at - 0.4, 0) }}>De la part de votre pharmacie</div>
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <OfferCard t={t} at={at} />
        </div>
        <AppCard style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, ...stag(t, at + 0.3, 0) }}>
          <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 14, background: U.appTint }}>
            <Store size={19} color={U.green} />
          </span>
          <span style={{ flex: 1, ...appText(13, 600, U.appSoft) }}>À présenter au comptoir de votre pharmacie, avec votre bilan.</span>
        </AppCard>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", ...stag(t, at + 0.4, 0) }}>
          <Example />
        </div>
      </div>
      <AppTabs active="accueil" />
    </Screen>
  );
}

// ---- L'e-mail du bilan, la notification, le calendrier ----------------------------------------------------------------

export function MailBilan({ t, at = 0, pharmacy = "Pharmacie du Centre", product = "Probiotique" }: { t: number; at?: number; pharmacy?: string; product?: string }) {
  const DARK = "#0B3B47";
  const points = [
    { Icon: Clock, title: "Pendant", text: "toute la durée de l'antibiotique" },
    { Icon: Pill, title: "À distance", text: "de la prise de l'antibiotique" },
    { Icon: CalendarCheck, title: "Chaque jour", text: "jusqu'à la fin de la cure" },
  ];
  return (
    <Screen bg="#EEF3F1">
      <div style={{ position: "absolute", inset: 0, padding: "56px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, ...appText(15, 600, U.green), ...stag(t, at, 0) }}>
          <ChevronLeft size={20} />
          Boîte de réception
          <span style={{ marginLeft: "auto" }}>
            <Example />
          </span>
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "0 4px", ...stag(t, at, 1) }}>
          <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 99, background: U.grad, ...appText(13, 800, "#FFF") }}>PC</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={appText(15, 700)}>{pharmacy}</div>
            <div style={appText(12, 500, "#64748B")}>à moi · maintenant</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "0 4px", lineHeight: 1.1, ...appText(25, 800, DARK), ...stag(t, at, 2) }}>Votre bilan conseil</div>
        <div style={{ marginTop: 4, padding: "0 4px", ...appText(13, 500, "#475467"), ...stag(t, at, 2) }}>Bonjour, voici le conseil de votre pharmacien.</div>
        <div style={{ marginTop: 12, borderRadius: 18, background: "#FFF", border: "1px solid #E4ECE9", padding: 14, ...stag(t, at, 3, 0.1) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: "#F4F8F7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MiniBox name={product} w={46} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={appText(18, 800, "#101828")}>{product}</div>
              <span style={{ display: "inline-block", marginTop: 4, padding: "3px 10px", borderRadius: 99, background: "#E3F4EC", ...appText(11.5, 600, "#0B6B4F") }}>Conseillé aujourd'hui</span>
            </div>
          </div>
          <div style={{ marginTop: 12, borderRadius: 10, background: "#EAF5EF", borderLeft: "4px solid #1D8174", padding: "10px 12px", ...stag(t, at, 5, 0.1) }}>
            <div style={{ ...appText(10.5, 800, "#0B6B4F"), letterSpacing: "0.05em", textTransform: "uppercase" }}>Pourquoi avec votre traitement</div>
            <div style={{ marginTop: 4, lineHeight: 1.35, ...appText(13.5, 600, "#101828") }}>Avec un antibiotique, la flore intestinale peut être perturbée.</div>
          </div>
          <div style={{ marginTop: 10, ...appText(10.5, 800, DARK), letterSpacing: "0.05em", textTransform: "uppercase", ...stag(t, at, 6, 0.1) }}>3 points clés</div>
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            {points.map(({ Icon, title, text }, i) => {
              const p = at === undefined ? 1 : ressort(t, at + 0.75 + 0.1 * i, { damping: 11, stiffness: 260, mass: 0.5 });
              return (
                <div key={title} style={{ flex: 1, borderRadius: 12, background: "#F5F9F7", padding: "10px 6px", textAlign: "center", opacity: clamp01(p * 3), transform: `scale(${lerp(0.6, 1, p)})` }}>
                  <span style={{ display: "inline-flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 99, background: "#E3F4EC", transform: `translateY(${wobble(t, i + 2, 1.5, 1.6)}px)` }}>
                    <Icon size={16} color="#1D8174" strokeWidth={2.4} />
                  </span>
                  <div style={{ marginTop: 5, ...appText(12, 800, DARK) }}>{title}</div>
                  <div style={{ marginTop: 2, lineHeight: 1.25, ...appText(10.5, 500, "#475467") }}>{text}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 10, borderRadius: 16, background: "#E9F4EF", padding: "12px 14px", ...stag(t, at, 10, 0.1) }}>
          <div style={appText(14, 800, DARK)}>Les bons gestes à retenir</div>
          {["Suivez les conseils de votre pharmacien.", "Une question ? Votre pharmacie reste à votre écoute."].map((line) => (
            <div key={line} style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.3, ...appText(12, 500, "#344054") }}>
              <Check size={15} color="#1D8174" strokeWidth={3} style={{ flexShrink: 0, marginTop: 1 }} />
              {line}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, borderRadius: 16, background: "#FFF", border: "1px solid #E4ECE9", padding: "10px 12px", ...stag(t, at, 11, 0.1) }}>
          <Store size={20} color={U.green} />
          <span style={{ flex: 1, ...appText(13, 700) }}>{pharmacy}</span>
          <span style={{ padding: "7px 12px", borderRadius: 10, background: U.green, ...appText(12, 700, "#FFF") }}>Appeler</span>
        </div>
      </div>
    </Screen>
  );
}

const NOTIF_ICONS = {
  mail: { bg: "linear-gradient(180deg, #4C9BF5, #2167D8)", node: <Mail size={21} color="#FFF" strokeWidth={2.2} /> },
  bell: { bg: "linear-gradient(180deg, #F7A54B, #E07A12)", node: <BellRing size={20} color="#FFF" strokeWidth={2.2} /> },
  calendar: { bg: "#FFFFFF", node: <CalendarCheck size={21} color={U.green} strokeWidth={2.2} /> },
} as const;

export function Notification({
  t,
  at,
  title,
  body,
  icon = "mail",
  app,
  when = "maintenant",
  until,
  width = 335,
  x,
  y,
  scale = 1,
  rot,
  style,
}: Place & { t: number; at: number; title: string; body: string; icon?: "mail" | "bell" | "calendar" | "robot"; app?: string; when?: string; until?: number; width?: number }) {
  if (t < at) return null;
  const r = ressort(t, at, { damping: 13, stiffness: 210, mass: 0.7 });
  const out = until === undefined ? 0 : prog(t, until, 0.32, EXIT);
  if (out >= 1) return null;
  const appName = app ?? (icon === "mail" ? "Mail" : icon === "robot" ? "PharmaBoost" : icon === "calendar" ? "Calendrier" : "Rappel");
  const tile =
    icon === "robot" ? (
      <span style={{ display: "inline-flex", width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, background: PB.green }}>
        <LogoRobot t={t} size={34} />
      </span>
    ) : (
      <span style={{ display: "inline-flex", width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, background: NOTIF_ICONS[icon].bg, boxShadow: icon === "calendar" ? "inset 0 0 0 1px #DDE5E2" : undefined }}>{NOTIF_ICONS[icon].node}</span>
    );
  const card = (
    <div style={{ width, boxSizing: "border-box", display: "flex", gap: 11, padding: "12px 14px", borderRadius: 24, background: "rgba(246,248,247,.92)", backdropFilter: "blur(18px) saturate(1.6)", boxShadow: "0 18px 40px -14px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.6)" }}>
      {tile}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", ...appText(11.5, 600, "#6B7280"), textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <span>{appName}</span>
          <span style={{ textTransform: "none", letterSpacing: 0 }}>{when}</span>
        </div>
        <div style={{ marginTop: 2, ...appText(15, 700, "#111827") }}>{title}</div>
        <div style={{ marginTop: 1, lineHeight: 1.3, ...appText(13.5, 500, "#374151") }}>{body}</div>
      </div>
    </div>
  );
  const drop = `translateY(${(1 - r) * -150 - out * 160}px) scale(${lerp(0.9, 1, clamp01(r))})`;
  if (x === undefined || y === undefined) {
    return <div style={{ position: "absolute", left: (PHONE_SIZE.W - 2 * PHONE_SIZE.bezel - width) / 2, top: 50, zIndex: 15, opacity: clamp01(r * 3) * (1 - out), transform: drop, ...style }}>{card}</div>;
  }
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={{ opacity: clamp01(r * 3) * (1 - out), ...style }}>
      <div style={{ transform: drop }}>{card}</div>
    </Placed>
  );
}

/** Les temps de la cure : la case i se coche à ticks[i] ; la fin de cure s'allume à `end`. */
export function cureTicks(at: number, days = 7, step = 0.11): { ticks: number[]; end: number } {
  const ticks = Array.from({ length: Math.max(0, days - 2) }, (_, i) => at + 0.25 + i * step);
  return { ticks, end: at + 0.25 + Math.max(0, days - 2) * step + 0.15 };
}

export function CalendarCure({ t, at = 0, days = 7, step = 0.11, product = "Probiotique", start = 20, x, y, scale, rot, style }: Place & { t: number; at?: number; days?: number; step?: number; product?: string; start?: number }) {
  const { ticks, end } = cureTicks(at, days, step);
  const e = prog(t, at, 0.4, SNAP);
  const endK = ressort(t, end, { damping: 9, stiffness: 260, mass: 0.5 });
  const ring = t >= end ? ((t - end) % 1) : -1;
  const cells = 14;
  return (
    <Placed x={x} y={y} scale={scale} rot={rot} style={style}>
      <div style={{ width: 360, boxSizing: "border-box", padding: 20, borderRadius: 28, background: "#FFF", boxShadow: "0 30px 60px -30px rgba(0,0,0,.5)", opacity: clamp01(e * 1.6), transform: `translateY(${(1 - e) * 30}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, background: U.grad }}>
            <CalendarCheck size={22} color="#FFF" />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ ...appText(11.5, 800, U.green), letterSpacing: "0.08em", textTransform: "uppercase" }}>Ma cure</div>
            <div style={appText(19, 800)}>{product}</div>
          </div>
          <span style={{ padding: "5px 11px", borderRadius: 99, background: U.appTint, ...appText(12.5, 700, "#3F5E57") }}>{days} jours</span>
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", ...appText(12, 700, U.appMute) }}>{d}</div>
          ))}
          {Array.from({ length: cells }, (_, i) => {
            const n = ((start - 1 + i) % 31) + 1;
            const inCure = i < days;
            const tk = i < ticks.length ? ressort(t, ticks[i], { damping: 10, stiffness: 320, mass: 0.45 }) : 0;
            const isEnd = i === days - 1;
            const soon = i >= ticks.length && inCure;
            return (
              <div key={i} style={{ position: "relative", height: 42, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 13, background: inCure ? (soon ? rgba(PB.citron, 0.55 * clamp01(endK)) : U.appTint) : "transparent", ...appText(14, 700, inCure ? U.appInk : "#B7C3C0") }}>
                <span style={{ opacity: 1 - clamp01(tk) }}>{n}</span>
                {tk > 0.01 && (
                  <span style={{ position: "absolute", inset: 3, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 11, background: U.grad, transform: `scale(${tk})` }}>
                    <Check size={20} color="#FFF" strokeWidth={3.2} />
                  </span>
                )}
                {isEnd && endK > 0.01 && (
                  <>
                    {ring >= 0 && <span style={{ position: "absolute", inset: 0, borderRadius: 13, border: `2px solid ${PB.green}`, transform: `scale(${1 + 0.5 * ring})`, opacity: 1 - ring }} />}
                    <span style={{ position: "absolute", right: -8, top: -10, display: "inline-flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 99, background: PB.green, transform: `scale(${endK}) rotate(${14 * Math.sin(t * 12) * pulse(t, end, 0.05, 0.4, 0.2)}deg)` }}>
                      <BellRing size={14} color={PB.citron} strokeWidth={2.6} />
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, height: 22, display: "flex", alignItems: "center", gap: 8, opacity: clamp01(endK), ...appText(13.5, 700, PB.green) }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: PB.green }} />
          Votre cure se termine bientôt
        </div>
      </div>
    </Placed>
  );
}

// ---- BIENTÔT ----------------------------------------------------------------------------------------------------------

export function SoonBadge({ t, at, text = "BIENTÔT", x, y, scale = 1, rot = -4, style }: Place & { t: number; at?: number; text?: string }) {
  const r = at === undefined ? 1 : ressort(t, at, { damping: 9, stiffness: 260, mass: 0.55 });
  if (at !== undefined && t < at) return null;
  const since = at === undefined ? 10 + t : t - at;
  const breathe = 1 + 0.025 * Math.sin(t * 2 * Math.PI / 1.2);
  const sh = ((since - 0.2) % 1.8) / 0.6;
  const dot = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 0.9);
  return (
    <Placed x={x} y={y} scale={scale * Math.max(0, r) * breathe} rot={rot + (1 - clamp01(r)) * 18} style={style}>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 14, height: 66, padding: "0 30px 0 24px", borderRadius: 99, overflow: "hidden", background: PB.citron, boxShadow: `inset 0 0 0 3px ${PB.green}, 0 0 ${30 + 16 * dot}px ${rgba(PB.citron, 0.55)}, 0 14px 30px -14px rgba(0,0,0,.5)` }}>
        <span style={{ width: 14, height: 14, borderRadius: 99, background: PB.green, boxShadow: `0 0 0 ${5 * dot}px ${rgba(PB.green, 0.25)}` }} />
        <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 31, letterSpacing: "0.16em", color: PB.green }}>{text}</span>
        <Sheen k={sh} alpha={0.75} />
      </div>
    </Placed>
  );
}

// ---- Le titre de chapitre ----------------------------------------------------------------------------------------------

/** « POUR *L'ÉQUIPE* » → mots, avec l'accent sur ceux entre astérisques. */
function accentWords(text: string) {
  let on = false;
  return text.split(/\s+/).filter(Boolean).map((raw) => {
    let w = "";
    let accent = false;
    for (const ch of raw) {
      if (ch === "*") {
        on = !on;
        continue;
      }
      w += ch;
      if (on) accent = true;
    }
    return { w, accent };
  });
}

export function ChapterTitle({ t, at, n, text, exitAt, bg = true, tag = true }: { t: number; at: number; n: string; text: string; exitAt?: number; bg?: boolean; tag?: boolean }) {
  if (t < at - 0.05) return null;
  const words = accentWords(text);
  const plain = words.map((w) => w.w).join(" ");
  const kIn = prog(t, at - 0.05, 0.34, WHIP);
  const kOut = exitAt === undefined ? 0 : prog(t, exitAt, 0.42, WHIP);
  const fly = exitAt === undefined ? 0 : prog(t, exitAt - 0.02, 0.36, SNAP);
  const push = 1 + 0.035 * prog(t, at, 1.6, LINEAR);
  const L = lerp(2400, -320, kIn);
  const R = lerp(2400, -340, kOut); // le bord droit du panneau (bas) : il file vers la gauche à la sortie
  const showPanel = bg && kOut < 1;
  // Le titre rétrécit vers le coin (110, 72).
  const size = 150;
  const estW = plain.length * size * 0.66;
  const cx = lerp(960, 110 + estW * 0.19 * 0.5 + 64, fly);
  const cy = lerp(560, 74, fly);
  const s = lerp(push, 0.19, fly);
  const tagK = exitAt === undefined || !tag ? 0 : prog(t, exitAt + 0.26, 0.3, SNAP);
  const ghost = 0.12 * (1 - kOut);
  const ul = prog(t, at + 0.4, 0.45, SNAP) * (1 - fly);
  const pill = ressort(t, at + 0.12, { damping: 10, stiffness: 260, mass: 0.5 });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {showPanel && (
        <>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(70% 80% at 50% 50%, ${PB.green2} 0%, ${PB.green} 70%)`, clipPath: `polygon(${L}px 0, ${R + 260}px 0, ${R}px 1080px, ${L - 260}px 1080px)` }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) translateX(${wobble(t, 3, 30, 0.4)}px) scale(${push})`, fontFamily: MONO, fontWeight: 700, fontSize: 620, lineHeight: 1, color: "transparent", WebkitTextStroke: `3px ${rgba(PB.citron, ghost * 2)}`, whiteSpace: "nowrap", letterSpacing: "-0.04em" }}>{n}</div>
          </div>
          {/* La bande citron qui mène le balayage (entrée) puis le referme (sortie). */}
          {kIn < 1 && <div style={{ position: "absolute", inset: 0, background: PB.citron, clipPath: `polygon(${L - 70}px 0, ${L}px 0, ${L - 260}px 1080px, ${L - 330}px 1080px)` }} />}
          {kOut > 0 && <div style={{ position: "absolute", inset: 0, background: PB.citron, clipPath: `polygon(${R + 260}px 0, ${R + 330}px 0, ${R + 70}px 1080px, ${R}px 1080px)` }} />}
        </>
      )}
      {fly < 1 && (
        <div style={{ position: "absolute", left: cx, top: cy, transform: `translate(-50%, -50%) scale(${s})`, display: "flex", flexDirection: "column", alignItems: "center", opacity: 1 - clamp01((fly - 0.75) / 0.25) }}>
          <div style={{ display: "inline-flex", alignItems: "center", height: 70, padding: "0 28px", borderRadius: 99, background: PB.citron, fontFamily: MONO, fontWeight: 700, fontSize: 40, color: PB.green, transform: `scale(${Math.max(0, pill)}) rotate(${(1 - clamp01(pill)) * -12}deg)` }}>{n}</div>
          <div style={{ marginTop: 34, display: "flex", gap: size * 0.26, fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.04em", lineHeight: 1, whiteSpace: "nowrap" }}>
            {words.map((w, i) => {
              const k = prog(t, at + 0.16 + i * 0.08, 0.42, SNAP);
              return (
                <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.02em 0.1em" }}>
                  <span style={{ display: "inline-block", transform: `translateY(${(1 - k) * 115}%) rotate(${(1 - k) * 6}deg)`, color: w.accent ? PB.citron : "#FFFFFF", textShadow: w.accent ? `0 0 40px ${rgba(PB.citron, 0.35)}` : undefined }}>{w.w}</span>
                </span>
              );
            })}
          </div>
          <div style={{ marginTop: 22, width: 560, height: 10, borderRadius: 99, background: PB.citron, transform: `scaleX(${ul})` }} />
        </div>
      )}
      {tagK > 0 && (
        <div style={{ position: "absolute", left: 110, top: 46, display: "inline-flex", alignItems: "center", gap: 14, height: 56, padding: "0 22px 0 8px", borderRadius: 99, background: "rgba(15,47,42,.82)", boxShadow: `inset 0 0 0 2px ${rgba(PB.citron, 0.3)}, 0 12px 30px -14px rgba(0,0,0,.6)`, opacity: tagK, transform: `translateX(${(1 - tagK) * -40}px)` }}>
          <span style={{ display: "inline-flex", alignItems: "center", height: 40, padding: "0 14px", borderRadius: 99, background: PB.citron, fontFamily: MONO, fontWeight: 700, fontSize: 21, color: PB.green }}>{n}</span>
          <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 24, letterSpacing: "0.06em", color: "#FFF", whiteSpace: "nowrap" }}>
            {words.map((w, i) => (
              <span key={i} style={{ color: w.accent ? PB.citron : "#FFF" }}>
                {i > 0 ? " " : ""}
                {w.w}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

// ---- Le curseur -------------------------------------------------------------------------------------------------------

export function Cursor({ t, x, y, clickAt, opacity = 1, size = 1 }: { t: number; x: number; y: number; clickAt?: number | number[]; opacity?: number; size?: number }) {
  const clicks = clickAt === undefined ? [] : Array.isArray(clickAt) ? clickAt : [clickAt];
  const press = 1 - 0.16 * Math.max(0, ...clicks.map((c) => pulse(t, c - 2 * F, 2 * F, 2 * F, 6 * F)));
  return (
    <>
      {clicks.map((c, i) => {
        const p = prog(t, c, 0.45, SNAP);
        if (t < c || p >= 1) return null;
        const r = (14 + 80 * p) * size;
        return (
          <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `${5 * (1 - p) * size}px solid ${PB.citron}`, background: rgba(PB.citron, 0.25 * (1 - p)), opacity: (1 - p) * opacity, pointerEvents: "none" }} />
        );
      })}
      <svg width={64 * size} height={64 * size} viewBox="0 0 32 32" style={{ position: "absolute", left: x - 12 * size, top: y - 8 * size, overflow: "visible", opacity, transform: `scale(${press})`, transformOrigin: `${12 * size}px ${8 * size}px`, filter: "drop-shadow(0 8px 12px rgba(0,0,0,.45))", pointerEvents: "none" }}>
        <path d="M 6 4 L 6 26 Q 6 28.2 7.7 26.8 L 12.4 22.6 L 16.4 30.6 Q 17.2 31.9 18.6 31.2 L 21.1 30 Q 22.4 29.2 21.7 27.9 L 17.8 20.3 L 24.4 19.9 Q 26.6 19.7 25 18.2 Z" fill="#FFFFFF" stroke={PB.green} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </>
  );
}
