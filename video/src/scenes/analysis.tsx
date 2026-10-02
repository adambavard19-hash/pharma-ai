import type { ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { Barcode, Check, Lightbulb, ShieldCheck, Sparkles, Boxes } from "lucide-react";
import { C, EASE_IN_OUT, MONO, sp, tw, useF } from "../theme";
import { DarkStage, At } from "../ui/stage";
import { Kinetic, words } from "../ui/kinetic";
import { EXAMPLE, ProductTile } from "../ui/product";

/* ==========================================================================
 * 3. L'ANALYSE (14,4 – 28,8 s)
 * Médicament → traitement → votre stock → conseil. Les étapes et leurs
 * libellés viennent du moteur (src/core/ai/pipeline.ts) ; la règle montrée est
 * la ligne 1 de la base maître (amoxicilline → probiotique).
 * ======================================================================== */

const ACT = [84, 152, 222, 292];
const XS = [300, 740, 1180, 1620];
const PILL_Y = 330;

export function Analysis({ intro }: { intro: number }) {
  const f = useF();
  const enter = tw(f, [-intro, 0], [0, 1]);
  const exit = tw(f, [414, 446], [0, 1], EASE_IN_OUT);

  // Le titre se range en haut quand le moteur se déploie.
  const lift = tw(f, [54, 80], [0, 1], EASE_IN_OUT);
  // Progression de la ligne entre les étapes.
  const fill = interpolate(f, [ACT[0] - 8, ACT[1] - 6, ACT[2] - 6, ACT[3] - 6], [XS[0], XS[1], XS[2], XS[3]], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT });
  const drift = 1 + 0.035 * tw(f, [60, 420], [0, 1], (x) => x);
  const follow = -(fill - 960) * 0.05;

  return (
    <AbsoluteFill style={{ opacity: enter * (1 - exit), transform: `scale(${1 - 0.06 * exit})` }}>
      <DarkStage>
        <At x={0} y={0} w={1920} style={{ top: interpolate(lift, [0, 1], [360, 60]), transformOrigin: "960px 0", transform: `scale(${interpolate(lift, [0, 1], [1, 0.56])})` }}>
          <Kinetic at={-12} size={112} color={C.white} align="center" lines={[words("Un *bip.*", C.accent300), words("PharmaBoost analyse.")]} />
        </At>

        <AbsoluteFill style={{ transformOrigin: "960px 560px", transform: `translateX(${follow}px) scale(${drift})`, opacity: tw(f, [62, 80], [0, 1]) }}>
          <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
            <line x1={XS[0]} y1={PILL_Y} x2={XS[3]} y2={PILL_Y} stroke="rgba(255,255,255,.14)" strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" />
            <line x1={XS[0]} y1={PILL_Y} x2={fill} y2={PILL_Y} stroke={C.brand300} strokeWidth={3} strokeLinecap="round" />
            <circle cx={fill} cy={PILL_Y} r={26} fill={C.brand300} opacity={0.18} />
            <circle cx={fill} cy={PILL_Y} r={8} fill={C.brand100} />
          </svg>
          <Node i={0} f={f} label="Médicament" icon={<Barcode size={30} />}>
            <NodeDrug f={f} />
          </Node>
          <Node i={1} f={f} label="Traitement" icon={<Sparkles size={30} />}>
            <NodeNeed f={f} />
          </Node>
          <Node i={2} f={f} label="Votre stock" icon={<Boxes size={30} />}>
            <NodeStock f={f} />
          </Node>
          <Node i={3} f={f} label="Conseil" icon={<Lightbulb size={30} />}>
            <NodeAdvice f={f} />
          </Node>
        </AbsoluteFill>

        <At x={0} y={872} w={1920}>
          <Kinetic at={338} out={404} size={70} color={C.white} align="center" lines={[words("Le *bon conseil.* Au bon moment.", C.accent300)]} />
        </At>
      </DarkStage>
    </AbsoluteFill>
  );
}

function Node({ i, f, label, icon, children }: { i: number; f: number; label: string; icon: ReactNode; children: ReactNode }) {
  const appear = sp(f, 64 + i * 4, { damping: 200, stiffness: 120 });
  const active = f >= ACT[i] && (i === 3 || f < ACT[i + 1]);
  const done = i < 3 && f >= ACT[i + 1];
  const on = sp(f, ACT[i], { damping: 16, stiffness: 180 });
  const card = sp(f, ACT[i] + 2, { damping: 200, stiffness: 110 });
  const w = 390;
  return (
    <At x={XS[i] - w / 2} y={PILL_Y - 34} w={w} style={{ opacity: appear, transform: `translateY(${(1 - appear) * 24}px)` }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? C.accent400 : done ? C.brand600 : "rgba(255,255,255,.1)",
            color: active ? C.brand950 : C.white,
            transform: `scale(${active ? 1 + 0.12 * (1 - on) + 0.04 : 1})`,
            boxShadow: active ? `0 0 0 ${8 * on}px rgba(231,182,45,.18)` : "none",
          }}
        >
          {done ? <Check size={32} strokeWidth={3} /> : icon}
        </div>
        <div style={{ marginTop: 14, fontSize: 19, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: active ? C.accent300 : C.brand300, opacity: f < ACT[i] ? 0.55 : 1 }}>{label}</div>
        <div
          style={{
            marginTop: 18,
            width: w,
            minHeight: 300,
            borderRadius: 24,
            padding: 24,
            background: active ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.05)",
            border: `1.5px solid ${active ? "rgba(231,182,45,.8)" : "rgba(255,255,255,.1)"}`,
            opacity: f < ACT[i] ? 0.35 : 1,
            color: C.white,
          }}
        >
          <div style={{ opacity: card, transform: `translateY(${(1 - card) * 16}px)` }}>{f >= ACT[i] ? children : null}</div>
        </div>
      </div>
    </At>
  );
}

const chip = (bg: string, fg: string) => ({ display: "inline-block", fontSize: 17, fontWeight: 500, color: fg, background: bg, borderRadius: 999, padding: "5px 14px" });

function NodeDrug({ f }: { f: number }) {
  const second = sp(f, ACT[0] + 10);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 25, fontWeight: 500 }}>AMOXICILLINE 1 g</div>
        <div style={{ marginTop: 8, ...chip("rgba(104,220,199,.16)", C.brand200) }}>Antibiotique</div>
      </div>
      <div style={{ opacity: second * 0.75 }}>
        <div style={{ fontFamily: MONO, fontSize: 22 }}>PARACÉTAMOL 1000 mg</div>
        <div style={{ marginTop: 8, ...chip("rgba(255,255,255,.08)", C.brand100) }}>Antalgique</div>
      </div>
    </div>
  );
}

function NodeNeed({ f }: { f: number }) {
  const safe = sp(f, ACT[1] + 26);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.brand300 }}>Besoin repéré</div>
      <div style={{ fontSize: 27, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{EXAMPLE.need}</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: C.brand100, opacity: safe, transform: `translateY(${(1 - safe) * 10}px)` }}>
        <ShieldCheck size={24} color={C.brand300} /> Contrôles de sécurité
        <Check size={20} color={C.brand300} strokeWidth={3} style={{ marginLeft: "auto" }} />
      </div>
    </div>
  );
}

const TILES = [
  { n: "vitamine-c-1000", match: false },
  { n: "probio-flore-10", match: true, pick: true },
  { n: "spray-nasal-marin", match: false },
  { n: "probio-enfant", match: true, empty: true },
  { n: "magnesium-marin-b6", match: false },
  { n: "probio-confort", match: true },
  { n: "pastilles-gorge", match: false },
  { n: "calcium-vitamine-d", match: false },
  { n: "brumisateur", match: false },
];

function NodeStock({ f }: { f: number }) {
  const filter = tw(f, [ACT[2] + 22, ACT[2] + 36], [0, 1]);
  const pick = sp(f, ACT[2] + 44, { damping: 14, stiffness: 160 });
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {TILES.map((t, i) => {
          const p = sp(f, ACT[2] + 2 + i * 2, { damping: 18, stiffness: 200 });
          const dim = !t.match || t.empty ? 1 - 0.72 * filter : 1;
          const chosen = t.pick ? pick : 0;
          return (
            <div key={t.n} style={{ position: "relative", opacity: p * dim, transform: `scale(${0.8 + 0.2 * p + 0.08 * chosen})` }}>
              <ProductTile name={t.n} size={98} style={{ boxShadow: chosen ? `0 0 0 ${4 * chosen}px ${C.accent400}, 0 12px 30px -8px rgba(231,182,45,.5)` : "none" }} />
              {t.empty && filter > 0 && (
                <span style={{ position: "absolute", right: -4, top: -6, fontSize: 14, fontWeight: 600, color: C.brand950, background: C.brand100, borderRadius: 999, padding: "2px 9px", opacity: filter }}>0</span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, fontSize: 19, color: C.brand100, opacity: pick }}>En stock : {EXAMPLE.stock}</div>
    </div>
  );
}

function NodeAdvice({ f }: { f: number }) {
  const t = sp(f, ACT[3] + 8, { damping: 16, stiffness: 160 });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <ProductTile name="probio-flore-10" size={96} style={{ transform: `scale(${0.85 + 0.15 * t})` }} />
        <div style={chip("rgba(231,182,45,.16)", C.accent300)}>Conseil associé</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>{EXAMPLE.product}</div>
      <div style={{ fontSize: 18, color: C.brand100, lineHeight: 1.35 }}>{EXAMPLE.ruleTitle}</div>
    </div>
  );
}
