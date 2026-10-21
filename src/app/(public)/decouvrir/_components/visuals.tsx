import { CalendarCheck, Check, Mail, ScanLine } from "lucide-react";
import type { BannerMockItem } from "./banner-mock";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { ANALGESIC_TREE, evaluateTree } from "@/core/counter/question-tree";
import { cn } from "@/lib/utils";
import { CounterIslandStill } from "@/components/island/counter-island-still";
import { IslandQuestions } from "@/components/island/island-questions";
import type { IslandAdvice } from "@/components/island/counter-island";
import type { CounterSheet } from "../../../../../agent/src/counter-sheet";

/**
 * Les écrans de PharmaBoost redessinés pour le site : textes et structure
 * repris de l'application (la bannière du poste de caisse, le plan de prise,
 * la page « Mon équipe »). Produits, prix, marges, stocks et chiffres d’équipe
 * sont ceux du catalogue de démonstration : chaque visuel le dit (« exemple »).
 */

/**
 * L'exemple de l'accueil suit de vraies règles du moteur : protection solaire
 * sous doxycycline (« Conseil peau — Série 2 », RCP de la doxycycline) et
 * levure probiotique (Ultra-Levure) pendant un antibiotique. Produits, prix et stocks :
 * catalogue de démonstration.
 */
const DOXY = "DOXYCYCLINE 100 mg";
const SOLAIRE = { name: "Crème solaire SPF 50+", price: "16,90 €", image: "/site/produits/creme-solaire-spf50.webp", quantity: 18 };

/**
 * L'exemple de la section « Stock et marge » : un autre produit que celui de
 * l'accueil (probiotique pendant un antibiotique, règle du moteur). Prix, marge
 * (prix de vente moins prix d'achat) et stock : catalogue de démonstration.
 */
const STOCK_EXAMPLE = {
  need: "Levure probiotique pendant un antibiotique",
  product: "Ultra-Levure 200 mg",
  tile: "/site/produits/ultra-levure-200-mg.webp",
  price: "8,90 €",
  margin: "3,60 €",
  stock: 29,
};

/** La phrase courte d'une règle du moteur, telle que la bannière l'affiche (une ligne, coupée). Une règle disparue : pas de phrase. */
function ruleReason(key: string, drug: string): string | undefined {
  return ADVICE_RULES.find((rule) => rule.key === key)?.shortReasonTemplate.replaceAll("{drug}", drug);
}

/**
 * Le menu déroulant de la nouvelle bannière, pour les exemples du site (fondateur, 18 oct. 2026) : deux questions à poser, les réponses
 * possibles du patient (cliquables), le conseil en deux phrases. Au comptoir, le modèle les rédige ; ici, ils sont écrits d'exemple.
 */
type ExampleAnswer = { ask: 0 | 1; label: string; say: string; product?: { name: string; price: string; margin: string; quantity: number } };
export function examplePitch(name: string, ask: [string, string], pitch: string, answers: ExampleAnswer[]): CounterSheet {
  return {
    name,
    reasons: [],
    script: "",
    contraindications: [],
    usage: [],
    description: "",
    more: { contraindications: 0, usage: 0 },
    cut: false,
    ask,
    pitch,
    answers: answers.map((answer) => ({ ask: answer.ask, label: answer.label, say: answer.say, ...(answer.product ? { product: { ...answer.product, stock: "IN_STOCK" } } : {}) })),
  };
}

const SOLAIRE_PITCH = examplePitch(
  SOLAIRE.name,
  ["Allez-vous vous exposer au soleil pendant le traitement ?", "Votre peau rougit-elle facilement au soleil ?"],
  "La doxycycline rend la peau plus sensible au soleil. Cette crème SPF 50+ la protège : à appliquer avant chaque sortie, et à renouveler souvent.",
  [
    { ask: 0, label: "Oui, en vacances", say: "Proposez plutôt le grand format en spray, plus pratique sur tout le corps.", product: { name: "Spray solaire SPF 50+ 200 ml", price: "19,90 €", margin: "7,10 €", quantity: 9 } },
    { ask: 0, label: "Non, pas vraiment", say: "Gardez la crème : même par temps couvert, la peau peut réagir." },
    { ask: 1, label: "Oui, très vite", say: "Insistez sur la protection pendant tout le traitement, et l'ombre aux heures chaudes." },
    { ask: 1, label: "Non", say: "La protection reste conseillée tant que dure le traitement." },
  ],
);

const LEVURE_PITCH = examplePitch(
  STOCK_EXAMPLE.product,
  ["Avez-vous déjà eu des troubles digestifs avec un antibiotique ?", "Êtes-vous allergique à la levure ?"],
  "Un antibiotique fragilise la flore intestinale. Cette levure probiotique aide à la protéger, à prendre pendant toute la durée du traitement.",
  [
    { ask: 0, label: "Oui, déjà", say: "Proposez-la dès le premier jour du traitement." },
    { ask: 0, label: "Non, jamais", say: "Elle reste utile en prévention, le temps du traitement." },
    { ask: 1, label: "Oui", say: "Ne la proposez pas : orientez vers un probiotique sans levure." },
    { ask: 1, label: "Non", say: "Vous pouvez la proposer sans réserve." },
  ],
);

/** Les deux conseils de l'accueil : ceux qu'un scan de doxycycline appelle, pris dans le rayon d'exemple. Le premier montre son menu. */
export const HERO_ITEMS: (BannerMockItem & Pick<IslandAdvice, "margin" | "sheet" | "pitchOpen">)[] = [
  { ...SOLAIRE, drug: DOXY, reason: ruleReason("skin-doxycycline-photoprotection", DOXY), stock: "IN_STOCK", margin: "6,20 €", sheet: SOLAIRE_PITCH, pitchOpen: true },
  { name: STOCK_EXAMPLE.product, price: STOCK_EXAMPLE.price, image: STOCK_EXAMPLE.tile, drug: DOXY, reason: ruleReason("digestive-tolerance-antibiotics", DOXY), challenge: true, shortDate: "30/11/26", stock: "IN_STOCK", quantity: STOCK_EXAMPLE.stock, margin: STOCK_EXAMPLE.margin, sheet: LEVURE_PITCH },
];

/** La lueur de balayage : une bande qui descend, très discrète. Désactivée si l'utilisateur réduit les animations. */
const SCAN_CSS = `@keyframes pb-scan{0%{transform:translateY(-100%)}100%{transform:translateY(420%)}}
.pb-scan{animation:pb-scan 3.2s cubic-bezier(.65,0,.35,1) infinite}
@media (prefers-reduced-motion: reduce){.pb-scan{animation:none;opacity:0}}`;

export function ExampleTag({ className }: { className?: string }) {
  return <span className={cn("font-mono text-[10.5px] tracking-[0.08em] text-text-tertiary uppercase", className)}>exemple</span>;
}

function StockBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[12px] font-medium text-success-700 ring-1 ring-success-100 ring-inset">
      <span className="size-1.5 rounded-full bg-success-600" /> En stock · {n}
    </span>
  );
}

function MarginBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-50 px-2.5 py-1 text-[12px] font-medium text-accent-800 ring-1 ring-accent-200 ring-inset">
      Marge {value}
    </span>
  );
}

/** La boîte du produit, en vignette sur un fond clair, comme une fiche produit. */
function ProductTile({ size, tile, className }: { size: number; tile: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- vignette locale déjà à la bonne taille
  return <img src={tile} alt="" width={size} height={size} className={cn("shrink-0 rounded-xl bg-surface-app object-contain", className)} />;
}

/* ------------------------------------------------------------------ */
/* Accueil : le logiciel de gestion, le scan, la bannière              */
/* ------------------------------------------------------------------ */

/**
 * Le logiciel de gestion, inchangé, et la bannière PharmaBoost par-dessus, à droite — comme sur le poste de caisse. Le logiciel est
 * générique (aucune marque) ; la bannière est le vrai dessin, avec ses deux conseils d'exemple.
 */
/**
 * `glass` : posé sur l'encre ADN du héros du site, le halo vert s'efface (il voilait l'encre) et la fenêtre du logiciel
 * passe en verre dépoli — l'encre se devine derrière, le texte reste net. Sans l'option (plaquette), rien ne change.
 */
export function HeroVisual({ glass = false }: { glass?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[580px] lg:max-w-none">
      <style>{SCAN_CSS}</style>
      {!glass && <div className="absolute -inset-x-10 -inset-y-12 -z-10 bg-[radial-gradient(55%_55%_at_65%_45%,var(--color-brand-100),transparent_72%)] opacity-90" aria-hidden="true" />}

      {/* Le logiciel de gestion de l'officine, inchangé */}
      <div
        className={cn(
          "rounded-[22px] border p-3 shadow-[0_30px_80px_-44px_rgba(15,23,42,0.45)]",
          glass ? "border-white/70 bg-white/55 backdrop-blur-xl dark:border-border-subtle dark:bg-surface-card" : "border-border-subtle bg-surface-card",
        )}
        aria-hidden="true"
      >
        <div className="flex items-center gap-1.5 px-1.5 pb-2.5">
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="ml-2 font-mono text-[11px] text-text-tertiary">Logiciel de gestion · Vente</span>
          <ExampleTag className="ml-auto" />
        </div>
        <div className="relative space-y-2 overflow-hidden rounded-xl bg-surface-app p-3 pb-14 sm:pb-16">
          <LgoRow text="DOXYCYCLINE 100 mg cp séc." active />
          <LgoRow text="PARACÉTAMOL 1000 mg cp" />
          <div className="pb-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-brand-400/20 to-transparent" />
        </div>
      </div>

      {/* La bannière PharmaBoost, en île, par-dessus le logiciel : notre robot dedans, les deux conseils du scan. */}
      <div className="relative -mt-12 flex justify-center sm:-mt-14 sm:justify-end [&_section]:max-w-full">
        <CounterIslandStill mix items={HERO_ITEMS.map((item) => ({ ...item, pitchOpen: false }))} drug={DOXY} className="w-full max-w-[500px] [&>div]:flex [&>div]:justify-center sm:[&>div]:justify-end" />
      </div>

    </div>
  );
}

/** Une ligne de la vente dans le logiciel de gestion ; celle qu'on vient de scanner est entourée. */
function LgoRow({ text, active = false }: { text: string; active?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-lg border bg-surface-card px-3 py-2.5", active ? "border-brand-400 ring-2 ring-brand-100" : "border-border-subtle")}>
      <span className="truncate font-mono text-[12px] text-text-primary sm:text-[12.5px]">{text}</span>
      {active ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">
          <ScanLine className="size-3" /> Produit scanné
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[11px] text-text-tertiary">× 1</span>
      )}
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
    <div className="relative w-full max-w-[230px] overflow-hidden rounded-xl border border-border-subtle bg-surface-card p-3 shadow-sm" aria-hidden="true">
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

export function StepSuivi() {
  return (
    <div className="flex w-full max-w-[210px] flex-col items-center" aria-hidden="true">
      <div className="w-full rounded-[22px] border-[5px] border-ink-900 bg-surface-card p-2.5 shadow-sm">
        <p className="font-mono text-[9.5px] tracking-[0.1em] text-brand-700 uppercase">Plan conseil patient</p>
        <p className="mt-0.5 text-[12px] font-semibold text-text-primary">DOXYCYCLINE 100 mg</p>
        <p className="text-[10.5px] text-text-secondary">Antibiotique : traite l&apos;infection</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10.5px]">
          <span className="rounded-md bg-brand-50 px-2 py-1 text-brand-900">Matin · 1</span>
          <span className="rounded-md bg-brand-50 px-2 py-1 text-brand-900">Soir · 1</span>
        </div>
        <div className="mt-2 border-t border-border-subtle pt-1.5">
          <p className="font-mono text-[9px] tracking-[0.1em] text-text-tertiary uppercase">Conseil du pharmacien</p>
          <p className="text-[11px] font-semibold text-text-primary">{SOLAIRE.name}</p>
          <p className="text-[10.5px] text-text-secondary">Avant chaque sortie au soleil</p>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-600 px-2 py-1.5 text-[10.5px] font-medium text-white">
          <CalendarCheck className="size-3" /> 08:00 · Rappel de prise
        </div>
      </div>
      {/* L'autre envoi possible : le bilan du comptoir, par e-mail, après « Vente terminée ». */}
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-card px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-text-primary shadow-sm">
        <Mail className="size-3.5 text-brand-600" /> Votre bilan du jour
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* La bonne question                                                    */
/* ------------------------------------------------------------------ */

/** Le médicament de l'exemple : un paracétamol, qui ne dit pas pourquoi le patient le prend. */
const ANALGESIC = "DOLIPRANE 1000 mg";

/**
 * L'arbre du comptoir tel que la bannière le dessine : « Pourquoi ? » → « Douleur localisée », « Où ? » → « Dos », puis la poche
 * du dos. Les questions, les choix et le conseil débloqué viennent du moteur (core/counter/question-tree.ts et la règle de la
 * zone), pas d'un texte recopié : seuls le produit, son prix et son stock sont d'exemple.
 */
export function QuestionVisual() {
  const view = evaluateTree(ANALGESIC_TREE, { why: ["PAIN"], where: ["BACK"] }, ANALGESIC);
  const questions = view.questions.map((question) => ({ node: question.node, text: question.text, choices: question.choices.map(({ key, label, selected }) => ({ key, label, selected })) }));
  const items: IslandAdvice[] = view.unlocked.map((key) => ({
    name: "Poche chaud/froid dos",
    price: "12,90 €",
    margin: "5,40 €",
    drug: ANALGESIC,
    reason: ruleReason(key, ANALGESIC),
    stock: "IN_STOCK",
    quantity: 6,
    pitchOpen: true,
    sheet: examplePitch(
      "Poche chaud/froid dos",
      ["Votre douleur est-elle récente ou dure-t-elle depuis longtemps ?", "Avez-vous une douleur qui descend dans la jambe ?"],
      "En plus de l'antalgique, la chaleur détend les muscles du dos. Cette poche se chauffe au micro-ondes et se pose vingt minutes.",
      [
        { ask: 0, label: "Récente, un faux mouvement", say: "Proposez la poche, à utiliser froide les premiers jours." },
        { ask: 0, label: "Depuis des semaines", say: "Proposez la poche chaude, et conseillez d'en parler au médecin." },
        { ask: 1, label: "Oui", say: "Orientez vers le médecin avant tout conseil." },
        { ask: 1, label: "Non", say: "Vous pouvez proposer la poche sans réserve." },
      ],
    ),
  }));
  // La bannière ACTUELLE, avec ses vrais composants : l'île noire et notre robot (le conseil débloqué), puis la capsule des
  // questions, comme au poste de caisse. Les phrases d'orientation attendent la relecture de la pharmacienne : pas ici.
  return (
    <div
      className="relative flex flex-col items-center gap-2 overflow-hidden rounded-[26px] border border-black/10 px-3 py-6 shadow-xl sm:py-8 [&_section]:max-w-full"
      style={{ background: "radial-gradient(120% 90% at 20% 10%, #2A2F4A 0%, #171A2B 45%, #0E1020 100%)" }}
      aria-label="Bannière PharmaBoost, exemple : la question, puis le conseil"
      data-ile-style="aurore"
      role="group"
    >
      <CounterIslandStill items={items} drug={ANALGESIC} className="flex w-full justify-center [&>div]:max-w-full" />
      <IslandQuestions questions={questions} contentKey="exemple-dos" maxHeight={null} />
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
        {/* Plus petite sur téléphone : à 96 px, le nom du produit tenait sur quatre lignes. */}
        <ProductTile size={96} tile={STOCK_EXAMPLE.tile} className="size-16 sm:size-24" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-tight font-semibold text-text-primary sm:text-[21px]">{STOCK_EXAMPLE.product}</p>
          <p className="mt-1 hidden text-[13px] text-text-secondary sm:block">{STOCK_EXAMPLE.need}</p>
          {/* Sous 360 px, le prix passe sous le nom : à côté, il ne laissait au nom qu'une colonne de quatre lignes. */}
          <p className="mt-1 hidden text-[19px] font-semibold tracking-[-0.02em] text-text-primary tabular max-[359px]:block">{STOCK_EXAMPLE.price}</p>
        </div>
        <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary tabular max-[359px]:hidden sm:text-[26px]">{STOCK_EXAMPLE.price}</p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-app p-4">
          <StockBadge n={STOCK_EXAMPLE.stock} />
          <p className="mt-3 text-[13px] text-text-secondary">Stock de l&apos;officine</p>
        </div>
        <div className="rounded-2xl bg-surface-app p-4">
          <MarginBadge value={STOCK_EXAMPLE.margin} />
          <p className="mt-3 text-[13px] text-text-secondary">Prix de vente moins prix d&apos;achat</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Votre équipe                                                         */
/* ------------------------------------------------------------------ */

/** Le classement d'exemple : chaque comptoir est attribué à une personne, les conseils de ce comptoir sont les siens. */
const TEAM = [
  { counter: "Comptoir 1", name: "Camille", proposed: 64, validated: 23 },
  { counter: "Comptoir 2", name: "Hugo", proposed: 51, validated: 15 },
  { counter: "Comptoir 3", name: "Inès", proposed: 38, validated: 9 },
];
const CHALLENGE = { laboratory: "Laboratoire A", title: "Gamme solaire", units: 34, target: 50, daysRemaining: 12, people: [15, 11, 8] };

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)} %`;

/** La page « Mon équipe » de l'application, redessinée : le classement du mois, puis un challenge et la part de chacun. */
export function TeamVisual() {
  const proposed = TEAM.reduce((sum, row) => sum + row.proposed, 0);
  const validated = TEAM.reduce((sum, row) => sum + row.validated, 0);
  return (
    <div className="rounded-[28px] border border-border-subtle bg-surface-card p-5 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.45)] sm:p-7" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">
          {/* « Ce mois-ci » d'un bloc : à 320 px, la ligne se coupait au trait d'union (« MOIS- / CI »). */}
          Mon équipe · <span className="whitespace-nowrap">Ce mois-ci</span>
        </p>
        <ExampleTag />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[12px] font-medium">
        {["Aujourd'hui", "Cette semaine", "Ce mois", "Cette année"].map((period) => (
          <span key={period} className={cn("rounded-full px-3 py-1", period === "Ce mois" ? "bg-brand-600 text-white" : "bg-surface-app text-text-secondary")}>
            {period}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-text-secondary">
        {/* D'un bloc : à 320 px, « (31 %) » se coupait avant le signe pour cent. */}
        {proposed} conseils proposés · <span className="whitespace-nowrap">{validated} validés ({percent(validated, proposed)})</span>
      </p>
      <ol className="mt-2 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
        {TEAM.map((row, index) => (
          // Sur téléphone, tout est resserré (rang, écarts, chiffres) : sinon les trois chiffres mangeaient le prénom (« Cam… »).
          <li key={row.name} className="flex items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4">
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular sm:size-8 sm:text-[14px]", index === 0 ? "bg-warning-100 text-warning-800" : "bg-surface-sunken text-text-secondary")}>{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-text-primary">{row.name}</span>
              <span className="block truncate text-[12px] text-text-tertiary">{row.counter}</span>
              <span className="mt-1 block h-1.5 max-w-[9rem] overflow-hidden rounded-full bg-surface-sunken">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: percent(row.validated, validated).replace(" ", "") }} />
              </span>
            </span>
            <span className="grid shrink-0 grid-cols-3 gap-2 text-right sm:gap-5">
              <Stat value={String(row.proposed)} label="proposés" />
              <Stat value={String(row.validated)} label="validés" tone="text-success-700" />
              <Stat value={percent(row.validated, row.proposed)} label="taux" />
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-2xl bg-surface-app p-4">
        {/* Le titre passe à la ligne plutôt que d'être coupé ; « jours restants » descend dessous s'il manque de place. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{CHALLENGE.laboratory}</p>
            <p className="text-[15px] font-semibold text-text-primary">Challenge · {CHALLENGE.title}</p>
          </div>
          <p className="shrink-0 text-[12px] text-text-secondary">{CHALLENGE.daysRemaining} jours restants</p>
        </div>
        <p className="mt-2 text-[13px] text-text-secondary">
          <span className="text-[20px] font-semibold text-text-primary tabular">{CHALLENGE.units}</span> sur {CHALLENGE.target} unités
        </p>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full rounded-full bg-accent-500" style={{ width: percent(CHALLENGE.units, CHALLENGE.target).replace(" ", "") }} />
        </div>
        <p className="mt-2.5 text-[12px] text-text-secondary">{TEAM.map((row, i) => `${row.name} ${CHALLENGE.people[i]}`).join(" · ")}</p>
      </div>
    </div>
  );
}

function Stat({ value, label, tone = "text-text-primary" }: { value: string; label: string; tone?: string }) {
  return (
    <span className="block min-w-[2.25rem] sm:min-w-[2.75rem]">
      <span className={cn("block text-[16px] leading-6 font-semibold tabular sm:text-[19px]", tone)}>{value}</span>
      <span className="block text-[11px] text-text-tertiary">{label}</span>
    </span>
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


/* ------------------------------------------------------------------ */
/* Le bilan conseil et le rappel de fin de cure                          */
/* ------------------------------------------------------------------ */

/**
 * Le bilan du jour, puis, trois semaines plus tard, le rappel de fin de cure (17 oct. 2026) : deux e-mails au nom de la pharmacie,
 * dessinés pour le site (produit et pharmacie d'exemple).
 */
export function CureReminderVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <div className="rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-sm">
        <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-text-tertiary uppercase">
          <Mail className="size-3.5 text-brand-600" /> Aujourd&apos;hui · après la vente
        </p>
        <p className="mt-2 text-[15px] font-semibold text-text-primary">Votre bilan — Pharmacie du Centre</p>
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-surface-app px-3 py-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Check className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-text-primary">Magnésium marin B6 · 30 comprimés</p>
            <p className="text-[12px] text-text-secondary">Conseillé aujourd&apos;hui par votre pharmacien</p>
          </div>
        </div>
        <p className="mt-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[12.5px] leading-5 text-brand-900">
          Nous vous enverrons un rappel quelques jours avant la fin de votre cure, pour penser à la renouveler.
        </p>
      </div>
      <div className="relative z-10 -mt-3 ml-8 rounded-2xl border border-brand-300 bg-surface-card p-4 shadow-[0_24px_60px_-28px_rgba(11,59,71,.45)]">
        <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-brand-700 uppercase">
          <CalendarCheck className="size-3.5" /> 3 semaines plus tard · 7 jours avant la fin
        </p>
        <p className="mt-2 text-[15px] font-semibold text-text-primary">Votre cure de magnésium arrive à son terme</p>
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">Il vous en reste environ une semaine. Pensez à repasser à la pharmacie pour la renouveler.</p>
      </div>
    </div>
  );
}
