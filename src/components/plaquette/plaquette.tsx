// Les aplats sombres prennent le bleu-vert de la bannière du comptoir (#0F3F54 → #082638), jamais un vert foncé uni.
import type { ReactNode } from "react";
import { Check, CheckCircle2, FileText, Globe, HelpCircle, Mail, Phone, Thermometer, TriangleAlert, XCircle } from "lucide-react";
import { BannerMock, BannerPillsInline, type BannerMockItem } from "@/app/(public)/decouvrir/_components/banner-mock";
import { ExampleTag, HeroVisual, StepScan, StepSuivi } from "@/app/(public)/decouvrir/_components/visuals";
import { fr, HAIRLINE } from "@/app/(public)/decouvrir/_components/site-shell";
import { EXAMPLES, FAQ, SAFETY, STOCK_POINTS, TEAM_POINTS } from "@/app/(public)/decouvrir/_components/site-content";
import { SETUP_INCLUDES } from "@/app/(public)/decouvrir/_components/pricing-section";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { ANALGESIC_TREE, evaluateTree } from "@/core/counter/question-tree";
import { ESTIMATE_ASSUMPTIONS, estimateAdditionalRevenue } from "@/core/pricing/revenue-estimate";
import { formatPriceEuros, referrerPriceCents, type PublicPricing } from "@/core/pricing/official-offer";
import { cn } from "@/lib/utils";
import { normalizeContact, PLAQUETTE_PUBLIC_EMAIL, PLAQUETTE_SITE, type PlaquetteContact } from "./contact";
import { PLAQUETTE_CSS } from "./plaquette-styles";

/**
 * La plaquette de présentation de PharmaBoost : six feuilles A4, à l'écran comme sur papier, que les commerciaux envoient aux
 * pharmacies qu'ils démarchent.
 *
 * Elle ne dit rien que le site ne dise déjà : les listes (exemples, stock, équipe, sécurité, questions) viennent du même fichier
 * que l'accueil (`site-content.ts`), les visuels sont ceux du site (bannière du poste de caisse, bonne question, plan conseil),
 * le tarif vient de l'offre publique (console ou offre officielle) et l'estimation de chiffre d'affaires est CALCULÉE par la même
 * fonction que le simulateur du site. Les produits et les prix des visuels sont ceux du catalogue de démonstration, marqués
 * « exemple ». Les ventes au comptoir sont déclarées (Vendu / Non vendu), jamais lues dans le logiciel de gestion.
 *
 * Avec `contact`, les coordonnées du commercial figurent sur la couverture, en pied de chaque feuille et dans « Votre contact » ;
 * sans, la version générique donne l'adresse publique de PharmaBoost.
 */

const TOTAL_PAGES = 6;

/** Le premier exemple du simulateur du site (« 200 » à l'ouverture) : la plaquette le reprend, et le calcule. */
export const EXAMPLE_CLIENTS_PER_DAY = 200;

/**
 * Ce que paie l'abonnement, mot pour mot la liste « Compris dans l'abonnement » de la section tarif du site
 * (`pricing-section.tsx`, où elle n'est pas exportée). Un test vérifie que chaque ligne y figure toujours.
 */
export const PLAQUETTE_SUBSCRIPTION_INCLUDES = [
  "Tous vos postes de comptoir",
  "Les mises à jour automatiques des postes",
  "La bibliothèque de conseils commune",
  "Le support, depuis PharmaBoost",
];

/**
 * Les trois étapes du comptoir, telles que l'accueil les présentait (rubrique « Comment ça marche », retirée de l'accueil le
 * 10 oct. 2026 mais toujours vraie) : le scan dans le logiciel de gestion, la bannière et Vendu / Non vendu, puis le bilan par
 * e-mail ou le plan conseil complet remis depuis l'écran de vente.
 */
export const PLAQUETTE_STEPS = [
  { n: "01", title: "Vous scannez les boîtes", line: "Comme d'habitude, dans votre logiciel de gestion." },
  { n: "02", title: "La bannière propose", line: "Les produits qui accompagnent le traitement, pris dans votre rayon, avec la quantité en stock. Vendu ou Non vendu : un clic." },
  {
    n: "03",
    title: "Le patient repart avec ses conseils",
    line: "Son bilan par e-mail, s'il le souhaite. Ou, depuis l'écran de vente, son plan conseil complet : posologie, indication, rappels — sur son téléphone, par e-mail ou imprimé.",
  },
];

/* ------------------------------------------------------------------ */
/* Les exemples des visuels (catalogue de démonstration)               */
/* ------------------------------------------------------------------ */

const DOXY = "DOXYCYCLINE 100 mg";
const SOLAIRE = { name: "Crème solaire SPF 50+", price: "16,90 €", image: "/site/produits/creme-solaire-spf50.webp", quantity: 18 };

/** La phrase à dire de la règle « photoprotection sous doxycycline », remplie comme le fait le moteur (et la page « Pourquoi »). */
const DOXY_COUNTER_SCRIPT = ADVICE_RULES.find((rule) => rule.key === "skin-doxycycline-photoprotection")
  ?.counterScriptTemplate.replaceAll("{drug}", DOXY)
  .replaceAll("{product}", SOLAIRE.name);

/** Une réponse de la foire aux questions du site, retrouvée par sa question : une question disparue du site disparaît d'ici. */
function faq(question: string): string | undefined {
  return FAQ.find((item) => item.q === question)?.a;
}

/**
 * La typographie française de la plaquette : celle du site (`fr` : espace insécable avant « ? ! : ; » et dans les guillemets),
 * plus un nombre jamais séparé de son unité (« 12 mois », « 25 jours », « 3 g », « 20 % ») : sur papier, « 12 » en fin de
 * ligne et « mois » au début de la suivante se lisent mal.
 */
function typo(text: string): string {
  return fr(text).replace(/(\d) (?=(?:mois|jours|g|€|%|clients)(?![\p{L}]))/gu, "$1\u00a0");
}

/* ------------------------------------------------------------------ */
/* La plaquette                                                         */
/* ------------------------------------------------------------------ */

export function Plaquette({ pricing, contact, className }: { pricing: PublicPricing; contact?: PlaquetteContact | null; className?: string }) {
  const person = normalizeContact(contact);
  const footer = person ? [person.name, person.phone, person.email].filter(Boolean).join(" · ") : `${PLAQUETTE_SITE} · ${PLAQUETTE_PUBLIC_EMAIL}`;
  return (
    <div className={cn("plq", className)} data-plaquette={person ? "personnelle" : "generique"}>
      <style href="pharmaboost-plaquette" precedence="default">
        {PLAQUETTE_CSS}
      </style>
      <Cover person={person} />
      <Sheet n={2} section="Le potentiel" footer={footer}>
        <PotentialPage />
      </Sheet>
      <Sheet n={3} section="Comment ça marche" footer={footer}>
        <HowPage />
      </Sheet>
      <Sheet n={4} section="Ce que la pharmacie y gagne" footer={footer}>
        <GainsPage monthlyPriceCents={pricing.monthlyPriceCents} />
      </Sheet>
      <Sheet n={5} section="Sécurité et confiance" footer={footer}>
        <SafetyPage />
      </Sheet>
      <Sheet n={6} section="Tarif et mise en service" footer={footer}>
        <PricingPage pricing={pricing} person={person} />
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Les briques                                                          */
/* ------------------------------------------------------------------ */

type Person = ReturnType<typeof normalizeContact>;

function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-[9px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- le logo vectoriel, imprimé tel quel */}
      <img src="/logo-robot.svg" alt="" width={large ? 48 : 26} height={large ? 48 : 26} className="block shrink-0" />
      <span className={cn("font-semibold tracking-[-0.015em] text-text-primary", large ? "text-[25px]" : "text-[14px]")}>
        Pharma<span className="text-brand-600">Boost</span>
      </span>
    </span>
  );
}

/** Une feuille intérieure : l'en-tête courant, le contenu, le pied (coordonnées et numéro de page). */
function Sheet({ n, section, footer, children }: { n: number; section: string; footer: string; children: ReactNode }) {
  return (
    <section className="plq-page" aria-label={`Page ${n} sur ${TOTAL_PAGES} : ${section}`}>
      <div className="flex h-full flex-col px-[56px] pt-[36px] pb-[30px]">
        <header>
          <div className="flex items-center justify-between">
            <Wordmark />
            <span className="font-mono text-[10px] tracking-[0.16em] text-text-tertiary uppercase">{section}</span>
          </div>
          <div className={cn("mt-[12px] h-px", HAIRLINE)} aria-hidden="true" />
        </header>
        {/* Les blocs ne rétrécissent jamais : un contenu trop long déborde (et la mesure le voit) au lieu d'être rogné en silence. */}
        <div className="plq-body flex min-h-0 flex-1 flex-col pt-[20px] [&>*]:shrink-0">{children}</div>
        <footer className="mt-[14px] flex items-center justify-between gap-6 border-t border-border-subtle pt-[10px] text-[10.5px] text-text-tertiary">
          <span>PharmaBoost · Le copilote du comptoir officinal</span>
          <span className="flex items-center gap-4">
            <span>{footer}</span>
            <span className="font-mono tabular text-text-secondary">
              {n} / {TOTAL_PAGES}
            </span>
          </span>
        </footer>
      </div>
    </section>
  );
}

/** Le titre d'une feuille : le numéro et le mot-clé, le titre, puis une phrase d'introduction. */
function Opener({ n, kicker, title, children }: { n: string; kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] text-brand-700 uppercase">
        <span className="text-text-tertiary">{n}</span>
        <span className={cn("h-px w-8", HAIRLINE)} aria-hidden="true" />
        {kicker}
      </p>
      <h2 className="mt-[12px] text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-text-primary">{title}</h2>
      {children && <p className="mt-[10px] text-[14px] leading-[1.55] text-text-secondary">{children}</p>}
    </div>
  );
}

function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("font-mono text-[10px] tracking-[0.14em] text-text-tertiary uppercase", className)}>{children}</p>;
}

function CheckList({ items, className, tone = "text-text-secondary" }: { items: string[]; className?: string; tone?: string }) {
  return (
    <ul className={cn("space-y-[7px] text-[12.5px] leading-[1.45]", tone, className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-[8px]">
          <Check className="mt-[2px] size-[14px] shrink-0 text-brand-600" strokeWidth={3} aria-hidden="true" />
          <span>{typo(item)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Couverture                                                       */
/* ------------------------------------------------------------------ */

const HERO_TEXT =
  "Au comptoir, vous scannez les boîtes comme d'habitude. La bannière PharmaBoost vous montre, dans la foulée du scan, ce qu'il est utile de conseiller en plus, pris dans votre rayon. Et le patient repart avec ses conseils.";

/** Les trois idées du bandeau de couverture, chacune déjà dite sur le site. */
const COVER_POINTS = [
  { label: "Au scan", value: "Le conseil qui accompagne le traitement, pris dans votre rayon." },
  { label: "Le pharmacien décide", value: "Vendu ou Non vendu, en un clic sur la bannière." },
  { label: "Sans changer vos habitudes", value: "À côté de votre logiciel de gestion, sans le modifier." },
];

function Cover({ person }: { person: Person }) {
  return (
    <section className="plq-page" aria-label={`Page 1 sur ${TOTAL_PAGES} : couverture`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_42%_at_82%_52%,var(--color-brand-100),transparent_72%)]" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-ink-200)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-ink-200)_1px,transparent_1px)] [mask-image:radial-gradient(60%_42%_at_22%_22%,black,transparent_78%)] bg-[size:44px_44px] opacity-70"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col">
        <div className="px-[56px] pt-[44px]">
          <header className="flex items-center justify-between">
            <Wordmark large />
            <span className="rounded-full border border-brand-200 bg-white px-[14px] py-[7px] font-mono text-[10.5px] tracking-[0.16em] text-brand-800 uppercase">Plaquette de présentation</span>
          </header>

          <div className="mt-[40px] grid grid-cols-[1fr_282px] items-end gap-[30px]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-white px-[12px] py-[6px] text-[12.5px] font-medium text-text-secondary">
                <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion
              </p>
              <h1 className="mt-[20px] text-[72px] leading-[0.97] font-bold tracking-[-0.045em] text-text-primary">
                Scan.
                <br />
                Conseil.
                <br />
                {/* Couleur pleine : le dégradé découpé dans le texte (celui du site) laissait un filet autour du mot dans le PDF. */}
                <span className="text-brand-600">Bilan.</span>
              </h1>
            </div>
            <div className="pb-[10px]">
              <p className="text-[21px] leading-[1.22] font-bold tracking-[-0.02em] text-brand-800">Le copilote du comptoir officinal</p>
              <p className="mt-[12px] text-[13.5px] leading-[1.62] text-text-secondary">{typo(HERO_TEXT)}</p>
            </div>
          </div>
        </div>

        {/* Le visuel de l'accueil du site, réduit d'un bloc (zoom) : à sa taille réelle, la bannière poussait le bandeau hors de la feuille. */}
        <div className="relative mt-[30px] flex min-h-0 flex-1 items-start justify-center px-[56px]">
          <div className="w-[548px] [zoom:0.8]">
            <HeroVisual />
          </div>
        </div>

        <div className="relative shrink-0 bg-[linear-gradient(160deg,#0F3F54,#082638)] px-[56px] pt-[24px] pb-[26px] text-white">
          <div className="grid grid-cols-3 gap-[26px]">
            {COVER_POINTS.map((point) => (
              <div key={point.label}>
                <p className="font-mono text-[10px] tracking-[0.16em] text-brand-300 uppercase">{point.label}</p>
                <p className="mt-[6px] text-[13px] leading-[1.45] font-semibold text-white">{typo(point.value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-[18px] flex items-center justify-between gap-6 border-t border-white/15 pt-[14px] text-[12px] text-brand-100">
            {person ? (
              <>
                <span>
                  <span className="text-brand-300">Votre contact · </span>
                  <span className="font-semibold text-white">{person.name}</span>
                </span>
                <span className="flex items-center gap-4">
                  {person.phone && <span>{person.phone}</span>}
                  <span>{person.email}</span>
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold text-white">{PLAQUETTE_SITE}</span>
                <span>{PLAQUETTE_PUBLIC_EMAIL}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Le potentiel                                                     */
/* ------------------------------------------------------------------ */

function PotentialPage() {
  return (
    <>
      <Opener n="01" kicker="Le potentiel" title={typo("Et si chaque délivrance révélait tout son potentiel de conseil ?")}>
        {typo("Comment ne manquer aucune opportunité de conseil au comptoir ? Votre équipe officinale peut-elle penser à tout le potentiel de conseil, à chaque délivrance ?")}{" "}
        <span className="font-semibold text-text-primary">PharmaBoost, oui.</span> Au comptoir pour l&apos;équipe, à la maison pour le patient.
      </Opener>

      <div className="mt-[18px] grid grid-cols-2 gap-[28px] border-t border-border-subtle pt-[14px]">
        <div>
          <h3 className="text-[18px] leading-[1.2] font-bold tracking-[-0.02em] text-text-primary">Des milliers de produits. Un patient à la fois.</h3>
          <p className="mt-[7px] text-[12px] leading-[1.55] text-text-secondary">
            {typo("En rayon, des milliers de références. Sur chaque ordonnance, des médicaments qui appellent un conseil ou une précaution. Avec la file qui attend, impossible de tout avoir en tête : le bon conseil passe parfois à la trappe.")}
          </p>
        </div>
        <p className="self-center rounded-[14px] bg-brand-50 px-[18px] py-[14px] text-[13px] leading-[1.55] font-medium text-brand-950">
          {typo("PharmaBoost y pense avec vous. Au moment du scan, il propose les meilleures références de votre officine pour ce patient, cette ordonnance et ces médicaments. Vous décidez.")}
        </p>
      </div>

      {/* La même ordonnance, sans puis avec PharmaBoost (page « Pourquoi » du site). */}
      <div className="mt-[16px] rounded-[20px] border border-border-subtle bg-surface-card p-[12px]">
        <div className="flex items-center gap-3 rounded-[12px] bg-surface-app px-[14px] py-[9px]">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand-100 text-brand-800" aria-hidden="true">
            <FileText className="size-[15px]" />
          </span>
          <div className="min-w-0 flex-1">
            <MonoLabel>Ordonnance du patient</MonoLabel>
            <p className="font-mono text-[12.5px] text-text-primary">DOXYCYCLINE 100 mg · PARACÉTAMOL 1000 mg</p>
          </div>
          <ExampleTag />
        </div>
        <div className="mt-[12px] grid grid-cols-2 gap-[12px]">
          <Side tone="without" result="Le patient repart sans conseil.">
            <p className="text-[12px] text-text-tertiary">Ce que le pharmacien doit se rappeler, seul :</p>
            <ul className="mt-[8px] space-y-[7px]">
              {["Cet antibiotique rend-il la peau sensible au soleil ?", "Une protection solaire en rayon ? Laquelle ?", "Une précaution à rappeler ?", "Trois patients attendent…"].map((question) => (
                <li key={question} className="flex items-center gap-[8px] rounded-[10px] bg-white px-[10px] py-[8px] text-[12px] text-text-secondary">
                  <HelpCircle className="size-[14px] shrink-0 text-warning-600" aria-hidden="true" /> {typo(question)}
                </li>
              ))}
            </ul>
          </Side>
          <Side tone="with" result="Le patient repart avec le bon conseil.">
            <p className="text-[12px] text-text-secondary">Au scan, la bannière propose :</p>
            <BannerMock subject={DOXY} items={[{ ...SOLAIRE, drug: DOXY, stock: "IN_STOCK" }]} footer={false} width={440} className="mt-[8px]" />
            {DOXY_COUNTER_SCRIPT && (
              <div className="mt-[10px] rounded-[9px] bg-white px-[10px] py-[7px]">
                {/* La bannière ne dit pas de phrase : celle-ci est sur l'écran de vente (« À dire au patient »). */}
                <MonoLabel className="text-[9px] text-brand-700">Écran de vente · À dire au patient</MonoLabel>
                <p className="mt-[3px] text-[10.5px] leading-[1.48] text-brand-950">{typo(DOXY_COUNTER_SCRIPT)}</p>
              </div>
            )}
          </Side>
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-3 gap-px overflow-hidden rounded-[16px] border border-border-subtle bg-border-subtle">
        {[
          { label: "Chaque patient", value: "Les précautions à vérifier" },
          { label: "Chaque ordonnance", value: "Le traitement lu en entier" },
          { label: "Chaque médicament", value: "Le conseil qui l'accompagne" },
        ].map((cell) => (
          <div key={cell.label} className="bg-surface-card px-[16px] py-[11px]">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-text-tertiary uppercase">{cell.label}</dt>
            <dd className="mt-[4px] text-[14px] leading-[1.3] font-semibold text-text-primary">{typo(cell.value)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Side({ tone, result, children }: { tone: "without" | "with"; result: string; children: ReactNode }) {
  const withPb = tone === "with";
  return (
    <div className={cn("flex flex-col rounded-[14px] border p-[12px]", withPb ? "border-brand-200 bg-brand-50" : "border-border-subtle bg-surface-app")}>
      <span className={cn("w-fit rounded-full px-[10px] py-[3px] text-[11px] font-semibold text-white", withPb ? "bg-brand-600" : "bg-ink-700")}>{withPb ? "Avec PharmaBoost" : "Sans PharmaBoost"}</span>
      <div className="mt-[10px] flex-1">{children}</div>
      <p className={cn("mt-[12px] flex items-start gap-[7px] border-t pt-[10px] text-[13px] leading-snug font-semibold", withPb ? "border-brand-200 text-success-700" : "border-border-subtle text-danger-700")}>
        {withPb ? <CheckCircle2 className="mt-px size-[16px] shrink-0" aria-hidden="true" /> : <XCircle className="mt-px size-[16px] shrink-0" aria-hidden="true" />}
        {result}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Comment ça marche                                                */
/* ------------------------------------------------------------------ */

function HowPage() {
  const visuals = [
    // Réduits d'un bloc pour tenir dans leur case sans couper le nom du médicament ni le cadre du téléphone.
    <div key="scan" className="w-full [zoom:0.92]">
      <StepScan />
    </div>,
    <BannerMock key="banner" subject={DOXY} items={[{ ...SOLAIRE, drug: DOXY, stock: "IN_STOCK" }]} footer={false} width={420} align="center" />,
    <div key="suivi" className="[zoom:0.74]">
      <StepSuivi />
    </div>,
  ];
  return (
    <>
      <Opener n="02" kicker="Comment ça marche" title="Du scan au conseil, en trois étapes.">
        {typo("Une petite bannière, à côté de votre logiciel. Elle attend votre prochain scan, pose la bonne question quand il le faut, rappelle les mises en garde — comme 3 g de paracétamol par jour au maximum — et reste là jusqu'à la fin de la vente. Elle ne prend jamais la main sur votre logiciel de gestion.")}
      </Opener>

      <ol className="relative mt-[22px] grid grid-cols-[0.9fr_1.25fr_1fr] gap-[14px]">
        {PLAQUETTE_STEPS.map((step, index) => (
          <li key={step.n} className="flex flex-col">
            <div className="flex h-[200px] items-center justify-center overflow-hidden rounded-[16px] border border-border-subtle bg-surface-app p-[12px]">{visuals[index]}</div>
            <span className="mt-[12px] font-mono text-[12px] text-brand-700">{step.n}</span>
            <h3 className="mt-[2px] text-[16px] leading-[1.2] font-bold tracking-[-0.02em] text-text-primary">{step.title}</h3>
            <p className="mt-[5px] text-[12px] leading-[1.55] text-text-secondary">{typo(step.line)}</p>
          </li>
        ))}
      </ol>

      {/* La bonne question : l'arbre du comptoir, dessiné par la bannière. */}
      <div className="mt-auto grid grid-cols-[1fr_356px] items-center gap-[26px] rounded-[20px] border border-border-subtle bg-surface-app p-[22px]">
        <div>
          <p className="font-mono text-[10.5px] tracking-[0.16em] text-brand-700 uppercase">Une question, puis le conseil</p>
          <h3 className="mt-[8px] text-[21px] leading-[1.15] font-bold tracking-[-0.025em] text-text-primary">Le bon conseil commence par la bonne question.</h3>
          <p className="mt-[10px] text-[12.5px] leading-[1.6] text-text-secondary">
            {typo("Un paracétamol ne dit pas pourquoi le patient le prend. PharmaBoost vous fait poser la question : fièvre, mal de tête, douleur ? Où a-t-il mal ? Le produit vient ensuite : la poche chaud/froid pour le dos, pas un produit au hasard.")}
          </p>
          <ul className="mt-[12px] flex flex-wrap gap-[6px]">
            {["Pourquoi ?", "Où ?", "Puis le produit"].map((chip) => (
              <li key={chip} className="inline-flex items-center gap-[6px] rounded-full border border-border-subtle bg-white px-[11px] py-[5px] text-[12px] font-medium text-text-primary">
                <Check className="size-[13px] text-brand-600" aria-hidden="true" /> {typo(chip)}
              </li>
            ))}
          </ul>
          <p className="mt-[12px] flex items-center gap-[8px] text-[12px] text-text-secondary">
            <Thermometer className="size-[14px] shrink-0 text-brand-600" aria-hidden="true" /> {typo("Fièvre ? Un thermomètre, s'il n'en a pas à la maison.")}
          </p>
        </div>
        <div>
          <QuestionBanner />
          <p className="mt-[6px] text-center text-[10.5px] text-text-tertiary">
            La bannière, telle qu&apos;elle pose la question · <ExampleTag className="text-[9.5px]" />
          </p>
        </div>
      </div>
    </>
  );
}

/** Le médicament de l'exemple : un paracétamol, qui ne dit pas pourquoi le patient le prend. */
const ANALGESIC = "DOLIPRANE 1000 mg";

/**
 * La bonne question du site (`QuestionVisual`), sans le pied de la bannière (e-mail, détail, « Vente terminée », déjà sur la
 * couverture) : la plaquette n'a pas la place de le répéter. Questions, choix et conseil débloqué viennent du moteur (arbre du
 * comptoir et règle de la zone) ; seuls le produit, son prix et son stock sont d'exemple.
 */
function QuestionBanner() {
  const view = evaluateTree(ANALGESIC_TREE, { why: ["PAIN"], where: ["BACK"] }, ANALGESIC);
  const questions = view.questions.map((question) => ({ text: question.text, choices: question.choices.map((choice) => ({ label: choice.label, selected: choice.selected })) }));
  const items: BannerMockItem[] = view.unlocked.map((key) => ({
    name: "Poche chaud/froid dos",
    price: "12,90 €",
    drug: ANALGESIC,
    reason: ADVICE_RULES.find((rule) => rule.key === key)?.shortReasonTemplate.replaceAll("{drug}", ANALGESIC),
    stock: "IN_STOCK",
    quantity: 6,
  }));
  return <BannerMock subject={ANALGESIC} questions={questions} items={items} footer={false} align="center" />;
}

/* ------------------------------------------------------------------ */
/* 4 · Ce que la pharmacie y gagne                                      */
/* ------------------------------------------------------------------ */

function GainsPage({ monthlyPriceCents }: { monthlyPriceCents: number }) {
  const estimate = estimateAdditionalRevenue(EXAMPLE_CLIENTS_PER_DAY);
  const ratePercent = Math.round(ESTIMATE_ASSUMPTIONS.adviceRate * 100);
  const product = formatPriceEuros(ESTIMATE_ASSUMPTIONS.averageProductCents);
  const days = ESTIMATE_ASSUMPTIONS.openDaysPerMonth;
  const perMonth = formatPriceEuros(estimate.perMonthCents);
  const scale = Math.max(estimate.perMonthCents, monthlyPriceCents, 1);
  const bar = (cents: number) => `${Math.max(1.5, (cents / scale) * 100)}%`;

  return (
    <>
      <Opener n="03" kicker="Ce que la pharmacie y gagne" title={typo("Plus de conseils pertinents, plus d’opportunités au comptoir, sans changer vos habitudes.")} />

      {/* L'estimation du simulateur du site, calculée ici par la même fonction : chaque étape se refait à la calculette. */}
      <div className="mt-[18px] overflow-hidden rounded-[20px] border-2 border-brand-500">
        <div className="grid grid-cols-[1fr_286px]">
          <div className="px-[20px] py-[16px]">
            <p className="font-mono text-[10.5px] tracking-[0.16em] text-brand-700 uppercase">Estimez ce que PharmaBoost vous rapporte</p>
            <p className="mt-[8px] text-[15px] leading-[1.35] font-semibold text-text-primary">
              Exemple : {estimate.clientsPerDay.toLocaleString("fr-FR")} clients par jour
            </p>
            <ol className="mt-[10px] divide-y divide-border-subtle border-y border-border-subtle text-[12.5px]" aria-label="Le calcul, étape par étape">
              <Step label={`Clients conseillés (${ratePercent} %)`} value={`${estimate.advisedClientsPerDay} par jour`} />
              <Step label={`× ${product} par produit en moyenne`} value={`${formatPriceEuros(estimate.perDayCents)} par jour`} />
              <Step label={`× ${days} jours d'ouverture`} value={`${perMonth} par mois`} strong />
            </ol>
            <p className="mt-[10px] font-mono text-[11px] text-text-secondary tabular">
              {estimate.clientsPerDay} clients × {ratePercent} % × {product} × {days} jours = {perMonth}
            </p>
          </div>
          <div className="flex flex-col justify-center bg-brand-50 px-[20px] py-[16px]">
            <p className="text-[11.5px] font-medium whitespace-nowrap text-brand-800">Chiffre d&apos;affaires supplémentaire estimé</p>
            <p className="mt-[4px] flex flex-wrap items-baseline gap-x-[8px]">
              <span className="text-[44px] leading-none font-bold tracking-[-0.035em] text-brand-700 tabular">{perMonth}</span>
              <span className="text-[14px] font-medium text-brand-800">par mois</span>
            </p>
            <div className="mt-[14px] space-y-[9px] text-[11px]" aria-hidden="true">
              <Bar label="Chiffre d'affaires estimé" value={perMonth} width={bar(estimate.perMonthCents)} tone="bg-brand-600" />
              <Bar label="Abonnement" value={formatPriceEuros(monthlyPriceCents)} width={bar(monthlyPriceCents)} tone="bg-ink-400" />
            </div>
            <p className="mt-[10px] text-[11.5px] text-brand-900">Pour un abonnement de {formatPriceEuros(monthlyPriceCents)} HT par mois.</p>
          </div>
        </div>
        <p className="border-t border-border-subtle bg-white px-[20px] py-[10px] text-[11px] leading-[1.5] text-text-tertiary">
          {typo(
            `Estimation indicative, pas une promesse de résultat : ${ratePercent} % de vos clients prennent un produit conseillé, à ${product} en moyenne, sur ${days} jours d'ouverture par mois. C'est du chiffre d'affaires, pas une marge. Faites le calcul avec vos chiffres sur ${PLAQUETTE_SITE}.`,
          )}
        </p>
      </div>

      <div className="mt-[20px] grid flex-1 grid-cols-2 gap-[26px]">
        {/* Stock et marge : la liste du site, dans l'ordre du départage. */}
        <div className="flex flex-col">
          <p className="font-mono text-[10.5px] tracking-[0.16em] text-brand-700 uppercase">Stock et marge</p>
          <h3 className="mt-[6px] text-[18px] leading-[1.2] font-bold tracking-[-0.02em] text-text-primary">
            Votre rayon. Votre marge.
            <br />
            Sous les yeux.
          </h3>
          <dl className="mt-[10px] divide-y divide-border-subtle border-y border-border-subtle">
            {STOCK_POINTS.map((point) => (
              <div key={point.label} className="py-[7px]">
                <dt className="font-mono text-[9.5px] tracking-[0.14em] text-text-tertiary uppercase">{point.label}</dt>
                <dd className="mt-[2px]">
                  <span className="block text-[12.5px] leading-[1.4] font-semibold text-text-primary">{typo(point.value)}</span>
                  {point.hint && <span className="mt-[2px] block text-[10.5px] leading-[1.48] text-text-secondary">{typo(point.hint)}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Mon équipe : un comptoir par personne, les résultats de chacun, les ventes déclarées. */}
        <div className="flex flex-col">
          <p className="font-mono text-[10.5px] tracking-[0.16em] text-brand-700 uppercase">Mon équipe</p>
          <h3 className="mt-[6px] text-[18px] leading-[1.2] font-bold tracking-[-0.02em] text-text-primary">
            Un comptoir, une personne.
            <br />
            Les résultats de chacun.
          </h3>
          <dl className="mt-[10px] divide-y divide-border-subtle border-y border-border-subtle">
            {TEAM_POINTS.map((point) => (
              <div key={point.label} className="py-[7px]">
                <dt className="font-mono text-[9.5px] tracking-[0.14em] text-text-tertiary uppercase">{point.label}</dt>
                <dd className="mt-[2px] text-[12.5px] leading-[1.4] font-semibold text-text-primary">{typo(point.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-[10px] text-[11px] leading-[1.5] text-text-tertiary">{typo("Au comptoir, les ventes sont déclarées : Vendu ou Non vendu, en un clic sur la bannière.")}</p>
          {/* Ce que la bannière montre d'un conseil : le challenge en cours, la date courte, puis le stock — dans cet ordre. */}
          <div className="mt-auto rounded-[14px] border border-border-subtle bg-surface-app px-[14px] py-[11px]">
            <p className="flex items-center justify-between text-[11px] text-text-secondary">
              Au comptoir, sur la bannière : <ExampleTag className="text-[9.5px]" />
            </p>
            <div className="mt-[7px]">
              <BannerPillsInline item={{ challenge: true, shortDate: "30/11/26", stock: "IN_STOCK", quantity: 29 }} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Step({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-[6px]">
      <span className="text-text-secondary">{label}</span>
      <span className={cn("text-right font-medium whitespace-nowrap text-text-primary tabular", strong && "font-semibold text-brand-700")}>{value}</span>
    </li>
  );
}

function Bar({ label, value, width, tone }: { label: string; value: string; width: string; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-brand-900">{label}</span>
        <span className="font-semibold text-brand-950 tabular">{value}</span>
      </div>
      <div className="mt-[3px] h-[8px] rounded-full bg-white">
        <span className={cn("block h-full rounded-full", tone)} style={{ width }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5 · Sécurité et confiance                                            */
/* ------------------------------------------------------------------ */

/** L'encadré « Le pharmacien garde la décision » : deux réponses de la foire aux questions du site. */
const DECISION_QUESTIONS = ["Qui décide du conseil ?", "Une IA choisit-elle les produits ?"];

function SafetyPage() {
  return (
    <>
      <Opener n="04" kicker="Sécurité et confiance" title="La sécurité avant la suggestion.">
        {typo("Le médecin prescrit. PharmaBoost vous rappelle ce qui accompagne le traitement, et ce qu'il ne faut pas y ajouter.")}
      </Opener>

      {/* Les exemples du site : chacun adossé à une règle ou à une mise en garde du moteur. */}
      <div className="mt-[18px] overflow-hidden rounded-[18px] border border-border-subtle">
        <div className="grid grid-cols-[0.8fr_1.15fr_1.25fr] gap-[16px] border-b border-border-subtle bg-surface-app px-[16px] py-[7px]">
          {["Au scan", "PharmaBoost vous montre", "Pourquoi"].map((heading) => (
            <span key={heading} className="font-mono text-[9.5px] tracking-[0.14em] text-text-tertiary uppercase">
              {heading}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-border-subtle">
          {EXAMPLES.map((example) => (
            <li key={example.scan} className="grid grid-cols-[0.8fr_1.15fr_1.25fr] items-baseline gap-[16px] px-[16px] py-[5px]">
              <p className="font-mono text-[11px] text-text-secondary">
                {example.scan}
                {example.context && <span className="mt-[1px] block font-sans text-[11px] text-text-tertiary">{typo(example.context)}</span>}
              </p>
              <div>
                <p className={cn("flex items-baseline gap-[6px] text-[12.5px] leading-snug font-semibold", example.warning ? "text-warning-800" : "text-text-primary")}>
                  {example.warning ? <TriangleAlert className="size-[13px] shrink-0 translate-y-[2px] text-warning-600" aria-hidden="true" /> : <span className="text-brand-600" aria-hidden="true">+</span>}
                  {example.warning && <span className="sr-only">Mise en garde :</span>}
                  <span>{typo(example.shows)}</span>
                </p>
                {example.note && <p className="mt-[1px] pl-[14px] text-[11px] text-text-tertiary">{typo(example.note)}</p>}
              </div>
              <p className="text-[11px] leading-[1.45] text-text-secondary">{typo(example.why)}</p>
            </li>
          ))}
        </ul>
        <p className="border-t border-border-subtle bg-surface-app px-[16px] py-[7px] text-[11px] text-text-tertiary">{typo("Au comptoir, vous notez Vendu ou Non vendu. Le conseil reste votre décision.")}</p>
      </div>

      <dl className="mt-[16px] grid grid-cols-3 gap-px overflow-hidden rounded-[18px] border border-border-subtle bg-border-subtle">
        {SAFETY.map((cell) => (
          <div key={cell.label} className="bg-white px-[15px] py-[9px]">
            <dt className="font-mono text-[9.5px] tracking-[0.14em] text-text-tertiary uppercase">{cell.label}</dt>
            <dd className="mt-[4px] text-[12.5px] leading-[1.4] font-semibold text-text-primary">{typo(cell.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto rounded-[20px] bg-[linear-gradient(160deg,#0F3F54,#082638)] px-[24px] py-[18px] text-white">
        <p className="font-mono text-[10px] tracking-[0.16em] text-brand-300 uppercase">Le pharmacien décide</p>
        <h3 className="mt-[6px] text-[20px] leading-[1.2] font-bold tracking-[-0.02em]">Le pharmacien garde la décision.</h3>
        <dl className="mt-[12px] grid grid-cols-2 gap-x-[26px] gap-y-[12px]">
          {DECISION_QUESTIONS.map((question) => {
            const answer = faq(question);
            return answer ? (
              <div key={question}>
                <dt className="text-[12.5px] font-semibold text-white">{typo(question)}</dt>
                <dd className="mt-[2px] text-[11.5px] leading-[1.5] text-brand-100">{typo(answer)}</dd>
              </div>
            ) : null;
          })}
        </dl>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Tarif et mise en service                                         */
/* ------------------------------------------------------------------ */

/** Les questions qu'on pose avant de signer, avec les réponses du site. */
const PRICING_QUESTIONS = ["Faut-il paramétrer les conseils ?", "Quel engagement ?"];

function PricingPage({ pricing, person }: { pricing: PublicPricing; person: Person }) {
  const { monthlyPriceCents, setupFeeCents, commitmentMonths, referralDiscountPercent } = pricing;
  const referrerPrice = referrerPriceCents(monthlyPriceCents, referralDiscountPercent);
  const nextSteps = [
    { n: "1", title: "La démonstration", line: person ? "Voyez-le sur votre comptoir : réservez une démo avec votre contact." : `Voyez-le sur votre comptoir : réservez une démo sur ${PLAQUETTE_SITE}.` },
    { n: "2", title: "L'installation", line: "Un fichier à télécharger par poste de comptoir, un double-clic. La mise en service est faite avec vous." },
    { n: "3", title: "La formation de l'équipe", line: "Comprise dans la mise en service, avec le paramétrage de l'officine et l'import du stock." },
  ];

  return (
    <>
      <Opener n="05" kicker="Tarif et mise en service" title="Un seul abonnement. Tout est inclus.">
        Un abonnement par officine, quel que soit le nombre de postes de comptoir.
      </Opener>

      <div className="mt-[18px] grid grid-cols-2 gap-[14px]">
        <div className="flex flex-col rounded-[18px] border border-border-subtle bg-white p-[18px]">
          <p className="font-mono text-[10.5px] tracking-[0.14em] text-text-tertiary uppercase">{pricing.name}</p>
          <p className="mt-[8px] flex flex-wrap items-baseline gap-x-[6px]">
            <span className="text-[36px] leading-none font-bold tracking-[-0.03em] text-text-primary tabular">{formatPriceEuros(monthlyPriceCents)}</span>
            <span className="text-[13px] text-text-secondary">HT / mois</span>
          </p>
          <p className="mt-[6px] text-[12.5px] font-semibold text-brand-700">Engagement de {commitmentMonths} mois</p>
          <p className="mt-[14px] text-[12.5px] font-semibold text-text-primary">Compris dans l&apos;abonnement</p>
          <CheckList items={PLAQUETTE_SUBSCRIPTION_INCLUDES} className="mt-[7px]" />
          <div className="mt-auto pt-[14px]">
            <div className="rounded-[12px] bg-brand-50 px-[13px] py-[10px]">
              <p className="text-[12.5px] font-semibold text-brand-950">{typo(`Parrainez un confrère : ${referralDiscountPercent} % de moins par mois`)}</p>
              <p className="mt-[3px] text-[11px] leading-[1.5] text-brand-900">
                {typo(`Au moment de votre inscription, indiquez la personne que vous parrainez. Dès qu'elle s'abonne, vous ne payez plus ${formatPriceEuros(monthlyPriceCents)} mais ${formatPriceEuros(referrerPrice)} HT par mois.`)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-[18px] border border-border-subtle bg-surface-app p-[18px]">
          <p className="font-mono text-[10.5px] tracking-[0.14em] text-text-tertiary uppercase">Mise en service clé en main</p>
          <p className="mt-[8px] flex flex-wrap items-baseline gap-x-[6px]">
            <span className="text-[36px] leading-none font-bold tracking-[-0.03em] text-text-primary tabular">{formatPriceEuros(setupFeeCents)}</span>
            <span className="text-[13px] text-text-secondary">HT, une seule fois</span>
          </p>
          <p className="mt-[14px] text-[12.5px] font-semibold text-text-primary">Ce qu&apos;elle comprend</p>
          <CheckList items={SETUP_INCLUDES} className="mt-[7px]" />
          <div className="mt-auto pt-[14px]">
            <div className="rounded-[12px] border border-border-subtle bg-white px-[13px] py-[10px]">
              <p className="text-[12.5px] font-semibold text-text-primary">Compatible avec votre logiciel</p>
              <p className="mt-[3px] text-[11px] leading-[1.5] text-text-secondary">{typo(faq("Compatible avec mon logiciel ?") ?? "")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-[20px]">
        <p className="font-mono text-[10.5px] tracking-[0.16em] text-brand-700 uppercase">Les prochaines étapes</p>
        <ol className="mt-[10px] grid grid-cols-3 gap-[14px]">
          {nextSteps.map((step) => (
            <li key={step.n} className="border-t-2 border-brand-500 pt-[10px]">
              <p className="flex items-center gap-[8px]">
                <span className="flex size-[22px] items-center justify-center rounded-full bg-brand-600 text-[11.5px] font-bold text-white">{step.n}</span>
                <span className="text-[13.5px] font-bold text-text-primary">{typo(step.title)}</span>
              </p>
              <p className="mt-[6px] text-[11.5px] leading-[1.5] text-text-secondary">{typo(step.line)}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Deux réponses de la foire aux questions du site, celles qu'on pose avant de signer. */}
      <dl className="mt-[20px] grid grid-cols-2 gap-[14px]">
        {PRICING_QUESTIONS.map((question) => {
          const answer = faq(question);
          return answer ? (
            <div key={question} className="rounded-[14px] bg-surface-app px-[16px] py-[12px]">
              <dt className="text-[12.5px] font-semibold text-text-primary">{typo(question)}</dt>
              <dd className="mt-[3px] text-[11.5px] leading-[1.5] text-text-secondary">{typo(answer)}</dd>
            </div>
          ) : null;
        })}
      </dl>

      <div className="mt-auto overflow-hidden rounded-[20px] bg-[linear-gradient(160deg,#0F3F54,#082638)] text-white">
        <div className="grid grid-cols-[1fr_auto] items-center gap-[24px] px-[24px] py-[20px]">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-brand-300 uppercase">Votre contact</p>
            {person ? (
              <>
                <p className="mt-[6px] text-[22px] leading-[1.15] font-bold tracking-[-0.02em]">{person.name}</p>
                <p className="mt-[2px] text-[12px] text-brand-100">Votre contact PharmaBoost</p>
                <ul className="mt-[12px] space-y-[6px] text-[13px]">
                  {person.phone && (
                    <li className="flex items-center gap-[9px]">
                      <Phone className="size-[14px] text-brand-300" aria-hidden="true" /> <span className="font-semibold">{person.phone}</span>
                    </li>
                  )}
                  <li className="flex items-center gap-[9px]">
                    <Mail className="size-[14px] text-brand-300" aria-hidden="true" /> <span className="font-semibold">{person.email}</span>
                  </li>
                </ul>
              </>
            ) : (
              <>
                <p className="mt-[6px] text-[22px] leading-[1.15] font-bold tracking-[-0.02em]">PharmaBoost</p>
                <ul className="mt-[12px] space-y-[6px] text-[13px]">
                  <li className="flex items-center gap-[9px]">
                    <Mail className="size-[14px] text-brand-300" aria-hidden="true" /> <span className="font-semibold">{PLAQUETTE_PUBLIC_EMAIL}</span>
                  </li>
                  <li className="flex items-center gap-[9px]">
                    <Globe className="size-[14px] text-brand-300" aria-hidden="true" /> <span className="font-semibold">{PLAQUETTE_SITE}</span>
                  </li>
                </ul>
              </>
            )}
          </div>
          <div className="rounded-[14px] bg-white/8 px-[18px] py-[14px] text-right">
            <p className="text-[20px] leading-[1.15] font-bold tracking-[-0.02em]">Voyez-le sur votre comptoir.</p>
            <p className="mt-[6px] text-[12px] text-brand-100">Réserver une démo · {PLAQUETTE_SITE}/decouvrir/demo</p>
            {person && <p className="mt-[2px] text-[12px] text-brand-100">{typo(`${PLAQUETTE_PUBLIC_EMAIL} · ${PLAQUETTE_SITE}`)}</p>}
          </div>
        </div>
        <p className="border-t border-white/12 px-[24px] py-[9px] text-[10px] text-brand-200">
          {typo(`PharmaBoost · Outil d'aide au conseil officinal : il ne diagnostique pas et ne prescrit pas. Tarifs hors taxes.`)}
        </p>
      </div>
    </>
  );
}
