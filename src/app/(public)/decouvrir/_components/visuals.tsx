import { CalendarCheck, Check, MousePointer2, ScanLine } from "lucide-react";
import { PharmaLogo } from "@/components/app/logo";
import { cn } from "@/lib/utils";

/**
 * Les écrans de PharmaBoost redessinés pour le site : textes et structure
 * repris de l'application (avis en coin d'écran, carte de conseil, plan de
 * prise). Produit, prix, marge et stock sont ceux du catalogue de
 * démonstration : chaque visuel le dit (« exemple »).
 */

/**
 * L'exemple suit une vraie règle du moteur (« Photosensibilisation », règle de
 * sécurité : une cycline rend la peau sensible au soleil, RCP de la
 * doxycycline). Produit, prix, marge et stock : catalogue de démonstration.
 */
const EXAMPLE = {
  drug: "DOXYCYCLINE 100 mg cp séc.",
  second: "PARACÉTAMOL 1000 mg cp",
  need: "Protection solaire sous doxycycline",
  product: "Crème solaire SPF 50+",
  tile: "/site/produits/creme-solaire-spf50.webp",
  price: "16,90 €",
  margin: "7,40 €",
  stock: 18,
};

/** La lueur de balayage : une bande qui descend, très discrète. Désactivée si l'utilisateur réduit les animations. */
const SCAN_CSS = `@keyframes pb-scan{0%{transform:translateY(-100%)}100%{transform:translateY(420%)}}
.pb-scan{animation:pb-scan 3.2s cubic-bezier(.65,0,.35,1) infinite}
@media (prefers-reduced-motion: reduce){.pb-scan{animation:none;opacity:0}}`;

export function ExampleTag({ className }: { className?: string }) {
  return <span className={cn("font-mono text-[10.5px] tracking-[0.08em] text-text-tertiary uppercase", className)}>exemple</span>;
}

function StockBadge({ n = EXAMPLE.stock }: { n?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[12px] font-medium text-success-700 ring-1 ring-success-100 ring-inset">
      <span className="size-1.5 rounded-full bg-success-600" /> En stock · {n}
    </span>
  );
}

function MarginBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-50 px-2.5 py-1 text-[12px] font-medium text-accent-800 ring-1 ring-accent-200 ring-inset">
      Marge {EXAMPLE.margin}
    </span>
  );
}

/** La boîte du produit, en vignette sur un fond clair, comme une fiche produit. */
function ProductTile({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
  return <img src={EXAMPLE.tile} alt="" width={size} height={size} className="shrink-0 rounded-xl bg-surface-app object-contain" />;
}

/* ------------------------------------------------------------------ */
/* Accueil : le logiciel de gestion, le scan, la suggestion            */
/* ------------------------------------------------------------------ */

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[580px] lg:max-w-none" aria-hidden="true">
      <style>{SCAN_CSS}</style>
      <div className="absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(55%_55%_at_65%_45%,var(--color-brand-100),transparent_72%)] opacity-90" />

      {/* Le logiciel de gestion de l'officine, inchangé */}
      <div className="rounded-[22px] border border-border-subtle bg-surface-card p-3 shadow-[0_30px_80px_-44px_rgba(15,23,42,0.45)]">
        <div className="flex items-center gap-1.5 px-1.5 pb-2.5">
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="ml-2 font-mono text-[11px] text-text-tertiary">Logiciel de gestion · Vente</span>
        </div>
        <div className="relative space-y-2 overflow-hidden rounded-xl bg-surface-app p-3">
          <LgoRow text={EXAMPLE.drug} active />
          <LgoRow text={EXAMPLE.second} />
          <div className="h-11 rounded-lg border border-dashed border-border-default" />
          <div className="pb-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-brand-400/20 to-transparent" />
        </div>
      </div>

      {/* La suggestion PharmaBoost */}
      <div className="relative -mt-8 ml-auto w-[90%] rounded-[22px] border border-border-subtle bg-surface-card p-4 shadow-[0_44px_90px_-44px_rgba(0,64,59,0.6)] sm:w-[80%] sm:p-5">
        <div className="flex items-center gap-2">
          <PharmaLogo size={22} />
          <span className="text-[13px] font-semibold text-text-primary">PharmaBoost</span>
          <ExampleTag className="ml-auto" />
        </div>
        <p className="mt-3 font-mono text-[10.5px] tracking-[0.12em] text-brand-700 uppercase">Conseil associé</p>
        <p className="text-[14.5px] font-semibold text-text-primary">{EXAMPLE.need}</p>
        <div className="mt-3 flex items-center gap-3">
          <ProductTile size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-text-primary">{EXAMPLE.product}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StockBadge />
              <MarginBadge />
            </div>
          </div>
          <p className="text-[18px] font-semibold text-text-primary tabular">{EXAMPLE.price}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px] font-semibold sm:grid-cols-[1.3fr_1fr_1fr]">
          <span className="rounded-lg bg-success-600 px-3 py-2 text-center text-white">Proposer</span>
          <span className="hidden rounded-lg border border-border-default px-3 py-2 text-center text-text-primary sm:block">Autre produit</span>
          <span className="rounded-lg bg-surface-sunken px-3 py-2 text-center text-text-secondary">Ignorer</span>
        </div>
      </div>

      <div className="absolute top-[40%] -left-4 hidden items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[12px] font-medium text-text-primary shadow-sm sm:flex">
        <ScanLine className="size-3.5 text-brand-600" /> Produit scanné
      </div>
    </div>
  );
}

function LgoRow({ text, active = false }: { text: string; active?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between rounded-lg border bg-surface-card px-3 py-2.5", active ? "border-brand-400 ring-2 ring-brand-100" : "border-border-subtle")}>
      <span className="truncate font-mono text-[12px] text-text-primary sm:text-[12.5px]">{text}</span>
      <span className="ml-2 font-mono text-[11px] text-text-tertiary">× 1</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Les étapes : un visuel qui se comprend sans le texte                 */
/* ------------------------------------------------------------------ */

// Les barres d'un code-barres décoratif : largeur et position calculées une fois.
const BARS = Array.from({ length: 38 }, (_, i) => 1 + ((i * 7919 + 13) % 4)).reduce<{ x: number; w: number }[]>((acc, w) => {
  const last = acc[acc.length - 1];
  acc.push({ x: last ? last.x + last.w + 1.6 : 0, w });
  return acc;
}, []);

export function StepScan() {
  return (
    <div className="relative w-full max-w-[230px] overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-3 shadow-sm">
      <style>{SCAN_CSS}</style>
      <div className="h-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-400" />
      <p className="mt-2.5 text-[12.5px] font-semibold text-text-primary">DOXYCYCLINE 100 mg</p>
      <p className="text-[11px] text-text-tertiary">comprimé sécable</p>
      <div className="relative mt-3 overflow-hidden rounded-md bg-white p-1.5">
        <svg viewBox="0 0 160 40" className="h-10 w-full" preserveAspectRatio="none">
          {BARS.map((bar, i) => (
            <rect key={i} x={bar.x} y={0} width={bar.w} height={40} fill="#14191F" />
          ))}
        </svg>
        <div className="pb-scan absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-transparent via-brand-400/70 to-transparent" />
      </div>
      <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">
        <ScanLine className="size-3" /> Scanné
      </span>
    </div>
  );
}

export function StepAnalyse() {
  const rows = [
    { k: "Traitement", v: "Antibiotique" },
    { k: "Sécurité", v: "Vigilances vérifiées" },
    { k: "Stock", v: `${EXAMPLE.stock} en rayon` },
  ];
  return (
    <ul className="w-full max-w-[240px] space-y-2">
      {rows.map((r) => (
        <li key={r.k} className="flex items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-card px-3 py-2.5 shadow-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[10px] tracking-[0.1em] text-text-tertiary uppercase">{r.k}</span>
            <span className="block truncate text-[12.5px] font-semibold text-text-primary">{r.v}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StepConseil() {
  return (
    <div className="relative w-full max-w-[240px] rounded-xl border border-border-subtle bg-surface-card p-3 shadow-sm">
      <p className="font-mono text-[10px] tracking-[0.1em] text-brand-700 uppercase">Conseil associé</p>
      <p className="text-[11.5px] text-text-secondary">{EXAMPLE.need}</p>
      <div className="mt-2 flex items-center gap-2.5">
        <ProductTile size={52} />
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold text-text-primary">{EXAMPLE.product}</p>
          <p className="text-[12px] text-text-secondary tabular">{EXAMPLE.price}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-success-600 px-3 py-2 text-[12px] font-semibold text-white">
        <Check className="size-3.5" strokeWidth={3} /> Proposer ce produit
      </div>
      <div className="mt-1.5 rounded-lg bg-surface-sunken px-3 py-1.5 text-center text-[11.5px] font-medium text-text-secondary">Ignorer</div>
      <MousePointer2 className="absolute right-6 bottom-12 size-5 fill-white text-ink-900 drop-shadow" />
    </div>
  );
}

export function StepSuivi() {
  return (
    <div className="w-full max-w-[210px] rounded-[22px] border-[5px] border-ink-900 bg-surface-card p-2.5 shadow-sm">
      <p className="font-mono text-[9.5px] tracking-[0.1em] text-brand-700 uppercase">Plan conseil patient</p>
      <p className="mt-0.5 text-[12px] font-semibold text-text-primary">DOXYCYCLINE 100 mg</p>
      <p className="text-[10.5px] text-text-secondary">Antibiotique : traite l&apos;infection</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10.5px]">
        <span className="rounded-md bg-brand-50 px-2 py-1 text-brand-900">Matin · 1</span>
        <span className="rounded-md bg-brand-50 px-2 py-1 text-brand-900">Soir · 1</span>
      </div>
      <div className="mt-2 border-t border-border-subtle pt-1.5">
        <p className="font-mono text-[9px] tracking-[0.1em] text-text-tertiary uppercase">Conseil du pharmacien</p>
        <p className="text-[11px] font-semibold text-text-primary">{EXAMPLE.product}</p>
        <p className="text-[10.5px] text-text-secondary">Avant chaque sortie au soleil</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-600 px-2 py-1.5 text-[10.5px] font-medium text-white">
        <CalendarCheck className="size-3" /> 08:00 · Rappel de prise
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stock et marge                                                       */
/* ------------------------------------------------------------------ */

export function StockMarginVisual() {
  return (
    <div className="relative rounded-[28px] border border-border-subtle bg-surface-card p-6 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.45)] sm:p-8" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">Solution disponible dans votre officine</p>
        <ExampleTag />
      </div>
      <div className="mt-5 flex items-center gap-4">
        <ProductTile size={96} />
        <div className="min-w-0 flex-1">
          <p className="text-[18px] leading-tight font-semibold text-text-primary sm:text-[21px]">{EXAMPLE.product}</p>
          <p className="mt-1 hidden text-[13px] text-text-secondary sm:block">{EXAMPLE.need}</p>
        </div>
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary tabular sm:text-[26px]">{EXAMPLE.price}</p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-app p-4">
          <StockBadge />
          <p className="mt-3 text-[13px] text-text-secondary">Stock de l&apos;officine</p>
        </div>
        <div className="rounded-2xl bg-surface-app p-4">
          <MarginBadge />
          <p className="mt-3 text-[13px] text-text-secondary">Prix de vente moins prix d&apos;achat</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sans ordonnance                                                       */
/* ------------------------------------------------------------------ */

export function RequestVisual() {
  const products = [
    { name: "Spray nasal eau de mer isotonique", tile: "/site/produits/spray-nasal-eau-de-mer.webp", price: "6,90 €", stock: 36 },
    { name: "Pastilles gorge miel-citron", tile: "/site/produits/pastilles-gorge-miel-citron.webp", price: "5,90 €", stock: 58 },
  ];
  return (
    <div className="rounded-[28px] border border-border-subtle bg-surface-card p-6 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.45)] sm:p-7" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">Demande sans ordonnance</p>
        <ExampleTag />
      </div>
      <p className="mt-4 rounded-xl bg-surface-app px-4 py-3 text-[14px] text-text-primary">« Nez bouché et mal à la gorge depuis hier. » · 34 ans</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["Nez bouché ou qui coule", "Gorge irritée"].map((n) => (
          <span key={n} className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-800 ring-1 ring-brand-200 ring-inset">{n}</span>
        ))}
      </div>
      <p className="mt-4 flex gap-2 text-[13px] text-text-primary"><span className="font-semibold text-warning-600">?</span> Depuis combien de temps, et y a-t-il de la fièvre ?</p>
      <ul className="mt-4 space-y-2">
        {products.map((p) => (
          <li key={p.name} className="flex items-center gap-3 rounded-xl border border-border-subtle p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- vignette SVG locale */}
            <img src={p.tile} alt="" width={44} height={44} className="rounded-lg bg-surface-app object-contain" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-primary">{p.name}</span>
            <span className="hidden sm:inline-flex"><StockBadge n={p.stock} /></span>
            <span className="text-[13px] font-semibold text-text-primary tabular">{p.price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
