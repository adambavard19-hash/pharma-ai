import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Lock, Mail } from "lucide-react";
import {
  AdnBackdrop,
  CalendarCure,
  Camera,
  ChapterTitle,
  DotGrid,
  Dust,
  EXIT,
  F,
  IN_OUT,
  JAKARTA,
  LINEAR,
  MailBilan,
  Notification,
  PB,
  PHONE_SIZE,
  Phone,
  Ring,
  SNAP,
  Sparks,
  WHIP,
  clamp01,
  cue,
  cureTicks,
  keys,
  lerp,
  prog,
  pulse,
  ressort,
  rgba,
  tween,
  wobble,
  type Cue,
} from "../kit";

/* ==========================================================================
 * S10 · LE PATIENT (48,5 → 53,8) — N9 : « Pour le patient : son bilan par e-mail, et un rappel avant la fin de sa cure. »
 *
 *   ENTRÉE      le chapitre « 2/3 · POUR LE PATIENT » (ChapterTitle, même gabarit que S9 et S12) ; sa bande citron
 *               découpe S9 (S9 suit la même géométrie, à CH_AT). « PATIENT » monte sur le mot (48,97).
 *   « son bilan »  le panneau file, le monde du patient est CLAIR (papier, hélice) ; le téléphone jaillit d'en bas en
 *               tournant, écran verrouillé ; il VIBRE sur « bilan » (49,91) : notification Mail « Pharmacie du Centre ·
 *               Votre bilan conseil ».
 *   « par e-mail »  le doigt touche la notification, l'e-mail monte ; sur « e-mail » (50,40) la fiche du produit
 *               SE DÉCOLLE de l'écran et grandit à droite (loupe ×2,2, liée au téléphone) : Probiotique, « Pourquoi
 *               avec votre traitement », 3 points clés. Aucun nom de patient.
 *   « rappel »  la loupe pivote et devient le calendrier de la cure (51,27) : une cure de 14 jours (le logiciel n'envoie
 *               de rappel que pour une cure d'au moins 14 jours, « quelques jours avant la fin »), les jours se cochent en
 *               rafale, la fin de cure s'allume sur « fin » (52,01) ; un e-mail part de la cloche et vole au téléphone :
 *               notification sur « cure » (52,45), avec le VRAI objet de l'e-mail (src/core/cure/reminder-email.ts) ;
 *               elle JAILLIT en grand au-dessus du téléphone pour être lisible.
 *   SORTIE      53,3 → 53,75 : iris citron qui se referme sur le rappel (la caméra plonge dedans), S11 apparaît autour.
 * ======================================================================== */

// ---- Les temps (secondes du film, voix mesurée : mots.json N9) -------------------------------------------------------
/** Le chapitre. S9 (s09-equipe.tsx, S10_CHAPTER) se découpe sur sa bande : GARDER ÉGAUX. */
const CH_AT = 48.62; // « POUR » 48,78 (dit 48,69), « LE » 48,86, « PATIENT » 48,94 (dit 48,97)
const CH_EXIT = 49.46;
const PHONE_IN = 49.6; // le téléphone arrive de la droite en tournant, collé au panneau qui file (0,42 s)
const NOTIF1 = 49.88; // « bilan » 49,91 : il vibre, la notification tombe
const TAP = 50.2; // « par » 50,20 : le doigt touche la notification
/**
 * L'e-mail, dans le téléphone ET dans la loupe (le même contenu, au même instant : la loupe grossit ce que montre l'écran).
 * Il monte déjà rempli ; ses 3 points clés arrivent à 50,41 / 50,51 / 50,61, pendant que la loupe grandit.
 */
const MAIL_AT = 49.66;
const LOUPE = 50.38; // « e-mail » 50,40 : la fiche se décolle
const FLIP = 51.03; // la loupe pivote…
const CAL_AT = 51.15; // …et devient le calendrier (« rappel » 51,27)
/** Une cure de 14 jours : MIN_CURE_DAYS du logiciel (src/core/cure/cure.ts), pas de rappel en dessous. */
const CAL_DAYS = 14;
const CAL = cureTicks(CAL_AT, CAL_DAYS, 0.46 / (CAL_DAYS - 2)); // 12 cases de 51,40 à 51,82 ; fin de cure à 52,01 (« fin »)
const FLY0 = CAL.end + 0.06; // l'e-mail du rappel part de la cloche
const NOTIF2 = 52.42; // « cure » 52,45
const ECHO_AT = NOTIF2 + 0.06; // la notification jaillit en grand
const EXIT_AT = 53.3;
/** L'objet réel de l'e-mail de rappel (src/core/cure/reminder-email.ts). */
const REMINDER = "Votre cure de Probiotique arrive à son terme";

// ---- Géométrie ------------------------------------------------------------------------------------------------------
/** x 680 : le téléphone laisse libre l'étiquette « 2/3 · POUR LE PATIENT » (haut gauche, jusqu'à x ≈ 440). */
const PHONE = { x: 680, y: 488 };
const SCREEN0 = { x: PHONE.x - PHONE_SIZE.W / 2 + PHONE_SIZE.bezel, y: PHONE.y - PHONE_SIZE.H / 2 + PHONE_SIZE.bezel };
/** La fiche du produit dans l'écran de l'e-mail (px de l'écran 355 × 792), mesurée sur planche. */
const REG = { x: 6, y: 192, w: 343, h: 316 };
const ZOOM = 2.2;
const LOUPE_C = { x: 1360, y: 470 };
const CAL_C = { x: 1360, y: 476 };
const CAL_S = 1.75;
/** La cloche de la fin de cure (coin de la 14e case du calendrier), mesurée sur planche. */
const BELL = { x: 1626, y: 526 };
/** Où la notification se pose dans l'écran (centre : 335 px de large à 10 px du bord, deux lignes). */
const NOTIF_C = { x: SCREEN0.x + 177, y: SCREEN0.y + 100 };
/** Le rappel en grand (centre, coordonnées de l'écran) : au-dessus du téléphone, sous l'étiquette du chapitre. */
const ECHO = { x: 700, y: 262 };
const ECHO_S = 1.8;
const ECHO_W = 350;

const beat = (t: number) => {
  const u = (((t - 20) % 0.5) + 0.5) % 0.5;
  return Math.exp(-u * 9);
};

/** L'écran verrouillé (fond du téléphone avant l'e-mail). */
function LockScreen({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, #1C4A42 0%, ${PB.green} 55%, #071A17 100%)` }}>
      <div style={{ position: "absolute", left: "50%", top: 300, width: 420, height: 420, marginLeft: -210, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(PB.mint, 0.25)} 0%, transparent 65%)`, transform: `translate(${wobble(t, 3, 12, 0.4)}px, ${wobble(t, 6, 10, 0.35)}px)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 112, display: "flex", justifyContent: "center" }}>
        <Lock size={20} color="#FFFFFF" strokeWidth={2.4} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 140, textAlign: "center", fontFamily: JAKARTA, fontWeight: 700, fontSize: 82, letterSpacing: "-0.03em", color: "#FFF", transform: `translateY(${wobble(t, 2, 2, 1)}px)` }}>9:41</div>
    </AbsoluteFill>
  );
}

/** Le contenu de l'écran : verrouillé, puis l'e-mail qui monte quand on touche la notification. */
function PhoneScreen({ t }: { t: number }) {
  const up = prog(t, TAP + 0.03, 0.34, SNAP);
  const p = prog(t, TAP, 0.45, SNAP);
  return (
    <>
      <LockScreen t={t} />
      {up > 0 && (
        <AbsoluteFill style={{ transform: `translateY(${(1 - up) * 100}%)`, boxShadow: "0 -20px 40px rgba(0,0,0,.25)" }}>
          <MailBilan t={t} at={MAIL_AT} />
        </AbsoluteFill>
      )}
      {/* Le doigt : une onde là où se trouve la notification. */}
      {p > 0 && p < 1 && (
        <div style={{ position: "absolute", left: 177 - 18 - 60 * p, top: 88 - 18 - 60 * p, width: 36 + 120 * p, height: 36 + 120 * p, borderRadius: "50%", background: rgba("#FFFFFF", 0.45 * (1 - p)), border: `3px solid ${rgba(PB.citron, 1 - p)}`, zIndex: 30 }} />
      )}
      <Notification t={t} at={NOTIF1} until={TAP + 0.04} title="Pharmacie du Centre" body="Votre bilan conseil" icon="mail" />
      <Notification t={t} at={NOTIF2} title="Pharmacie du Centre" body={REMINDER} icon="mail" />
    </>
  );
}

/**
 * CONTOURNEMENT d'un défaut de ChapterTitle (kit/screens.tsx) : la lueur citron des mots (text-shadow) est coupée net
 * par leur masque (un rectangle clair se voit autour de « LE PATIENT ») ; elle est remplacée par un drop-shadow posé sur
 * le masque, qui n'est pas coupé. Feuille de style limitée à ce titre.
 */
function ChapterFix({ children }: { children: ReactNode }) {
  const w = `.s10-chapitre span[style*="overflow: hidden"]`;
  const css = `${w} > span { text-shadow: none !important; } ${w}:nth-child(n+2) { filter: drop-shadow(0 0 22px ${rgba(PB.citron, 0.38)}); }`;
  return (
    <AbsoluteFill className="s10-chapitre">
      <style>{css}</style>
      {children}
    </AbsoluteFill>
  );
}

/** Les ondes de vibration de part et d'autre du téléphone. */
function Buzz({ t, at, x }: { t: number; at: number; x: number }) {
  const u = t - at;
  if (u < 0 || u > 0.62) return null;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      {[0, 1, 2].map((i) => {
        const k = clamp01((u - i * 0.07) / 0.45);
        if (k <= 0 || k >= 1) return null;
        const d = 214 + 26 * i + 30 * k;
        const a = (1 - k) * 0.9;
        const h = 70 + 26 * i;
        return (
          <g key={i} stroke={PB.brand} strokeWidth={7} strokeLinecap="round" fill="none" opacity={a}>
            <path d={`M ${x - d} ${PHONE.y - 150 - h} q ${-24} ${h} 0 ${2 * h}`} />
            <path d={`M ${x + d} ${PHONE.y - 150 - h} q ${24} ${h} 0 ${2 * h}`} />
          </g>
        );
      })}
    </svg>
  );
}

/** La fiche du produit qui se décolle de l'e-mail et grandit (loupe), puis pivote. */
function Loupe({ t }: { t: number }) {
  if (t < LOUPE) return null;
  const k = prog(t, LOUPE, 0.5, SNAP);
  const out = prog(t, FLIP, 0.13, EXIT);
  if (out >= 1) return null;
  const from = { x: SCREEN0.x + REG.x + REG.w / 2, y: SCREEN0.y + REG.y + REG.h / 2 };
  const cx = lerp(from.x, LOUPE_C.x, k);
  const cy = lerp(from.y, LOUPE_C.y, k) - 60 * Math.sin(Math.PI * k);
  const s = lerp(1 / ZOOM, 1, k);
  const W = REG.w * ZOOM;
  const H = REG.h * ZOOM;
  const glowK = pulse(t, LOUPE + 0.42, 0.06, 0.05, 0.4);
  return (
    <div
      style={{
        position: "absolute",
        left: cx - W / 2,
        top: cy - H / 2,
        width: W,
        height: H,
        borderRadius: 34,
        overflow: "hidden",
        background: "#EEF3F1",
        transform: `perspective(1800px) rotateY(${out * 90}deg) rotate(${lerp(-4, 0, k)}deg) scale(${s})`,
        boxShadow: `0 0 0 ${3 + 3 * glowK}px ${rgba(PB.citron, 0.9)}, 0 50px 90px -40px rgba(11,40,34,.55), 0 0 ${60 * glowK}px ${rgba(PB.citron, 0.6)}`,
      }}
    >
      <div style={{ position: "absolute", left: -REG.x * ZOOM, top: -REG.y * ZOOM, width: PHONE_SIZE.W - 2 * PHONE_SIZE.bezel, height: PHONE_SIZE.H - 2 * PHONE_SIZE.bezel, transform: `scale(${ZOOM})`, transformOrigin: "0 0" }}>
        <MailBilan t={t} at={MAIL_AT} />
      </div>
    </div>
  );
}

/** Les traits qui relient la fiche du téléphone à la loupe. */
function Connectors({ t }: { t: number }) {
  const k = prog(t, LOUPE + 0.22, 0.3, SNAP);
  const out = prog(t, FLIP - 0.06, 0.12, LINEAR);
  const a = k * (1 - out);
  if (a <= 0.01) return null;
  const x0 = SCREEN0.x + REG.x;
  const x1 = x0 + REG.w;
  const y0 = SCREEN0.y + REG.y;
  const y1 = y0 + REG.h;
  const W = REG.w * ZOOM;
  const H = REG.h * ZOOM;
  const lx = LOUPE_C.x - W / 2;
  const ly0 = LOUPE_C.y - H / 2;
  const ly1 = LOUPE_C.y + H / 2;
  const dash = (1 - k) * 600;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, opacity: a, pointerEvents: "none" }}>
      <path d={`M ${x1} ${y0} L ${lx + 20} ${ly0 + 10} L ${lx + 20} ${ly1 - 10} L ${x1} ${y1} Z`} fill={rgba(PB.citron, 0.16)} />
      <path d={`M ${x1} ${y0} L ${lx + 20} ${ly0 + 10} M ${x1} ${y1} L ${lx + 20} ${ly1 - 10}`} stroke={PB.brand} strokeWidth={3} strokeDasharray="10 9" strokeDashoffset={dash} fill="none" />
      <rect x={x0} y={y0} width={REG.w} height={REG.h} rx={16} fill="none" stroke={PB.citron} strokeWidth={4} />
    </svg>
  );
}

/** Le calendrier de la cure, qui arrive en pivotant (la suite de la loupe). */
function Calendar({ t }: { t: number }) {
  if (t < FLIP + 0.1) return null;
  const k = prog(t, FLIP + 0.12, 0.32, SNAP);
  const endHit = pulse(t, CAL.end, 0.05, 0.05, 0.45);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: `perspective(1800px) rotateY(${(1 - k) * -90}deg) scale(${1 + 0.03 * endHit})`, transformOrigin: `${CAL_C.x}px ${CAL_C.y}px` }}>
      <CalendarCure t={t} at={CAL_AT} days={CAL_DAYS} step={0.46 / (CAL_DAYS - 2)} x={CAL_C.x} y={CAL_C.y} scale={CAL_S} />
    </div>
  );
}

/** L'e-mail du rappel qui part de la cloche et vole jusqu'au téléphone. */
function ReminderFlight({ t }: { t: number }) {
  const dur = NOTIF2 - FLY0 - 0.02;
  if (t < FLY0 || t > FLY0 + dur + F) return null;
  const k = prog(t, FLY0, dur, IN_OUT);
  const P0 = BELL;
  const P2 = NOTIF_C;
  const P1 = { x: (P0.x + P2.x) / 2, y: 40 };
  const at = (kk: number) => {
    const a = (1 - kk) * (1 - kk);
    const b = 2 * kk * (1 - kk);
    const c = kk * kk;
    return { x: a * P0.x + b * P1.x + c * P2.x, y: a * P0.y + b * P1.y + c * P2.y };
  };
  const dot = (kk: number, alpha: number, size: number, key: string, icon = false) => {
    const p = at(clamp01(kk));
    return (
      <div key={key} style={{ position: "absolute", left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: "50%", background: icon ? PB.green : PB.citron, opacity: alpha, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: icon ? `0 0 0 4px ${PB.citron}, 0 12px 26px -8px rgba(0,0,0,.45)` : undefined, transform: icon ? `rotate(${lerp(-20, 10, kk)}deg)` : undefined }}>
        {icon && <Mail size={size * 0.5} color={PB.citron} strokeWidth={2.6} />}
      </div>
    );
  };
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => (k - 0.035 * (i + 1) > 0 ? dot(k - 0.035 * (i + 1), 0.55 - i * 0.07, 22 - i * 2.2, `tr${i}`) : null))}
      {dot(k, 1, 62, "env", true)}
    </>
  );
}

/**
 * Le rappel EN GRAND : la notification jaillit du téléphone (depuis sa place dans l'écran, `from` en coordonnées de
 * l'écran) et se pose au-dessus de lui, lisible ; l'iris de la sortie se referme sur elle.
 */
function ReminderEcho({ t, from }: { t: number; from: { x: number; y: number; s: number } }) {
  if (t < ECHO_AT) return null;
  const k = prog(t, ECHO_AT, 0.34, SNAP);
  const r = ressort(t, ECHO_AT, { damping: 11, stiffness: 230, mass: 0.6 });
  const glow = pulse(t, ECHO_AT + 0.2, 0.06, 0.08, 0.45);
  return (
    <div
      style={{
        position: "absolute",
        left: lerp(from.x, ECHO.x, k),
        top: lerp(from.y, ECHO.y, k),
        borderRadius: 24,
        transform: `translate(-50%, -50%) rotate(${lerp(-5, -1.5, k) + wobble(t, 5, 0.5, 0.7)}deg) scale(${lerp(from.s, ECHO_S, r)})`,
        boxShadow: `0 0 0 ${2 + 1.5 * glow}px ${PB.citron}, 0 40px 70px -30px rgba(11,40,34,.6), 0 0 ${50 * glow}px ${rgba(PB.citron, 0.7)}`,
      }}
    >
      <Notification t={t} at={NOTIF2 - 1} title="Pharmacie du Centre" body={REMINDER} icon="mail" width={ECHO_W} style={{ position: "relative", left: 0, top: 0 }} />
    </div>
  );
}

export function Scene({ t }: { t: number }) {
  // Le téléphone arrive de la droite en pivotant, juste derrière le bord du panneau qui file à gauche.
  const inK = prog(t, PHONE_IN, 0.42, SNAP);
  const px = lerp(PHONE.x + 1720, PHONE.x, inK);
  const py = PHONE.y + 50 * (1 - inK);
  const tilt = keys(t, [[PHONE_IN, 58], [PHONE_IN + 0.5, -9, SNAP]]) + wobble(t, 12, 3, 0.5);
  const rot = keys(t, [[PHONE_IN, 10], [PHONE_IN + 0.45, -1.5, SNAP]]);
  const buzz = t < NOTIF2 - 0.05 ? NOTIF1 : NOTIF2;
  const lightStatus = t < TAP + 0.2;

  // La sortie : iris qui se referme sur le rappel en grand.
  const ex = prog(t, EXIT_AT, 0.45, WHIP);
  const R = lerp(1560, 0, ex);
  const anticip = 1 - 0.02 * pulse(t, EXIT_AT - 0.14, 0.12, 0, 0.14);
  const dive = lerp(1, 1.45, ex) * anticip;

  const b = beat(t);
  // Après le rappel, la caméra s'approche un peu du téléphone (le bas du téléphone reste au-dessus de 930), puis plonge
  // dans le rappel en grand (iris).
  const near = prog(t, NOTIF2 + 0.08, 0.8, IN_OUT);
  const camZoom = (1 + 0.04 * prog(t, CH_EXIT, 3.8, LINEAR)) * (1 + 0.04 * near);
  const camX = tween(t, FLIP, 1.2, 0, -12, IN_OUT);
  const cam = {
    zoom: camZoom,
    origin: [PHONE.x, PHONE.y] as [number, number],
    x: camX,
    shakes: [
      { at: NOTIF1, amp: 4, frames: 12 },
      { at: NOTIF2, amp: 4, frames: 12 },
    ],
  };

  const world: ReactNode = (
    <>
      <Camera t={t} {...cam} depth={0.35}>
        <AdnBackdrop t={t} tone="paper" focus={[0.74, 0.5]} width={1600} opacity={0.5} />
        <AbsoluteFill style={{ background: `radial-gradient(55% 75% at 30% 46%, ${rgba("#FFFFFF", 0.92)} 0%, ${rgba("#F2F8F5", 0.7)} 45%, ${rgba("#D9EAE4", 0.55)} 100%)` }} />
        <DotGrid t={t} opacity={0.07} color="15,47,42" />
      </Camera>
      <Camera t={t} {...cam} depth={0.7}>
        <div style={{ position: "absolute", left: PHONE.x - 420, top: PHONE.y - 420, width: 840, height: 840, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(PB.mint, 0.3 + 0.08 * b)} 0%, ${rgba(PB.brand, 0.08)} 45%, transparent 70%)`, opacity: inK }} />
        <div style={{ position: "absolute", left: CAL_C.x - 520, top: CAL_C.y - 440, width: 1040, height: 880, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(PB.citron, 0.4)} 0%, transparent 65%)`, opacity: prog(t, LOUPE, 0.4) }} />
      </Camera>
      <Camera t={t} {...cam}>
        <Buzz t={t} at={NOTIF1} x={px} />
        <Buzz t={t} at={NOTIF2} x={px} />
        {t >= PHONE_IN && <Phone t={t} x={px} y={py} tilt={tilt} rot={rot} buzz={buzz} statusTone={lightStatus ? "light" : "dark"}>
          <PhoneScreen t={t} />
        </Phone>}
        <Connectors t={t} />
        <Loupe t={t} />
        <Calendar t={t} />
        <Ring t={t} at={CAL.end} x={BELL.x} y={BELL.y} max={240} color={PB.brand} width={5} />
        <Sparks t={t} at={CAL.end} x={BELL.x} y={BELL.y} count={14} seed="s10-bell" speed={700} color={PB.brand} len={20} life={0.4} />
        <ReminderFlight t={t} />
        <Ring t={t} at={NOTIF2} x={NOTIF_C.x} y={NOTIF_C.y} max={360} color={PB.citron} width={6} />
      </Camera>
      <Camera t={t} {...cam} depth={1.4}>
        <Dust t={t} count={22} seed="s10-dust" color={PB.brand} size={[1.5, 3.5]} alpha={0.28} speed={0.07} />
      </Camera>
      <ChapterFix>
        <ChapterTitle t={t} at={CH_AT} n="2/2" text="POUR *LE PATIENT*" exitAt={CH_EXIT} />
      </ChapterFix>
    </>
  );

  // La notification dans l'écran, en coordonnées de l'écran (sans la dérive de la caméra, quelques px).
  const echoFrom = { x: PHONE.x + camZoom * (NOTIF_C.x - PHONE.x) + camX, y: PHONE.y + camZoom * (NOTIF_C.y - PHONE.y), s: camZoom };

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "#EEF5F2", clipPath: ex > 0 ? `circle(${R}px at ${ECHO.x}px ${ECHO.y}px)` : undefined }}>
        <AbsoluteFill style={{ transform: dive !== 1 ? `scale(${dive})` : undefined, transformOrigin: `${ECHO.x}px ${ECHO.y}px` }}>
          {world}
          <ReminderEcho t={t} from={echoFrom} />
        </AbsoluteFill>
      </AbsoluteFill>
      {ex > 0 && ex < 1 && (
        <div style={{ position: "absolute", left: ECHO.x - R - 9, top: ECHO.y - R - 9, width: 2 * R + 18, height: 2 * R + 18, borderRadius: "50%", border: `${18 * (1 - 0.5 * ex)}px solid ${PB.citron}`, boxShadow: `0 0 40px ${rgba(PB.citron, 0.6)}`, pointerEvents: "none" }} />
      )}
    </AbsoluteFill>
  );
}

export const cues: Cue[] = [
  cue("balayage-court", 48.55, 0.42), // le panneau du chapitre découpe S9
  cue("pop-sec", 48.74, 0.38), // la pastille « 2/3 »
  cue("swoosh", 49.5, 0.45), // le panneau file, le téléphone arrive en pivotant
  cue("telephone-vibre", 49.86, 0.42), // il vibre (sous « bilan » : discret)
  cue("mail", 49.9, 0.32), // la notification
  cue("ui-clic", 50.2, 0.45), // le doigt touche
  cue("swipe-tel", 50.24, 0.32), // l'e-mail monte
  cue("carte-depliee", 50.38, 0.42), // la fiche se décolle
  cue("pop-leger", 50.51, 0.22),
  cue("pop-leger", 50.61, 0.22), // les points clés 2 et 3 (le 1er, à 50,41, est couvert par la fiche qui se décolle)
  cue("swoosh", 51.03, 0.3), // la loupe pivote en calendrier
  ...CAL.ticks.filter((_, i) => i % 2 === 0).map((at, i) => cue("tic-sec", at, 0.38, 1 + 0.06 * i)), // les jours se cochent (un tic pour deux cases)
  cue("ui-ding", CAL.end, 0.45), // la fin de cure s'allume
  cue("whoosh-pb", FLY0 + 0.02, 0.26), // l'e-mail du rappel vole
  cue("notif-douce", NOTIF2, 0.55), // le rappel arrive, puis jaillit en grand
  cue("telephone-vibre", NOTIF2 + 0.02, 0.28),
  cue("whoosh-pb", EXIT_AT, 0.45), // l'iris plonge dans le rappel
];
