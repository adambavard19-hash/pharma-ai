import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  ACT1,
  Backdrop,
  Burst,
  Camera,
  Coins,
  Confetti,
  Converge,
  DotGrid,
  Dust,
  Exit,
  Glass,
  Glitch,
  GOLD_METAL,
  IN_OUT,
  LINEAR,
  Odometer,
  PB,
  Ring,
  Shatter,
  SlotDigits,
  Sparks,
  WHIP,
  Word,
  MotionBlur,
  digits,
  label,
  support,
  tween,
} from "./kit";

/* ==========================================================================
 * LA VITRINE DU KIT — composition « PresKit » (6 s) : chaque gadget du kit en action, pour voir avant d'utiliser.
 *   npx remotion still src/index.ts PresKit out/stills/kit.png --frame=120 --scale=0.5
 * ======================================================================== */

function Cell({ x, y, w, h, title }: { x: number; y: number; w: number; h: number; title: string }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 24, border: "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ position: "absolute", left: 18, top: 14, ...label(16), color: "rgba(255,255,255,.45)" }}>{title}</div>
    </div>
  );
}

function GreyCard() {
  return (
    <div style={{ position: "absolute", left: 1330, top: 640, width: 480, height: 300, borderRadius: 24, background: `linear-gradient(135deg, ${ACT1.g2}, ${ACT1.g1})`, border: `2px solid ${ACT1.g3}` }}>
      <div style={{ position: "absolute", left: 30, top: 40, ...support(44), color: ACT1.g4 }}>Monde gris</div>
      <div style={{ position: "absolute", left: 30, top: 110, width: 300, height: 18, borderRadius: 9, background: ACT1.g3 }} />
      <div style={{ position: "absolute", left: 30, top: 146, width: 220, height: 18, borderRadius: 9, background: ACT1.g3, opacity: 0.6 }} />
    </div>
  );
}

export function KitDemo() {
  const t = useCurrentFrame() / 60;
  return (
    <AbsoluteFill>
      <Backdrop t={t} kind="brand" />
      <DotGrid t={t} opacity={0.08} wave={{ at: 0.4, x: 960, y: 540 }} />
      <Dust t={t} count={30} color={PB.mint2} alpha={0.2} />
      <Camera t={t} zoom={tween(t, 0, 6, 1, 1.03, LINEAR)} shakes={[{ at: 1.2, amp: 12 }]}>
        <Cell x={60} y={60} w={580} h={460} title="Word rise · slice" />
        <Word t={t} at={0.2} text="COMPTOIR" x={350} y={250} size={110} enter="rise" exit="slice" exitAt={3.2} />
        <Word t={t} at={0.5} text="tout va *très vite*" x={350} y={380} size={52} weight={800} enter="slide" tracking="-0.02em" />
        <MotionBlur on={t > 3.75 && t < 4.35}>
          {(tt) => <div style={{ position: "absolute", left: tween(tt, 3.8, 0.45, 110, 470, WHIP), top: 450, width: 120, height: 28, borderRadius: 14, background: PB.mint }} />}
        </MotionBlur>

        <Cell x={670} y={60} w={580} h={460} title="punch · glitch · letters" />
        <Word t={t} at={1.2} text="VENDU !" x={960} y={200} size={120} color={PB.gold} enter="punch" style={{ textShadow: "0 8px 30px rgba(242,165,22,.45)" }} />
        <AbsoluteFill>
          <Glitch t={t} at={1.6} dur={0.5}>
            <Word t={t} at={0.3} text="PENSER" x={960} y={330} size={90} color={ACT1.g4} enter="none" />
          </Glitch>
        </AbsoluteFill>
        <Word t={t} at={0.6} text="CONSEIL" x={960} y={440} size={80} color={PB.mint} enter="letters" exit="fall" exitAt={3.6} />

        <Cell x={1280} y={60} w={580} h={460} title="Odometer · SlotDigits" />
        <div style={{ position: "absolute", left: 1320, top: 120 }}>
          <Odometer t={t} value={(tt) => tween(tt, 0.4, 1, 0, 1, LINEAR)} decimals={2} decimalSep="." size={120} color={PB.mint2} />
        </div>
        <div style={{ position: "absolute", left: 1320, top: 280 }}>
          <Odometer t={t} value={(tt) => tween(tt, 0.3, 1.2, 42, 57, IN_OUT)} digits={3} prefix="N° " size={56} />
        </div>
        <div style={{ position: "absolute", left: 1320, top: 380 }}>
          <SlotDigits t={t} at={0.8} text="8,90 €" size={80} />
        </div>

        <Cell x={60} y={560} w={580} h={460} title="Glass · sheen · active" />
        <Glass tone="light" active={0.5 + 0.5 * Math.sin(t * 3)} sheen={(t * 0.45) % 1} style={{ left: 110, top: 640, width: 480, height: 300 }}>
          <div style={{ position: "absolute", left: 30, top: 34, ...support(40), color: "#fff" }}>Ultra-Levure</div>
          <div style={{ position: "absolute", left: 30, top: 100, ...digits(64), color: PB.mint2 }}>8,90 €</div>
          <div style={{ position: "absolute", left: 30, top: 200, padding: "8px 18px", borderRadius: 999, background: GOLD_METAL, ...label(20), color: "#3A2400" }}>★ Challenge</div>
        </Glass>

        <Cell x={670} y={560} w={580} h={460} title="Confetti · Burst · Ring · Sparks · Coins" />
        <Ring t={t} at={1.0} x={960} y={800} max={420} />
        <Burst t={t} at={1.0} x={960} y={800} />
        <Sparks t={t} at={1.3} x={960} y={800} />
        <Converge t={t} at={2.2} x={960} y={790} radius={240} />
        <Coins t={t} at={2.6} x={960} y={900} count={10} power={1100} />
        <Confetti t={t} at={0.9} x={760} y={960} angle={-60} spread={25} power={1500} count={60} />
        <Confetti t={t} at={0.95} x={1160} y={960} angle={-120} spread={25} power={1500} count={60} seed="c2" />

        <Cell x={1280} y={560} w={580} h={460} title="Shatter · Exit strobe" />
        <Shatter t={t} at={2.0} center={[1570, 790]} power={900}>
          <GreyCard />
        </Shatter>
        <div style={{ position: "absolute", left: 1330, top: 960 }}>
          <Exit t={t} at={1.4} kind="strobe" dist={420}>
            <div style={{ ...support(30), color: ACT1.g4 }}>écho stroboscopique</div>
          </Exit>
        </div>
      </Camera>
    </AbsoluteFill>
  );
}
