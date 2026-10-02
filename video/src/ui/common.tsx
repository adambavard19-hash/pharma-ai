import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Check, HelpCircle, Pill, Users } from "lucide-react";
import { C, EASE_IN_OUT, SHADOW, sp, tw, useF } from "../theme";
import { DarkStage, At } from "./stage";
import { Kinetic, words, type Word } from "./kinetic";
import { Ripple } from "./counter";
import { CtaButton, Logo, Wordmark } from "./product";
import { Sfx } from "./sfx";

/**
 * La carte de fin des films courts : une phrase-thème, puis le symbole, le
 * nom, la promesse et l'invitation. ~6,5 s.
 */
export function EndCard({ intro, lead }: { intro: number; lead: Word[][] }) {
  const f = useF();
  const enter = tw(f, [-intro, -2], [0, 1]);
  const flash = Math.max(0, tw(f, [-4, 0], [0, 0.45]) - tw(f, [0, 12], [0, 0.45]));
  const L0 = 46;
  const logo = sp(f, L0, { damping: 11, stiffness: 140 });
  const open = tw(f, [L0 + 16, L0 + 36], [0, 1], EASE_IN_OUT);
  const LOGO = 220, WORD = 124, GAP = 36, WORD_W = 860;
  const left1 = 960 - (LOGO + GAP + WORD_W) / 2;
  const logoX = interpolate(open, [0, 1], [960 - LOGO / 2, left1]);
  const cta = sp(f, L0 + 72, { damping: 15, stiffness: 150 });
  const t = f / 30;
  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <DarkStage>
        <div style={{ position: "absolute", left: `${18 + Math.sin(t / 2) * 2}%`, top: "22%", width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.13), transparent 65%)" }} />
        <div style={{ position: "absolute", left: `${82 - Math.sin(t / 2) * 2}%`, top: "78%", width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.13), transparent 65%)" }} />
        <At x={0} y={390} w={1920}>
          <Kinetic at={2} out={L0 - 10} size={84} color={C.white} align="center" stagger={2} lines={lead} />
        </At>
        <Ripple x={960} y={420} at={L0} max={1500} color={C.brand200} />
        <At x={logoX + LOGO + GAP} y={420 - WORD * 0.62} w={WORD_W} style={{ clipPath: `inset(-20% ${(1 - open) * 100}% -20% 0)`, transform: `translateX(${(1 - open) * -70}px)`, opacity: tw(open, [0, 0.25], [0, 1]) }}>
          <Wordmark size={WORD} dark />
        </At>
        <At x={logoX} y={420 - (LOGO * 1062) / 1098 / 2} style={{ transform: `scale(${0.35 + 0.65 * logo}) rotate(${(1 - logo) * -12}deg)`, opacity: Math.min(1, logo * 2), filter: "drop-shadow(0 30px 50px rgba(0,0,0,.35))" }}>
          <Logo size={LOGO} />
        </At>
        <At x={0} y={600} w={1920}>
          <Kinetic at={L0 + 40} size={56} color={C.brand100} weight={500} align="center" tracking="-0.015em" stagger={2} lines={[words("Le copilote intelligent du comptoir.")]} />
        </At>
        <At x={0} y={730} w={1920} style={{ display: "flex", justifyContent: "center", opacity: Math.min(1, cta * 1.4), transform: `translateY(${(1 - cta) * 30}px) scale(${0.92 + 0.08 * cta})` }}>
          <CtaButton shine={tw(f, [L0 + 96, L0 + 136], [0, 1])} />
        </At>
        <At x={0} y={858} w={1920} style={{ textAlign: "center", fontSize: 30, letterSpacing: "0.02em", color: C.brand200, opacity: tw(f, [L0 + 84, L0 + 100], [0, 1]) }}>
          pharmaboost.app
        </At>
        <AbsoluteFill style={{ background: C.white, opacity: flash }} />
        <Sfx at={0} name="whoosh" volume={0.5} />
        <Sfx at={L0} name="impact" volume={0.55} />
        <Sfx at={L0 + 16} name="swish" volume={0.4} />
        <Sfx at={L0 + 72} name="pop" volume={0.55} />
      </DarkStage>
    </AbsoluteFill>
  );
}

/** Une pensée : le doute (sans PharmaBoost) ou la réponse (avec). */
export function Bubble({ text, tone, p, style }: { text: string; tone: "doubt" | "ok"; p: number; style?: CSSProperties }) {
  const ok = tone === "ok";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 24px",
        borderRadius: 26,
        borderTopRightRadius: 8,
        fontSize: 27,
        lineHeight: 1.3,
        background: ok ? C.brand50 : C.ink100,
        color: ok ? C.brand900 : C.ink600,
        fontStyle: ok ? "normal" : "italic",
        border: `1px solid ${ok ? C.brand200 : C.ink200}`,
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 24}px) scale(${0.9 + 0.1 * p})`,
        transformOrigin: "right center",
        ...style,
      }}
    >
      {ok ? <Check size={30} color={C.success600} strokeWidth={3} style={{ flexShrink: 0 }} /> : <HelpCircle size={30} color={C.warning600} style={{ flexShrink: 0 }} />}
      <span>{text}</span>
    </div>
  );
}

/** L'interrupteur du site : « Sans PharmaBoost » / « Avec PharmaBoost ». */
export function Toggle({ on }: { on: number }) {
  const pill = (active: boolean, label: string, color: string) => (
    <span style={{ position: "relative", zIndex: 1, padding: "12px 26px", fontSize: 22, fontWeight: 600, color: active ? C.white : C.ink600 }}>{label}</span>
  );
  return (
    <div style={{ position: "relative", display: "inline-flex", padding: 6, borderRadius: 999, background: C.ink100, border: `1px solid ${C.ink200}` }}>
      <div style={{ position: "absolute", top: 6, bottom: 6, left: 6 + on * 254, width: 254, borderRadius: 999, background: on > 0.5 ? C.brand600 : C.ink700, transition: "none" }} />
      <div style={{ width: 254, textAlign: "center" }}>{pill(on < 0.5, "Sans PharmaBoost", C.ink700)}</div>
      <div style={{ width: 254, textAlign: "center" }}>{pill(on >= 0.5, "Avec PharmaBoost", C.brand600)}</div>
    </div>
  );
}

/** La file d'attente au comptoir : des patients qui arrivent. */
export function Queue({ count, appear }: { count: number; appear: (i: number) => number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => {
        const p = appear(i);
        return (
          <span key={i} style={{ width: 64, height: 64, borderRadius: 32, display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? C.brand100 : C.ink100, color: i === 0 ? C.brand800 : C.ink400, opacity: p, transform: `translateX(${(1 - p) * 40}px) scale(${0.6 + 0.4 * p})` }}>
            <Users size={30} />
          </span>
        );
      })}
    </div>
  );
}

export function Pharmacist({ on }: { on: number }) {
  return (
    <span style={{ width: 84, height: 84, borderRadius: 42, display: "flex", alignItems: "center", justifyContent: "center", background: on > 0.5 ? C.brand600 : C.ink200, color: on > 0.5 ? C.white : C.ink700, boxShadow: on > 0.5 ? `0 0 0 ${10 * on}px rgba(0,132,116,.15)` : "none" }}>
      <Pill size={40} />
    </span>
  );
}

/** Un bloc de titre de scène : pastille, titre cinétique, sous-titre. */
export function TitleBlock({ chip, chipAt, lines, at, out, size = 78, sub, subAt, subOut }: { chip?: string; chipAt?: number; lines: Word[][]; at: number; out?: number; size?: number; sub?: string; subAt?: number; subOut?: number }) {
  const f = useF();
  const chipP = chipAt === undefined ? 0 : sp(f, chipAt, { damping: 20, stiffness: 160 });
  const subP = subAt === undefined ? 0 : Math.min(tw(f, [subAt, subAt + 12], [0, 1]), subOut === undefined ? 1 : 1 - tw(f, [subOut, subOut + 10], [0, 1]));
  return (
    <div>
      {chip && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 18px", borderRadius: 999, background: C.white, border: `1px solid ${C.ink200}`, fontSize: 20, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.brand700, opacity: chipP, transform: `translateY(${(1 - chipP) * -14}px)`, marginBottom: 26 }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: C.accent400 }} />
          {chip}
        </div>
      )}
      <Kinetic at={at} out={out} size={size} lines={lines} stagger={2} />
      {sub && <div style={{ marginTop: 28, fontSize: 31, lineHeight: 1.35, color: C.ink600, maxWidth: 700, opacity: subP, transform: `translateY(${(1 - subP) * 12}px)` }}>{sub}</div>}
    </div>
  );
}

/** Paramètres → Laboratoires : « Mettre en avant » qui devient « Mise en avant ». */
export function LabsPanel({ at }: { at: number }) {
  const f = useF();
  const rows = [
    { name: "Laboratoire A", refs: "12 références · 9 en rayon", on: at + 34 },
    { name: "Laboratoire B", refs: "8 références · 8 en rayon", on: at + 52 },
    { name: "Laboratoire C", refs: "15 références · 11 en rayon", on: -1 },
  ];
  return (
    <div style={{ width: 860, background: C.white, borderRadius: 24, border: `1px solid ${C.ink200}`, boxShadow: SHADOW.card, padding: "26px 30px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: C.ink900 }}>Laboratoires</span>
        <span style={{ marginLeft: "auto", fontSize: 15, color: C.ink400 }}>exemple</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 17, color: C.ink500, lineHeight: 1.4 }}>Une préférence départage entre références équivalentes : elle ne fait jamais passer une moins adaptée devant.</div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => {
          const p = sp(f, at + 4 + i * 5, { damping: 24, stiffness: 170 });
          const on = r.on >= 0 && f >= r.on;
          const press = r.on >= 0 ? tw(f, [r.on - 3, r.on], [0, 1]) - tw(f, [r.on + 1, r.on + 6], [0, 1]) : 0;
          return (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 16, background: on ? C.brand50 : C.ink50, border: `1px solid ${on ? C.brand200 : C.ink100}`, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: C.ink900 }}>{r.name}</div>
                <div style={{ fontSize: 16, color: C.ink500 }}>{r.refs}</div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 600, borderRadius: 12, padding: "10px 16px", transform: `scale(${1 - 0.06 * press})`, background: on ? C.brand600 : C.white, color: on ? C.white : C.brand700, border: `1.5px solid ${on ? C.brand600 : C.brand200}` }}>
                {on ? "✓ Mise en avant" : "Mettre en avant"}
              </span>
              <span style={{ fontSize: 18, fontWeight: 500, color: C.ink500, padding: "10px 6px" }}>Écarter</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: C.white, borderRadius: 28, border: `1px solid ${C.ink200}`, boxShadow: SHADOW.lift, ...style }}>{children}</div>;
}
