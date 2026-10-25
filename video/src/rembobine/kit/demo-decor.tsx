import { AbsoluteFill } from "remotion";
import { A1, JAKARTA, PB, label } from "./brand";
import { clamp01, prog, IN_OUT } from "../../presentation/motion/kit/ease";
import {
  Bubble,
  CounterScreen,
  Douchette,
  FranceMap,
  GreenCross,
  MedBox,
  Ordonnance,
  Patient,
  Pharmacienne,
  Pharmacy,
  PharmacyBag,
  SET,
  bagSlot,
} from "./decor";

/* ==========================================================================
 * DÉMONSTRATION DU DÉCOR (kit/decor.tsx) — node src/rembobine/tools/planche.mjs --demo decor 0 1 2 3 4 5 6 7
 *   0 → 2   le comptoir, acte 1 : le néon s'allume, la pharmacienne lassée parle (« Autre chose ? »), la douchette bipe
 *   2 → 4   acte 1 : « Non merci. », il prend son sac, se retourne, marche vers la porte qui s'ouvre (carillon)
 *   4 → 6   PharmaBoost : l'écran s'allume, elle pose le probiotique, « Je veux bien ! », signe de la main, clin d'œil
 *   6 → 7   les objets : boîtes, place vide, radio, ordonnance, sacs, douchette, croix, bulles
 *   7 → 8   la carte de France (rouge puis verte) et les trois états de l'écran du comptoir (dont un enfant)
 *   8 → 9   gros plans : visages à l'échelle 2,3, sac en radio et sa place vide (bagSlot) — hors planche par défaut
 * ======================================================================== */

function Tag({ x, y, children, dark }: { x: number; y: number; children: string; dark?: boolean }) {
  return <div style={{ position: "absolute", left: x, top: y, transform: "translateX(-50%)", ...label(16), color: dark ? "#9FB0B6" : PB.inkSoft, whiteSpace: "nowrap" }}>{children}</div>;
}

export function Scene({ t }: { t: number }) {
  if (t < 2) {
    const light = t < 0.45 ? (Math.floor(t * 30) % 3 === 1 ? 0.25 : 0.75) : 1;
    return (
      <Pharmacy t={t} mood="act1" light={light} douchette={false}>
        <Pharmacienne t={t} mood="act1" expression="lasse" talk={[[0.6, 1.7]]} />
        <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} mood="act1" />
        <MedBox kind="amoxicilline" x={SET.slots.box1.x} y={SET.slots.box1.y} w={110} mood="act1" />
        <Douchette t={t} x={SET.slots.box1.x - 8} y={430} angle={-12} size={0.55} beamAt={[0.25, 1.85]} beamLength={60} beamWidth={120} mood="act1" />
        <Patient t={t} mood="act1" grab={0} />
        <Bubble t={t} at={0.55} text="Autre chose ?" side={SET.pharmacienne.bubble.side} mood="act1" x={SET.pharmacienne.bubble.x} y={SET.pharmacienne.bubble.y} />
      </Pharmacy>
    );
  }
  if (t < 4) {
    const leave = prog(t, 2.6, 1.3, (x) => x);
    return (
      <Pharmacy t={t} mood="act1" doorOpen={prog(t, 3.3, 0.3, IN_OUT) - prog(t, 3.85, 0.15, IN_OUT)} chimeAt={3.4}>
        <Pharmacienne t={t} mood="act1" expression="neutre" />
        <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} mood="act1" />
        <Patient t={t} mood="act1" talk={[[1.9, 2.3]]} grab={prog(t, 2.05, 0.5, (x) => x)} leave={leave} />
        <Bubble t={t} at={1.9} exitAt={2.55} text="Non merci." side={SET.patient.bubble.side} mood="act1" x={SET.patient.bubble.x} y={SET.patient.bubble.y} />
      </Pharmacy>
    );
  }
  if (t < 6) {
    return (
      <Pharmacy t={t} mood="pb" screen="pb" screenPower={prog(t, 3.7, 0.6, (x) => x)}>
        <Pharmacienne t={t} mood="pb" expression="sourire" talk={[[4.0, 4.5]]} place={prog(t, 3.6, 1.2, (x) => x)} wink={4.85} />
        <Ordonnance x={SET.slots.rx.x} y={SET.slots.rx.y} w={150} flat={1} rotate={-8} />
        <MedBox kind="amoxicilline" x={SET.slots.box1.x} y={SET.slots.box1.y} w={110} />
        <Patient t={t} mood="pb" expression="sourire" talk={[[4.6, 5.2]]} boxesInBag={2} wave={4.8} />
        <Bubble t={t} at={4.6} exitAt={5.7} text="Je veux bien !" side={SET.patient.bubble.side} mood="pb" x={SET.patient.bubble.x} y={SET.patient.bubble.y} />
      </Pharmacy>
    );
  }
  if (t < 7) {
    const xr = clamp01(Math.sin((t - 6) * Math.PI * 1.2) * 0.5 + 0.5);
    const kinds = ["amoxicilline", "paracetamol", "probiotique", "pastilles"] as const;
    return (
      <AbsoluteFill style={{ background: PB.paper }}>
        {kinds.map((k, i) => (
          <MedBox key={k} kind={k} x={200 + i * 300} y={420} w={230} />
        ))}
        <MedBox ghost={A1.alarm} x={1400} y={420} w={230} t={t}>
          <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 90, color: A1.alarm }}>?</span>
        </MedBox>
        <MedBox kind="amoxicilline" x={1700} y={420} w={230} xray={xr} />
        <Tag x={1400} y={440}>
          ghost
        </Tag>
        <Tag x={1700} y={440}>
          xray
        </Tag>
        <Ordonnance x={220} y={720} w={220} write={clamp01((t - 5.9) * 1.6)} />
        <PharmacyBag x={540} y={520} boxes={2} />
        <PharmacyBag x={800} y={520} boxes={1} xray={xr} />
        <MedBox kind="paracetamol" x={1110} y={860} w={150} />
        <Douchette t={t} x={1110} y={690} angle={-8} size={0.8} beamAt={[6.0, 6.5]} beamLength={70} beamWidth={150} />
        <div style={{ position: "absolute", left: 1290, top: 520, width: 300, height: 360, background: A1.wall, borderRadius: 24 }} />
        <GreenCross t={t} x={1440} y={700} size={120} mood="act1" />
        <GreenCross t={t} x={1740} y={700} size={120} mood="pb" />
        <Bubble t={t} at={5.8} text="Non merci." side="left" mood="act1" x={150} y={190} />
        <Bubble t={t} at={5.8} text="Je veux bien !" side="right" mood="pb" x={1820} y={190} />
        <Bubble t={t} at={5.8} text="Je vous conseille un probiotique." side="left" mood="pb" x={560} y={190} size={44} />
      </AbsoluteFill>
    );
  }
  if (t >= 8) {
    // gros plans (hors planche par défaut) : visages à l'échelle 2, sac en radio avec la place vide
    const slot = bagSlot(1, 360);
    return (
      <AbsoluteFill style={{ background: PB.paper2 }}>
        <Pharmacienne t={t} mood="pb" expression="sourire" talk={[[8.1, 8.6]]} wink={8.7} x={420} y={1180} scale={2.3} />
        <Patient t={t} mood={t < 8.5 ? "pb" : "act1"} expression={t < 8.5 ? "sourire" : "neutre"} talk={[[8.2, 8.45]]} x={1000} y={2040} scale={2.4} />
        <div style={{ position: "absolute", left: 1290, top: 0, width: 630, height: 1080, background: A1.ink }} />
        <PharmacyBag x={1600} y={260} w={360} boxes={1} xray={clamp01((t - 8) * 3)} mood="act1" />
        <MedBox ghost={A1.alarm} x={1600 + slot.x} y={260 + slot.y + slot.w * 0.3} w={slot.w} t={t}>
          <span style={{ fontFamily: JAKARTA, fontWeight: 800, fontSize: 70, color: A1.alarm }}>?</span>
        </MedBox>
      </AbsoluteFill>
    );
  }
  const n = Math.floor((t - 7) * 400);
  return (
    <AbsoluteFill style={{ background: PB.paper }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 960, height: 1080, background: A1.ink }} />
      <FranceMap t={t} x={480} y={400} size={620} color={A1.alarm} base={A1.grey} lit={(i) => (i < n ? 1 : 0)} />
      <FranceMap t={t} x={1440} y={400} size={620} color={PB.stock} base={PB.inkSoft} lit={(i) => clamp01((n - i) / 30)} />
      <CounterScreen t={t} mood="act1" state="off" x={240} y={860} w={260} />
      <CounterScreen t={t} mood="act1" state="grey" x={660} y={860} w={260} />
      <CounterScreen t={t} mood="pb" state="pb" power={clamp01((t - 6.9) * 3)} x={1440} y={860} w={300}>
        <div style={{ position: "absolute", inset: 0, background: PB.paper }}>
          <div style={{ position: "absolute", left: 80, top: 80, right: 80, height: 260, borderRadius: 48, background: PB.green, color: PB.citron, fontFamily: JAKARTA, fontWeight: 800, fontSize: 120, display: "flex", alignItems: "center", padding: "0 70px" }}>enfant 1600 × 1000</div>
        </div>
      </CounterScreen>
      <Tag x={480} y={60} dark>
        act1 · Non merci
      </Tag>
      <Tag x={1440} y={60}>
        pb · vendu
      </Tag>
    </AbsoluteFill>
  );
}
