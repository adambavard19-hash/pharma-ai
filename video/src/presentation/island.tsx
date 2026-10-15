import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { ArrowUp, Check, Home, Loader2, Mail, MessageCircle, PartyPopper, Plus, ScanLine, Send, TriangleAlert, X } from "lucide-react";
import { FONT, MONO } from "../theme";
import { Mascot, type Track } from "./mascot";
import { animate, clamp01, current, halo, islIn, islLine, islPop, press, ramp } from "./anim";
import {
  ADVICE,
  ALERT_FOCUS,
  ALERT_TEXT,
  ANALYSIS_STEPS,
  CHAT_ANSWER,
  CHAT_FOOTNOTE,
  CHAT_PLACEHOLDER,
  CHAT_QUESTION,
  CHAT_SUGGESTIONS,
  DONE_BADGE,
  DONE_LINES,
  DONE_SUB,
  DRUG,
  EMAIL,
  FOR_SALE,
  HOME_AFTER,
  HOME_BEFORE,
  KC,
  LOGICIEL_ALERTS,
  PIXEL_LOOK,
  POSTE_LABEL,
  T,
  type FilmAdvice,
} from "./data";
import { TYPE_STEP, type Plan } from "./plan";

/* ==========================================================================
 * LES ÎLES, REDESSINÉES POUR LA VIDÉO, en pixels du site :
 *  - l'île du poste : src/components/island/counter-island.tsx (+ la carte
 *    « Résultat de la vente » de src/app/(poste)/poste/ile/poste-island.tsx) ;
 *  - l'île du logiciel : src/components/island/platform-island.tsx et
 *    app-island.tsx (Accueil avec les alertes et leurs gestes, Discussion).
 * Les classes Tailwind du site sont traduites en styles ; les hauteurs, que le
 * site mesure, sont posées ici à la main (et vérifiées image par image).
 * ======================================================================== */

/** Le centre et le haut de l'île, en pixels du site (le poste comme le logiciel). */
export const ISLAND_X = 720;
export const ISLAND_Y = 5;

const truncate: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const WHITE = (a: number) => `rgba(255,255,255,${a})`;

// ---- La capsule ------------------------------------------------------------------------------------------------

export type Tone = "neutral" | "accent" | "warning" | "success";
const TONE_RING: Record<Tone, string> = {
  neutral: "0 0 0 1px rgba(255,255,255,0.07)",
  accent: "0 0 0 1px rgba(54,232,200,0.35), 0 0 28px -6px rgba(54,232,200,0.45)",
  warning: "0 0 0 1.5px rgba(245,166,35,0.75), 0 0 32px -6px rgba(245,166,35,0.55)",
  success: "0 0 0 1px rgba(34,200,143,0.6), 0 0 30px -6px rgba(34,200,143,0.55)",
};

/** Le ton de l'île à l'instant t : les liserés se croisent en fondu (0,45 s). */
function toneWeights(t: number, tones: { t: number; tone: Tone }[]): [Tone, number][] {
  const cur = current(t, tones);
  const idx = tones.indexOf(cur);
  const prev = idx > 0 ? tones[idx - 1].tone : cur.tone;
  const k = ramp(t, cur.t, 0.45);
  if (prev === cur.tone || k >= 1) return [[cur.tone, 1]];
  return [
    [prev, 1 - k],
    [cur.tone, k],
  ];
}

/** La capsule noire : largeur et hauteur en ressort, liseré du ton, ombre. */
export function Capsule({ left, top, width, height, tones, t, children, opacity = 1, scale = 1 }: { left: number; top: number; width: number; height: number; tones: { t: number; tone: Tone }[]; t: number; children: ReactNode; opacity?: number; scale?: number }) {
  const radius = height > 64 ? 28 : 999;
  return (
    <div style={{ position: "absolute", left, top, width, height, opacity, transform: scale !== 1 ? `scale(${scale})` : undefined }}>
      {toneWeights(t, tones).map(([tone, w]) => (
        <div key={tone} style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: `${TONE_RING[tone]}, 0 18px 40px -14px rgba(0,0,0,0.55)`, opacity: w }} />
      ))}
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, overflow: "hidden", background: "#0B0F14", color: "#fff", fontFamily: FONT }}>{children}</div>
    </div>
  );
}

function Row({ robot, title, sub, trailing, icon, compact }: { robot: ReactNode; title: ReactNode; sub?: ReactNode; trailing?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: compact ? 0 : "10px 12px", height: compact ? 38 : undefined }}>
      {robot}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, lineHeight: "20px", fontWeight: 600, ...truncate }}>
          {icon}
          {title}
        </p>
        {sub !== undefined && <p style={{ margin: 0, fontSize: 12.5, lineHeight: "18px", color: WHITE(0.6), ...truncate }}>{sub}</p>}
      </div>
      {trailing}
    </div>
  );
}

/** Une tuile chiffrée de l'île (« COMPTOIR 2 · Connecté »). */
function Tile({ label, value, dot, style }: { label: string; value: ReactNode; dot?: string; style?: CSSProperties }) {
  return (
    <div style={{ minWidth: 0, borderRadius: 16, background: WHITE(0.06), padding: "8px 10px", height: 55, boxSizing: "border-box", ...style }}>
      <p style={{ margin: 0, fontSize: 10.5, lineHeight: "15.75px", fontWeight: 500, letterSpacing: "0.04em", color: WHITE(0.55), textTransform: "uppercase", ...truncate }}>{label}</p>
      <p style={{ margin: "2px 0 0", display: "flex", alignItems: "center", gap: 6, fontSize: 14, lineHeight: "21px", fontWeight: 600, fontVariantNumeric: "tabular-nums", ...truncate }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: dot, flexShrink: 0 }} />}
        {value}
      </p>
    </div>
  );
}

// ---- L'île du poste ------------------------------------------------------------------------------------------

type PosteKey = "idle" | "peek" | "scan" | "analyzing" | "alert" | "advice" | "email" | "emailSent" | "done";

const POSTE_WIDTH: Record<PosteKey, number> = { idle: 244, peek: 440, scan: 340, analyzing: 420, alert: 460, advice: 560, email: 460, emailSent: 360, done: 420 };
const POSTE_TONE: Record<PosteKey, Tone> = { idle: "neutral", peek: "neutral", scan: "accent", analyzing: "accent", alert: "warning", advice: "neutral", email: "neutral", emailSent: "success", done: "success" };
const POSTE_ROBOT: Record<PosteKey, number> = { idle: 32, peek: 34, scan: 36, analyzing: 36, alert: 36, advice: 34, email: 34, emailSent: 36, done: 40 };
/** Le nombre de lignes du texte de la mise en garde à 13 px dans 408 px (vérifié à l'image). */
export const ALERT_LINES = 12;

/** La hauteur de chaque étape, en pixels du site (les marges et hauteurs des classes du site). */
function posteHeight(key: PosteKey, lines = 1): number {
  switch (key) {
    case "idle":
      return 44;
    case "peek":
      return 131;
    case "scan":
      return 58;
    case "analyzing":
      return 90 + 24 * lines;
    case "alert":
      return 136 + 20 * ALERT_LINES;
    case "advice":
      return 373;
    case "email":
      return 116;
    case "emailSent":
      return 58;
    case "done":
      return 60;
  }
}

export function posteStages(P: Plan): { t: number; key: PosteKey }[] {
  return [
    { t: -1, key: "idle" },
    { t: P.hoverIn, key: "peek" },
    { t: P.collapse, key: "idle" },
    { t: P.scan, key: "scan" },
    { t: P.analyzing, key: "analyzing" },
    { t: P.alert, key: "alert" },
    { t: P.advice, key: "advice" },
    { t: P.addEmail, key: "email" },
    { t: P.emailSent, key: "emailSent" },
    { t: P.backToAdvice, key: "advice" },
    { t: P.done, key: "done" },
  ];
}

/** Les lignes d'analyse visibles (cochées + celle en cours). */
function linesShown(t: number, P: Plan) {
  return Math.min(ANALYSIS_STEPS.length, 1 + P.checks.filter((c, i) => i < 3 && t >= c).length);
}

/** La géométrie de l'île du poste à l'instant t (pour la caméra, le pointeur, la carte résultat). */
export function posteGeometry(t: number, P: Plan, restOnly = false) {
  const stages = restOnly ? [{ t: -1, key: "idle" as PosteKey }] : posteStages(P);
  const widthKeys = stages.map((s) => ({ t: s.t, v: POSTE_WIDTH[s.key] }));
  const heightKeys: { t: number; v: number }[] = [];
  for (const s of stages) {
    heightKeys.push({ t: s.t, v: posteHeight(s.key, 1) });
    if (s.key === "analyzing") for (let i = 0; i < 3; i++) heightKeys.push({ t: P.checks[i], v: posteHeight("analyzing", i + 2) });
  }
  heightKeys.sort((a, b) => a.t - b.t);
  const width = animate(t, widthKeys);
  const height = animate(t, heightKeys);
  return { width, height, stage: current(t, stages), stages };
}

const STOCK_LABEL = (q: number) => `${T.inStock} · ${q}`;

function Chip({ bg, fg, children, glow = 0 }: { bg: string; fg: string; children: ReactNode; glow?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        lineHeight: "16px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: bg,
        color: fg,
        boxShadow: glow > 0 ? `0 0 0 ${2.5 * glow}px rgba(54,232,200,${glow}), 0 0 ${22 * glow}px rgba(54,232,200,${0.85 * glow})` : undefined,
        transform: glow > 0 ? `scale(${1 + 0.08 * glow})` : undefined,
      }}
    >
      {children}
    </span>
  );
}

function AdviceCard({ item, outcome, outcomeAt, t, at, glows }: { item: FilmAdvice; outcome: "SOLD" | "NOT_SOLD" | null; outcomeAt: number; t: number; at: number; glows: { reason: number; stock: number; challenge: number; date: number } }) {
  return (
    <li style={{ listStyle: "none", borderRadius: 16, padding: 10, background: KC.panel, color: KC.ink, height: 123, boxSizing: "border-box", ...islLine(t, at) }}>
      <div style={{ display: "flex", gap: 10, height: 63 }}>
        <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 12, background: "#fff", overflow: "hidden", display: "grid", placeItems: "center" }}>
          <Img src={staticFile(item.image)} style={{ width: 52, height: 52, objectFit: "contain" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, height: 20 }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: "20px", fontWeight: 700, ...truncate }}>{item.name}</p>
            <p style={{ margin: 0, flexShrink: 0, fontSize: 13, lineHeight: "20px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{item.price}</p>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: "17px",
              height: 17,
              color: KC.inkSoft,
              borderRadius: 4,
              background: glows.reason > 0 ? `rgba(54,232,200,${0.22 * glows.reason})` : undefined,
              boxShadow: glows.reason > 0 ? `0 0 0 ${3 * glows.reason}px rgba(54,232,200,${0.22 * glows.reason})` : undefined,
              ...truncate,
            }}
          >
            {item.reason}
          </p>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "nowrap", gap: 4, height: 20 }}>
            {item.challenge && (
              <Chip bg={KC.challengeBg} fg={KC.challengeFg} glow={glows.challenge}>
                ★ {T.challenge}
              </Chip>
            )}
            {item.shortDate && (
              <Chip bg={KC.dateBg} fg={KC.dateFg} glow={glows.date}>
                {T.shortDate} {item.shortDate}
              </Chip>
            )}
            <Chip bg={KC.stockBg} fg={KC.stockFg} glow={glows.stock}>
              {STOCK_LABEL(item.quantity)}
            </Chip>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, height: 32 }}>
        {outcome ? (
          <>
            <span style={{ display: "inline-flex", flex: 1, height: 32, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, fontSize: 12.5, fontWeight: 700, ...(outcome === "SOLD" ? { background: KC.soldBg, color: KC.soldFg } : { background: KC.notSoldBg, color: KC.notSoldFg }), ...islPop(t, outcomeAt) }}>
              {outcome === "SOLD" && <Check size={14} strokeWidth={3} />}
              {outcome === "SOLD" ? T.sold : T.notSold}
            </span>
            <span style={{ height: 32, display: "inline-flex", alignItems: "center", padding: "0 10px", fontSize: 12, fontWeight: 600, color: KC.inkSoft }}>{T.change}</span>
          </>
        ) : (
          <>
            <span style={{ flex: 1, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: KC.soldBg, color: KC.soldFg }}>{T.sold}</span>
            <span style={{ flex: 1, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: KC.notSoldBg, color: KC.notSoldFg }}>{T.notSold}</span>
          </>
        )}
      </div>
    </li>
  );
}

/** La lueur ambre qui balaie un passage de la mise en garde. */
function AlertText({ t, sweepAt }: { t: number; sweepAt: number }) {
  const i = ALERT_TEXT.indexOf(ALERT_FOCUS);
  const before = ALERT_TEXT.slice(0, i);
  const after = ALERT_TEXT.slice(i + ALERT_FOCUS.length);
  const p = clamp01((t - sweepAt) / 1.1);
  const stay = t >= sweepAt ? Math.min(1, (t - sweepAt) / 0.4) : 0;
  return (
    <p style={{ margin: "10px 0 0", borderRadius: 16, padding: "10px 12px", fontSize: 13, lineHeight: "20px", background: "rgba(245,166,35,0.12)", color: "#FFE2B0", height: 20 + 20 * ALERT_LINES, boxSizing: "border-box", overflow: "hidden" }}>
      {before}
      <span
        style={{
          color: stay > 0 ? `rgb(255,${Math.round(226 + 20 * stay)},${Math.round(176 + 40 * stay)})` : undefined,
          backgroundImage: `linear-gradient(90deg, rgba(245,166,35,${0.16 * stay}), rgba(245,166,35,${0.16 * stay})), linear-gradient(100deg, transparent 0%, rgba(255,196,90,0) 35%, rgba(255,196,90,0.55) 50%, rgba(255,196,90,0) 65%, transparent 100%)`,
          backgroundSize: "100% 100%, 300% 100%",
          backgroundPosition: `0 0, ${100 - p * 100}% 0`,
          backgroundRepeat: "no-repeat",
          borderRadius: 4,
          WebkitBoxDecorationBreak: "clone",
          boxDecorationBreak: "clone",
          padding: "1px 2px",
        }}
      >
        {ALERT_FOCUS}
      </span>
      {after}
    </p>
  );
}

/**
 * L'île du poste à l'instant t, posée dans le monde (pixels du site). `robotHidden` : le robot a sauté hors de l'île
 * (passage au logiciel). `restOnly` : l'île au repos seule (retour au poste, scène H).
 */
export function PosteIsland({ t, P, pixel, robotHidden = false, restOnly = false }: { t: number; P: Plan; pixel: Track; robotHidden?: boolean; restOnly?: boolean }) {
  const { width, height, stage, stages } = posteGeometry(t, P, restOnly);
  const key = stage.key;
  const at = stage.t;
  const tones = stages.map((s) => ({ t: s.t, tone: POSTE_TONE[s.key] }));
  const robot = (size: number) =>
    robotHidden ? <span style={{ width: size, height: size * 0.92, flexShrink: 0 }} /> : <Mascot track={pixel} t={t} size={size} look={PIXEL_LOOK} />;
  const content = islIn(t, at);
  let body: ReactNode = null;

  switch (key) {
    case "idle":
      body = (
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 16px 0 6px" }}>
          {robot(POSTE_ROBOT.idle)}
          <span style={{ minWidth: 0, flex: 1, fontSize: 13, color: WHITE(0.8), ...truncate }}>{T.idle}</span>
          <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: KC.accent, boxShadow: `0 0 8px ${KC.accent}` }} />
        </div>
      );
      break;
    case "peek":
      body = (
        <div style={{ padding: "12px 14px 14px" }}>
          <Row robot={robot(POSTE_ROBOT.peek)} title={T.idle} sub="Je surveille le comptoir. Scannez une boîte pour commencer." compact />
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <Tile label={POSTE_LABEL} value="Connecté" dot={KC.accent} style={islPop(t, at + 0.2)} />
          </div>
        </div>
      );
      break;
    case "scan": {
      const sweep = ((t - at) % 1.1) / 1.1;
      body = (
        <div style={{ position: "relative" }}>
          <Row robot={robot(POSTE_ROBOT.scan)} title={T.scanTitle} sub={T.scanSub} icon={<ScanLine size={16} color={KC.glow} />} />
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: "33%", transform: `translateX(${-120 + 440 * (sweep < 0 ? 0 : sweep)}%)`, background: `linear-gradient(90deg, transparent, ${KC.glow}, transparent)` }} />
          </span>
        </div>
      );
      break;
    }
    case "analyzing": {
      const shown = linesShown(t, P);
      body = (
        <div style={{ padding: "12px 14px 14px" }}>
          <Row robot={robot(POSTE_ROBOT.analyzing)} title={T.scanSub} sub={DRUG} compact />
          <ol style={{ margin: "10px 0 0", padding: "10px 12px", borderRadius: 16, background: WHITE(0.05), fontFamily: MONO, fontSize: 12, lineHeight: "20px", display: "flex", flexDirection: "column", gap: 4 }}>
            {ANALYSIS_STEPS.slice(0, shown).map((step, i) => {
              const done = t >= P.checks[i];
              const appear = i === 0 ? P.analyzing : P.checks[i - 1];
              return (
                <li key={step} style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 8, height: 20, ...islLine(t, appear) }}>
                  {done ? (
                    <span style={{ display: "inline-flex", ...islPop(t, P.checks[i]) }}>
                      <Check size={14} color={KC.accent} strokeWidth={3} />
                    </span>
                  ) : (
                    <Loader2 size={14} color={WHITE(0.6)} style={{ transform: `rotate(${((t * 400) % 360).toFixed(1)}deg)` }} />
                  )}
                  <span style={{ color: done ? WHITE(0.85) : WHITE(0.6), ...truncate }}>{step}</span>
                </li>
              );
            })}
          </ol>
        </div>
      );
      break;
    }
    case "alert":
      body = (
        <div style={{ padding: "12px 14px 14px" }}>
          <Row robot={robot(POSTE_ROBOT.alert)} title={T.readFirst} sub={T.duringSale} compact icon={<TriangleAlert size={16} color="#F5A623" />} />
          <AlertText t={t} sweepAt={P.sweep} />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <span style={{ height: 32, display: "inline-flex", alignItems: "center", borderRadius: 8, padding: "0 12px", fontSize: 12.5, fontWeight: 600, color: WHITE(0.9), background: WHITE(0.08 + 0.1 * press(t, P.compris)), transform: `scale(${1 - 0.05 * press(t, P.compris)})` }}>Compris</span>
          </div>
        </div>
      );
      break;
    case "advice": {
      const o1 = t >= P.sold ? ("SOLD" as const) : null;
      const o2 = t >= P.notSold ? ("NOT_SOLD" as const) : null;
      const all = o1 !== null && o2 !== null;
      const H = P.halos;
      // La première ouverture des conseils (après « Compris ») : les halos ; au retour du bilan, plus aucun.
      const first = at < P.addEmail;
      const g = (when: number) => (first ? halo(t, when) : 0);
      body = (
        <div style={{ padding: 12 }}>
          <Row robot={robot(POSTE_ROBOT.advice)} title={FOR_SALE} sub={all ? T.allDone : `${T.forDrug}${DRUG}`} compact />
          <ul style={{ margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {ADVICE.map((item, i) => (
              <AdviceCard
                key={item.name}
                item={item}
                t={t}
                at={first ? at : at - 1}
                outcome={i === 0 ? o1 : o2}
                outcomeAt={first ? (i === 0 ? P.sold : P.notSold) : -10}
                glows={{ reason: g(H.reasons), stock: g(H.stock), challenge: g(H.challenge), date: g(H.date) }}
              />
            ))}
          </ul>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, background: WHITE(0.08 + 0.08 * press(t, P.addEmail)), fontSize: 12.5, fontWeight: 600, color: WHITE(0.9) }}>
              <Mail size={14} /> {T.emailAdd}
            </span>
            <span style={{ flex: 1, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, background: KC.accent, color: "#04261A", fontSize: 12.5, fontWeight: 700, transform: `scale(${1 - 0.05 * press(t, P.finish)})`, filter: press(t, P.finish) > 0 ? "brightness(1.1)" : undefined }}>
              <Check size={14} strokeWidth={3} /> {T.finish}
            </span>
          </div>
        </div>
      );
      break;
    }
    case "email": {
      const typed = t < P.typeEmail ? "" : EMAIL.slice(0, Math.min(EMAIL.length, 1 + Math.floor((t - P.typeEmail) / TYPE_STEP)));
      const caret = Math.floor(t * 2) % 2 === 0;
      body = (
        <div style={{ padding: "12px 14px 14px" }}>
          <Row robot={robot(POSTE_ROBOT.email)} title="Bilan conseil par e-mail" sub="Le patient reçoit ses conseils et vos coordonnées." compact />
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ height: 40, minWidth: 0, flex: 1, boxSizing: "border-box", display: "flex", alignItems: "center", borderRadius: 12, border: `1px solid ${typed ? "#36E8C8" : WHITE(0.1)}`, background: WHITE(0.06), padding: "0 12px", fontSize: 13.5, color: typed ? "#fff" : WHITE(0.35) }}>
              {typed || "patient@exemple.fr"}
              {typed && caret && t < P.sendEmail && <span style={{ display: "inline-block", width: 1.5, height: 16, marginLeft: 1, background: "#36E8C8" }} />}
            </div>
            <span style={{ height: 40, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 12, padding: "0 14px", background: KC.accent, color: "#04261A", fontSize: 13, fontWeight: 700, transform: `scale(${1 - 0.05 * press(t, P.sendEmail)})` }}>
              <Send size={14} /> Envoyer
            </span>
          </div>
        </div>
      );
      break;
    }
    case "emailSent":
      body = (
        <Row
          robot={robot(POSTE_ROBOT.emailSent)}
          title="E-mail envoyé"
          sub={EMAIL}
          trailing={
            <span style={{ width: 28, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: KC.accent, ...islPop(t, at) }}>
              <Check size={16} color="#04261A" strokeWidth={3} />
            </span>
          }
        />
      );
      break;
    case "done":
      body = (
        <Row
          robot={robot(POSTE_ROBOT.done)}
          title={T.doneTitle}
          sub={DONE_SUB}
          trailing={
            <span style={{ display: "inline-flex", ...islPop(t, at) }}>
              <PartyPopper size={20} color={KC.challengeIcon} />
            </span>
          }
        />
      );
      break;
  }

  // La carte « Résultat de la vente », sous l'île (poste-island.tsx), quand le poste reçoit la fin de la vente.
  const showResult = !restOnly && key === "done" && t >= P.resultCard;
  const resultP = showResult ? animate(t, [{ t: P.resultCard, v: 0 }, { t: P.resultCard + 0.001, v: 1 }]) : 0;
  return (
    <>
      <Capsule left={ISLAND_X - width / 2} top={ISLAND_Y} width={width} height={height} tones={tones} t={t}>
        <div style={{ width, ...content }}>{body}</div>
      </Capsule>
      {showResult && (
        <Capsule left={ISLAND_X - 210} top={ISLAND_Y + height + 8} width={420} height={posteHeight("done") + 18} tones={[{ t: P.resultCard, tone: "success" }]} t={t + 1} opacity={Math.min(1, resultP * 1.4)}>
          <div style={{ padding: "10px 16px", fontSize: 12.5, lineHeight: "18px", color: WHITE(0.8), display: "flex", flexDirection: "column", gap: 2, transform: `scale(${0.92 + 0.08 * Math.min(1, resultP)})`, transformOrigin: "50% 0", ...islIn(t, P.resultCard) }}>
            {DONE_LINES.map((line) => (
              <p key={line} style={{ margin: 0 }}>
                {line}
              </p>
            ))}
            {t >= P.badge && (
              <p style={{ margin: 0, fontWeight: 600, color: KC.challengeIcon, ...islPop(t, P.badge), transformOrigin: "0 50%" }}>★ {DONE_BADGE}</p>
            )}
          </div>
        </Capsule>
      )}
    </>
  );
}

/** Où cliquer dans l'île du poste (pixels du site), pour le pointeur. */
export function posteTargets() {
  const adviceLeft = ISLAND_X - POSTE_WIDTH.advice / 2;
  const inner = adviceLeft + 12;
  const cardsTop = ISLAND_Y + 12 + 38 + 10;
  const card = (i: number) => cardsTop + i * (123 + 8);
  const half = (POSTE_WIDTH.advice - 24 - 20 - 6) / 2;
  const footY = cardsTop + 2 * 123 + 8 + 10 + 18;
  const footHalf = (POSTE_WIDTH.advice - 24 - 8) / 2;
  const alertInnerRight = ISLAND_X + POSTE_WIDTH.alert / 2 - 14;
  const emailInnerRight = ISLAND_X + POSTE_WIDTH.email / 2 - 14;
  return {
    capsule: { x: ISLAND_X + 30, y: ISLAND_Y + 24 },
    compris: { x: alertInnerRight - 38, y: ISLAND_Y + 12 + 38 + 10 + 20 + 20 * ALERT_LINES + 10 + 16 },
    sold: { x: inner + 10 + half / 2, y: card(0) + 10 + 63 + 8 + 16 },
    notSold: { x: inner + 10 + half + 6 + half / 2, y: card(1) + 10 + 63 + 8 + 16 },
    addEmail: { x: inner + footHalf / 2, y: footY },
    finish: { x: inner + footHalf + 8 + footHalf / 2, y: footY },
    send: { x: emailInnerRight - 50, y: ISLAND_Y + 12 + 38 + 12 + 20 },
    reasons: { x: inner + 62 + 150, y: card(0) + 10 + 20 + 8 },
  };
}

// ---- L'île du logiciel ---------------------------------------------------------------------------------------

type AppKey = "closed" | "home" | "chat";
const APP_WIDTH: Record<AppKey, number> = { closed: 236, home: 540, chat: 580 };
const DOT: Record<string, string> = { problem: "#F5A623", todo: "#36E8C8", good: "#22C88F", info: "rgba(255,255,255,0.4)" };
const PILL_DOT: Record<string, string> = { warning: "#F5A623", todo: "#36E8C8", good: "#22C88F", info: "rgba(255,255,255,0.4)" };
/** Une alerte : padding 8, texte en lignes de 19 px, gestes (28 px). */
const alertHeight = (lines: number) => 8 + 19 * lines + 6 + 28 + 8;
const ALERT_LINE_COUNT = [1, 1, 1];
const HOME_HEIGHT = 10 + 34 + 10 + 55 + 10 + ALERT_LINE_COUNT.reduce((s, l) => s + alertHeight(l), 0) + 6 * 2 + 12;
const HOME_HEIGHT_AFTER = HOME_HEIGHT - alertHeight(ALERT_LINE_COUNT[0]) - 6;
const CHAT_TOP = 10 + 34 + 10;
const CHAT_EMPTY = CHAT_TOP + 44 + 8 + 104 + 10 + 34 + 12;
const CHAT_TYPING = CHAT_TOP + 44 + 12;
const USER_BUBBLE = 32;
const THINKING_BUBBLE = 35;
const ANSWER_BUBBLE = 57;
const CHAT_SENT = CHAT_TOP + USER_BUBBLE + 12 + THINKING_BUBBLE + 8 + 44 + 12;
const CHAT_ANSWERED = CHAT_TOP + USER_BUBBLE + 12 + ANSWER_BUBBLE + 8 + 44 + 12;
const CHAT_DONE = CHAT_ANSWERED + 8 + 18;

export function appGeometry(t: number, P: Plan) {
  const stages: { t: number; key: AppKey }[] = [
    { t: -1, key: "closed" },
    { t: P.autoOpen, key: "home" },
    { t: P.chatTab, key: "chat" },
  ];
  const width = animate(t, stages.map((s) => ({ t: s.t, v: APP_WIDTH[s.key] })));
  const height = animate(t, [
    { t: -1, v: 44 },
    { t: P.autoOpen, v: HOME_HEIGHT },
    { t: P.acceptDone, v: HOME_HEIGHT_AFTER },
    { t: P.chatTab, v: CHAT_EMPTY },
    { t: P.typeChat, v: CHAT_TYPING },
    { t: P.sendChat, v: CHAT_SENT },
    { t: P.answerFrom + 0.5, v: CHAT_ANSWERED },
    { t: P.answerTo + 0.1, v: CHAT_DONE },
  ]);
  return { width, height, stage: current(t, stages), stages };
}

/** Où cliquer dans l'île du logiciel. */
export function appTargets() {
  const homeLeft = ISLAND_X - APP_WIDTH.home / 2;
  return {
    accept: { x: homeLeft + 12 + 12 + 14 + 44, y: ISLAND_Y + 10 + 34 + 10 + 55 + 10 + 8 + 19 + 6 + 14 },
    discussion: { x: homeLeft + 12 + 34 + 10 + 92 + 4 + 56, y: ISLAND_Y + 10 + 17 },
    input: { x: ISLAND_X - 120, y: ISLAND_Y + CHAT_TOP + 22 },
  };
}

/** Le compteur du jour qui roule : « 5 conseils · 5 ventes » → « 6 conseils · 6 ventes ». */
function Roll({ from, to, t, at }: { from: string; to: string; t: number; at: number }) {
  return (
    <span style={{ display: "inline-flex" }}>
      {Array.from(to).map((ch, i) => {
        const old = from[i] ?? "";
        if (old === ch) return <span key={i} style={{ whiteSpace: "pre" }}>{ch}</span>;
        const p = ramp(t, at + i * 0.012, 0.35);
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", overflow: "hidden", height: 21, verticalAlign: "top" }}>
            <span style={{ display: "block", transform: `translateY(${-p * 21}px)` }}>{old}</span>
            <span style={{ display: "block", transform: `translateY(${-p * 21}px)` }}>{ch}</span>
          </span>
        );
      })}
    </span>
  );
}

const TAB_WIDTH = { home: 92, chat: 112, plus: 78 };

/** L'île du logiciel à l'instant t (pixels du site). */
export function AppIsland({ t, P, pixel, robotHidden = false }: { t: number; P: Plan; pixel: Track; robotHidden?: boolean }) {
  const { width, height, stage, stages } = appGeometry(t, P);
  const key = stage.key;
  const tones = [
    { t: -1, tone: "neutral" as Tone },
    { t: P.autoOpen, tone: "accent" as Tone },
  ];
  const robot = (size: number) => (robotHidden ? <span style={{ width: size, height: size * 0.92, flexShrink: 0 }} /> : <Mascot track={pixel} t={t} size={size} look={PIXEL_LOOK} />);
  const accepted = t >= P.acceptDone;
  const alerts = accepted ? LOGICIEL_ALERTS.slice(1) : LOGICIEL_ALERTS;
  let body: ReactNode;

  if (key === "closed") {
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 14px 0 6px" }}>
        <span style={{ position: "relative", flexShrink: 0 }}>
          {robot(32)}
          <span style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#04261A", background: "#36E8C8", boxShadow: "0 0 0 2px #0B0F14", ...islPop(t, P.land + 0.1) }}>
            {LOGICIEL_ALERTS.length}
          </span>
        </span>
        <span style={{ minWidth: 0, flex: 1, fontSize: 13, color: WHITE(0.8), ...truncate }}>{HOME_AFTER.headline}</span>
        <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: "#36E8C8", boxShadow: "0 0 8px #36E8C8" }} />
      </div>
    );
  } else {
    const tab = key === "chat" ? "chat" : "home";
    const tabs = [
      { k: "home", label: "Accueil", icon: <Home size={14} />, w: TAB_WIDTH.home },
      { k: "chat", label: "Discussion", icon: <MessageCircle size={14} />, w: TAB_WIDTH.chat },
      { k: "plus", label: "Stock", icon: <Plus size={14} />, w: TAB_WIDTH.plus },
    ];
    let panel: ReactNode;
    if (tab === "home") {
      const pills = HOME_AFTER.pills;
      panel = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {pills.map((pill, i) => (
              <Tile
                key={pill.key}
                label={pill.label}
                dot={pill.tone ? PILL_DOT[pill.tone] : undefined}
                value={pill.key === "jour" ? <Roll from={HOME_BEFORE.pills[0].value} to={pill.value} t={t} at={P.roll} /> : pill.value}
                style={{ ...islLine(t, stage.t + 0.05 + i * 0.03), boxShadow: pill.key === "jour" && halo(t, P.roll - 0.05, 0.5) > 0 ? `0 0 0 ${1.5 * halo(t, P.roll - 0.05, 0.5)}px rgba(54,232,200,.6)` : undefined }}
              />
            ))}
          </div>
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {alerts.map((alert) => {
              const i = LOGICIEL_ALERTS.indexOf(alert);
              const busy = alert.kind === "join-request" && t >= P.accept && t < P.acceptDone;
              return (
                <li key={alert.key} style={{ listStyle: "none", borderRadius: 16, background: WHITE(0.06), padding: "8px 12px", ...islLine(t, stage.t + 0.12 + i * 0.05) }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ marginTop: 7, width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: DOT[alert.severity] }} />
                    <p style={{ margin: 0, minWidth: 0, flex: 1, fontSize: 13, lineHeight: "19px", color: WHITE(0.9) }}>{alert.text}</p>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, paddingLeft: 14, height: 28 }}>
                    {alert.actions.map((action, a) => (
                      <span
                        key={action.kind}
                        style={{
                          display: "inline-flex",
                          height: 28,
                          alignItems: "center",
                          gap: 4,
                          borderRadius: 8,
                          padding: "0 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          ...(a === 0 ? { background: "#36E8C8", color: "#04261A", transform: `scale(${1 - 0.06 * press(t, P.accept)})` } : { background: WHITE(0.1), color: "#fff" }),
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        {a === 0 && <Check size={14} strokeWidth={3} />}
                        {busy && a === 0 ? "…" : action.label}
                      </span>
                    ))}
                    {alert.link && <span style={{ display: "inline-flex", height: 28, alignItems: "center", padding: "0 8px", fontSize: 12, fontWeight: 500, color: "#36E8C8" }}>{alert.link.label} →</span>}
                    {alert.snoozable && <span style={{ marginLeft: "auto", display: "inline-flex", height: 28, alignItems: "center", padding: "0 8px", fontSize: 12, color: WHITE(0.55) }}>{alert.severity === "good" || alert.severity === "info" ? "Compris" : "Plus tard"}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      );
    } else {
      const typing = t >= P.typeChat && t < P.sendChat;
      const typed = typing ? CHAT_QUESTION.slice(0, Math.min(CHAT_QUESTION.length, 1 + Math.floor((t - P.typeChat) / TYPE_STEP))) : "";
      const sent = t >= P.sendChat;
      const words = CHAT_ANSWER.split(" ");
      const shownWords = t < P.answerFrom ? 0 : Math.min(words.length, Math.ceil(((t - P.answerFrom) / (P.answerTo - P.answerFrom)) * words.length));
      const answering = sent && shownWords < words.length;
      const caret = Math.floor(t * 2) % 2 === 0;
      panel = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sent && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", ...islLine(t, P.sendChat) }}>
                <p style={{ margin: 0, maxWidth: "85%", borderRadius: 16, borderBottomRightRadius: 6, background: "#36E8C8", padding: "6px 12px", fontSize: 13.5, lineHeight: "19.6px", color: "#04261A" }}>{CHAT_QUESTION}</p>
              </div>
              <div style={{ position: "relative", borderRadius: 16, borderTopLeftRadius: 6, background: WHITE(0.07), padding: "8px 12px", fontSize: 13.5, lineHeight: "20.25px", color: WHITE(0.9), ...islLine(t, P.sendChat + 0.05) }}>
                {shownWords > 0 && (
                  <>
                    <span style={{ position: "absolute", top: 6, right: 10, fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: WHITE(0.45) }}>exemple</span>
                    <p style={{ margin: 0, paddingRight: 56 }}>{words.slice(0, shownWords).join(" ")}</p>
                  </>
                )}
                {shownWords === 0 && (
                  <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, lineHeight: "18.75px", color: WHITE(0.6) }}>
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      {[0, 1, 2].map((k) => (
                        <span key={k} style={{ width: 6, height: 6, borderRadius: 3, background: "#36E8C8", opacity: 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((t - k * 0.15) * Math.PI * 2)) }} />
                      ))}
                    </span>
                    Je réfléchis…
                  </p>
                )}
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, borderRadius: 16, background: WHITE(0.07), padding: "4px 4px 4px 12px", boxShadow: typing ? "inset 0 0 0 1px rgba(54,232,200,.6)" : undefined }}>
            <div style={{ minHeight: 36, flex: 1, display: "flex", alignItems: "center", fontSize: 14, lineHeight: "20px", color: typed ? "#fff" : WHITE(0.4) }}>
              {typed || (sent ? "Une autre question ?" : CHAT_PLACEHOLDER)}
              {typing && caret && <span style={{ display: "inline-block", width: 1.5, height: 17, marginLeft: 1, background: "#36E8C8" }} />}
            </div>
            {answering ? (
              <span style={{ marginBottom: 2, height: 32, display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "0 12px", background: WHITE(0.1), fontSize: 12.5, fontWeight: 500 }}>Arrêter</span>
            ) : (
              <span style={{ marginBottom: 2, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: "#36E8C8", color: "#04261A", opacity: typed ? 1 : 0.3 }}>
                <ArrowUp size={16} />
              </span>
            )}
          </div>
          {!sent && !typing && (
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CHAT_SUGGESTIONS.map((s, i) => (
                  <span key={s} style={{ borderRadius: 999, border: `1px solid ${WHITE(0.12)}`, background: WHITE(0.04), padding: "6px 12px", fontSize: 12.5, lineHeight: "18.75px", color: WHITE(0.8), ...islLine(t, P.chatTab + 0.08 + i * 0.03) }}>
                    {s}
                  </span>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", padding: "0 2px", fontSize: 11.5, lineHeight: "16.7px", color: WHITE(0.45 + 0.4 * halo(t, P.chatTab + 0.35, 0.9)) }}>{CHAT_FOOTNOTE}</p>
            </div>
          )}
          {sent && !answering && t >= P.answerTo + 0.1 && (
            <span style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 6, padding: "0 4px", fontSize: 12, lineHeight: "18px", color: WHITE(0.5), ...islLine(t, P.answerTo + 0.1) }}>Nouvelle conversation</span>
          )}
        </div>
      );
    }
    body = (
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 34 }}>
          {robot(34)}
          <div style={{ display: "flex", minWidth: 0, flex: 1, alignItems: "center", gap: 4 }}>
            {tabs.map((tb) => {
              const on = tb.k === tab;
              return (
                <span key={tb.k} style={{ width: tb.w, boxSizing: "border-box", display: "inline-flex", height: 32, flexShrink: 0, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: on ? "#fff" : "transparent", color: on ? "#0B0F14" : WHITE(0.7) }}>
                  {tb.icon}
                  {tb.label}
                </span>
              );
            })}
          </div>
          <span style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 16, color: WHITE(0.6) }}>
            <X size={16} />
          </span>
        </div>
        <div style={{ marginTop: 10 }}>{panel}</div>
      </div>
    );
  }

  return (
    <Capsule left={ISLAND_X - width / 2} top={ISLAND_Y} width={width} height={height} tones={tones} t={t} opacity={ramp(t, P.logicielShow, 0.2)} scale={animate(t, [{ t: -1, v: 0.6 }, { t: P.logicielShow, v: 1 }])}>
      <div style={{ width, ...islIn(t, stage.t) }}>{body}</div>
    </Capsule>
  );
}
