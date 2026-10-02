import type { CSSProperties } from "react";
import { CalendarCheck, Printer, RefreshCw } from "lucide-react";
import { C, FONT, SHADOW, sp, tw, useF } from "../theme";
import { EXAMPLE, ProductTile } from "./product";

/**
 * Le plan du patient tel qu'il s'ouvre sur son téléphone (/plan/[id]) : en-tête
 * de l'officine, bouton des rappels, tableau des prises. Posologie du scénario
 * de démonstration : amoxicilline 1 g, matin et soir, 6 jours.
 */
export function Phone({ h = 860, children }: { h?: number; children: React.ReactNode }) {
  const w = h * 0.49;
  return (
    <div style={{ width: w, height: h, borderRadius: 64, background: C.ink900, padding: 14, boxShadow: SHADOW.lift }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, overflow: "hidden", background: "#EEF1F4" }}>
        <div style={{ position: "absolute", top: 12, left: "50%", width: 120, height: 32, marginLeft: -60, borderRadius: 20, background: C.ink900, zIndex: 3 }} />
        {children}
      </div>
    </div>
  );
}

export function PlanScreen({ show }: { show: (i: number) => number }) {
  const b = (i: number): CSSProperties => ({ opacity: show(i), transform: `translateY(${(1 - show(i)) * 14}px)` });
  const Dot = ({ on }: { on: boolean }) => (
    <span style={{ width: 34, height: 26, borderRadius: 8, background: on ? C.brand100 : "transparent", color: on ? C.brand800 : C.ink300, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "1" : "—"}</span>
  );
  return (
    <div style={{ padding: "64px 18px 18px", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...b(0) }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: C.ink900 }}>Votre pharmacie</span>
        <Printer size={18} color={C.ink500} />
      </div>
      <div style={{ background: "#0F766E", color: C.white, borderRadius: 12, padding: "12px 14px", fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, ...b(0) }}>
        <CalendarCheck size={18} /> Ajouter les rappels à mon agenda
      </div>
      <div style={{ background: C.white, borderRadius: 16, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10, ...b(1) }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: C.brand700 }}>PLAN PERSONNALISÉ</div>
        <div style={{ fontSize: 19, fontWeight: 600, color: C.ink900 }}>Votre traitement au quotidien</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 34px)", gap: 6, alignItems: "center", fontSize: 11.5, color: C.ink500, fontWeight: 500 }}>
          <span>Médicament</span><span>Matin</span><span>Midi</span><span>Soir</span><span>Couch.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, 34px)", gap: 6, alignItems: "center", ...b(2) }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink900 }}>AMOXICILLINE 1 g</div>
            <div style={{ fontSize: 12.5, color: C.ink500 }}>Pendant 6 jours</div>
          </div>
          <Dot on /><Dot on={false} /><Dot on /><Dot on={false} />
        </div>
      </div>
      <div style={{ background: C.white, borderRadius: 16, padding: "14px", ...b(3) }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink900 }}>Les conseils de votre pharmacien</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
          <ProductTile name="probio-flore-10" size={46} />
          <div style={{ fontSize: 13, color: C.ink700, lineHeight: 1.35 }}>{EXAMPLE.product} : à prendre à distance de l&apos;antibiotique.</div>
        </div>
      </div>
    </div>
  );
}

/** Une notification de l'agenda du téléphone (fichier rappels-de-prise.ics). */
export function CalendarBanner({ title, body, time, style }: { title: string; body: string; time: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "rgba(255,255,255,.96)", borderRadius: 22, padding: "14px 16px", boxShadow: "0 18px 40px -16px rgba(15,23,42,.45)", fontFamily: FONT, ...style }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: C.brand600, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <CalendarCheck size={20} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.ink900, lineHeight: 1.25 }}>{title}</span>
          <span style={{ fontSize: 13, color: C.ink400, flexShrink: 0 }}>{time}</span>
        </div>
        <div style={{ fontSize: 13.5, color: C.ink600, marginTop: 2, lineHeight: 1.3 }}>{body}</div>
      </div>
    </div>
  );
}

/** Un QR code décoratif (motifs de repérage, modules déterministes) : il n'ouvre rien. */
export function QrMark({ size }: { size: number }) {
  const n = 25;
  const cell = size / n;
  const finder = (x: number, y: number) => x < 7 && y < 7 || x >= n - 7 && y < 7 || x < 7 && y >= n - 7;
  const rects = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) continue;
    if (((x * 73 + y * 151 + x * y * 7) % 11) < 5) rects.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={C.ink900} />);
  }
  const F = ({ x, y }: { x: number; y: number }) => (
    <g>
      <rect x={x * cell} y={y * cell} width={7 * cell} height={7 * cell} rx={cell * 1.4} fill={C.ink900} />
      <rect x={(x + 1) * cell} y={(y + 1) * cell} width={5 * cell} height={5 * cell} rx={cell} fill={C.white} />
      <rect x={(x + 2) * cell} y={(y + 2) * cell} width={3 * cell} height={3 * cell} rx={cell * 0.6} fill={C.ink900} />
    </g>
  );
  return (
    <svg width={size} height={size}>
      {rects}
      <F x={0} y={0} /><F x={n - 7} y={0} /><F x={0} y={n - 7} />
    </svg>
  );
}

const card: CSSProperties = { background: C.white, borderRadius: 24, border: `1px solid ${C.ink200}`, boxShadow: SHADOW.card, fontFamily: FONT };

/** Le stock relié : la pastille de fraîcheur, et chaque bip qui décompte. */
export function StockPanel({ at, bipAt }: { at: number; bipAt: number }) {
  const f = useF();
  const rows = [
    { tile: "probio-flore-10", name: EXAMPLE.product, cat: "Probiotiques", qty: EXAMPLE.stock, tone: "ok" as const },
    { tile: "spray-nasal-marin", name: "Spray nasal eau de mer", cat: "ORL", qty: 12, tone: "ok" as const },
    { tile: "pastilles-gorge", name: "Pastilles gorge miel-citron", cat: "ORL", qty: 3, tone: "low" as const },
    { tile: "vitamine-c-1000", name: "Vitamine C 1000", cat: "Vitamines", qty: 18, tone: "ok" as const },
  ];
  const minus = tw(f, [bipAt, bipAt + 10], [0, 1]);
  const minusOut = tw(f, [bipAt + 26, bipAt + 40], [0, 1]);
  return (
    <div style={{ ...card, width: 900, padding: "26px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: C.ink900 }}>Stock</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 500, color: C.success700, background: C.success50, borderRadius: 999, padding: "6px 14px", boxShadow: `inset 0 0 0 1px ${C.success100}` }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: C.success600 }} /> Stock à jour · il y a 3 min
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600, color: C.brand700, border: `1.5px solid ${C.brand200}`, borderRadius: 12, padding: "8px 14px" }}>
          <RefreshCw size={18} /> Mettre à jour maintenant
        </span>
      </div>
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => {
          const p = sp(f, at + 6 + i * 5, { damping: 26, stiffness: 160 });
          const qty = i === 0 && minus > 0.5 ? r.qty - 1 : r.qty;
          return (
            <div key={r.name} style={{ position: "relative", display: "flex", alignItems: "center", gap: 16, padding: "10px 14px", borderRadius: 14, background: i === 0 ? C.brand50 : C.ink50, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
              <ProductTile name={r.tile} size={54} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 21, fontWeight: 600, color: C.ink900 }}>{r.name}</div>
                <div style={{ fontSize: 15, color: C.ink500 }}>{r.cat}</div>
              </div>
              <span style={{ fontSize: 17, fontWeight: 500, borderRadius: 999, padding: "6px 14px", fontVariantNumeric: "tabular-nums", color: r.tone === "low" ? C.warning700 : C.success700, background: r.tone === "low" ? C.warning50 : C.success50, boxShadow: `inset 0 0 0 1px ${r.tone === "low" ? C.warning300 : C.success100}` }}>
                {r.tone === "low" ? `Plus que ${qty} en stock` : `En stock · ${qty}`}
              </span>
              {i === 0 && minus > 0 && minusOut < 1 && (
                <span style={{ position: "absolute", right: 200, top: 8 - 18 * minus, fontSize: 18, fontWeight: 600, color: C.brand700, background: C.white, borderRadius: 999, padding: "4px 12px", boxShadow: SHADOW.card, opacity: minus * (1 - minusOut) }}>
                  bip · −1
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Le pilotage du titulaire : périodes, décisions, et le détail par collaborateur. */
export function PilotagePanel({ at }: { at: number }) {
  const f = useF();
  const periods = ["Aujourd'hui", "Cette semaine", "Ce mois"];
  const active = f < at + 16 ? 0 : f < at + 30 ? 1 : 2;
  const grow = sp(f, at + 32, { damping: 30, stiffness: 70 });
  const n = (v: number) => Math.round(v * grow);
  const people = [
    { ini: "CA", name: "Camille", role: "Pharmacienne", ok: 14, no: 4 },
    { ini: "HU", name: "Hugo", role: "Préparateur", ok: 10, no: 3 },
    { ini: "LÉ", name: "Léa", role: "Préparatrice", ok: 7, no: 4 },
  ];
  return (
    <div style={{ ...card, width: 940, padding: "26px 30px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: C.ink900 }}>Pilotage de l&apos;officine</span>
        <span style={{ marginLeft: "auto", fontSize: 14, color: C.ink400 }}>exemple</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {periods.map((p, i) => (
          <span key={p} style={{ fontSize: 17, fontWeight: 500, borderRadius: 999, padding: "8px 16px", background: i === active ? C.brand600 : C.white, color: i === active ? C.white : C.ink600, border: `1px solid ${i === active ? C.brand600 : C.ink200}` }}>{p}</span>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 18 }}>
        {[
          { l: "Conseils proposés", v: n(48), c: C.ink900 },
          { l: "Acceptés", v: n(31), c: C.success700 },
          { l: "Refusés", v: n(11), c: C.ink900 },
        ].map((k) => (
          <div key={k.l} style={{ border: `1px solid ${C.ink200}`, borderRadius: 16, padding: "14px 18px" }}>
            <div style={{ fontSize: 16, color: C.ink500 }}>{k.l}</div>
            <div style={{ fontSize: 40, fontWeight: 600, color: k.c, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, fontSize: 15, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink500 }}>Par collaborateur</div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {people.map((p, i) => {
          const rate = p.ok / (p.ok + p.no);
          const g = sp(f, at + 36 + i * 5, { damping: 30, stiffness: 80 });
          return (
            <div key={p.name} style={{ display: "grid", gridTemplateColumns: "48px 1.4fr 0.7fr 0.7fr 1.6fr", alignItems: "center", gap: 14, padding: "8px 10px", borderRadius: 12, background: C.ink50 }}>
              <span style={{ width: 44, height: 44, borderRadius: 22, background: C.brand100, color: C.brand800, fontWeight: 600, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{p.ini}</span>
              <div>
                <div style={{ fontSize: 19, fontWeight: 600, color: C.ink900 }}>{p.name}</div>
                <div style={{ fontSize: 14, color: C.ink500 }}>{p.role}</div>
              </div>
              <div style={{ fontSize: 18, color: C.success700, fontVariantNumeric: "tabular-nums" }}>{Math.round(p.ok * g)} acceptés</div>
              <div style={{ fontSize: 18, color: C.ink600, fontVariantNumeric: "tabular-nums" }}>{Math.round(p.no * g)} refusés</div>
              <div style={{ height: 12, borderRadius: 6, background: C.ink200, overflow: "hidden" }}>
                <div style={{ width: `${rate * 100 * g}%`, height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.brand400}, ${C.brand600})` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
