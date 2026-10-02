import { AbsoluteFill, interpolate } from "remotion";
import { C, EASE_IN_OUT, sp, tw, useF } from "../theme";
import { DarkStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { Ripple } from "../ui/counter";
import { CtaButton, Logo, Wordmark } from "../ui/product";

/* ==========================================================================
 * 6. LE LOGO (50,4 – 60 s)
 * Impact, le symbole, le nom, la promesse, l'invitation.
 * ======================================================================== */

const LOGO = 236;
const WORD = 130;
const GAP = 40;
const WORD_W = 900;

export function Finale({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, -2], [0, 1]);
  const flash = Math.max(0, tw(f, [-5, 0], [0, 0.5]) - tw(f, [0, 16], [0, 0.5]));

  const logo = sp(f, -3, { damping: 11, stiffness: 120 });
  const open = tw(f, [30, 62], [0, 1], EASE_IN_OUT);
  const groupW = LOGO + GAP + WORD_W;
  const left0 = 960 - LOGO / 2;
  const left1 = 960 - groupW / 2;
  const logoX = interpolate(open, [0, 1], [left0, left1]);
  const cta = sp(f, 160, { damping: 16, stiffness: 140 });
  const t = f / 30;

  return (
    <AbsoluteFill style={{ opacity: enter }}>
      <DarkStage glow={C.brand800}>
        {/* Deux disques de lumière, comme le bloc d'appel du site */}
        <div style={{ position: "absolute", left: `${18 + Math.sin(t / 2) * 2}%`, top: "22%", width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.14), transparent 65%)" }} />
        <div style={{ position: "absolute", left: `${82 - Math.sin(t / 2) * 2}%`, top: "78%", width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,.14), transparent 65%)" }} />
        <Ripple x={960} y={420} at={0} max={1500} color={C.brand200} />

        {/* Le nom sort de derrière le symbole */}
        <At x={logoX + LOGO + GAP} y={420 - WORD * 0.62} w={WORD_W} style={{ clipPath: `inset(-20% ${(1 - open) * 100}% -20% 0)`, transform: `translateX(${(1 - open) * -70}px)`, opacity: tw(open, [0, 0.25], [0, 1]) }}>
          <Wordmark size={WORD} dark />
        </At>
        <At x={logoX} y={420 - (LOGO * 1062) / 1098 / 2} style={{ transform: `scale(${0.35 + 0.65 * logo}) rotate(${(1 - logo) * -12}deg)`, opacity: Math.min(1, logo * 2), filter: "drop-shadow(0 30px 50px rgba(0,0,0,.35))" }}>
          <Logo size={LOGO} />
        </At>

        <At x={0} y={610} w={1920}>
          <Kinetic at={84} size={60} color={C.brand100} weight={500} align="center" tracking="-0.015em" lines={[words("Le copilote intelligent du comptoir.")]} />
        </At>

        <At x={0} y={752} w={1920} style={{ display: "flex", justifyContent: "center", opacity: Math.min(1, cta * 1.4), transform: `translateY(${(1 - cta) * 30}px) scale(${0.92 + 0.08 * cta})` }}>
          <CtaButton shine={tw(f, [196, 240], [0, 1])} />
        </At>
        <At x={0} y={880} w={1920} style={{ textAlign: "center", fontSize: 30, letterSpacing: "0.02em", color: C.brand200, opacity: tw(f, [178, 196], [0, 1]) }}>
          pharmaboost.app
        </At>
        <AbsoluteFill style={{ background: C.white, opacity: flash }} />
      </DarkStage>
    </AbsoluteFill>
  );
}
