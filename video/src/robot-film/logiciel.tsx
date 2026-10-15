import type { ReactNode } from "react";
import { ArrowUp, Check, FileUp, Home, Loader2, MessageCircle, Plus, RotateCcw, X } from "lucide-react";
import { textWidth } from "../ui/banner";
import { contentIn, current, islandRadius, IslandShell, keyed, lineIn, popIn, ringShadow, toneAt, type Keyed, type Tone } from "../island/capsule";
import { GLOW, GREEN, islandFont, Lines, WHITE, wrap } from "../island/parts";
import { APP_ALERTS, CHAT_ANSWER, CHAT_FOOTNOTE, CHAT_PLACEHOLDER, CHAT_QUESTION, CHAT_SUGGESTIONS, HOME_AFTER, HOME_BEFORE, STOCK_DONE, STOCK_FILE, STOCK_STATS } from "./data";
import { TYPE_MS, type Plan } from "./plan";

/* ==========================================================================
 * L'ÎLE DU LOGICIEL (src/components/island/platform-island.tsx et app-island.tsx), image par image : la capsule
 * fermée (le robot, « 13 délivrances aujourd'hui », la pastille du nombre d'alertes), l'Accueil (pastilles, alertes
 * et leurs gestes), la Discussion, et « Stock » pour déposer le fichier. Lueur turquoise quand elle est ouverte,
 * jamais de vert : le vert est réservé au poste (e-mail envoyé, vente terminée).
 * ======================================================================== */

export type AppPhase = "empty" | "typing" | "pending" | "stream1" | "stream2" | "done" | "idle" | "over" | "reading" | "preview" | "sending";
export type AppState = { kind: "closed" } | { kind: "home"; accepted: boolean } | { kind: "chat"; phase: AppPhase } | { kind: "stock"; phase: AppPhase };

/** Les points de couleur : des pastilles (home.ts, IslandTone) et des alertes (alerts.ts, AlertSeverity). */
const TONE_DOT: Record<string, string> = { warning: "#F5A623", problem: "#F5A623", todo: "#36E8C8", good: "#22C88F", info: "rgba(255,255,255,0.4)" };

// ---- Les cotes ------------------------------------------------------------------------------------------------

const PANEL_Y = 10 + 32 + 10;
const PILLS_H = 8 + 15.75 + 2 + 21 + 8;
const ALERT_TEXT_W = 540 - 24 - 24 - 6 - 8;
const alertLines = APP_ALERTS.map((a) => wrap(a.text, 13, ALERT_TEXT_W));
const alertH = (i: number) => 8 + alertLines[i].length * 18.85 + 6 + 28 + 8;

const CHAT_W = 580 - 24;
/** Les suggestions, rangées comme flex-wrap (gap 6). */
const chipW = (s: string) => textWidth(s, 12.5) * 0.93 + 24 + 2;
const suggestionRows = (() => {
  const rows: string[][] = [];
  let row: string[] = [];
  let used = 0;
  for (const s of CHAT_SUGGESTIONS) {
    const w = chipW(s);
    if (row.length && used + 6 + w > CHAT_W) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += (row.length ? 6 : 0) + w;
    row.push(s);
  }
  if (row.length) rows.push(row);
  return rows;
})();
const SUGG_H = suggestionRows.length * 32.75 + (suggestionRows.length - 1) * 6;
const FOOT_LINES = wrap(CHAT_FOOTNOTE, 11.5, CHAT_W - 2);
/** La réponse, coupée pour laisser la place de l'étiquette « exemple » en haut à droite de la bulle. */
const ANSWER_LINES = wrap(CHAT_ANSWER, 13.5, CHAT_W - 24 - 78);
const USER_H = 12 + 19.6;
const INPUT_H = 44;
const STATUS_H = 16 + 18.75;
const answerH = (lines: number) => 16 + lines * 20.25;
const DROP_H = 2 + 40 + 20 + 6 + 20.25 + 6 + 2 * 18;
const PREVIEW_H = 12 + 19.5 + 8 + 19.5 + 8 + 4 + 32 + 12;

export function appSize(s: AppState): { w: number; h: number } {
  switch (s.kind) {
    case "closed":
      return { w: 236, h: 44 };
    case "home": {
      const shown = s.accepted ? [1, 2] : [0, 1, 2];
      const list = shown.reduce((sum, i, k) => sum + alertH(i) + (k ? 6 : 0), 0);
      return { w: 540, h: PANEL_Y + PILLS_H + 10 + list + 12 };
    }
    case "chat": {
      const turns = (assistant: number) => USER_H + 12 + assistant + 8;
      const body =
        s.phase === "empty" ? INPUT_H + 8 + SUGG_H + 10 + FOOT_LINES.length * 16.675
        : s.phase === "typing" ? INPUT_H
        : s.phase === "pending" ? turns(STATUS_H) + INPUT_H
        : s.phase === "stream1" ? turns(answerH(1)) + INPUT_H
        : s.phase === "stream2" ? turns(answerH(ANSWER_LINES.length)) + INPUT_H
        : turns(answerH(ANSWER_LINES.length)) + INPUT_H + 8 + 18;
      return { w: 580, h: PANEL_Y + body + 12 };
    }
    case "stock": {
      const body = s.phase === "preview" ? PREVIEW_H : s.phase === "done" ? DROP_H + 8 + 19.5 : DROP_H;
      return { w: 540, h: PANEL_Y + body + 12 };
    }
  }
}

const toneOf = (s: AppState): Tone => (s.kind === "closed" ? "neutral" : "accent");

const TABS = [
  { key: "home", label: "Accueil", Icon: Home },
  { key: "chat", label: "Discussion", Icon: MessageCircle },
  { key: "stock", label: "Stock", Icon: Plus },
] as const;
const tabW = (label: string) => Math.round(12 + 14 + 6 + textWidth(label, 12.5) * 0.93 + 12);
const tabX = (i: number) => 56 + TABS.slice(0, i).reduce((s, t) => s + tabW(t.label) + 4, 0);
const ACCEPT_W = Math.round(10 + 14 + 4 + textWidth("Accepter", 12) * 0.93 + 10);
const CANCEL_W = Math.round(12 + textWidth("Annuler", 12.5) * 0.93 + 12);

/** Où cliquer (pixels de l'île, depuis son coin haut gauche). */
export const APP_TARGET = {
  robotClosed: { x: 22, y: 22 },
  tab: (key: "home" | "chat" | "stock") => {
    const i = TABS.findIndex((t) => t.key === key);
    return { x: tabX(i) + tabW(TABS[i].label) / 2, y: 26 };
  },
  accept: { x: 38 + ACCEPT_W / 2, y: PANEL_Y + PILLS_H + 10 + 8 + alertLines[0].length * 18.85 + 6 + 14 },
  input: { x: 60, y: PANEL_Y + 22 },
  drop: { x: 270, y: PANEL_Y + DROP_H / 2 },
  sendStock: { x: 24 + (492 - 8 - CANCEL_W) / 2, y: PANEL_Y + 12 + 19.5 + 8 + 19.5 + 8 + 4 + 16 },
};

/** Le premier mot de la deuxième ligne de la réponse : l'île s'allonge quand il s'écrit. */
const ANSWER_WORDS = CHAT_ANSWER.split(" ");
const LINE2_WORD = ANSWER_LINES.length > 1 ? ANSWER_LINES[0].split(" ").length : ANSWER_WORDS.length;
const wordAt = (p: Plan, i: number) => p.answerStart + (i / ANSWER_WORDS.length) * (p.answerEnd - p.answerStart);

/** Les états de l'île du logiciel. */
export function appKeys(p: Plan): Keyed<AppState>[] {
  return [
    { at: 0, state: { kind: "closed" } },
    { at: p.autoOpen, state: { kind: "home", accepted: false } },
    { at: p.accepted, state: { kind: "home", accepted: true } },
    { at: p.chatTab, state: { kind: "chat", phase: "empty" } },
    { at: p.typeQ, state: { kind: "chat", phase: "typing" } },
    { at: p.sendQ, state: { kind: "chat", phase: "pending" } },
    { at: p.answerStart, state: { kind: "chat", phase: "stream1" } },
    ...(ANSWER_LINES.length > 1 ? [{ at: wordAt(p, LINE2_WORD), state: { kind: "chat" as const, phase: "stream2" as const } }] : []),
    { at: p.answerEnd + 0.05, state: { kind: "chat", phase: "done" } },
    { at: p.stockTab, state: { kind: "stock", phase: "idle" } },
    { at: p.overZone, state: { kind: "stock", phase: "over" } },
    { at: p.drop, state: { kind: "stock", phase: "reading" } },
    { at: p.preview, state: { kind: "stock", phase: "preview" } },
    { at: p.sendStock, state: { kind: "stock", phase: "sending" } },
    { at: p.stockDone, state: { kind: "stock", phase: "done" } },
    { at: p.closeApp, state: { kind: "closed" } },
  ];
}

export type AppCtx = { t: number; plan: Plan; robot: (size: number) => ReactNode };

// ---- Les écrans ------------------------------------------------------------------------------------------------

function Spin({ size, t, color }: { size: number; t: number; color: string }) {
  return <Loader2 size={size} color={color} style={{ transform: `rotate(${((t / 0.9) % 1) * 360}deg)` }} />;
}

function Closed({ c, count }: { c: AppCtx; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 14px 0 6px" }}>
      <span style={{ position: "relative", width: 32, flexShrink: 0 }}>
        {c.robot(32)}
        <span style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, padding: "0 4px", boxSizing: "border-box", borderRadius: 8, background: GLOW, color: "#04261A", fontSize: 10, lineHeight: "16px", fontWeight: 700, textAlign: "center", boxShadow: "0 0 0 2px #0B0F14" }}>{count}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: WHITE(0.8), whiteSpace: "nowrap" }}>{HOME_AFTER.headline}</span>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: GLOW, boxShadow: `0 0 8px ${GLOW}`, flexShrink: 0 }} />
    </div>
  );
}

function Header({ c, tab, w }: { c: AppCtx; tab: "home" | "chat" | "stock"; w: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 32 }}>
      <span style={{ width: 34, flexShrink: 0 }}>{c.robot(34)}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <div key={t.key} style={{ width: tabW(t.label), height: 32, boxSizing: "border-box", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", background: on ? "#fff" : "transparent", color: on ? "#0B0F14" : WHITE(0.7) }}>
              <t.Icon size={14} />
              {t.label}
            </div>
          );
        })}
      </div>
      <span style={{ width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE(0.6), marginLeft: w > 0 ? 0 : 0 }}>
        <X size={16} />
      </span>
    </div>
  );
}

/** Un chiffre qui roule (le compteur du jour) : l'ancien monte, le nouveau arrive d'en dessous. */
function Roll({ from, to, at, t }: { from: string; to: string; at: number; t: number }) {
  const k = Math.max(0, Math.min(1, (t - at) / 0.32));
  const e = 1 - Math.pow(1 - k, 3);
  if (from === to || k >= 1) return <span>{to}</span>;
  return (
    <span style={{ position: "relative", display: "inline-block", overflow: "hidden", height: 21, verticalAlign: "top" }}>
      <span style={{ display: "block", transform: `translateY(${-e * 21}px)` }}>{from}</span>
      <span style={{ position: "absolute", left: 0, top: 0, transform: `translateY(${(1 - e) * 21}px)` }}>{to}</span>
    </span>
  );
}

function HomePanel({ c, local, accepted }: { c: AppCtx; local: number; accepted: boolean }) {
  const { t, plan } = c;
  const before = HOME_BEFORE.pills[0].value.match(/\d+/g) ?? [];
  const after = HOME_AFTER.pills[0].value.match(/\d+/g) ?? [];
  const busy = t >= plan.accept && !accepted;
  const shown = accepted ? [1, 2] : [0, 1, 2];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {HOME_AFTER.pills.map((pill, i) => (
          <div key={pill.key} style={{ minWidth: 0, borderRadius: 16, background: WHITE(0.06), padding: "8px 10px", ...lineIn(local, 0.03 * i) }}>
            <div style={{ fontSize: 10.5, lineHeight: "15.75px", fontWeight: 500, letterSpacing: "0.04em", color: WHITE(0.55), textTransform: "uppercase", whiteSpace: "nowrap" }}>{pill.label}</div>
            <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, fontSize: 14, lineHeight: "21px", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {pill.tone && <span style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: TONE_DOT[pill.tone] }} />}
              {pill.key === "jour" ? (
                <span>
                  <Roll from={before[0] ?? ""} to={after[0] ?? ""} at={plan.roll} t={t} />
                  {" conseils · "}
                  <Roll from={before[1] ?? ""} to={after[1] ?? ""} at={plan.roll + 0.12} t={t} />
                  {" ventes"}
                </span>
              ) : (
                pill.value
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((i, k) => {
          const a = APP_ALERTS[i];
          return (
            <div key={a.key} style={{ borderRadius: 16, background: WHITE(0.06), padding: "8px 12px", ...lineIn(local, 0.12 + 0.05 * k) }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ marginTop: 7, width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: TONE_DOT[a.severity] }} />
                <Lines lines={alertLines[i]} size={13} lineHeight={18.85} style={{ color: WHITE(0.9) }} />
              </div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, paddingLeft: 14, height: 28 }}>
                {a.actions.map((action, j) => (
                  <span key={action.kind} style={{ height: 28, padding: "0 10px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", ...(j === 0 ? { background: GLOW, color: "#04261A", width: ACCEPT_W, boxSizing: "border-box", filter: t >= plan.accept - 0.08 && t < plan.accept + 0.06 ? "brightness(1.1)" : undefined } : { background: WHITE(0.1), color: "#fff" }), opacity: busy ? 0.6 : 1 }}>
                    {j === 0 && <Check size={14} strokeWidth={3} />}
                    {busy && j === 0 ? "…" : action.label}
                  </span>
                ))}
                {a.link && <span style={{ height: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 500, color: GLOW, whiteSpace: "nowrap" }}>{a.link.label} →</span>}
                {a.snoozable && <span style={{ marginLeft: "auto", height: 28, padding: "0 8px", display: "inline-flex", alignItems: "center", fontSize: 12, color: WHITE(0.55), whiteSpace: "nowrap" }}>{a.severity === "good" || a.severity === "info" ? "Compris" : "Plus tard"}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatPanel({ c, phase }: { c: AppCtx; phase: AppPhase }) {
  const { t, plan } = c;
  const typed = CHAT_QUESTION.slice(0, Math.max(0, Math.min(CHAT_QUESTION.length, Math.floor((t - plan.typeQ) / TYPE_MS) + 1)));
  const sent = phase === "pending" || phase === "stream1" || phase === "stream2" || phase === "done";
  const pending = phase === "pending" || phase === "stream1" || phase === "stream2";
  const words = ANSWER_WORDS.filter((_, i) => t >= wordAt(plan, i)).length;
  const caret = phase === "typing" && Math.floor(t / 0.53) % 2 === 0;
  let used = 0;
  const lines = ANSWER_LINES.map((line) => {
    const n = line.split(" ").length;
    const visible = Math.max(0, Math.min(n, words - used));
    used += n;
    return line.split(" ").slice(0, visible).join(" ");
  }).filter((l, i) => i === 0 || l.length > 0);
  const dot = (d: number) => 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(((t - d) / 1) * 2 * Math.PI));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", ...popIn(t - plan.sendQ) }}>
            <div style={{ maxWidth: "85%", borderRadius: 16, borderBottomRightRadius: 6, background: GLOW, color: "#04261A", padding: "6px 12px", fontSize: 13.5, lineHeight: "19.6px" }}>{CHAT_QUESTION}</div>
          </div>
          <div style={{ position: "relative", borderRadius: 16, borderTopLeftRadius: 6, background: WHITE(0.07), color: WHITE(0.9), padding: "8px 12px", fontSize: 13.5, lineHeight: "20.25px", ...lineIn(t - plan.sendQ, 0.05) }}>
            {phase === "pending" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, lineHeight: "18.75px", color: WHITE(0.6) }}>
                <span style={{ display: "inline-flex", gap: 2 }}>
                  {[0, 0.15, 0.3].map((d) => (
                    <span key={d} style={{ width: 6, height: 6, borderRadius: 3, background: GLOW, opacity: dot(d) }} />
                  ))}
                </span>
                Je réfléchis…
              </div>
            ) : (
              lines.map((l, i) => (
                <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>
              ))
            )}
            {phase !== "pending" && <span style={{ position: "absolute", top: 7, right: 9, borderRadius: 999, padding: "1px 7px", border: `1px solid ${WHITE(0.2)}`, fontSize: 10, lineHeight: "14px", fontWeight: 600, letterSpacing: "0.04em", color: WHITE(0.6), textTransform: "uppercase" }}>exemple</span>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: INPUT_H, boxSizing: "border-box", borderRadius: 16, background: WHITE(0.07), padding: "4px 4px 4px 12px", boxShadow: phase === "typing" || phase === "empty" ? `0 0 0 1px rgba(54,232,200,0.6)` : undefined }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", fontSize: 14, lineHeight: "20px", whiteSpace: "nowrap" }}>
          {phase === "typing" ? <span style={{ color: "#fff" }}>{typed}</span> : <span style={{ color: WHITE(0.4) }}>{sent ? "Une autre question ?" : CHAT_PLACEHOLDER}</span>}
          {caret && <span style={{ width: 1.5, height: 18, background: "#fff", marginLeft: 1 }} />}
        </div>
        {pending ? (
          <div style={{ height: 32, padding: "0 12px", borderRadius: 12, background: WHITE(0.1), display: "flex", alignItems: "center", fontSize: 12.5, fontWeight: 500 }}>Arrêter</div>
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: 12, background: GLOW, color: "#04261A", display: "flex", alignItems: "center", justifyContent: "center", opacity: phase === "typing" ? 1 : 0.3 }}>
            <ArrowUp size={16} />
          </div>
        )}
      </div>
      {phase === "empty" && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {suggestionRows.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                {row.map((s) => (
                  <span key={s} style={{ height: 32.75, boxSizing: "border-box", borderRadius: 999, border: `1px solid ${WHITE(0.12)}`, background: WHITE(0.04), padding: "0 12px", display: "inline-flex", alignItems: "center", fontSize: 12.5, color: WHITE(0.8), whiteSpace: "nowrap" }}>{s}</span>
                ))}
              </div>
            ))}
          </div>
          <Lines lines={FOOT_LINES} size={11.5} lineHeight={16.675} style={{ marginTop: 10, paddingLeft: 2, color: WHITE(0.45) }} />
        </div>
      )}
      {phase === "done" && (
        <div style={{ alignSelf: "flex-end", height: 18, display: "flex", alignItems: "center", gap: 6, paddingRight: 4, fontSize: 12, color: WHITE(0.5), ...lineIn(t - plan.answerEnd) }}>
          <RotateCcw size={14} /> Nouvelle conversation
        </div>
      )}
    </div>
  );
}

function StockPanel({ c, phase }: { c: AppCtx; phase: AppPhase }) {
  const { t, plan } = c;
  if (phase === "preview") {
    return (
      <div style={{ borderRadius: 16, background: WHITE(0.06), padding: 12, fontSize: 13, lineHeight: "19.5px" }}>
        <div style={{ fontWeight: 600 }}>{STOCK_FILE}</div>
        <div style={{ marginTop: 8, color: WHITE(0.75) }}>{STOCK_STATS}</div>
        <div style={{ marginTop: 8, paddingTop: 4, display: "flex", gap: 8 }}>
          <div style={{ flex: 1, height: 32, borderRadius: 12, background: GLOW, color: "#04261A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, filter: t >= plan.sendStock - 0.08 ? "brightness(1.1)" : undefined }}>Envoyer mon stock</div>
          <div style={{ width: CANCEL_W, height: 32, borderRadius: 12, background: WHITE(0.1), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5 }}>Annuler</div>
        </div>
      </div>
    );
  }
  const busy = phase === "reading" || phase === "sending";
  const over = phase === "over";
  return (
    <div>
      <div style={{ height: DROP_H, boxSizing: "border-box", borderRadius: 16, border: `1px dashed ${over ? GLOW : WHITE(0.2)}`, background: over ? "rgba(54,232,200,0.1)" : WHITE(0.03), padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", boxShadow: over ? "0 0 22px -6px rgba(54,232,200,.6)" : undefined }}>
        {busy ? <Spin size={20} t={t} color={GLOW} /> : <FileUp size={20} color={GLOW} />}
        <div style={{ fontSize: 13.5, lineHeight: "20.25px", fontWeight: 600 }}>{phase === "reading" ? `Je lis ${STOCK_FILE}…` : phase === "sending" ? "J'envoie votre stock…" : "Déposez le fichier de votre stock"}</div>
        <Lines lines={wrap("L'export de votre logiciel de gestion. Je le vérifie avant tout : rien ne change sans votre accord.", 12, 540 - 24 - 34)} size={12} lineHeight={18} style={{ color: WHITE(0.55) }} />
      </div>
      {phase === "done" && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "19.5px", fontWeight: 600, color: GLOW, transformOrigin: "0 50%", ...popIn(t - plan.stockDone) }}>
          <Check size={16} strokeWidth={3} /> {STOCK_DONE}
        </div>
      )}
    </div>
  );
}

function content(s: AppState, c: AppCtx, local: number, w: number): ReactNode {
  if (s.kind === "closed") return <Closed c={c} count={APP_ALERTS.length} />;
  const tab = s.kind;
  return (
    <div style={{ padding: "10px 12px 12px" }}>
      <Header c={c} tab={tab} w={w} />
      <div style={{ marginTop: 10 }}>
        {s.kind === "home" && <HomePanel c={c} local={local} accepted={s.accepted} />}
        {s.kind === "chat" && <ChatPanel c={c} phase={s.phase} />}
        {s.kind === "stock" && <StockPanel c={c} phase={s.phase} />}
      </div>
    </div>
  );
}

function contentStart(keys: Keyed<AppState>[], index: number): number {
  if (index === 0) return -10;
  let i = index;
  while (i > 0 && keys[i - 1].state.kind === keys[index].state.kind) i--;
  return keys[i].at;
}

export function appBox(keys: Keyed<AppState>[], t: number) {
  return { w: keyed(keys, t, (s) => appSize(s).w), h: keyed(keys, t, (s) => appSize(s).h) };
}

export function AppIsland({ keys, c, place }: { keys: Keyed<AppState>[]; c: AppCtx; place: { cx: number; top: number; zoom: number } }) {
  const { t } = c;
  const { index, key } = current(keys, t);
  const { w, h } = appBox(keys, t);
  const radius = islandRadius(keys, t, (s) => appSize(s).h, w, h);
  const tone = toneAt(keys, t, toneOf);
  const local = t - contentStart(keys, index);
  // Le contenu de l'onglet ne se refond pas quand il change de phase (la frappe, la réponse) : seul le changement d'onglet le fait.
  return (
    <IslandShell cx={place.cx} top={place.top} zoom={place.zoom} width={w} height={h} radius={radius} shadow={ringShadow(tone.from, tone.to, tone.p)} style={islandFont}>
      <div style={{ position: "absolute", left: 0, top: 0, width: appSize(key.state).w, ...contentIn(local) }}>{content(key.state, c, local, w)}</div>
    </IslandShell>
  );
}

/** La notification du logiciel après « Accepter » (toast de succès, en bas à droite). */
export function JoinToast({ t, at, text }: { t: number; at: number; text: string }) {
  const k = Math.max(0, Math.min(1, (t - at) / 0.25));
  const out = t > at + 3.2 ? Math.min(1, (t - at - 3.2) / 0.3) : 0;
  if (k <= 0 || out >= 1) return null;
  const e = 1 - Math.pow(1 - k, 3);
  return (
    <div style={{ width: 384, display: "flex", gap: 12, borderRadius: 10, border: "1px solid #E2E9E9", background: "#fff", padding: 14, boxShadow: "0 10px 30px -8px rgba(0,0,0,.35)", opacity: e * (1 - out), transform: `translateY(${(1 - e) * 16}px)`, ...islandFont }}>
      <span style={{ width: 18, height: 18, borderRadius: 9, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
        <Check size={12} color="#fff" strokeWidth={3} />
      </span>
      <div style={{ fontSize: 13.5, lineHeight: "19px", fontWeight: 500, color: "#172126" }}>{text}</div>
    </div>
  );
}
