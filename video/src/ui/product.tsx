import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { ArrowRight, Check, Lightbulb, Pill, RefreshCw, X } from "lucide-react";
import { C, FONT, SHADOW } from "../theme";
import { mix } from "./counter";

/**
 * Les écrans de PharmaBoost, redessinés à l'identique (textes et structure
 * pris dans le code). Produit, prix et marge sont ceux du catalogue de
 * démonstration : des exemples, signalés comme tels à l'écran.
 */

/**
 * L'exemple suit une vraie règle du moteur : « Photosensibilisation »
 * (src/core/ai/engines/advice.ts, règle de sécurité — une cycline rend la
 * peau sensible au soleil, RCP de la doxycycline). Textes repris de la règle.
 */
export const EXAMPLE = {
  ref: "ORD-0042",
  drugs: ["DOXYCYCLINE 100 mg", "PARACÉTAMOL 1000 mg"],
  product: "Crème solaire SPF 50+",
  tile: "creme-solaire-spf50",
  price: "16,90 €",
  margin: "marge 7,40 €",
  stock: 18,
  ruleTitle: "Photosensibilisation",
  need: "Protection solaire sous doxycycline",
  reason: "Doxycycline : la peau devient plus sensible au soleil pendant tout le traitement.",
  toast: "Doxycycline photosensibilise : l'exposition au soleil demande une précaution.",
  say: "« Pendant tout le traitement, la doxycycline rend la peau plus sensible au soleil. Évitez l'exposition directe : Crème solaire SPF 50+ protège les zones découvertes. »",
  planAdvice: "avant chaque sortie, pendant tout le traitement.",
};

/** Les produits qui ont leur vraie boîte (la même que sur le site) ; les autres gardent leur vignette. */
const BOXES: Record<string, string> = {
  "probio-flore-10": "produits/boites/flore-equilibre-10-milliards.webp",
  "creme-solaire-spf50": "produits/boites/creme-solaire-spf50.webp",
  "spray-nasal-marin": "produits/boites/spray-nasal-eau-de-mer.webp",
  "pastilles-gorge": "produits/boites/pastilles-gorge-miel-citron.webp",
};

export function ProductTile({ name, size, style }: { name: string; size: number; style?: CSSProperties }) {
  const box = BOXES[name];
  if (box) return <Img src={staticFile(box)} style={{ width: size, height: size, borderRadius: size * 0.14, display: "block", background: "#F1F5F3", objectFit: "contain", ...style }} />;
  return <Img src={staticFile(`produits/${name}.svg`)} style={{ width: size, height: size, borderRadius: size * 0.14, display: "block", ...style }} />;
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

/**
 * « Pharma » + « Boost », comme le logo de l'application (src/components/app/logo.tsx) :
 * gras, −0,025em, « Boost » en brand-700 — brand-400 sur fond sombre, comme le thème sombre.
 */
export function Wordmark({ size, dark = false }: { size: number; dark?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>
      <span style={{ color: dark ? C.white : C.ink900 }}>Pharma</span>
      <span style={{ color: dark ? C.brand400 : C.brand700 }}>Boost</span>
    </span>
  );
}

/**
 * L'ancien avis en coin d'écran (agent/src/toast.ts), remplacé par la bannière
 * du comptoir (ui/banner.tsx). Plus aucun film du site ne doit le montrer.
 * @deprecated garder seulement le temps que les derniers films passent à la bannière.
 */
export function Toast({ w }: { w: number }) {
  const k = w / 420;
  return (
    <div style={{ width: w, background: "#18211F", borderRadius: 14 * k, padding: `${12 * k}px ${14 * k}px`, boxShadow: SHADOW.toast, border: `1px solid ${C.ink800}`, fontFamily: FONT }}>
      <div style={{ fontSize: 12 * k, fontWeight: 600, color: "#78C8B4" }}>PharmaBoost · {EXAMPLE.ref}</div>
      <div style={{ fontSize: 13.5 * k, fontWeight: 600, color: C.white, marginTop: 3 * k }}>{EXAMPLE.drugs.join(" · ")}</div>
      <div style={{ fontSize: 13 * k, color: C.white, lineHeight: 1.4, marginTop: 8 * k }}>
        • {EXAMPLE.product} · {EXAMPLE.price} · {EXAMPLE.toast}
      </div>
      <div style={{ fontSize: 10.5 * k, color: "#A0AAA6", marginTop: 9 * k }}>Cliquer pour ouvrir dans PharmaBoost · disparaît dans 15 s</div>
    </div>
  );
}

function Badge({ children, bg, fg }: { children: ReactNode; bg: string; fg: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 18, fontWeight: 500, color: fg, background: bg, borderRadius: 999, padding: "4px 14px", fontVariantNumeric: "tabular-nums" }}>{children}</span>;
}

/**
 * La carte de conseil de l'écran de vente, dans le navigateur
 * (vente/[id]/advice-zone.tsx) : bandeau « Conseil associé » avec la famille,
 * la raison, « Solution disponible dans votre officine », « À dire au patient »,
 * les trois choix. Au comptoir, c'est la bannière (ui/banner.tsx) qui sert ;
 * cette carte montre « l'écran de vente ». `show` (0→1 par bloc) fait monter la
 * carte ; `accepted` la fait passer au vert.
 */
export function AdviceCard({ w, show, accepted, press, stockPulse = 0 }: { w: number; show: (i: number) => number; accepted: number; press: number; stockPulse?: number }) {
  const block = (i: number): CSSProperties => ({ opacity: show(i), transform: `translateY(${(1 - show(i)) * 22}px)` });
  const border = mix(C.ink200, "#87E39F", accepted);
  return (
    <div style={{ width: w, background: C.white, borderRadius: 16, border: `1.5px solid ${border}`, boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 16px 40px -18px rgba(16,24,40,.28)", overflow: "hidden", fontFamily: FONT, padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: C.success50, borderRadius: 12, padding: "12px 16px", ...block(0) }}>
        <span style={{ width: 42, height: 42, borderRadius: 21, background: C.success600, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Lightbulb size={22} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.success700 }}>Conseil associé</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.ink900, letterSpacing: "-0.01em" }}>{EXAMPLE.ruleTitle}</div>
        </div>
        <span style={{ fontSize: 16, color: C.ink600, background: C.ink100, border: `1px solid ${C.ink200}`, borderRadius: 999, padding: "3px 12px", marginLeft: 6 }}>Parapharmacie</span>
        <span style={{ marginLeft: "auto", fontSize: 16, color: C.ink600, background: C.white, border: `1px solid ${C.ink300}`, borderRadius: 999, padding: "3px 12px" }}>Suggestion n°1</span>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: C.ink100, borderRadius: 12, padding: "14px 18px", fontSize: 20, lineHeight: 1.45, color: C.ink900, ...block(1) }}>
        <Pill size={22} color={C.ink400} style={{ flexShrink: 0, marginTop: 3 }} /> {EXAMPLE.reason}
      </div>

      <div style={block(2)}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.ink400 }}>Solution disponible dans votre officine</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10, border: `1px solid ${C.ink200}`, borderRadius: 12, padding: "14px 18px" }}>
          <ProductTile name={EXAMPLE.tile} size={92} style={{ border: `1px solid ${C.ink200}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.ink900, letterSpacing: "-0.01em" }}>{EXAMPLE.product}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, ...block(3) }}>
              <span style={{ fontSize: 32, fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums" }}>{EXAMPLE.price}</span>
              <span style={{ fontSize: 17, fontWeight: 500, color: C.success700, background: C.success50, borderRadius: 7, padding: "3px 9px" }}>{EXAMPLE.margin}</span>
              <span style={{ position: "relative" }}>
                <Badge bg={C.success100} fg={C.success700}>
                  <Check size={16} strokeWidth={3} /> En stock : {EXAMPLE.stock}
                </Badge>
                {stockPulse > 0 && <span style={{ position: "absolute", inset: -6 - 10 * stockPulse, borderRadius: 999, border: `2px solid ${C.brand400}`, opacity: 1 - stockPulse }} />}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: C.brand50, border: `1px solid ${C.brand100}`, borderRadius: 12, padding: "14px 18px", ...block(4) }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.brand800 }}>À dire au patient</div>
        <div style={{ fontSize: 21, color: C.ink900, lineHeight: 1.45, marginTop: 4 }}>{EXAMPLE.say}</div>
      </div>

      {accepted > 0.02 ? (
        <div style={{ height: 84, borderRadius: 12, background: "rgba(212,247,224,.7)", display: "flex", alignItems: "center", gap: 14, padding: "0 22px", fontSize: 24, fontWeight: 600, color: "#1D5B2B", opacity: accepted, transform: `translateY(${(1 - accepted) * 10}px)` }}>
          <Check size={30} strokeWidth={2.6} color={C.success700} /> Ajouté à la délivrance
          <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 500, color: C.success700, textDecoration: "underline" }}>Annuler</span>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12, ...block(5) }}>
          <ActionButton label="Proposer ce produit" hint="Ajouté à la délivrance" tone="primary" pressed={press} />
          <ActionButton label="Autre produit" hint="Changer de référence" tone="neutral" />
          <ActionButton label="Ignorer" hint="Refus enregistré" tone="ghost" />
        </div>
      )}
    </div>
  );
}

/** Les trois choix de la carte (DecisionButton de l'écran de vente) : même hauteur, même graisse, le vert n'est pas plus gros. */
export function ActionButton({ label, hint, tone, pressed = 0 }: { label: string; hint: string; tone: "primary" | "neutral" | "ghost"; pressed?: number }) {
  const primary = tone === "primary";
  const Icon = primary ? Check : tone === "neutral" ? RefreshCw : X;
  return (
    <div
      style={{
        height: 86,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 18px",
        background: primary ? C.success600 : C.white,
        border: `2px solid ${primary ? C.success600 : C.ink300}`,
        color: primary ? C.white : tone === "neutral" ? C.ink900 : C.ink600,
        boxShadow: primary ? "0 8px 20px -10px rgba(22,163,74,.8)" : "none",
        transform: `scale(${1 - 0.04 * pressed})`,
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: primary ? "rgba(255,255,255,.2)" : C.ink100 }}>
        <Icon size={22} strokeWidth={2.75} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</span>
        <span style={{ display: "block", fontSize: 15, opacity: primary ? 0.85 : 1, color: primary ? C.white : C.ink400, marginTop: 2 }}>{hint}</span>
      </span>
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

/** Le bouton principal du site, « Réserver une démo » : une pilule, la flèche. Blanc sur les fonds sombres. `label` le renomme (« Devenir partenaire »). */
export function CtaButton({ shine, dark = true, label = "Réserver une démo" }: { shine: number; dark?: boolean; label?: string }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", display: "inline-flex", alignItems: "center", gap: 16, height: 92, padding: "0 50px", borderRadius: 999, background: dark ? C.white : C.brand600, color: dark ? C.brand700 : C.white, fontSize: 36, fontWeight: 600, letterSpacing: "-0.01em", boxShadow: dark ? "0 30px 60px -24px rgba(0,0,0,.5)" : SHADOW.lift }}>
      {label} <ArrowRight size={36} strokeWidth={2.4} />
      <div style={{ position: "absolute", top: 0, bottom: 0, width: 120, left: -160 + shine * 760, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.0) 20%, rgba(54,232,200,.3) 50%, transparent 80%)" }} />
    </div>
  );
}
