import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { noise2D } from "@remotion/noise";
import { ArrowRight, Bell, CheckCircle2, CircleUserRound, Compass, GraduationCap, House, ShieldCheck, Trophy, X } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { C, FONT, MONO } from "../theme";
import { Cursor, Wordmark } from "../ui/product";
import { rgba } from "../ui/stage";
import { HEAVY, MINT } from "../reel/stage";
import { Mascot } from "./mascot";
import { AppIsland, ISLAND_X, ISLAND_Y, PosteIsland, appTargets, posteGeometry, posteTargets } from "./island";
import { clamp01, halo, IN_OUT, lerp, ramp, SITE_EASE } from "./anim";
import { CHALLENGE_TARGET, CHALLENGE_TITLE, CHALLENGE_UNITS, JOINED_TOAST, LGO_LINE, PIXEL_LOOK, TEAM_ROBOTS } from "./data";
import type { Plan, Tracks } from "./plan";

/* ==========================================================================
 * LES PLANS DU FILM « PRÉSENTATION ».
 *
 *  - le poste (A à D, puis H) : le bureau de l'ordinateur du comptoir, la
 *    fenêtre générique du logiciel de gestion, l'île en haut au centre ; une
 *    caméra virtuelle (×1,95 à ×2,6) cadre la bande haute de l'écran ;
 *  - le logiciel (E, F) : PharmaBoost côté titulaire, page floutée, l'île au
 *    même endroit du cadre ;
 *  - l'équipe (G) : plan large, un robot par comptoir, « Mon équipe », le
 *    téléphone ;
 *  - la fin (I) : le robot, le nom, « Scan. Conseil. Bilan. », l'adresse.
 * ======================================================================== */

const K = BANNER.colors;
export const W = 1920;
export const H = 1080;

// ---- La caméra -------------------------------------------------------------------------------------------------

type Key = { t: number; v: number; d: number };

/** Une valeur qui glisse d'une cible à l'autre (chaque cible a sa durée), en partant de la valeur du moment. */
function glide(t: number, keys: Key[]): number {
  let from = keys[0].v;
  let to = keys[0].v;
  let start = keys[0].t;
  let dur = keys[0].d;
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i].t) break;
    const k = keys[i];
    from = from + (to - from) * IN_OUT(clamp01((k.t - start) / dur));
    to = k.v;
    start = k.t;
    dur = k.d;
  }
  return from + (to - from) * IN_OUT(clamp01((t - start) / dur));
}

/** Le haut de l'île reste à 56 px du haut de l'image, quel que soit le zoom. */
const ISLAND_SCREEN_TOP = 56;

export function camera(t: number, P: Plan) {
  const S = glide(t, [
    { t: -1, v: 2.5, d: 0.1 },
    { t: P.tl.lines[0].start, v: 2.6, d: 3.1 },
    { t: P.hoverIn - 0.1, v: 2.4, d: 0.6 },
    { t: P.collapse, v: 2.5, d: 0.6 },
    { t: P.scan - 0.1, v: 2.25, d: 0.8 },
    { t: P.alert - 0.05, v: 1.95, d: 0.8 },
    { t: P.advice - 0.05, v: 2.1, d: 0.7 },
    { t: P.addEmail, v: 2.3, d: 0.7 },
    { t: P.backToAdvice - 0.05, v: 2.1, d: 0.6 },
    { t: P.done, v: 2.45, d: 1.1 },
    { t: P.jump + 0.2, v: 2.05, d: 0.7 },
    { t: P.chatTab, v: 2.1, d: 0.7 },
    { t: P.posteBack - 0.3, v: 2.5, d: 0.01 },
    { t: P.posteBack - 0.25, v: 2.62, d: 3.6 },
  ]);
  const cx = ISLAND_X + 3 * Math.sin(t / 2.7);
  const top = ISLAND_Y - ISLAND_SCREEN_TOP / S;
  return { S, cx, top, toScreen: (x: number, y: number) => ({ x: W / 2 + (x - cx) * S, y: (y - top) * S }) };
}

function World({ t, P, children }: { t: number; P: Plan; children: ReactNode }) {
  const cam = camera(t, P);
  return <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "0 0", transform: `translate(${W / 2}px, 0px) scale(${cam.S}) translate(${-cam.cx}px, ${-cam.top}px)` }}>{children}</div>;
}

/** Un voile sombre en bas de l'image : les sous-titres blancs restent lisibles sur les fenêtres claires. */
export function Scrim({ opacity = 1 }: { opacity?: number }) {
  return <AbsoluteFill style={{ opacity, background: "linear-gradient(180deg, transparent 0%, transparent 70%, rgba(4,10,18,.42) 84%, rgba(4,10,18,.66) 100%)" }} />;
}

// ---- Le poste ---------------------------------------------------------------------------------------------------

/** Le logiciel de gestion de l'officine, derrière l'île : une fenêtre générique, sans marque (LgoBackdrop du site). */
function LgoWindow({ t, P }: { t: number; P: Plan }) {
  const scanned = t >= P.scan - 0.05;
  const inscribe = ramp(t, P.scan - 0.05, 0.25, SITE_EASE);
  const select = scanned ? 1 - ramp(t, P.scan + 1.6, 1.2) : 0;
  const row = (content: ReactNode, active = false, k = 0) => (
    <div key={k} style={{ display: "flex", height: 36, alignItems: "center", borderRadius: 6, background: "#fff", padding: "0 12px", fontSize: 12, color: "#4A5A68", boxShadow: active ? `inset 0 0 0 ${1.5 * select}px rgba(30,111,138,${0.9 * select})` : undefined }}>
      {content}
    </div>
  );
  return (
    <div style={{ position: "absolute", left: ISLAND_X - 390, top: 170, width: 780, borderRadius: 12, overflow: "hidden", background: "rgba(233,237,241,.97)", boxShadow: "0 25px 50px -12px rgba(0,0,0,.6)", fontFamily: FONT }}>
      <div style={{ display: "flex", height: 32, alignItems: "center", gap: 6, background: "#C9D3DC", padding: "0 12px" }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: "#FF5F57" }} />
        <span style={{ width: 10, height: 10, borderRadius: 5, background: "#FEBC2E" }} />
        <span style={{ width: 10, height: 10, borderRadius: 5, background: "#28C840" }} />
        <span style={{ marginLeft: 12, fontSize: 11, fontWeight: 600, color: "#4A5A68" }}>Logiciel de gestion — Vente</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {row(
            scanned ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, opacity: inscribe, transform: `translateX(${(1 - inscribe) * -8}px)` }}>
                <span style={{ fontFamily: MONO, fontWeight: 500, color: "#22313D" }}>{LGO_LINE}</span>
              </span>
            ) : null,
            true,
            0,
          )}
          {row(null, false, 1)}
          {row(null, false, 2)}
          <div style={{ height: 80, borderRadius: 6, background: "#fff" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ height: 64, borderRadius: 6, background: "#fff" }} />
          <div style={{ height: 64, borderRadius: 6, background: "#fff" }} />
          <div style={{ height: 40, borderRadius: 6, background: "#1E6F8A" }} />
        </div>
      </div>
    </div>
  );
}

const DESKTOP = "radial-gradient(120% 90% at 20% 10%, #2A2F4A 0%, #171A2B 45%, #0E1020 100%)";

/** Le poste du comptoir : le bureau, le logiciel, l'île. */
export function PosteScene({ t, P, tracks, restOnly = false, robotHidden = false }: { t: number; P: Plan; tracks: Tracks; restOnly?: boolean; robotHidden?: boolean }) {
  return (
    <AbsoluteFill style={{ background: DESKTOP, overflow: "hidden" }}>
      <World t={t} P={P}>
        <LgoWindow t={restOnly ? -1 : t} P={P} />
        <PosteIsland t={t} P={P} pixel={tracks.pixel} restOnly={restOnly} robotHidden={robotHidden} />
      </World>
      <Scrim />
    </AbsoluteFill>
  );
}

// ---- Le logiciel ------------------------------------------------------------------------------------------------

/** PharmaBoost côté titulaire, derrière l'île du logiciel : l'en-tête, et la page légèrement floutée. */
function AppPage() {
  const card = (style: CSSProperties, children?: ReactNode) => <div style={{ position: "absolute", borderRadius: 12, background: "#fff", border: `1px solid ${C.ink200}`, boxShadow: "0 4px 24px -4px rgba(30,133,120,.14)", ...style }}>{children}</div>;
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 60, width: 1440, height: 900, filter: "blur(2.6px)", fontFamily: FONT }}>
        <div style={{ position: "absolute", left: 0, top: -60, width: 256, height: 1000, background: "#fff", borderRight: `1px solid ${C.ink200}` }} />
        <div style={{ position: "absolute", left: 288, top: 26, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink900 }}>Nouvelle vente</div>
        <div style={{ position: "absolute", left: 288, top: 66, width: 420, height: 12, borderRadius: 6, background: C.ink200 }} />
        {card({ left: 288, top: 104, width: 260, height: 96 })}
        {card({ left: 566, top: 104, width: 260, height: 96 })}
        {card({ left: 844, top: 104, width: 260, height: 96 })}
        {card({ left: 1122, top: 104, width: 260, height: 96 })}
        {card({ left: 288, top: 220, width: 816, height: 330 })}
        {card({ left: 1122, top: 220, width: 260, height: 330 })}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ position: "absolute", left: 312, top: 250 + i * 56, width: 760, height: 40, borderRadius: 8, background: C.ink50, border: `1px solid ${C.ink100}` }} />
        ))}
        <div style={{ position: "absolute", left: 340, top: 264, width: 200, height: 12, borderRadius: 6, background: C.ink300 }} />
        <div style={{ position: "absolute", left: 1140, top: 240, width: 120, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #1C796D, #22815B)" }} />
      </div>
      {/* L'en-tête : l'île prend sa place au centre. */}
      <div style={{ position: "absolute", left: -400, top: 0, width: 2240, height: 54, background: "rgba(255,255,255,.96)", borderBottom: `1px solid ${C.ink200}` }} />
      <div style={{ position: "absolute", left: 1090, top: 11, display: "flex", alignItems: "center", gap: 14, color: C.ink500 }}>
        <Bell size={18} />
        <span style={{ width: 32, height: 32, borderRadius: 16, background: C.brand100, color: C.brand800, fontFamily: FONT, fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" }}>CM</span>
      </div>
    </>
  );
}

export function LogicielScene({ t, P, tracks, robotHidden = false }: { t: number; P: Plan; tracks: Tracks; robotHidden?: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.app, overflow: "hidden" }}>
      <World t={t} P={P}>
        <AppPage />
        {t >= P.logicielShow && <AppIsland t={t} P={P} pixel={tracks.pixel} robotHidden={robotHidden} />}
      </World>
      <Toast t={t} at={P.acceptDone + 0.05} until={Math.min(P.teamIn, P.acceptDone + 0.05 + 4.5)} />
      <Scrim opacity={0.85} />
    </AbsoluteFill>
  );
}

/** La confirmation du produit (components/ui/toast.tsx), en bas à droite. */
function Toast({ t, at, until }: { t: number; at: number; until: number }) {
  if (t < at) return null;
  const p = ramp(t, at, 0.25, SITE_EASE);
  const out = ramp(t, until - 0.3, 0.3);
  const s = 1.55;
  return (
    <div style={{ position: "absolute", right: 44, top: 690, width: 384 * s, opacity: p * (1 - out), transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ display: "flex", gap: 12 * s, borderRadius: 8 * s, border: `1px solid ${C.ink200}`, background: "#fff", padding: 14 * s, boxShadow: "0 10px 15px -3px rgba(0,0,0,.18), 0 4px 6px -4px rgba(0,0,0,.12)", fontFamily: FONT }}>
        <CheckCircle2 size={18 * s} color={C.success600} style={{ flexShrink: 0, marginTop: 2 * s }} />
        <p style={{ margin: 0, minWidth: 0, flex: 1, fontSize: 13.5 * s, lineHeight: 1.45, fontWeight: 500, color: C.ink900 }}>{JOINED_TOAST}</p>
        <X size={14 * s} color={C.ink400} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
}

// ---- Le saut de Pixel, du poste au logiciel ----------------------------------------------------------------------

/** Pixel quitte l'île du poste, traverse avec une traînée et se pose dans l'île du logiciel, au même endroit du cadre. */
export function Leap({ t, P, tracks }: { t: number; P: Plan; tracks: Tracks }) {
  if (t < P.jump || t > P.land) return null;
  const cam = camera(t, P);
  const geom = posteGeometry(P.jump, P);
  const from = { x: ISLAND_X - geom.width / 2 + 12 + 20, y: ISLAND_Y + 30 };
  const to = { x: ISLAND_X - 118 + 6 + 16, y: ISLAND_Y + 22 };
  const at = (p: number) => {
    const e = IN_OUT(clamp01(p));
    return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) - 14 * Math.sin(Math.PI * clamp01(p)), size: lerp(40, 32, e) * (1 + 0.3 * Math.sin(Math.PI * clamp01(p))) };
  };
  const p = (t - P.jump) / (P.land - P.jump);
  const ghosts = [5, 4, 3, 2, 1, 0];
  return (
    <AbsoluteFill>
      {ghosts.map((g) => {
        const q = at(p - g * 0.07);
        const sc = cam.toScreen(q.x, q.y);
        const size = q.size * cam.S;
        if (g === 0) {
          return (
            <div key={g} style={{ position: "absolute", left: sc.x - size / 2, top: sc.y - (size * 0.92) / 2 }}>
              <Mascot track={tracks.pixel} t={t} size={size} look={PIXEL_LOOK} style={{ filter: `drop-shadow(0 0 ${14 * Math.sin(Math.PI * clamp01(p))}px rgba(54,232,200,.8))` }} />
            </div>
          );
        }
        if (p - g * 0.07 < 0) return null;
        return <div key={g} style={{ position: "absolute", left: sc.x - size * 0.42, top: sc.y - size * 0.38, width: size * 0.84, height: size * 0.76, borderRadius: "40%", background: `radial-gradient(circle, rgba(54,232,200,${0.32 - g * 0.05}), transparent 70%)` }} />;
      })}
    </AbsoluteFill>
  );
}

// ---- Le pointeur ------------------------------------------------------------------------------------------------

type Pt = { x: number; y: number };
type Stop = { t: number; world?: Pt; screen?: Pt };

/** Le pointeur : il arrive sur chaque cible à l'instant prévu (déplacement de 0,5 s au plus), clique, repart. */
export function Pointer({ t, P }: { t: number; P: Plan }) {
  const pt = posteTargets();
  const at = appTargets();
  const windows: { from: number; to: number; stops: Stop[]; clicks: number[] }[] = [
    {
      from: P.hoverIn - 0.75,
      to: P.hoverOut + 0.55,
      stops: [
        { t: P.hoverIn - 0.75, screen: { x: 1560, y: 980 } },
        { t: P.hoverIn, world: pt.capsule },
        { t: P.hoverOut, world: pt.capsule },
        { t: P.hoverOut + 0.5, screen: { x: 1500, y: 760 } },
      ],
      clicks: [],
    },
    {
      from: P.compris - 0.8,
      to: P.compris + 0.75,
      stops: [
        { t: P.compris - 0.8, screen: { x: 1620, y: 1000 } },
        { t: P.compris - 0.05, world: pt.compris },
        { t: P.compris + 0.25, world: pt.compris },
        { t: P.compris + 0.75, screen: { x: 1860, y: 420 } },
      ],
      clicks: [P.compris],
    },
    {
      from: P.sold - 0.75,
      to: P.finish + 0.6,
      stops: [
        { t: P.sold - 0.75, screen: { x: 1640, y: 1000 } },
        { t: P.sold, world: pt.sold },
        { t: P.notSold, world: pt.notSold },
        { t: P.addEmail, world: pt.addEmail },
        { t: P.typeEmail - 0.2, world: { x: pt.send.x + 60, y: pt.send.y + 70 } },
        { t: P.sendEmail, world: pt.send },
        { t: P.backToAdvice + 0.1, world: { x: pt.send.x + 40, y: pt.send.y + 200 } },
        { t: P.finish, world: pt.finish },
        { t: P.finish + 0.6, screen: { x: 1600, y: 1000 } },
      ],
      clicks: [P.sold, P.notSold, P.addEmail, P.sendEmail, P.finish],
    },
    {
      from: P.accept - 0.9,
      to: P.chatTab + 0.7,
      stops: [
        { t: P.accept - 0.9, screen: { x: 1620, y: 1000 } },
        { t: P.accept, world: at.accept },
        { t: P.acceptDone + 0.15, world: at.accept },
        { t: P.chatTab, world: at.discussion },
        { t: P.chatTab + 0.7, screen: { x: 1640, y: 980 } },
      ],
      clicks: [P.accept, P.chatTab],
    },
  ];
  // Un geste qui n'est pas dans ce film (instant « jamais », bien après la fin) : la souris ne s'y rend pas.
  const found = windows.find((x) => t >= x.from && t <= x.to);
  if (!found) return null;
  const w = { ...found, stops: found.stops.filter((stop) => stop.t < P.total + 60), clicks: found.clicks.filter((c) => c < P.total + 60) };
  const cam = camera(t, P);
  const pos = (s: Stop): Pt => (s.screen ? s.screen : cam.toScreen(s.world!.x, s.world!.y));
  let p: Pt = pos(w.stops[0]);
  for (let i = 1; i < w.stops.length; i++) {
    const a = w.stops[i - 1];
    const b = w.stops[i];
    if (t >= b.t) {
      p = pos(b);
      continue;
    }
    const leave = Math.max(a.t, b.t - 0.5);
    const k = IN_OUT(clamp01((t - leave) / (b.t - leave)));
    const pa = pos(a);
    const pb = pos(b);
    p = { x: lerp(pa.x, pb.x, k), y: lerp(pa.y, pb.y, k) };
    break;
  }
  const opacity = Math.min(ramp(t, w.from, 0.2), 1 - ramp(t, w.to - 0.25, 0.25));
  const click = w.clicks.find((c) => t >= c - 0.06 && t < c + 0.4);
  const press = click === undefined ? 0 : t < click ? (t - click + 0.06) / 0.06 : Math.max(0, 1 - (t - click) / 0.16);
  return <Cursor x={p.x - 4} y={p.y - 3} press={press} click={click === undefined || t < click ? -1 : (t - click) / 0.4} opacity={opacity} />;
}

// ---- L'équipe : un robot par comptoir, « Mon équipe », le téléphone ------------------------------------------------

function DarkBackdrop({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${K.cardTop} 0%, ${K.cardBottom} 78%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(52% 60% at ${50 + Math.sin(t / 2.4) * 6}% ${40 + Math.cos(t / 3.1) * 4}%, ${rgba(K.glow, 0.15)}, transparent 72%), radial-gradient(44% 50% at 100% 100%, rgba(7,150,180,.22), transparent 70%)` }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.065) 1.5px, transparent 1.7px)", backgroundSize: "42px 42px", backgroundPosition: `${-t * 5}px 0`, maskImage: "radial-gradient(62% 62% at 50% 48%, black, transparent 86%)", WebkitMaskImage: "radial-gradient(62% 62% at 50% 48%, black, transparent 86%)" }} />
      {Array.from({ length: 40 }, (_, i) => {
        const x = (noise2D("px", i * 0.41, t * 0.06) * 0.5 + 0.5) * W;
        const y = (noise2D("py", i * 0.67, t * 0.06) * 0.5 + 0.5) * H;
        const r = 1.5 + ((i * 7) % 5) * 0.7;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: K.muted, opacity: 0.08 + 0.1 * (((i * 3) % 4) / 3) }} />;
      })}
    </AbsoluteFill>
  );
}

/** « Mon équipe » (src/app/(app)/pilotage/page.tsx) : le classement du mois et le challenge en cours. Prénoms et chiffres : exemples. */
const RANKING = [
  { name: "Camille", proposed: 64, validated: 23 },
  { name: "Inès", proposed: 51, validated: 15 },
  { name: "Léo", proposed: 38, validated: 9 },
];
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)} %`;

function TeamPanel({ t, P }: { t: number; P: Plan }) {
  const proposed = RANKING.reduce((s, r) => s + r.proposed, 0);
  const validated = RANKING.reduce((s, r) => s + r.validated, 0);
  const g = halo(t, P.challengeHalo, 1.2);
  const ratio = CHALLENGE_UNITS / CHALLENGE_TARGET;
  const fill = ramp(t, P.challengeHalo - 0.2, 0.7, SITE_EASE);
  return (
    <div style={{ width: 860, borderRadius: 24, background: C.app, boxShadow: "0 40px 90px -40px rgba(0,0,0,.6)", padding: "26px 30px 28px", boxSizing: "border-box", fontFamily: FONT, color: C.ink900 }}>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em" }}>Mon équipe</div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        {["Aujourd'hui", "Cette semaine", "Ce mois", "Cette année"].map((p) => (
          <span key={p} style={{ borderRadius: 999, padding: "7px 16px", fontSize: 16, fontWeight: 500, border: `1px solid ${p === "Ce mois" ? C.brand600 : C.ink200}`, background: p === "Ce mois" ? C.brand600 : "#fff", color: p === "Ce mois" ? "#fff" : C.ink600 }}>
            {p}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 18, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>Classement</span>
        <span style={{ fontSize: 15, color: C.ink500 }}>
          {proposed} conseils proposés · {validated} validés ({pct(validated, proposed)})
        </span>
      </div>
      <div style={{ marginTop: 10, borderRadius: 14, background: "#fff", border: `1px solid ${C.ink200}` }}>
        {RANKING.map((r, i) => (
          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 18px", borderTop: i ? `1px solid ${C.ink100}` : undefined }}>
            <span style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 600, background: i === 0 ? "#FDEFCC" : C.ink100, color: i === 0 ? "#8A5A00" : C.ink600 }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 600 }}>{r.name}</span>
              <span style={{ marginTop: 5, display: "block", height: 6, maxWidth: 260, borderRadius: 3, background: C.ink100, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.round((r.validated / validated) * 100)}%`, borderRadius: 3, background: C.brand500 }} />
              </span>
            </span>
            {[
              [r.proposed, "proposés", C.ink900],
              [r.validated, "validés", C.success700],
              [pct(r.validated, r.proposed), "taux", C.ink900],
            ].map(([v, l, col]) => (
              <span key={String(l)} style={{ width: 74, textAlign: "right" }}>
                <span style={{ display: "block", fontSize: 21, lineHeight: "26px", fontWeight: 600, color: String(col), fontVariantNumeric: "tabular-nums" }}>{v}</span>
                <span style={{ display: "block", fontSize: 12, color: C.ink500 }}>{l}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 20, fontWeight: 600 }}>Challenges en cours</div>
      <div style={{ marginTop: 10, borderRadius: 14, background: "#fff", border: `1px solid ${C.ink200}`, padding: "14px 18px 16px", boxShadow: g > 0 ? `0 0 0 ${3 * g}px rgba(54,232,200,${0.6 * g}), 0 0 ${30 * g}px rgba(54,232,200,${0.45 * g})` : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.ink400 }}>Laboratoire A</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{CHALLENGE_TITLE}</div>
          </div>
          <div style={{ fontSize: 14, color: C.ink500 }}>12 jours restants</div>
        </div>
        <div style={{ marginTop: 6, fontSize: 15, color: C.ink500 }}>
          <span style={{ fontSize: 24, fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums" }}>{CHALLENGE_UNITS}</span> sur {CHALLENGE_TARGET} unités
        </div>
        <div style={{ marginTop: 8, height: 9, borderRadius: 5, background: C.ink100, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(ratio * 100 * (0.35 + 0.65 * fill))}%`, borderRadius: 5, background: C.accent500 }} />
        </div>
      </div>
    </div>
  );
}

/** Le téléphone : l'application PharmaBoost (/m), onglet Challenges puis Accueil. Prénom, officine et prime : exemples. */
function Phone({ t, P, tracks }: { t: number; P: Plan; tracks: Tracks }) {
  const home = t >= P.phoneHome;
  const swap = ramp(t, P.phoneHome, 0.3, SITE_EASE);
  const PW = 470;
  const PH = Math.round(PW * 2.06);
  const s = (PW - 24) / 390;
  const tabs = [
    { label: "Accueil", I: House },
    { label: "Formations", I: GraduationCap },
    { label: "Découvertes", I: Compass },
    { label: "Challenges", I: Trophy },
    { label: "Mon espace", I: CircleUserRound },
  ];
  const active = home ? "Accueil" : "Challenges";
  const ratio = CHALLENGE_UNITS / CHALLENGE_TARGET;
  const challengeCard = (compact: boolean) => (
    <div style={{ borderRadius: 24, background: "#fff", boxShadow: "0 6px 28px -8px rgba(30,110,100,.18)", padding: 18, display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {!compact && (
          <svg width={64} height={64} viewBox="0 0 64 64">
            <circle cx={32} cy={32} r={27} fill="none" stroke={C.ink100} strokeWidth={7} />
            <circle cx={32} cy={32} r={27} fill="none" stroke={C.accent400} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 27 * ratio} 999`} transform="rotate(-90 32 32)" />
            <text x={32} y={31} textAnchor="middle" fontSize={14} fontWeight={700} fill={C.ink900} fontFamily={FONT}>{Math.round(ratio * 100)}%</text>
            <text x={32} y={44} textAnchor="middle" fontSize={8.5} fill={C.ink500} fontFamily={FONT}>équipe</text>
          </svg>
        )}
        {compact && (
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: C.accent50, color: "#A06A00" }}>
            <Trophy size={20} />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!compact && <span style={{ display: "inline-block", borderRadius: 999, background: C.accent50, color: "#8A5A00", fontSize: 11.5, fontWeight: 600, padding: "2px 8px" }}>Encore 12 j</span>}
          <div style={{ marginTop: compact ? 0 : 4, fontSize: compact ? 15 : 16, fontWeight: 700, color: C.ink900 }}>{CHALLENGE_TITLE}</div>
          <div style={{ fontSize: 12.5, color: C.ink400 }}>Laboratoire A · {compact ? "encore 12 j" : "jusqu'au 25 oct."}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 }}>
        {(compact
          ? [
              ["Mes ventes", "11", ""],
              [`L'équipe / ${CHALLENGE_TARGET}`, String(CHALLENGE_UNITS), ""],
            ]
          : [
              ["Ma part", "11", "30 % de l'équipe"],
              ["L'équipe", String(CHALLENGE_UNITS), `sur ${CHALLENGE_TARGET}`],
              ["Mon rang", "2e", "sur 4"],
            ]
        ).map(([l, v, h]) => (
          <div key={l} style={{ borderRadius: 12, background: C.ink50, padding: "8px 10px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: C.ink400 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink900 }}>{v}</div>
            {h && <div style={{ fontSize: 11, color: C.ink400 }}>{h}</div>}
          </div>
        ))}
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: C.ink100 }}>
        <div style={{ height: "100%", width: `${ratio * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${C.accent400}, ${C.accent500})` }} />
        {!compact && [40, 50].map((m) => <span key={m} style={{ position: "absolute", left: `${(m / CHALLENGE_TARGET) * 100}%`, top: -4, width: 2, height: 14, marginLeft: -1, background: C.ink300 }} />)}
      </div>
      {!compact && <div style={{ borderRadius: 12, background: C.accent50, padding: "8px 12px", fontSize: 12.5, fontWeight: 500, color: "#6B4500" }}>Plus que <b>3</b> unités pour le prochain palier de l&apos;équipe.</div>}
    </div>
  );
  return (
    <div style={{ width: PW, height: PH, borderRadius: 64, background: "#0B0F14", padding: 12, boxSizing: "border-box", boxShadow: "0 50px 100px -40px rgba(0,0,0,.8), inset 0 0 0 2px rgba(255,255,255,.12)" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, overflow: "hidden", background: "#F2F8F8" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 390, height: (PH - 24) / s, transform: `scale(${s})`, transformOrigin: "0 0", fontFamily: FONT }}>
          {/* La barre d'état, l'en-tête de l'application. */}
          <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontSize: 14, fontWeight: 600, color: C.ink900 }}>
            <span>9:41</span>
            <span style={{ width: 96, height: 26, borderRadius: 13, background: "#0B0F14" }} />
            <span style={{ display: "flex", gap: 4 }}>
              <span style={{ width: 16, height: 10, borderRadius: 2, background: C.ink900 }} />
              <span style={{ width: 22, height: 10, borderRadius: 3, border: `1.5px solid ${C.ink900}` }} />
            </span>
          </div>
          <div style={{ height: 56, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: `1px solid ${rgba(C.ink200, 0.6)}`, background: "rgba(246,250,250,.85)" }}>
            <Mascot track={tracks.phone} t={t} size={30} />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink700 }}>Pharmacie du Centre</span>
          </div>
          <div style={{ padding: "16px 16px 0", position: "relative" }}>
            <div style={{ opacity: 1 - swap, position: home ? "absolute" : "relative", left: 16, right: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", color: C.ink900 }}>Challenges</div>
              <div style={{ marginTop: 4, fontSize: 13.5, color: C.ink500 }}>Pharmacie du Centre · vos challenges et vos objectifs.</div>
              <div style={{ marginTop: 22, fontSize: 17, fontWeight: 700, color: C.ink900 }}>En cours</div>
              <div style={{ marginTop: 12 }}>{challengeCard(false)}</div>
            </div>
            {home && (
              <div style={{ opacity: swap }}>
                <div style={{ position: "relative", overflow: "hidden", borderRadius: 24, background: "linear-gradient(140deg, #14615C 0%, #1D7A6C 55%, #2C8F70 100%)", padding: 20, color: "#fff", boxShadow: "0 18px 40px -18px rgba(20,90,80,.8)" }}>
                  <div style={{ position: "absolute", top: -64, right: -40, width: 192, height: 192, borderRadius: 96, background: "rgba(255,255,255,.12)", filter: "blur(24px)" }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,.8)" }}>Bonjour,</div>
                      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>Camille</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,.85)" }}>Préparateur · Pharmacie du Centre</div>
                    </div>
                    <Mascot track={tracks.phone} t={t} size={96} floating style={{ filter: "drop-shadow(0 12px 18px rgba(0,0,0,.2))" }} />
                  </div>
                  <div style={{ position: "relative", marginTop: 16, display: "flex", alignItems: "center", gap: 12, borderRadius: 16, borderTopRightRadius: 6, background: "rgba(255,255,255,.95)", padding: "12px 16px", boxShadow: "0 8px 24px -12px rgba(0,0,0,.35)", opacity: ramp(t, P.phoneHome + 0.25, 0.3), transform: `translateY(${(1 - ramp(t, P.phoneHome + 0.25, 0.3, SITE_EASE)) * 8}px)` }}>
                    <span style={{ position: "absolute", top: -6, right: 32, width: 12, height: 12, transform: "rotate(45deg)", background: "rgba(255,255,255,.95)" }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: "20px", fontWeight: 500, color: C.ink900 }}>Bonne nouvelle : votre prime « Prime d&apos;équipe de septembre » a été validée.</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 13, fontWeight: 600, color: C.brand700 }}>
                      Voir mes primes <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 28, fontSize: 17, fontWeight: 700, color: C.ink900 }}>Mes challenges</div>
                <div style={{ marginTop: 12 }}>{challengeCard(true)}</div>
              </div>
            )}
          </div>
          {/* La barre d'onglets. */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 84, display: "flex", justifyContent: "space-around", alignItems: "flex-start", paddingTop: 10, background: "rgba(255,255,255,.94)", borderTop: `1px solid ${C.ink200}` }}>
            {tabs.map(({ label, I }) => {
              const on = label === active;
              return (
                <span key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: on ? 700 : 500, color: on ? C.brand700 : C.ink400 }}>
                  <I size={22} />
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamScene({ t, P, tracks }: { t: number; P: Plan; tracks: Tracks }) {
  const shift = ramp(t, P.teamShift, 0.7);
  const panel = ramp(t, P.teamShift + 0.1, 0.6, SITE_EASE);
  const phone = ramp(t, P.phoneIn, 0.55, SITE_EASE);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <DarkBackdrop t={t} />
      {TEAM_ROBOTS.map((r, k) => {
        const size = lerp(210, 104, shift);
        const cx = lerp(W / 2 + (k - 1.5) * 380, 250 + k * 200, shift);
        const top = lerp(250, 96, shift);
        const enter = ramp(t, P.teamIn + 0.05 + k * 0.08, 0.5, SITE_EASE);
        return (
          <div key={r.look} style={{ position: "absolute", left: cx - size / 2, top, width: size, opacity: enter, transform: `translateY(${(1 - enter) * 40}px)` }}>
            <Mascot track={tracks.team[k]} t={t} size={size} look={r.look} />
            <div style={{ marginTop: lerp(18, 8, shift), display: "flex", justifyContent: "center" }}>
              <span style={{ whiteSpace: "nowrap", borderRadius: 999, background: "rgba(11,15,20,.6)", border: "1px solid rgba(255,255,255,.14)", padding: `${lerp(8, 4, shift)}px ${lerp(18, 10, shift)}px`, fontFamily: FONT, fontSize: lerp(27, 17, shift), fontWeight: 700, color: "#fff" }}>
                {r.caption}
              </span>
            </div>
          </div>
        );
      })}
      {panel > 0 && (
        <div style={{ position: "absolute", left: 130, top: 300, opacity: panel, transform: `translateY(${(1 - panel) * 60}px) scale(${0.96 + 0.04 * panel})`, transformOrigin: "50% 0" }}>
          <TeamPanel t={t} P={P} />
        </div>
      )}
      {phone > 0 && (
        <div style={{ position: "absolute", left: 1390, top: 92, transform: `translateX(${(1 - phone) * 600}px) rotate(${(1 - phone) * 6}deg)` }}>
          <Phone t={t} P={P} tracks={tracks} />
        </div>
      )}
      <Scrim opacity={0.6} />
    </AbsoluteFill>
  );
}

// ---- Retour au poste : les deux étiquettes ---------------------------------------------------------------------

function Label({ t, at, label, value, detail, left }: { t: number; at: number; label: string; value: string; detail?: string; left: number }) {
  const p = ramp(t, at, 0.5, SITE_EASE);
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", top: 222, left, width: 520, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, borderRadius: 16, padding: "26px 32px 30px", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", backdropFilter: "blur(6px)", fontFamily: FONT, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ShieldCheck size={30} color={C.brand300} />
        <span style={{ fontFamily: MONO, fontSize: 19, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand200 }}>{label}</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 34, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.015em", color: "#fff" }}>{value}</div>
      {detail && <div style={{ marginTop: 8, fontSize: 23, lineHeight: 1.35, color: "rgba(255,255,255,.75)" }}>{detail}</div>}
    </div>
  );
}

export function TrustLabels({ t, P }: { t: number; P: Plan }) {
  return (
    <AbsoluteFill>
      <Label t={t} at={P.labelRules} left={90} label="Règles" value="Validées par l'équipe officinale" detail="Chaque conseil vient d'une règle relue." />
      <Label t={t} at={P.labelData} left={700} label="Données" value="Aucune fiche patient" detail="L'adresse du bilan est effacée à « Vente terminée »." />
      <Label t={t} at={P.labelDecision} left={1310} label="Décision" value="Le dernier mot au pharmacien" />
    </AbsoluteFill>
  );
}

// ---- La fin ------------------------------------------------------------------------------------------------------

export function EndScene({ t, P, tracks }: { t: number; P: Plan; tracks: Tracks }) {
  const enter = ramp(t, P.endStart, 0.4);
  const flash = Math.max(0, ramp(t, P.endStart + 0.25, 0.1) - ramp(t, P.endStart + 0.35, 0.25)) * 0.12;
  const robot = ramp(t, P.endStart + 0.1, 0.55, SITE_EASE);
  const name = ramp(t, P.words[0] - 0.05, 0.45, SITE_EASE);
  const fade = ramp(t, P.total - 0.6, 0.6);
  const LOGO = 230;
  const WORD = 124;
  const words = ["Le bon conseil,", "à chaque vente."];
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - fade) }}>
      <DarkBackdrop t={t} />
      <div style={{ position: "absolute", left: "18%", top: "22%", width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: "50%", background: "radial-gradient(circle, rgba(54,232,200,.12), transparent 65%)" }} />
      <div style={{ position: "absolute", left: 0, width: W, top: 250, display: "flex", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <div style={{ opacity: Math.min(1, robot * 2), transform: `scale(${0.4 + 0.6 * robot}) rotate(${(1 - robot) * -12}deg)` }}>
          <Mascot track={tracks.end} t={t} size={LOGO} floating />
        </div>
        <div style={{ opacity: name, transform: `translateX(${(1 - name) * -60}px)`, clipPath: `inset(-20% ${(1 - name) * 100}% -20% 0)`, fontFamily: FONT }}>
          <Wordmark size={WORD} dark />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 640, display: "flex", justifyContent: "center", gap: 28, fontFamily: HEAVY, fontWeight: 800, fontSize: 88, letterSpacing: "-0.03em" }}>
        {words.map((w, i) => {
          const p = ramp(t, P.words[i + 1] - 0.04, 0.32, SITE_EASE);
          return (
            <span key={w} style={{ display: "inline-block", color: i === 1 ? C.brand300 : "#fff", opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.7 + 0.3 * p})`, textShadow: i === 1 ? `0 0 40px ${rgba(MINT, 0.35)}` : "0 6px 22px rgba(2,18,30,.6)" }}>
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, width: W, top: 820, textAlign: "center", fontFamily: FONT, fontSize: 34, fontWeight: 500, letterSpacing: "0.02em", color: C.brand200, opacity: ramp(t, P.url, 0.5) }}>pharmaboost.app</div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

// ---- La mention, de la première image à la dernière --------------------------------------------------------------

export function Mention({ opacity = 1 }: { opacity?: number }) {
  return (
    <div style={{ position: "absolute", right: 30, top: 24, opacity, borderRadius: 999, padding: "7px 16px", background: "rgba(8,14,22,.55)", border: "1px solid rgba(255,255,255,.12)", fontFamily: FONT, fontSize: 19, fontWeight: 600, letterSpacing: "0.005em", color: "rgba(255,255,255,.82)" }}>
      Illustration · chiffres, produits et prix : exemples
    </div>
  );
}
