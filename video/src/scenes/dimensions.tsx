import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { C, EASE_IN_OUT, sp, tw, useF } from "../theme";
import { LightStage, At } from "../ui/stage";
import { Eyebrow, Kinetic, words } from "../ui/kinetic";
import { CalendarBanner, Phone, PilotagePanel, PlanScreen, QrMark, StockPanel } from "../ui/panels";

/* ==========================================================================
 * 5. APRÈS LE COMPTOIR (40,8 – 50,4 s)
 * Trois temps courts : le plan du patient et ses rappels (mode sans patient :
 * rien n'est conservé), le stock relié, le pilotage par collaborateur.
 * ======================================================================== */

const PANELS = [
  { from: -18, to: 90 },
  { from: 90, to: 180 },
  { from: 180, to: 306 },
];

export function Dimensions({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 6], [0, 1], EASE_IN_OUT);
  const exit = tw(f, [262, 290], [0, 1], EASE_IN_OUT);
  return (
    <AbsoluteFill style={{ opacity: Math.min(1, enter * 1.4) * (1 - exit), transform: `translateX(${(1 - enter) * 520}px) scale(${1 - 0.05 * exit})`, filter: `blur(${(1 - enter) * 14}px)` }}>
      <LightStage>
        <Panel f={f} i={0} eyebrow="Suivi" title={[words("Un plan"), words("*pour le patient.*", C.brand600)]} sub="QR code, e-mail ou papier. Les rappels de prise dans son agenda.">
          <PlanVisual f={f} />
        </Panel>
        <Panel f={f} i={1} eyebrow="Stock" title={[words("Votre stock,"), words("*relié.*", C.brand600)]} sub="Chaque bip décompte. Chaque export de votre logiciel remet à jour.">
          <At x={900} y={290}>
            <StockPanel at={PANELS[1].from} bipAt={PANELS[1].from + 40} />
          </At>
        </Panel>
        <Panel f={f} i={2} eyebrow="Pilotage" title={[words("Votre"), words("*pilotage.*", C.brand600)]} sub="Par collaborateur. Par jour, par semaine, par mois.">
          <At x={880} y={210}>
            <PilotagePanel at={PANELS[2].from + 6} />
          </At>
        </Panel>
      </LightStage>
    </AbsoluteFill>
  );
}

function Panel({ f, i, eyebrow, title, sub, children }: { f: number; i: number; eyebrow: string; title: ReturnType<typeof words>[]; sub: string; children: ReactNode }) {
  const { from, to } = PANELS[i];
  if (f < from - 2 || f > to + 16) return null;
  const inP = i === 0 ? 1 : tw(f, [from, from + 16], [0, 1], EASE_IN_OUT);
  const outP = i === 2 ? 0 : tw(f, [to - 4, to + 12], [0, 1], EASE_IN_OUT);
  const x = (1 - inP) * 180 - outP * 180;
  return (
    <AbsoluteFill style={{ opacity: inP * (1 - outP), transform: `translateX(${x}px)` }}>
      <At x={140} y={330} w={680}>
        <Eyebrow style={{ opacity: tw(f, [from + 4, from + 14], [0, 1]) }}>{eyebrow}</Eyebrow>
        <div style={{ height: 18 }} />
        <Kinetic at={from + 6} size={84} lines={title} />
        <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.35, color: C.ink600, maxWidth: 620, opacity: tw(f, [from + 22, from + 36], [0, 1]), transform: `translateY(${(1 - tw(f, [from + 22, from + 36], [0, 1])) * 10}px)` }}>{sub}</div>
      </At>
      {children}
    </AbsoluteFill>
  );
}

function PlanVisual({ f }: { f: number }) {
  const phone = sp(f, -10, { damping: 200, stiffness: 90 });
  const show = (i: number) => sp(f, 2 + i * 6, { damping: 200, stiffness: 140 });
  const b1 = sp(f, 28, { damping: 20, stiffness: 160 });
  const b2 = sp(f, 52, { damping: 20, stiffness: 160 });
  const qr = sp(f, 14, { damping: 200, stiffness: 120 });
  return (
    <>
      <At x={1230} y={110} style={{ transform: `translateY(${(1 - phone) * 80}px)`, opacity: phone }}>
        <Phone h={860}>
          <PlanScreen show={show} />
        </Phone>
      </At>
      <At x={1160} y={150} w={560} style={{ opacity: b1, transform: `translateY(${(1 - b1) * -40}px) scale(${0.96 + 0.04 * b1})` }}>
        <CalendarBanner title="Matin — traitement" body="AMOXICILLINE 1 g — 1 comprimé" time="08:00" />
      </At>
      <At x={1160} y={262} w={560} style={{ opacity: b2, transform: `translateY(${(1 - b2) * -40}px) scale(${0.96 + 0.04 * b2})` }}>
        <CalendarBanner title="Fin du traitement — votre pharmacien prend de vos nouvelles" body="Fin du traitement : comment allez-vous ?" time="18:00" />
      </At>
      <At x={880} y={640} style={{ opacity: qr, transform: `translateY(${(1 - qr) * 30}px)` }}>
        <div style={{ width: 290, background: C.white, borderRadius: 22, padding: 20, boxShadow: "0 24px 60px -28px rgba(15,23,42,.35)", border: `1px solid ${C.ink200}` }}>
          <QrMark size={170} />
          <div style={{ marginTop: 12, fontSize: 17, color: C.ink600, lineHeight: 1.35 }}>Le patient scanne : son plan s&apos;ouvre.</div>
        </div>
      </At>
    </>
  );
}
