import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, ArrowRight, BadgePercent, BookOpen, Check, CirclePlay, Clock, ExternalLink, Eye, FileText, Handshake, Inbox, Info, Lightbulb, MessageSquare, Pill, RefreshCw, ScanBarcode, ShieldOff, ShoppingBag, ShoppingCart, Sparkles, Store, X } from "lucide-react";
import { detectAdviceOpportunities } from "../../../src/core/ai/engines/advice";
import type { PatientContext } from "../../../src/core/ai/types";
import { selectCounterCards, type CounterBrand, type CounterCard } from "../../../src/core/partners/counter-card";
import { INTEGRATION_MODE_LABELS } from "../../../src/core/partners/status";
import { TRAINING_STATUS_LABELS } from "../../../src/core/training/progress";
import { PRESCRIPTION_STATUS } from "../../../src/config/statuses";
import { universeLabel } from "../../../src/config/universes";
import { BUTTON_GRADIENT, C, FONT, MONO, SHADOW } from "../theme";
import { SALES } from "./banner";
import { EXAMPLE, ProductTile } from "./product";

/* ==========================================================================
 * PHARMABOOST PARTENAIRES, redessiné à l'identique.
 *
 * Les écrans d'une gamme partenaire, pour le film des laboratoires : l'écran
 * de vente et sa carte « À découvrir · gamme partenaire »
 * (src/app/(app)/vente/[id]/partner-cards.tsx), la page d'une marque pour
 * l'officine (src/app/(app)/partenaires/[slug]/page.tsx), le bloc « Contacter
 * ou commander » (partner-actions.tsx), les statistiques agrégées
 * (src/server/services/partners/stats.ts). Cotes et textes pris dans le code,
 * en pixels de l'application : la fenêtre les agrandit (`zoom`).
 *
 * Ce que la carte affiche passe par le VRAI code : le besoin vient du moteur de
 * conseil (advice.ts) sur la vente de la bannière, la carte du sélecteur
 * `selectCounterCards` (src/core/partners/counter-card.ts), qui la calcule
 * APRÈS le moteur, à partir du besoin qu'il a déjà retenu. Si le sélecteur ne
 * montrait pas la carte pour cette vente, le rendu échouerait.
 *
 * Aucun partenaire réel : « Marque A », « Laboratoire A », des produits, prix
 * et conditions d'exemple, dits à l'écran ; les statistiques sans chiffre.
 * ======================================================================== */

// ---- Les données -------------------------------------------------------------

/** La marque d'exemple (aucun laboratoire réel), dans l'univers des compléments alimentaires. */
export const PARTNER = {
  brand: "Marque A",
  lab: "Laboratoire A",
  range: "Gamme Ferments",
  universes: ["COMPLEMENTS_ALIMENTAIRES"],
};

/** La vente du film : l'amoxicilline seule, celle que la bannière vient de montrer (un conseil, le probiotique). */
const SALE = SALES.antibiotique;
const ADVICE = SALE.advice[0];

/** La vente sans patient (mode « sans patient »), comme dans ui/banner.tsx. */
const NO_PATIENT: PatientContext = { patientId: null, ageYears: null, sex: "UNSPECIFIED", isPregnant: null, isBreastfeeding: null, renalImpairment: null, hepaticImpairment: null, allergies: [], chronicConditions: [], currentTreatments: [], hasAdviceConsent: false };

type Opportunity = ReturnType<typeof detectAdviceOpportunities>[number];
let opportunityMemo: Opportunity | null = null;

/** Le besoin retenu par le moteur sur cette vente (règle du probiotique) : titre, raison courte, catégorie, bénéfices. */
export function saleOpportunity(): Opportunity {
  if (opportunityMemo) return opportunityMemo;
  const found = detectAdviceOpportunities({
    drugs: SALE.drugs.map((d, lineIndex) => ({ lineIndex, drugName: SALE.lines[lineIndex]?.name ?? d.name, knowledge: d, officialSubstance: d.substance })),
    patient: NO_PATIENT,
  }).find((o) => (o.ruleKey ?? o.key) === ADVICE.rule);
  if (!found) throw new Error(`Film : la règle « ${ADVICE.rule} » ne retient aucun besoin pour ${SALE.lines.map((l) => l.name).join(" + ")}.`);
  opportunityMemo = found;
  return found;
}

const BRAND: CounterBrand = { brandId: "exemple-marque-a", slug: "marque-a", name: PARTNER.brand, brandKey: "marque a", partnerName: PARTNER.lab, logoUrl: null, universes: PARTNER.universes };
let cardMemo: CounterCard | null = null;

/**
 * La carte du comptoir, calculée par le sélecteur de l'application à partir du
 * besoin retenu : un conseil proposé, ni bloqué ni écarté, dont le produit
 * (PROBIOTIQUE, sans marque) n'est pas de la marque partenaire.
 */
export function partnerCard(): CounterCard {
  if (cardMemo) return cardMemo;
  const o = saleOpportunity();
  const [card] = selectCounterCards(
    [{ recommendationId: ADVICE.id, category: o.category, opportunityBlocked: o.isBlocked, patientAnswer: null, status: "PROPOSED", contraindicated: false, productBrandKey: null }],
    [BRAND],
  );
  if (!card) throw new Error("Film : le sélecteur ne montrerait aucune gamme partenaire sur cette vente.");
  cardMemo = card;
  return card;
}

/** « Une alternative existe dans cet univers : compléments alimentaires. » (partner-cards.tsx). */
export function partnerLine(card: CounterCard) {
  return `Une alternative existe dans cet univers : ${universeLabel(card.universe).toLowerCase()}.`;
}

const price = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

// ---- Les briques de l'application ------------------------------------------

type Tone = "neutral" | "brand" | "accent" | "success" | "info";
/** Badge (src/components/ui/badge.tsx) : fond, texte, anneau. */
const TONES: Record<Tone, [string, string, string]> = {
  neutral: [C.ink100, C.ink700, C.ink200],
  brand: [C.brand50, C.brand700, C.brand200],
  accent: [C.accent50, "#7E4E03", C.accent200],
  success: [C.success50, C.success700, C.success100],
  info: ["#F0F7FF", "#2654C8", "#DEEDFF"],
};

export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  const [bg, fg, ring] = TONES[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "2px 8px", fontSize: 11.5, lineHeight: "16px", fontWeight: 500, whiteSpace: "nowrap", background: bg, color: fg, boxShadow: `inset 0 0 0 1px ${ring}` }}>
      {icon}
      {children}
    </span>
  );
}

/** Card : rayon 12, bord ink-200, fond blanc, ombre de carte. */
export function AppCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ borderRadius: 12, border: `1px solid ${C.ink200}`, background: C.white, boxShadow: "0 1px 2px rgba(23,33,38,.05), 0 4px 14px -6px rgba(30,133,120,.12)", ...style }}>{children}</div>;
}

function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "22px 24px 14px" }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 16, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.025em", color: C.ink900 }}>{title}</div>
        {description && <div style={{ fontSize: 14, lineHeight: "20px", color: C.ink600 }}>{description}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 17, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: C.ink900 }}>{title}</div>
      {description && <div style={{ fontSize: 14, lineHeight: "20px", color: C.ink600 }}>{description}</div>}
    </div>
  );
}

/** Alert (src/components/ui/feedback.tsx), tons neutre et info. */
function Alert({ tone, title, icon, children, style }: { tone: "neutral" | "info"; title?: string; icon?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  const neutral = tone === "neutral";
  return (
    <div style={{ display: "flex", gap: 12, borderRadius: 10, padding: 14, border: `1px solid ${neutral ? C.ink200 : "#DEEDFF"}`, background: neutral ? C.ink100 : "#F0F7FF", ...style }}>
      <span style={{ marginTop: 1, flexShrink: 0, color: neutral ? C.ink500 : "#2C67DD", display: "flex" }}>{icon ?? <Info size={18} />}</span>
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {title && <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink900 }}>{title}</div>}
        {children && <div style={{ fontSize: 13.5, lineHeight: "20px", color: C.ink600 }}>{children}</div>}
      </div>
    </div>
  );
}

/** Button md (src/components/ui/button.tsx) : 40 px, rayon 10 ; primaire en dégradé de marque, contour sinon. */
function AppButton({ variant, icon, children, press = 0, style }: { variant: "primary" | "outline"; icon?: ReactNode; children: ReactNode; press?: number; style?: CSSProperties }) {
  const primary = variant === "primary";
  return (
    <span
      style={{
        position: "relative",
        height: 40,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 16px",
        fontSize: 14,
        fontWeight: 600,
        boxSizing: "border-box",
        background: primary ? BUTTON_GRADIENT : press > 0 ? C.ink100 : C.white,
        color: primary ? C.white : C.ink900,
        border: primary ? "none" : `1px solid ${C.ink300}`,
        boxShadow: primary ? "0 1px 2px rgba(23,33,38,.12)" : undefined,
        transform: `scale(${1 - 0.04 * press})`,
        filter: primary && press > 0 ? `brightness(${1 - 0.12 * press})` : undefined,
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

/** Un pointeur posé DANS l'écran agrandi (au centre de son parent), ramené à sa taille réelle. */
export function InScreen({ zoom, children }: { zoom: number; children: ReactNode }) {
  return <span style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transform: `scale(${1 / zoom})`, transformOrigin: "0 0", zIndex: 5 }}>{children}</span>;
}

/**
 * Une fenêtre de l'application, posée dans l'image 1080p : une barre de titre,
 * puis la page en pixels de l'application, agrandie `zoom` fois et défilée de
 * `scroll` pixels (de l'application).
 */
export function AppWindow({ x, y, w, h, title, zoom, scroll = 0, children, style }: { x: number; y: number; w: number; h: number; title: string; zoom: number; scroll?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 18, overflow: "hidden", background: C.ink50, border: `1px solid ${C.ink200}`, boxShadow: SHADOW.lift, fontFamily: FONT, ...style }}>
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: C.white, borderBottom: `1px solid ${C.ink200}` }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: C.ink300 }} />)}
        <span style={{ marginLeft: 14, fontSize: 16, fontWeight: 600, color: C.ink500, letterSpacing: "-0.01em" }}>{title}</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 45, bottom: 0, overflow: "hidden" }}>
        <div style={{ zoom, transform: `translateY(${-scroll}px)` }}>{children}</div>
      </div>
    </div>
  );
}

// ---- L'écran de vente ----------------------------------------------------------

/** Largeur de la page de vente, en pixels de l'application (une page en une colonne : conseils, puis délivrance, puis gamme partenaire). */
export const SALE_W = 687;

/** Les trois choix de la carte (DecisionButton de advice-zone.tsx). */
function Decision({ tone, label, hint }: { tone: "accept" | "neutral" | "refuse"; label: string; hint: string }) {
  const accept = tone === "accept";
  const Icon = accept ? Check : tone === "neutral" ? RefreshCw : X;
  return (
    <span style={{ minHeight: 64, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: "10px 14px", border: `2px solid ${accept ? C.success600 : C.ink300}`, background: accept ? C.success600 : C.white, color: accept ? C.white : tone === "neutral" ? C.ink900 : C.ink600, boxShadow: accept ? "0 8px 20px -10px rgba(22,163,74,.8)" : undefined }}>
      <span style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: accept ? "rgba(255,255,255,.2)" : C.ink100 }}>
        <Icon size={accept || tone === "refuse" ? 22 : 18} strokeWidth={2.75} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, lineHeight: "20px", fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</span>
        <span style={{ display: "block", marginTop: 2, fontSize: 12.5, lineHeight: "16px", color: accept ? "rgba(255,255,255,.8)" : C.ink500 }}>{hint}</span>
      </span>
    </span>
  );
}

/**
 * La carte du conseil (ProductCard de advice-zone.tsx) : bandeau « Conseil
 * associé » et besoin du moteur, raison courte, « Solution disponible dans
 * votre officine », bénéfices de la règle, les trois choix. `show(i)` fait
 * monter chaque bloc.
 */
function AdviceCard({ show }: { show: (i: number) => number }) {
  const o = saleOpportunity();
  const block = (i: number): CSSProperties => ({ opacity: show(i), transform: `translateY(${(1 - show(i)) * 14}px)` });
  return (
    <div style={{ overflow: "hidden", borderRadius: 16, border: `1px solid ${C.ink200}`, background: C.white, boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 8px 24px -12px rgba(16,24,40,.18)" }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${C.brand600}, ${C.brand400})` }} />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 12, background: C.success50, padding: "8px 14px", ...block(0) }}>
          <span style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.success600, color: C.white }}>
            <Lightbulb size={17} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1D5B2B" }}>Conseil associé</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.title}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, borderRadius: 12, background: "rgba(240,245,245,.7)", padding: "12px 14px", ...block(1) }}>
          <Pill size={18} color={C.ink500} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 14.5, lineHeight: 1.5, color: C.ink900 }}>{o.shortReason}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, ...block(2) }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.ink500 }}>Solution disponible dans votre officine</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, borderRadius: 12, border: `1px solid ${C.ink200}`, background: C.white, padding: "12px 14px" }}>
            <ProductTile name="probio-flore-10" size={72} style={{ border: `1px solid ${C.ink200}`, borderRadius: 12, background: C.white, padding: 4, boxSizing: "border-box", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, lineHeight: "24px", fontWeight: 600, letterSpacing: "-0.01em", color: C.ink900 }}>{ADVICE.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", marginTop: 6 }}>
                <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, color: C.ink900, fontVariantNumeric: "tabular-nums" }}>{price(ADVICE.priceCents)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 999, padding: "2px 10px", fontSize: 12.5, fontWeight: 500, background: C.success100, color: "#1D5B2B" }}>
                  <Check size={14} strokeWidth={3} />
                  En stock : {ADVICE.quantity}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(o.benefits ?? []).slice(0, 3).map((benefit) => (
              <span key={benefit} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 999, background: "rgba(240,245,245,.7)", padding: "4px 10px", fontSize: 12.5, lineHeight: "16px", color: C.ink600 }}>
                <Check size={14} strokeWidth={2.5} color={C.brand600} />
                {benefit}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, ...block(3) }}>
          <Decision tone="accept" label="Proposer ce produit" hint="Ajouté à la délivrance" />
          <Decision tone="neutral" label="Autre produit" hint="Changer de référence" />
          <Decision tone="refuse" label="Ignorer" hint="Refus enregistré" />
        </div>
      </div>
    </div>
  );
}

/**
 * L'écran de vente, sur un écran d'environ 700 px de large (une colonne, comme
 * l'application sous 1 280 px) : le patient, le traitement et le conseil sous
 * son médicament, puis « Délivrance », puis — à part, sous les conseils — la
 * carte « À découvrir · gamme partenaire ». `partner` la fait entrer, `ring`
 * l'entoure pour le récit, `press` enfonce « Voir la gamme », `cursor` se pose
 * sur ce bouton.
 */
export function SalePage({ show, partner, ring = 0, press = 0, cursor }: { show: (i: number) => number; partner: number; ring?: number; press?: number; cursor?: ReactNode }) {
  const card = partnerCard();
  const status = PRESCRIPTION_STATUS.ANALYZED;
  return (
    <div style={{ width: SALE_W, boxSizing: "border-box", padding: "18px 20px 28px", fontFamily: FONT, color: C.ink900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700, letterSpacing: "-0.025em", textTransform: "uppercase" }}>Patient non rattaché</span>
          <Badge tone="brand">{status.label}</Badge>
        </div>
        <span style={{ fontSize: 12.5, color: C.ink500, fontVariantNumeric: "tabular-nums" }}>{EXAMPLE.ref}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 24, fontSize: 15, fontWeight: 600 }}>
        1 médicament
        <Check size={18} color={C.success600} strokeWidth={2.5} />
      </div>
      <AppCard style={{ marginTop: 10, padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, lineHeight: "20px" }}>
              <span style={{ fontWeight: 600 }}>AMOXICILLINE</span>
              <span style={{ color: C.ink600 }}> 1 g</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: "20px", color: C.ink600 }}>1 comprimé matin et soir · 6 j · 1 boîte</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 6px", fontSize: 12, color: C.ink500 }}>
            <BookOpen size={14} />
            Fiche
          </span>
        </div>
        <div style={{ marginTop: 12, borderLeft: `2px solid ${C.brand300}`, paddingLeft: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.brand800 }}>
              <Sparkles size={14} />À proposer avec ce médicament
            </span>
            <span style={{ borderRadius: 999, background: C.brand50, padding: "4px 12px", fontSize: 12.5, fontWeight: 500, color: C.brand800 }}>1 à décider</span>
          </div>
          <AdviceCard show={show} />
        </div>
      </AppCard>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShoppingBag size={18} color={C.ink500} />
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.025em", textTransform: "uppercase" }}>Délivrance</span>
        </div>
        <AppCard style={{ marginTop: 12, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, lineHeight: "20px", color: C.ink500 }}>Rien à encaisser pour l&apos;instant. Les conseils acceptés arrivent ici, et vous pouvez scanner une référence que le patient demande de lui-même.</div>
          <div style={{ height: 40, boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.ink300}`, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", fontSize: 13.5, color: C.ink500 }}>
            <ScanBarcode size={16} />
            Scanner un produit — code-barres ou nom
          </div>
        </AppCard>
      </div>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8, opacity: Math.min(1, partner * 1.4), transform: `translateY(${(1 - partner) * 26}px) scale(${0.97 + 0.03 * partner})`, transformOrigin: "50% 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px", fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: C.ink500 }}>
          <Handshake size={14} />À découvrir · gamme partenaire
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 12, border: `1px dashed ${ring > 0.5 ? C.brand400 : C.ink300}`, background: C.white, padding: "12px 16px", boxShadow: ring > 0 ? `0 0 0 ${5 * ring}px rgba(40,161,145,${0.22 * ring}), 0 14px 30px -14px rgba(30,133,120,${0.45 * ring})` : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.ink100, fontSize: 13, fontWeight: 600, color: C.ink600 }}>{card.name.slice(0, 2).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500, color: C.ink900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {card.name}
                <span style={{ fontWeight: 400, color: C.ink500 }}> · {card.partnerName}</span>
              </div>
              <div style={{ fontSize: 12.5, lineHeight: "20px", color: C.ink600 }}>{partnerLine(card)}</div>
            </div>
          </div>
          <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, border: `1px solid ${press > 0 ? C.ink400 : C.ink300}`, background: press > 0 ? C.ink100 : C.white, padding: "6px 12px", fontSize: 13, fontWeight: 500, color: C.ink900, transform: `scale(${1 - 0.04 * press})` }}>
            Voir la gamme
            <ArrowRight size={14} />
            {cursor}
          </span>
        </div>
        <div style={{ padding: "0 4px", fontSize: 11.5, lineHeight: "16px", color: C.ink500 }}>Proposée par un laboratoire partenaire de PharmaBoost. Elle n&apos;entre jamais dans le choix des conseils.</div>
      </div>
    </div>
  );
}

// ---- La page de la marque ------------------------------------------------------

export const BRAND_W = 687;

/** La gamme d'exemple : produits, codes, prix pro HT et prix public conseillé — des exemples. */
const RANGE_PRODUCTS = [
  { name: "Ferments lactiques 10 milliards", packaging: "30 gélules", code: "MA-FL30", pro: "7,20 €", pub: "14,50 €" },
  { name: "Ferments lactiques enfant", packaging: "14 sachets", code: "MA-FL14", pro: "5,90 €", pub: "11,90 €" },
  { name: "Ferments lactiques voyage", packaging: "10 gélules", code: "MA-FL10", pro: "4,10 €", pub: "8,50 €" },
];

/** Les formations reliées à la marque (TrainingCard) : titres et durées d'exemple ; libellés de content.ts (« Vidéo », « Fiche courte »). */
const TRAININGS = [
  { kind: "Vidéo", Icon: CirclePlay, minutes: "12 min", title: "Gamme Ferments : connaître la gamme" },
  { kind: "Fiche courte", Icon: FileText, minutes: "5 min", title: "Fiche produit : Ferments lactiques 10 milliards" },
];

/**
 * La page d'une marque partenaire pour l'officine ([slug]/page.tsx), arrivée
 * du comptoir : présentation, « Gammes et produits », « Conditions
 * professionnelles », « Formations ». `lit(k)` entoure une section (0 → 1).
 */
export function BrandPage({ lit = () => 0 }: { lit?: (key: "ranges" | "offers" | "trainings") => number }) {
  const ring = (k: "ranges" | "offers" | "trainings"): CSSProperties => {
    const r = lit(k);
    return r > 0 ? { boxShadow: `0 0 0 ${5 * r}px rgba(40,161,145,${0.2 * r})`, borderColor: r > 0.5 ? C.brand300 : C.ink200 } : {};
  };
  const th: CSSProperties = { padding: "10px 16px", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.025em", textTransform: "uppercase", color: C.ink500, whiteSpace: "nowrap" };
  const td: CSSProperties = { padding: "12px 16px", fontSize: 14, color: C.ink900, verticalAlign: "middle" };
  return (
    <div style={{ width: BRAND_W, boxSizing: "border-box", padding: "16px 20px 32px", display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT, color: C.ink900 }}>
      <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 10, fontSize: 13, fontWeight: 500, color: C.ink600 }}>
        <ArrowLeft size={16} />
        Gammes partenaires
      </span>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <span style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.ink100, fontSize: 17, fontWeight: 600, color: C.ink600 }}>MA</span>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 30, lineHeight: "36px", fontWeight: 700, letterSpacing: "-0.025em" }}>{PARTNER.brand}</div>
            <div style={{ fontSize: 15, lineHeight: "24px", color: C.ink600 }}>Proposée par {PARTNER.lab}, laboratoire partenaire de PharmaBoost.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Badge tone="accent">Gamme partenaire</Badge>
            {PARTNER.universes.map((key) => <Badge key={key} tone="brand">{universeLabel(key)}</Badge>)}
          </div>
        </div>
      </div>

      <Alert tone="neutral">
        Gamme proposée par un laboratoire partenaire de PharmaBoost. Elle ne modifie jamais les conseils du moteur : elle apparaît à part, signalée comme telle. Vous venez du comptoir, univers {universeLabel(PARTNER.universes[0]).toLowerCase()}.
      </Alert>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title="Gammes et produits" description={`${RANGE_PRODUCTS.length} produits publiés pour votre officine.`} />
        <AppCard style={ring("ranges")}>
          <CardHeader title={PARTNER.range} description="Ferments lactiques, en gélules et en sachets." action={<Badge tone="brand">{universeLabel(PARTNER.universes[0])}</Badge>} />
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ borderRadius: 12, border: `1px solid ${C.ink200}`, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
                <thead style={{ background: "rgba(240,245,245,.6)", borderBottom: `1px solid ${C.ink200}` }}>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Produit</th>
                    <th style={{ ...th, textAlign: "left" }}>Code</th>
                    <th style={{ ...th, textAlign: "right" }}>Prix pro HT</th>
                    <th style={{ ...th, textAlign: "right" }}>Prix public conseillé</th>
                  </tr>
                </thead>
                <tbody>
                  {RANGE_PRODUCTS.map((p, i) => (
                    <tr key={p.code} style={{ borderTop: i ? `1px solid ${C.ink200}` : undefined }}>
                      <td style={td}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: C.ink500 }}>{p.packaging}</div>
                      </td>
                      <td style={{ ...td, fontFamily: MONO, fontSize: 12.5, color: C.ink600, whiteSpace: "nowrap" }}>{p.code}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.pro}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.pub}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </AppCard>
      </div>

      <AppCard style={ring("offers")}>
        <CardHeader title="Conditions professionnelles" description="Offres publiées par le laboratoire, en cours de validité." />
        <div style={{ padding: "0 24px 24px" }}>
          <div style={{ display: "flex", gap: 12, borderRadius: 10, border: `1px solid ${C.ink200}`, padding: 14 }}>
            <BadgePercent size={16} color={C.ink500} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Offre d&apos;implantation</div>
              <div style={{ fontSize: 13, lineHeight: "20px", color: C.ink600 }}>Remise sur la première commande de la gamme.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 12.5, color: C.ink500 }}>
                <span>Remise : 10 %</span>
                <span>Minimum de commande : 150,00 € HT</span>
                <span>Gamme {PARTNER.range.replace(/^Gamme /, "")}</span>
                <span>Jusqu&apos;au 31/12/2026</span>
              </div>
            </div>
          </div>
        </div>
      </AppCard>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SectionHeader title="Formations" description="Les contenus du centre de formation reliés à cette marque." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {TRAININGS.map((t) => (
            <div key={t.title} style={{ display: "flex", flexDirection: "column", gap: 10, borderRadius: 12, border: `1px solid ${C.ink200}`, background: C.white, padding: 16, boxShadow: "0 1px 2px rgba(23,33,38,.05)", ...ring("trainings") }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge tone="brand" icon={<t.Icon size={12} />}>{t.kind}</Badge>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.ink500 }}>
                  <Clock size={12} />
                  {t.minutes}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, letterSpacing: "-0.01em" }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: C.ink500 }}>{PARTNER.lab} · {universeLabel(PARTNER.universes[0])}</div>
              </div>
              <div style={{ paddingTop: 2 }}>
                <Badge tone="neutral">{TRAINING_STATUS_LABELS.TODO}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Contacter ou commander ----------------------------------------------------

/** L'identifiant d'attribution d'exemple, au format de src/core/partners/attribution.ts (« PB-7K3M-Q9TD »). */
export const ATTRIBUTION_EXAMPLE = "PB-7K3M-Q9TD";

/** Les modes de travail du site (decouvrir/partenaires, MODES), ceux qu'une officine voit pour commander ; les deux derniers mots restent ensemble. */
export const ORDER_MODES = [
  { label: INTEGRATION_MODE_LABELS.B2B_LINK, line: "Un lien vers votre portail professionnel, porteur d'un code d'attribution." },
  { label: INTEGRATION_MODE_LABELS.FORM, line: "La demande de l'officine vous parvient par un\u00A0formulaire." },
  { label: INTEGRATION_MODE_LABELS.EMAIL, line: "Les demandes des officines vous parviennent par\u00A0e-mail." },
];

/**
 * « Contacter ou commander » (partner-actions.tsx), pour un laboratoire relié
 * par lien B2B : la phrase du mode, « Ouvrir le portail B2B », « Demander un
 * contact » ; après l'ouverture, l'identifiant d'attribution. Largeur 360 px.
 */
export function OrderCard({ press = 0, ack = 0, codeRing = 0, cursor }: { press?: number; ack?: number; codeRing?: number; cursor?: ReactNode }) {
  return (
    <AppCard style={{ width: 360, fontFamily: FONT, color: C.ink900 }}>
      <CardHeader title="Contacter ou commander" />
      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, lineHeight: "20px", color: C.ink600 }}>Commandez sur le portail professionnel du laboratoire. Le lien porte l&apos;identifiant d&apos;attribution PharmaBoost.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AppButton variant="primary" icon={<ExternalLink size={16} />} press={press}>
            Ouvrir le portail B2B
            {cursor}
          </AppButton>
          <AppButton variant="outline" icon={<MessageSquare size={16} />}>Demander un contact</AppButton>
        </div>
        {ack > 0 && (
          <div style={{ opacity: Math.min(1, ack * 1.5), transform: `translateY(${(1 - ack) * 10}px)` }}>
            <Alert tone="info" title="Portail ouvert dans un nouvel onglet, avec cet identifiant :">
              <span style={{ display: "inline-block", marginTop: 2, borderRadius: 6, padding: "1px 6px", marginLeft: -6, fontFamily: MONO, fontSize: 14, fontWeight: 600, letterSpacing: "0.04em", color: C.ink900, boxShadow: codeRing > 0 ? `0 0 0 ${3 * codeRing}px rgba(231,182,45,${0.45 * codeRing})` : undefined, background: codeRing > 0 ? `rgba(253,239,204,${codeRing})` : undefined }}>{ATTRIBUTION_EXAMPLE}</span>
            </Alert>
          </div>
        )}
      </div>
    </AppCard>
  );
}

// ---- Les statistiques ----------------------------------------------------------

/**
 * Ce qu'un partenaire reçoit : des agrégats (src/server/services/partners/stats.ts,
 * console /admin/partenaires/statistiques), communiqués par l'équipe — aucun
 * espace partenaire n'existe. Les quatre compteurs réels, SANS chiffre : aucun
 * partenaire n'existe encore, et des nombres se liraient comme des résultats.
 * À la place de chaque valeur, une pastille de même largeur pour tous (aucune
 * grandeur relative suggérée) ; `grow` la fait entrer.
 */
export function StatsPanel({ grow }: { grow: (i: number) => number }) {
  const stats = [
    { label: "Officines touchées", sub: "voient la marque", Icon: Store },
    { label: "Ouvertures attribuées", sub: "comptoir · catalogue · page marque", Icon: Eye },
    { label: "Demandes de contact", sub: "passées par les officines", Icon: Inbox },
    { label: "Commandes", sub: "avec l'identifiant d'attribution", Icon: ShoppingCart },
  ];
  return (
    <div style={{ width: 600, fontFamily: FONT, color: C.ink900, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ fontSize: 28, lineHeight: "36px", fontWeight: 700, letterSpacing: "-0.025em" }}>Bilan · {PARTNER.brand}</span>
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.ink400 }}>exemple</span>
        </div>
        <span style={{ fontSize: 14, lineHeight: "20px", color: C.ink600 }}>Communiqué par l&apos;équipe PharmaBoost.</span>
      </div>
      <Alert tone="info" title="Agrégats uniquement" icon={<ShieldOff size={18} />}>
        Des compteurs, jamais une officine nommée ni un patient.
      </Alert>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {stats.map((s, i) => {
          const g = grow(i);
          return (
            <AppCard key={s.label} style={{ padding: 20, opacity: Math.min(1, g * 2), transform: `translateY(${(1 - Math.min(1, g * 1.4)) * 12}px)` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12.5, lineHeight: "16px", fontWeight: 500, color: C.ink600 }}>{s.label}</span>
                <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.brand50, color: C.brand700 }}>
                  <s.Icon size={16} />
                </span>
              </div>
              {/* La valeur : une pastille, sans chiffre. */}
              <div style={{ marginTop: 8, height: 28, display: "flex", alignItems: "center" }}>
                <span style={{ width: 84 * Math.min(1, g), height: 18, borderRadius: 9, background: `linear-gradient(90deg, ${C.brand100}, ${C.brand50})`, boxShadow: `inset 0 0 0 1px ${C.brand200}` }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: C.ink500 }}>{s.sub}</div>
            </AppCard>
          );
        })}
      </div>
    </div>
  );
}
