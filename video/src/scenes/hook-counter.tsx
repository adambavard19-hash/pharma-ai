import { AbsoluteFill, interpolate } from "remotion";
import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { Check } from "lucide-react";
import { C, EASE_IN_OUT, sp, tw, useF } from "../theme";
import { DarkStage, LightStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { LgoWindow, Laser, MedBox, Ripple, ScannerAt, barcodeCenter } from "../ui/counter";
import { Logo } from "../ui/product";

/* ==========================================================================
 * 1. LE BIP (0 – 4,8 s)
 * Gros plan : la douchette balaie le code-barres, bip à 1,2 s, l'onde part,
 * la caméra recule et la question s'écrit.
 * ======================================================================== */

const BIP1 = 36;

export function Hook(_: { intro: number }) {
  const f = useF();
  const settle = tw(f, [46, 92], [0, 1], EASE_IN_OUT);
  const punch = f >= BIP1 ? Math.exp(-(f - BIP1) / 7) * 0.045 : 0;
  const scale = interpolate(settle, [0, 1], [1.3, 0.8]) + punch;
  const tx = interpolate(settle, [0, 1], [-40, 470]);
  const ty = interpolate(settle, [0, 1], [-40, 40]);

  const box = { x: 560, y: 440, w: 560 };
  const [bx, by] = barcodeCenter(box.x, box.y, box.w);
  const sweep = Math.sin(f / 3.2) * 22;
  const laserOn = Math.min(tw(f, [6, 14], [0, 1]), tw(f, [BIP1 + 2, BIP1 + 8], [1, 0]));
  const lit = Math.min(tw(f, [BIP1 - 2, BIP1 + 1], [0, 1]), tw(f, [BIP1 + 6, BIP1 + 46], [1, 0]));
  const nose: [number, number] = [1250, 400];

  return (
    <DarkStage glow={C.brand800}>
      <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <At x={box.x} y={box.y}>
          <MedBox name="AMOXICILLINE 1 g" form="comprimé dispersible" w={box.w} lit={lit} />
        </At>
        <Laser from={nose} to={[bx, by + sweep * laserOn]} spread={250} on={laserOn} />
        <ScannerAt nx={nose[0]} ny={nose[1]} w={380} deg={24} led={lit} />
        <Ripple x={bx} y={by} at={BIP1} max={640} />
      </AbsoluteFill>
      <At x={130} y={300} w={980}>
        <Kinetic
          at={52}
          size={90}
          color={C.white}
          stagger={3}
          lines={[words("Et si chaque *bip*", C.accent300), words("pouvait déclencher", C.accent300), words("le *bon conseil* ?", C.brand300)]}
        />
      </At>
    </DarkStage>
  );
}

/* ==========================================================================
 * 2. LE COMPTOIR (4,8 – 14,4 s)
 * Le logiciel de gestion, comme d'habitude. Deux bips, deux lignes. Puis
 * PharmaBoost apparaît à côté : chaque boîte y arrive, sans rien changer.
 * ======================================================================== */

const BIPS = [36, 72];
const LINES = [
  { text: "AMOXICILLINE 1 g cp disp. — 1 boîte", at: BIPS[0] },
  { text: "PARACÉTAMOL 1000 mg cp — 1 boîte", at: BIPS[1] },
];

export function Counter({ intro }: { intro: number }) {
  const f = useF();
  // L'ouverture en iris depuis le code-barres de la scène précédente.
  const iris = tw(f, [-intro, 8], [0, 2400], EASE_IN_OUT);
  // La fenêtre se range à gauche quand PharmaBoost apparaît.
  const room = tw(f, [96, 132], [0, 1], EASE_IN_OUT);
  const lgoScale = interpolate(room, [0, 1], [1, 0.8]);
  const panel = sp(f, 104, { damping: 200, stiffness: 90 });
  const mini = 1 - tw(f, [90, 110], [0, 1]);
  // Poussée finale dans le panneau PharmaBoost.
  const push = tw(f, [232, 274], [0, 1], EASE_IN_OUT);
  const zoom = interpolate(push, [0, 1], [1, 5.5]);
  const veil = tw(f, [252, 272], [0, 1]);

  // La petite scène de scan, à droite : une boîte par bip.
  const boxes = [
    { name: "AMOXICILLINE 1 g", form: "comprimé dispersible", in: 8, bip: BIPS[0], out: 46 },
    { name: "PARACÉTAMOL 1000 mg", form: "comprimé", in: 50, bip: BIPS[1], out: 84 },
  ];
  const box = { x: 1290, y: 640, w: 340 };
  const [bx, by] = barcodeCenter(box.x, box.y, box.w);
  const nose: [number, number] = [1690, 600];

  return (
    <AbsoluteFill style={{ clipPath: `circle(${iris}px at 1435px 682px)` }}>
      <LightStage>
        <AbsoluteFill style={{ transformOrigin: "1530px 480px", transform: `scale(${zoom})` }}>
          <At x={120} y={300} style={{ transformOrigin: "0 0", transform: `scale(${lgoScale})` }}>
            <LgoWindow w={1100} lines={LINES} />
          </At>

          {/* La douchette et les boîtes */}
          <AbsoluteFill style={{ opacity: mini }}>
            {boxes.map((b) => {
              const enter = sp(f, b.in, { damping: 200, stiffness: 140 });
              const leave = tw(f, [b.out, b.out + 12], [0, 1], EASE_IN_OUT);
              if (f < b.in - 2 || leave >= 1) return null;
              const lit = Math.min(tw(f, [b.bip - 2, b.bip + 1], [0, 1]), tw(f, [b.bip + 4, b.bip + 30], [1, 0]));
              return (
                <At key={b.name} x={box.x + (1 - enter) * 260 - leave * 260} y={box.y} style={{ opacity: enter * (1 - leave) }}>
                  <MedBox name={b.name} form={b.form} w={box.w} lit={lit} tilt={-12} />
                </At>
              );
            })}
            {boxes.map((b) => {
              const on = Math.min(tw(f, [b.bip - 12, b.bip - 6], [0, 1]), tw(f, [b.bip + 2, b.bip + 7], [1, 0]));
              return <Laser key={b.name} from={nose} to={[bx, by + Math.sin(f / 3) * 16 * on]} spread={170} on={on} />;
            })}
            <ScannerAt nx={nose[0]} ny={nose[1]} w={240} deg={38} led={Math.max(...BIPS.map((b) => tw(f, [b - 1, b + 1], [0, 1]) * tw(f, [b + 4, b + 24], [1, 0])))} />
            {BIPS.map((b) => <Ripple key={b} x={bx} y={by} at={b} max={360} />)}
          </AbsoluteFill>

          {/* PharmaBoost, à côté du logiciel */}
          <At x={1250} y={300} style={{ opacity: panel, transform: `translateY(${(1 - panel) * 70}px) scale(${0.94 + 0.06 * panel})`, filter: `blur(${(1 - panel) * 10}px)` }}>
            <PbPanel f={f} />
          </At>
          <DataFlow f={f} />
        </AbsoluteFill>

        <At x={120} y={92} w={1100}>
          <Kinetic at={2} out={132} size={74} lines={[words("Vous scannez."), words("*Comme d'habitude.*", C.brand600)]} />
        </At>
        <At x={120} y={92} w={1100}>
          <Kinetic at={146} out={232} size={74} lines={[words("Chaque boîte scannée"), words("arrive dans *PharmaBoost.*", C.brand600)]} />
        </At>
        <At x={1250} y={690} w={600} style={{ opacity: Math.min(tw(f, [176, 192], [0, 1]), 1 - tw(f, [228, 240], [0, 1])), fontSize: 30, color: C.ink600 }}>
          Vous restez sur votre logiciel de gestion.
        </At>
        <AbsoluteFill style={{ background: C.brand900, opacity: veil }} />
      </LightStage>
    </AbsoluteFill>
  );
}

const ROWS = [
  { name: "AMOXICILLINE 1 g", at: 132 },
  { name: "PARACÉTAMOL 1000 mg", at: 142 },
];

function PbPanel({ f }: { f: number }) {
  const dots = ".".repeat(1 + (Math.floor(Math.max(0, f) / 8) % 3));
  return (
    <div style={{ width: 560, borderRadius: 24, background: C.brand900, padding: 28, boxShadow: "0 40px 90px -30px rgba(0,64,59,.6)", color: C.white }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo size={46} />
        <span style={{ fontSize: 28, fontWeight: 600 }}>
          Pharma<span style={{ color: C.accent300 }}>Boost</span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 16, color: C.brand200, border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, padding: "5px 12px" }}>Poste comptoir 1</span>
      </div>
      <div style={{ marginTop: 22, fontSize: 15, fontWeight: 600, letterSpacing: "0.1em", color: C.brand300 }}>VENTE ORD-0042</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {ROWS.map((r) => {
          const p = sp(f, r.at, { damping: 22, stiffness: 170 });
          return (
            <div key={r.name} style={{ height: 66, borderRadius: 16, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", padding: "0 18px", fontSize: 23, fontWeight: 600, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
              {r.name}
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 16, fontWeight: 500, color: C.brand200 }}>
                <Check size={18} color={C.brand300} strokeWidth={3} /> reçue
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 18, fontSize: 19, color: C.brand200, opacity: tw(f, [160, 176], [0, 1]) }}>Analyse dans quelques secondes{dots}</div>
    </div>
  );
}

/** Les deux lignes bipées partent vers PharmaBoost : un tracé, une particule lumineuse. */
function DataFlow({ f }: { f: number }) {
  // Positions après le rangement de la fenêtre (échelle 0,84 depuis (120, 330)).
  const s = 0.8;
  const fromY = [300 + 154 * s, 300 + 234 * s];
  const fromX = 120 + 1058 * s;
  const toY = [459, 537];
  const starts = [110, 120];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {starts.map((st, i) => {
        const d = `M ${fromX} ${fromY[i]} C ${fromX + 110} ${fromY[i]}, ${1250 - 110} ${toY[i]}, 1250 ${toY[i]}`;
        const p = tw(f, [st, st + 22], [0, 1], EASE_IN_OUT);
        const fade = 1 - tw(f, [st + 60, st + 90], [0, 1]);
        if (p <= 0 || fade <= 0) return null;
        const ev = evolvePath(p, d);
        const pt = getPointAtLength(d, getLength(d) * p);
        return (
          <g key={i} opacity={fade}>
            <path d={d} stroke={C.brand400} strokeWidth={3} fill="none" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} strokeLinecap="round" />
            {p < 1 && pt && <circle cx={pt.x} cy={pt.y} r={9} fill={C.brand300} />}
            {p < 1 && pt && <circle cx={pt.x} cy={pt.y} r={22} fill={C.brand300} opacity={0.25} />}
          </g>
        );
      })}
    </svg>
  );
}
