import type { ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { Check, Loader2, Mail, PartyPopper, ScanLine, Send, TriangleAlert } from "lucide-react";
import { BANNER } from "../../../agent/src/banner-design";
import { MONO } from "../theme";
import { contentIn, current, islandRadius, IslandShell, keyed, lineIn, popIn, ringShadow, toneAt, type Keyed, type Tone } from "../island/capsule";
import { AMBER, Chip, GLOW, islandFont, Lines, Row, WHITE, wrap } from "../island/parts";
import { ADVICE, ADVICE_TITLE, ALERT_FOCUS, ALERT_TEXT, DONE_SUB, DRUG, PATIENT_EMAIL, PIXEL_CAPTION, PREALABLES, RESULT_BADGE, RESULT_LINES, STEPS, T, type FilmAdvice } from "./data";
import { TYPE_MS, type Plan } from "./plan";

/* ==========================================================================
 * L'ÎLE DU POSTE (src/components/island/counter-island.tsx et app/(poste)/poste/ile/poste-island.tsx), image par
 * image : la capsule au repos, le survol, le scan, l'analyse qui se coche, la mise en garde, les conseils, l'e-mail
 * du bilan, la fin de la vente et sa carte de résultat, le message des clics rapides. Cotes en pixels de l'île
 * (celles des classes du site) ; textes de banner-design.ts et du vrai code (data.ts).
 * ======================================================================== */

const K = BANNER.colors;

export type PosteKind = "idle" | "peek" | "scan" | "analyzing" | "alert" | "advice" | "email" | "emailSent" | "done" | "grumpy";
export type PosteState = { kind: PosteKind; lines?: number };

// ---- Les cotes ------------------------------------------------------------------------------------------------

const ALERT_TEXT_W = 460 - 28 - 24;
export const ALERT_LINES = wrap(ALERT_TEXT, 13, ALERT_TEXT_W);
const CARD_H = 10 + 63.5 + 8 + 32 + 10;

export function posteSize(s: PosteState): { w: number; h: number } {
  switch (s.kind) {
    case "idle":
      return { w: 244, h: 44 };
    case "peek":
      return { w: 440, h: 12 + 38 + 12 + 54.75 + 14 };
    case "scan":
      return { w: 340, h: 58 };
    case "analyzing": {
      const n = s.lines ?? 1;
      return { w: 420, h: 12 + 38 + 10 + 20 + 20 * n + 4 * (n - 1) + 14 };
    }
    case "alert":
      return { w: 460, h: 12 + 38 + 10 + 20 + 20 * ALERT_LINES.length + 10 + 32 + 14 };
    case "advice":
      return { w: 560, h: 12 + 38 + 10 + CARD_H * 2 + 8 + 10 + 36 + 12 };
    case "email":
      return { w: 460, h: 12 + 38 + 12 + 40 + 14 };
    case "emailSent":
    case "done":
      return { w: s.kind === "done" ? 420 : 360, h: 58 };
    case "grumpy":
      return { w: 380, h: 58 };
  }
}

const TONE: Record<PosteKind, Tone> = { idle: "neutral", peek: "neutral", scan: "accent", analyzing: "accent", alert: "warning", advice: "neutral", email: "neutral", emailSent: "success", done: "success", grumpy: "neutral" };
const ROBOT: Record<PosteKind, number> = { idle: 32, peek: 34, scan: 36, analyzing: 36, alert: 36, advice: 34, email: 34, emailSent: 36, done: 40, grumpy: 34 };

/** Où cliquer dans l'île (pixels de l'île, depuis son coin haut gauche). */
export const POSTE_TARGET = {
  // Le bout du pointeur sur le bas du robot : son visage reste visible quand on le tapote.
  robotIdle: { x: 35, y: 35 },
  robotPeek: { x: 44, y: 44 },
  compris: { x: 460 - 14 - 38, y: posteSize({ kind: "alert" }).h - 14 - 16 },
  sold: { x: 22 + 127.5, y: 60 + 10 + 63.5 + 8 + 16 },
  notSold: { x: 283 + 127.5, y: 60 + CARD_H + 8 + 10 + 63.5 + 8 + 16 },
  addEmail: { x: 12 + 132, y: posteSize({ kind: "advice" }).h - 12 - 18 },
  finish: { x: 284 + 132, y: posteSize({ kind: "advice" }).h - 12 - 18 },
  send: { x: 446 - 48, y: 12 + 38 + 12 + 20 },
  input: { x: 120, y: 12 + 38 + 12 + 20 },
};

/** Les états de l'île du poste au fil du film. */
export function posteKeys(p: Plan): Keyed<PosteState>[] {
  return [
    { at: 0, state: { kind: "idle" } },
    { at: p.peek, state: { kind: "peek" } },
    { at: p.fold, state: { kind: "idle" } },
    { at: p.scan, state: { kind: "scan" } },
    ...p.checks.map((c, k) => ({ at: k === 0 ? p.analyzing : p.checks[k - 1] + 0.02, state: { kind: "analyzing" as const, lines: k + 1 } })),
    { at: p.alert, state: { kind: "alert" } },
    { at: p.advice, state: { kind: "advice" } },
    { at: p.addEmail, state: { kind: "email" } },
    { at: p.emailSent, state: { kind: "emailSent" } },
    { at: p.backToAdvice, state: { kind: "advice" } },
    { at: p.finish, state: { kind: "done" } },
    { at: p.settle, state: { kind: "idle" } },
    { at: p.grumpy, state: { kind: "grumpy" } },
    { at: p.grumpyEnd, state: { kind: "idle" } },
  ];
}

/** Le contenu qui se fond à chaque changement (le `contentKey` du site) : l'analyse qui s'allonge ne refait pas son entrée. */
const contentId = (s: PosteState) => s.kind;

export type PosteCtx = {
  t: number;
  plan: Plan;
  /** Le robot à cette taille (null : il est parti en vol). */
  robot: (size: number) => ReactNode;
};

// ---- Les écrans ------------------------------------------------------------------------------------------------

function Spinner({ size, t, color = WHITE(0.6) }: { size: number; t: number; color?: string }) {
  return <Loader2 size={size} color={color} style={{ transform: `rotate(${((t / 0.9) % 1) * 360}deg)`, flexShrink: 0 }} />;
}

function Idle({ c, dot = true }: { c: PosteCtx; dot?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 16px 0 6px" }}>
      <span style={{ width: 32, flexShrink: 0 }}>{c.robot(32)}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: WHITE(0.8), whiteSpace: "nowrap" }}>{T.idle}</span>
      {dot && <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: K.accent, boxShadow: `0 0 8px ${K.accent}` }} />}
    </div>
  );
}

function Peek({ c, local }: { c: PosteCtx; local: number }) {
  return (
    <div style={{ padding: "12px 14px 14px" }}>
      <Row robot={c.robot(34)} title={T.idle} sub="Je surveille le comptoir. Scannez une boîte pour commencer." compact />
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ borderRadius: 16, background: WHITE(0.06), padding: "8px 10px", ...popIn(local, 0.22) }}>
          <div style={{ fontSize: 10.5, lineHeight: "15.75px", fontWeight: 500, letterSpacing: "0.04em", color: WHITE(0.55), textTransform: "uppercase" }}>Comptoir 2</div>
          <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, fontSize: 14, lineHeight: "21px", fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: K.accent }} />
            Connecté
          </div>
        </div>
      </div>
    </div>
  );
}

function Scan({ c }: { c: PosteCtx }) {
  const x = ((c.t / 1.1) % 1) * 4.4 - 1.2;
  return (
    <div style={{ position: "relative", height: 58 }}>
      <Row robot={c.robot(36)} title={T.scanTitle} sub={T.scanSub} icon={<ScanLine size={16} color={K.glow} />} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, overflow: "hidden" }}>
        <div style={{ width: "33%", height: "100%", transform: `translateX(${x * 100}%)`, background: `linear-gradient(90deg, transparent, ${K.glow}, transparent)` }} />
      </div>
    </div>
  );
}

function Analyzing({ c }: { c: PosteCtx }) {
  const { t, plan } = c;
  const done = plan.checks.filter((at) => t >= at).length;
  const shown = Math.min(STEPS.length, done + 1);
  return (
    <div style={{ padding: "12px 14px 14px" }}>
      <Row robot={c.robot(36)} title={T.scanSub} sub={DRUG} compact />
      <div style={{ marginTop: 10, borderRadius: 16, background: WHITE(0.05), padding: "10px 12px", fontFamily: MONO, fontSize: 12, lineHeight: "20px" }}>
        {STEPS.slice(0, shown).map((step, i) => {
          const ok = t >= plan.checks[i];
          const appear = i === 0 ? plan.analyzing : plan.checks[i - 1];
          return (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: i ? 4 : 0, ...lineIn(t - appear) }}>
              {ok ? (
                <span style={{ display: "inline-flex", ...popIn(t - plan.checks[i]) }}>
                  <Check size={14} color={K.accent} strokeWidth={3} />
                </span>
              ) : (
                <Spinner size={14} t={t} />
              )}
              <span style={{ color: ok ? WHITE(0.85) : WHITE(0.6), whiteSpace: "nowrap" }}>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** La mise en garde : le texte réel, et une lueur ambre qui balaie seulement « à distance de l'antibiotique, au moins 2 heures ». */
function Alert({ c, local }: { c: PosteCtx; local: number }) {
  const start = ALERT_TEXT.indexOf(ALERT_FOCUS);
  const end = start + ALERT_FOCUS.length;
  const sweep = Math.max(0, Math.min(1, (local - 1.0) / 0.9));
  let offset = 0;
  return (
    <div style={{ padding: "12px 14px 14px" }}>
      <Row robot={c.robot(36)} title={T.readFirst} sub={T.duringSale} compact icon={<TriangleAlert size={16} color={AMBER} />} />
      <div style={{ marginTop: 10, borderRadius: 16, padding: "10px 12px", background: "rgba(245,166,35,0.12)", color: "#FFE2B0" }}>
        <Lines
          lines={ALERT_LINES}
          size={13}
          lineHeight={20}
          render={(text, i) => {
            const from = offset;
            offset += text.length + 1;
            const a = Math.max(start, from);
            const b = Math.min(end, from + text.length);
            if (b <= a) return text;
            const pieces = [text.slice(0, a - from), text.slice(a - from, b - from), text.slice(b - from)];
            // Le balayage avance le long du passage, ligne après ligne.
            const before = Math.max(0, a - start) / ALERT_FOCUS.length;
            const span = (b - a) / ALERT_FOCUS.length;
            const k = Math.max(0, Math.min(1, (sweep - before) / Math.max(0.01, span)));
            return (
              <span key={i}>
                {pieces[0]}
                <span style={{ position: "relative", color: k > 0 ? "#FFF4DE" : undefined, fontWeight: k > 0.5 ? 600 : 400 }}>
                  <span style={{ position: "absolute", left: -2, top: 1, bottom: 1, width: `calc(${k * 100}% + ${4 * k}px)`, opacity: k > 0 ? 1 : 0, borderRadius: 5, background: "linear-gradient(90deg, rgba(245,166,35,.42), rgba(245,166,35,.28))", boxShadow: k > 0 ? "0 0 14px rgba(245,166,35,.45)" : undefined }} />
                  <span style={{ position: "relative" }}>{pieces[1]}</span>
                </span>
                {pieces[2]}
              </span>
            );
          }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <div style={{ height: 32, padding: "0 12px", borderRadius: 8, background: c.t >= c.plan.compris - 0.08 ? WHITE(0.16) : WHITE(0.08), display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: WHITE(0.9) }}>Compris</div>
      </div>
    </div>
  );
}

function AdviceCard({ item, outcome, at, t, local, index }: { item: FilmAdvice; outcome: "SOLD" | "NOT_SOLD" | null; at: number; t: number; local: number; index: number }) {
  const pressed = (when: number) => t >= when - 0.08 && t < when + 0.05;
  return (
    <div style={{ borderRadius: 16, padding: 10, background: K.panel, color: K.ink, ...lineIn(local, 0.04 * index) }}>
      <div style={{ display: "flex", gap: 10 }}>
        <Img src={staticFile(item.image)} style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 12, background: "#fff", objectFit: "contain" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 13.5, lineHeight: "20px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
            <div style={{ fontSize: 13, lineHeight: "20px", fontWeight: 700, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{item.price}</div>
          </div>
          <div style={{ fontSize: 12, lineHeight: "17px", color: K.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.reason}</div>
          <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
            {item.challenge && <Chip bg={K.challengeBg} fg={K.challengeFg}>★ {T.challenge}</Chip>}
            {item.shortDate && <Chip bg={K.dateBg} fg={K.dateFg}>{T.shortDate} {item.shortDate}</Chip>}
            <Chip bg={K.stockBg} fg={K.stockFg}>{T.inStock} · {item.quantity}</Chip>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, height: 32 }}>
        {outcome ? (
          <>
            <span style={{ flex: 1, height: 32, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12.5, fontWeight: 700, ...(outcome === "SOLD" ? { background: K.soldBg, color: K.soldFg } : { background: K.notSoldBg, color: K.notSoldFg }), ...popIn(t - at) }}>
              {outcome === "SOLD" && <Check size={14} strokeWidth={3} />}
              {outcome === "SOLD" ? T.sold : T.notSold}
            </span>
            <span style={{ height: 32, padding: "0 10px", display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: K.inkSoft }}>{T.change}</span>
          </>
        ) : (
          <>
            <span style={{ flex: 1, height: 32, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, background: K.soldBg, color: K.soldFg, filter: index === 0 && pressed(at) ? "brightness(1.08)" : undefined }}>{T.sold}</span>
            <span style={{ flex: 1, height: 32, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, background: K.notSoldBg, color: K.notSoldFg, filter: index === 1 && pressed(at) ? "brightness(.95)" : undefined }}>{T.notSold}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Advice({ c, local }: { c: PosteCtx; local: number }) {
  const { t, plan } = c;
  const outcomes: ("SOLD" | "NOT_SOLD" | null)[] = [t >= plan.sold ? "SOLD" : null, t >= plan.notSold ? "NOT_SOLD" : null];
  const all = outcomes.every(Boolean);
  const btn = (pressAt: number) => (t >= pressAt - 0.08 && t < pressAt + 0.06 ? 0.16 : 0.08);
  return (
    <div style={{ padding: 12 }}>
      <Row robot={c.robot(34)} title={ADVICE_TITLE} sub={all ? T.allDone : `${T.forDrug}${DRUG}`} compact />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {ADVICE.map((item, i) => (
          <AdviceCard key={item.name} item={item} outcome={outcomes[i]} at={i === 0 ? plan.sold : plan.notSold} t={t} local={local} index={i} />
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <div style={{ flex: 1, height: 36, borderRadius: 12, background: WHITE(btn(plan.addEmail)), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: WHITE(0.9) }}>
          <Mail size={14} /> {T.emailAdd}
        </div>
        <div style={{ flex: 1, height: 36, borderRadius: 12, background: K.accent, filter: t >= plan.finish - 0.08 && t < plan.finish + 0.06 ? "brightness(1.12)" : undefined, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#04261A" }}>
          <Check size={14} strokeWidth={3} /> {T.finish}
        </div>
      </div>
    </div>
  );
}

function Email({ c }: { c: PosteCtx }) {
  const { t, plan } = c;
  const typed = PATIENT_EMAIL.slice(0, Math.max(0, Math.min(PATIENT_EMAIL.length, Math.floor((t - plan.typeStart) / TYPE_MS) + 1)));
  const focused = t >= plan.typeStart - 0.25;
  const caret = focused && Math.floor(t / 0.53) % 2 === 0;
  return (
    <div style={{ padding: "12px 14px 14px" }}>
      <Row robot={c.robot(34)} title="Bilan conseil par e-mail" sub="Le patient reçoit ses conseils et vos coordonnées." compact />
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 12, border: `1px solid ${focused ? GLOW : WHITE(0.1)}`, background: WHITE(0.06), padding: "0 12px", boxSizing: "border-box", display: "flex", alignItems: "center", fontSize: 13.5 }}>
          {t >= plan.typeStart ? <span style={{ color: "#fff" }}>{typed}</span> : <span style={{ color: WHITE(0.35) }}>patient@exemple.fr</span>}
          {caret && <span style={{ width: 1.5, height: 17, background: "#fff", marginLeft: 1 }} />}
        </div>
        <div style={{ height: 40, padding: "0 14px", borderRadius: 12, background: K.accent, filter: t >= plan.send - 0.08 ? "brightness(1.12)" : undefined, display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#04261A" }}>
          <Send size={14} /> Envoyer
        </div>
      </div>
    </div>
  );
}

function EmailSent({ c, local }: { c: PosteCtx; local: number }) {
  return (
    <Row
      robot={c.robot(36)}
      title="E-mail envoyé"
      sub={PATIENT_EMAIL}
      trailing={
        <span style={{ width: 28, height: 28, borderRadius: 14, background: K.accent, display: "flex", alignItems: "center", justifyContent: "center", ...popIn(local, 0.12) }}>
          <Check size={16} color="#04261A" strokeWidth={3} />
        </span>
      }
    />
  );
}

function Done({ c, local }: { c: PosteCtx; local: number }) {
  // L'icône de fête saute (isl-pop), puis rebondit en mesure avec la danse.
  const hop = local > 0.5 && local < 2.8 ? Math.abs(Math.sin(((local - 0.5) * 112 * Math.PI) / 60)) * -3 : 0;
  return (
    <Row
      robot={c.robot(40)}
      title={T.doneTitle}
      sub={DONE_SUB}
      trailing={
        <span style={{ display: "inline-flex", transform: `translateY(${hop}px)`, ...popIn(local, 0.1) }}>
          <PartyPopper size={20} color={K.challengeIcon} />
        </span>
      }
    />
  );
}

function Grumpy({ c }: { c: PosteCtx }) {
  return <Row robot={c.robot(34)} title={PREALABLES.tapsTitle} sub={PREALABLES.tapsSub} />;
}

function content(s: PosteState, c: PosteCtx, local: number): ReactNode {
  switch (s.kind) {
    case "idle":
      return <Idle c={c} />;
    case "peek":
      return <Peek c={c} local={local} />;
    case "scan":
      return <Scan c={c} />;
    case "analyzing":
      return <Analyzing c={c} />;
    case "alert":
      return <Alert c={c} local={local} />;
    case "advice":
      return <Advice c={c} local={local} />;
    case "email":
      return <Email c={c} />;
    case "emailSent":
      return <EmailSent c={c} local={local} />;
    case "done":
      return <Done c={c} local={local} />;
    case "grumpy":
      return <Grumpy c={c} />;
  }
}

/** Le début du contenu en cours (le dernier changement de `contentKey`). */
function contentStart(keys: Keyed<PosteState>[], index: number): number {
  // L'image 0 est déjà la capsule au repos, contenu compris (l'image que le fil d'Instagram montre avant la lecture).
  if (index === 0) return -10;
  let i = index;
  while (i > 0 && contentId(keys[i - 1].state) === contentId(keys[index].state) && keys[i - 1].state.kind === "analyzing") i--;
  return keys[i].at;
}

export type IslandPlace = { cx: number; top: number; zoom: number };

/** La taille de l'île du poste à l'instant t (pour poser les sous-titres dessous). */
export function posteBox(keys: Keyed<PosteState>[], t: number) {
  const w = keyed(keys, t, (s) => posteSize(s).w);
  const h = keyed(keys, t, (s) => posteSize(s).h);
  return { w, h };
}

/** La carte « Résultat de la vente », sous l'île (poste-island.tsx) : une deuxième capsule, liseré vert. */
const RESULT_H = 10 + 18 * 3 + 2 * 2 + 10;

export function resultHeight(t: number, plan: Plan): number {
  if (t < plan.resultCard || t >= plan.settle + 0.3) return 0;
  return 8 + RESULT_H;
}

export function PosteIsland({ keys, c, place }: { keys: Keyed<PosteState>[]; c: PosteCtx; place: IslandPlace }) {
  const { t, plan } = c;
  const { index, key } = current(keys, t);
  const { w, h } = posteBox(keys, t);
  const radius = islandRadius(keys, t, (s) => posteSize(s).h, w, h);
  const tone = toneAt(keys, t, (s) => TONE[s.kind]);
  const start = contentStart(keys, index);
  const local = t - start;
  // La carte de résultat : elle entre en pop sous l'île, puis s'efface quand l'île se replie.
  const resultIn = t >= plan.resultCard ? Math.min(1, (t - plan.resultCard) / 0.42) : 0;
  const resultOut = t >= plan.settle ? Math.min(1, (t - plan.settle) / 0.25) : 0;
  const resultW = 420;
  return (
    <>
      <IslandShell cx={place.cx} top={place.top} zoom={place.zoom} width={w} height={h} radius={radius} shadow={ringShadow(tone.from, tone.to, tone.p)} style={islandFont}>
        <div style={{ position: "absolute", left: 0, top: 0, width: posteSize(key.state).w, ...contentIn(local) }}>{content(key.state, c, local)}</div>
      </IslandShell>
      {resultIn > 0 && resultOut < 1 && (
        <div style={{ position: "absolute", left: place.cx - resultW / 2, top: place.top + (h + 8) * place.zoom, width: resultW, transform: `scale(${place.zoom})`, transformOrigin: "50% 0", opacity: 1 - resultOut, ...islandFont }}>
          <div style={{ borderRadius: 28, background: "#0B0F14", boxShadow: ringShadow("success", "success", 1), color: "#fff", ...popIn(t - plan.resultCard) }}>
            <div style={{ padding: "10px 16px", fontSize: 12.5, lineHeight: "18px", color: WHITE(0.8) }}>
              {RESULT_LINES.map((l) => (
                <div key={l} style={{ marginBottom: 2 }}>{l}</div>
              ))}
              <div style={{ fontWeight: 600, color: K.challengeIcon, transformOrigin: "0 50%", ...popIn(t - plan.badge) }}>★ {RESULT_BADGE}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** La légende sous la capsule pendant la machine à sous des robots de comptoir (« Nova · Comptoir 3 »…). */
export function lookCaption(t: number, plan: Plan, others: { caption: string }[]): { text: string; opacity: number; at: number } | null {
  if (t < plan.slots[0] - 0.05 || t > plan.captionOut + 0.25) return null;
  const k = plan.slots.filter((s) => t >= s).length;
  const text = t >= plan.pixelBack ? PIXEL_CAPTION : others[Math.max(0, k - 1)].caption;
  const at = t >= plan.pixelBack ? plan.pixelBack : plan.slots[Math.max(0, k - 1)];
  const opacity = Math.min(1, (t - plan.slots[0] + 0.05) / 0.15) * (t > plan.captionOut ? Math.max(0, 1 - (t - plan.captionOut) / 0.25) : 1);
  return { text, opacity, at };
}
