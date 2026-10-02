import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { ArrowRight, Check, Lightbulb, Pill } from "lucide-react";
import { C, FONT, SHADOW } from "../theme";
import { mix } from "./counter";

/**
 * Les écrans de PharmaBoost, redessinés à l'identique (textes et structure
 * pris dans le code). Produit, prix et marge sont ceux du catalogue de
 * démonstration : des exemples, signalés comme tels à l'écran.
 */

export const EXAMPLE = {
  ref: "ORD-0042",
  drugs: ["AMOXICILLINE 1 g", "PARACÉTAMOL 1000 mg"],
  product: "Flore Équilibre 10 milliards",
  price: "14,90 €",
  margin: "marge 8,70 €",
  stock: 34,
  ruleTitle: "Tolérance digestive pendant l'antibiothérapie",
  need: "Tolérance digestive sous antibiotique",
  reason: "Antibiothérapie (amoxicilline) : la flore intestinale peut être perturbée pendant la cure.",
  say: "« Amoxicilline est un antibiotique : il peut perturber la flore intestinale. Flore Équilibre 10 milliards l'accompagne, à prendre à distance de l'antibiotique. »",
};

export function ProductTile({ name, size, style }: { name: string; size: number; style?: CSSProperties }) {
  return <Img src={staticFile(`produits/${name}.svg`)} style={{ width: size, height: size, borderRadius: size * 0.075, display: "block", ...style }} />;
}

/** Le logo : le symbole sur son squircle blanc, masqué à 22 %, centré sur le squircle. */
export function Logo({ size, style }: { size: number; style?: CSSProperties }) {
  // Le squircle occupe 1098×1062 px à (72, 90) sur la toile de 1254 px.
  const k = size / 1098;
  return (
    <div style={{ width: size, height: 1062 * k, borderRadius: "22%", overflow: "hidden", position: "relative", ...style }}>
      <Img src={staticFile("logo.png")} style={{ position: "absolute", width: 1254 * k, height: 1254 * k, left: -72 * k, top: -90 * k, maxWidth: "none" }} />
    </div>
  );
}

/** « Pharma » + « Boost » : texte vivant, comme sur le site. */
export function Wordmark({ size, dark = false }: { size: number; dark?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
      <span style={{ color: dark ? C.white : C.ink900 }}>Pharma</span>
      <span style={{ color: dark ? C.accent300 : C.brand600 }}>Boost</span>
    </span>
  );
}

/**
 * L'avis en coin d'écran du poste Windows (agent/src/toast.ts) : fond
 * #18211F, titre, boîtes bipées, une ligne par conseil, le pied. Pas de bouton :
 * un clic ouvre la vente dans PharmaBoost.
 */
export function Toast({ w }: { w: number }) {
  const k = w / 420;
  return (
    <div style={{ width: w, background: C.toastBg, borderRadius: 14 * k, padding: `${12 * k}px ${14 * k}px`, boxShadow: SHADOW.toast, border: `1px solid ${C.ink800}`, fontFamily: FONT }}>
      <div style={{ fontSize: 12 * k, fontWeight: 600, color: C.toastTitle }}>PharmaBoost · {EXAMPLE.ref}</div>
      <div style={{ fontSize: 13.5 * k, fontWeight: 600, color: C.white, marginTop: 3 * k }}>{EXAMPLE.drugs.join(" · ")}</div>
      <div style={{ fontSize: 13 * k, color: C.white, lineHeight: 1.4, marginTop: 8 * k }}>
        • {EXAMPLE.product} · {EXAMPLE.price} · Antibiothérapie (AMOXICILLINE) : la flore intestinale peut être perturbée pendant la cure.
      </div>
      <div style={{ fontSize: 10.5 * k, color: C.toastFoot, marginTop: 9 * k }}>Cliquer pour ouvrir dans PharmaBoost · disparaît dans 15 s</div>
    </div>
  );
}

function Badge({ children, bg, fg, ring }: { children: ReactNode; bg: string; fg: string; ring: string }) {
  return <span style={{ fontSize: 19, fontWeight: 500, color: fg, background: bg, borderRadius: 999, padding: "6px 16px", boxShadow: `inset 0 0 0 1px ${ring}` }}>{children}</span>;
}

/**
 * La carte de conseil de l'écran de vente (vente/[id]/advice-zone.tsx).
 * `show` (0→1 par bloc) fait monter la carte ; `accepted` la fait passer au vert.
 */
export function AdviceCard({ w, show, accepted, press, stockPulse = 0 }: { w: number; show: (i: number) => number; accepted: number; press: number; stockPulse?: number }) {
  const block = (i: number): CSSProperties => ({ opacity: show(i), transform: `translateY(${(1 - show(i)) * 22}px)` });
  const border = mix(C.ink200, C.success600, accepted);
  return (
    <div style={{ width: w, background: C.white, borderRadius: 24, border: `1.5px solid ${border}`, boxShadow: SHADOW.lift, overflow: "hidden", fontFamily: FONT }}>
      <div style={{ height: 7, background: accepted > 0.5 ? C.success600 : `linear-gradient(90deg, ${C.brand400}, ${C.brand600})` }} />
      <div style={{ padding: "26px 34px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, ...block(0) }}>
          <span style={{ width: 46, height: 46, borderRadius: 23, background: C.success600, color: C.white, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Lightbulb size={24} />
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.success700 }}>Conseil associé</div>
            <div style={{ fontSize: 27, fontWeight: 600, color: C.ink900, letterSpacing: "-0.015em" }}>{EXAMPLE.ruleTitle}</div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 17, color: C.ink500 }}>Suggestion n°1</span>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", background: C.ink100, borderRadius: 14, padding: "14px 18px", fontSize: 20, color: C.ink700, ...block(1) }}>
          <Pill size={22} color={C.ink500} /> {EXAMPLE.reason}
        </div>

        <div style={block(2)}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink500 }}>Solution disponible dans votre officine</div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 12 }}>
            <ProductTile name="probio-flore-10" size={96} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 30, fontWeight: 600, color: C.ink900, letterSpacing: "-0.015em" }}>{EXAMPLE.product}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 10, ...block(3) }}>
                <Badge bg={C.success50} fg={C.success700} ring={C.success100}>{EXAMPLE.margin}</Badge>
                <span style={{ position: "relative" }}>
                  <Badge bg={C.success50} fg={C.success700} ring={C.success100}>En stock : {EXAMPLE.stock}</Badge>
                  {stockPulse > 0 && <span style={{ position: "absolute", inset: -6 - 10 * stockPulse, borderRadius: 999, border: `2px solid ${C.brand400}`, opacity: 1 - stockPulse }} />}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{EXAMPLE.price}</div>
          </div>
        </div>

        <div style={{ background: C.brand50, borderRadius: 16, padding: "16px 20px", ...block(4) }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.brand700 }}>À dire au patient</div>
          <div style={{ fontSize: 21, color: C.brand900, lineHeight: 1.4, marginTop: 6 }}>{EXAMPLE.say}</div>
        </div>

        {accepted > 0.02 ? (
          <div style={{ height: 96, borderRadius: 16, background: C.success50, border: `1.5px solid ${C.success100}`, display: "flex", alignItems: "center", gap: 14, padding: "0 26px", fontSize: 26, fontWeight: 600, color: C.success700, opacity: accepted, transform: `translateY(${(1 - accepted) * 10}px)` }}>
            <Check size={30} strokeWidth={3} /> Ajouté à la délivrance
            <span style={{ marginLeft: "auto", fontSize: 19, fontWeight: 500, color: C.ink500, textDecoration: "underline" }}>Annuler</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, ...block(5) }}>
            <ActionButton label="Proposer ce produit" hint="Ajouté à la délivrance" tone="primary" pressed={press} />
            <ActionButton label="Autre produit" hint="Changer de référence" tone="neutral" />
            <ActionButton label="Ignorer" hint="Refus enregistré" tone="ghost" />
          </div>
        )}
      </div>
    </div>
  );
}

export function ActionButton({ label, hint, tone, pressed = 0 }: { label: string; hint: string; tone: "primary" | "neutral" | "ghost"; pressed?: number }) {
  const primary = tone === "primary";
  return (
    <div
      style={{
        height: 96,
        borderRadius: 16,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 24px",
        background: primary ? C.success600 : tone === "neutral" ? C.white : C.ink100,
        border: `1.5px solid ${primary ? C.success600 : C.ink200}`,
        color: primary ? C.white : C.ink800,
        boxShadow: primary ? "0 8px 20px -10px rgba(22,163,74,.8)" : "none",
        transform: `scale(${1 - 0.04 * pressed})`,
      }}
    >
      <span style={{ fontSize: 23, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 16, opacity: primary ? 0.85 : 1, color: primary ? C.white : C.ink500, marginTop: 2 }}>{hint}</span>
    </div>
  );
}

/** Le pointeur, avec une onde au clic. */
export function Cursor({ x, y, press = 0, click = -1, opacity = 1 }: { x: number; y: number; press?: number; click?: number; opacity?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}>
      {click >= 0 && click <= 1 && (
        <div style={{ position: "absolute", left: -40 * click, top: -40 * click, width: 80 * click, height: 80 * click, borderRadius: "50%", border: `3px solid ${C.brand400}`, opacity: 1 - click }} />
      )}
      <svg width={40} height={52} viewBox="0 0 20 26" style={{ transform: `scale(${1 - 0.12 * press})`, transformOrigin: "0 0", filter: "drop-shadow(0 4px 6px rgba(15,23,42,.35))" }}>
        <path d="M1 1 L1 20 L6 15.5 L9.5 23.5 L13 22 L9.5 14 L16 14 Z" fill={C.white} stroke={C.ink900} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function CtaButton({ shine }: { shine: number }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", display: "inline-flex", alignItems: "center", gap: 16, height: 92, padding: "0 46px", borderRadius: 20, background: C.white, color: C.brand800, fontSize: 36, fontWeight: 600, boxShadow: "0 30px 60px -24px rgba(0,0,0,.45)" }}>
      Découvrez PharmaBoost <ArrowRight size={36} strokeWidth={2.4} />
      <div style={{ position: "absolute", top: 0, bottom: 0, width: 120, left: -160 + shine * 760, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.0) 20%, rgba(104,220,199,.35) 50%, transparent 80%)" }} />
    </div>
  );
}
