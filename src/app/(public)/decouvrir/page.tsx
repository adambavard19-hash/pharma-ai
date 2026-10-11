import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Thermometer, TriangleAlert } from "lucide-react";
import { fr, KeyCell, Kicker, SectionHead } from "./_components/site-shell";
import { HeroVisual, QuestionVisual, RequestVisual, StockMarginVisual, TeamVisual, ExampleTag } from "./_components/visuals";
import { BannerPillsInline } from "./_components/banner-mock";
import { VideoButton } from "./_components/video-dialog";
import { BannerDemo } from "./_components/banner-demo";
import { loadLiveProof } from "@/server/services/site-leads";
import { loadPublicPricing } from "@/server/services/public-pricing";
import { formatEuros } from "@/core/billing/subscription";
import { PricingSection } from "./_components/pricing-section";
import { cn } from "@/lib/utils";

/**
 * Le site public. Peu de texte : des mots-clés, les vrais écrans, de l’air.
 * Tout ce qui est affirmé ici existe dans l'application ; les montants des
 * visuels sont ceux du catalogue de démonstration et sont marqués « exemple ».
 * Les ventes au comptoir sont DÉCLARÉES (Vendu / Non vendu) : jamais présentées
 * comme lues dans le logiciel de gestion.
 */

/**
 * Des cas réels du moteur, chacun adossé à une règle ou à une mise en garde : protection solaire sous doxycycline, ferments
 * lactiques sous amoxicilline, routine peau sous isotrétinoïne (« Conseil peau »), poche chaud/froid après l'arbre de questions,
 * paracétamol des remèdes contre le rhume (RCP Fervex), antiparasitaires pour chien (ANSES).
 */
const EXAMPLES: { scan: string; context?: string; shows: string; note?: string; warning?: boolean; why: string }[] = [
  { scan: "DOXYCYCLINE", shows: "Protection solaire SPF 50+", why: "Ce traitement rend la peau plus sensible au soleil." },
  { scan: "AMOXICILLINE", shows: "Probiotique", note: "À distance de l'antibiotique", why: "L'antibiotique peut perturber la flore intestinale." },
  { scan: "ISOTRÉTINOÏNE", shows: "Routine : nettoyer, hydrater, protéger", note: "À éviter : gommages et peelings", why: "Ce traitement assèche et fragilise la peau." },
  { scan: "PARACÉTAMOL", context: "Le patient a mal au dos", shows: "Poche chaud/froid pour le dos", note: "Après « Où a-t-il mal ? »", why: "Le froid ou le chaud local complète le traitement." },
  { scan: "FERVEX", shows: "3 g de paracétamol par jour au maximum", warning: true, why: "Chaque sachet contient déjà du paracétamol." },
  { scan: "ANTIPARASITAIRE CHIEN", shows: "Danger pour le chat", warning: true, why: "Selon l'ANSES, la perméthrine des antiparasitaires pour chien est toxique pour le chat." },
];

const STOCK_POINTS: { label: string; value: string; hint?: string }[] = [
  // La quantité vient du dernier envoi du stock : « stock exact » laissait croire à une lecture en direct.
  { label: "Stock", value: "Uniquement des produits en rayon, avec la quantité en stock sous chaque conseil" },
  // Dans l'ordre du départage (src/core/ai/engines/tiebreak.ts) : les laboratoires préférés, puis la date courte, puis le
  // challenge. Les dates courtes venaient d'abord à l'écran, et « la date courte d'abord » contredisait la ligne d'en dessous.
  {
    label: "Laboratoires",
    value: "Vos laboratoires préférés passent en premier",
    hint: "Dites simplement à PharmaBoost quels laboratoires vous préférez : quand deux produits répondent aussi bien au besoin, c'est le vôtre qui est proposé en premier. Le conseil reste choisi pour le patient, jamais pour le laboratoire.",
  },
  {
    label: "Dates courtes et challenges",
    value: "À conseil égal, après vos laboratoires préférés : la date courte, puis le challenge en cours",
    hint: "Vous les saisissez ; ils ne passent jamais devant le produit le plus adapté au patient.",
  },
  { label: "Associations", value: "Vos associations : ce produit vendu, celui-ci proposé — même sans ordonnance" },
  { label: "Marge", value: "Affichée sur l'écran de vente, quand le prix d'achat est connu" },
];

const TEAM_POINTS: { label: string; value: string }[] = [
  { label: "Comptoirs", value: "Chaque comptoir est attribué à un collaborateur" },
  { label: "Classement", value: "Proposés, validés, taux — par jour, semaine, mois" },
  { label: "Challenges", value: "La progression de chacun, challenge par challenge" },
  { label: "Bilan mensuel", value: "Chaque mois, par e-mail, ce qui s'est passé au comptoir" },
  // Deux chemins : l'invitation par e-mail (aucune approbation), ou « Rejoindre mon officine » (le titulaire approuve).
  { label: "Équipe", value: "Invitée par e-mail, ou demande à rejoindre : vous approuvez" },
];

/**
 * Une ligne « libellé · valeur » des sections Stock et Équipe. Sous 360 px, la colonne de la valeur ne gardait que 110 px
 * (deux mots par ligne) : le libellé passe au-dessus. À 360 px et au-delà, rien ne change.
 */
const POINT_ROW = "grid grid-cols-[8.5rem_1fr] items-baseline gap-4 py-4 max-[359px]:grid-cols-1 max-[359px]:gap-1.5";

const SAFETY = [
  { label: "Mises en garde", value: "Ce qu'il ne faut pas ajouter au traitement est signalé" },
  { label: "Posologie", value: "Les doses qui s'additionnent sont rappelées (3 g de paracétamol par jour au maximum)" },
  { label: "Vigilances", value: "Le complément qui ne va pas avec le traitement n'est pas proposé" },
  // Pas « relues » : toutes les règles attendent encore la relecture du pharmacien signataire (PENDING).
  { label: "Sources", value: "Règles écrites à partir de documents de pharmaciens et des sources officielles (RCP, HAS, ANSES)" },
  { label: "Décision", value: "Le pharmacien garde la validation finale" },
  { label: "Données", value: "Aucune fiche patient. L'e-mail du bilan est effacé après l'envoi." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Compatible avec mon logiciel ?", a: "PharmaBoost fonctionne à côté de votre logiciel de gestion, sans le modifier. Premier déploiement : LGPI ; les autres logiciels s'installent avec nous." },
  // Ni durée ni « sans alerte » : l'installateur n'est pas encore signé, et la mise à jour seule n'a pas encore été vue sur un vrai poste.
  { q: "Comment s'installe PharmaBoost ?", a: "Un fichier à télécharger par poste de comptoir, un double-clic. Les mises à jour arrivent ensuite automatiquement, jamais pendant une vente. La mise en service est faite avec vous." },
  { q: "Qui décide du conseil ?", a: "Le pharmacien. Au comptoir, il note Vendu ou Non vendu ; sur l'écran de vente, il propose, remplace ou ignore." },
  { q: "Une IA choisit-elle les produits ?", a: "Non. Les produits viennent de règles écrites à partir de documents de pharmaciens et des sources officielles (RCP, HAS, ANSES), et de votre stock. L'IA aide à lire l'ordonnance et à reconnaître les produits de votre stock." },
  { q: "Faut-il paramétrer les conseils ?", a: "Non. La bibliothèque de conseils est commune : une correction faite une fois vaut pour toutes les pharmacies. Vous gardez vos associations et vos laboratoires préférés." },
  { q: "Quelles données sont conservées ?", a: "Aucune fiche patient. Le plan conseil est chiffré et remis au patient ; l'adresse e-mail donnée pour le bilan est effacée après l'envoi." },
  { q: "Est-ce un dispositif médical ?", a: "Non. C'est un outil d'aide au conseil : il ne diagnostique pas et ne prescrit pas." },
  { q: "Quel engagement ?", a: "Un seul abonnement, avec un engagement de 12 mois. La mise en service, installation, paramétrage et formation de l'équipe comprises, est facturée une seule fois." },
];

/**
 * L'adresse de référence de l'accueil. Posée ici et non dans le layout : le layout la transmettrait à chaque page du site,
 * qui se déclarerait alors copie de l'accueil. Titre, description et image de partage viennent du layout.
 */
export const metadata: Metadata = { alternates: { canonical: "/decouvrir" } };

export default async function SitePage() {
  const [pricing, live] = await Promise.all([loadPublicPricing(), loadLiveProof()]);

  return (
    <>
      {/* ---- Accueil ------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--color-border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border-subtle)_1px,transparent_1px)] [mask-image:radial-gradient(70%_70%_at_30%_30%,black,transparent_75%)] bg-[size:64px_64px] opacity-70"
          aria-hidden="true"
        />
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-5 pt-14 pb-16 md:pt-24 md:pb-24 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion
            </p>
            <h1 className="mt-7 text-[56px] leading-[0.98] font-bold tracking-[-0.04em] text-text-primary md:text-[80px]">
              Scan.
              <br />
              Conseil.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Bilan.</span>
            </h1>
            <p className="mt-7 max-w-xl text-[17px] leading-7 text-text-secondary">
              Au comptoir, vous scannez les boîtes comme d&apos;habitude. La bannière PharmaBoost vous montre, dans la foulée du scan, ce qu&apos;il est utile de conseiller en plus, pris dans votre rayon. Et le patient repart avec ses conseils.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Réserver une démo <ArrowRight className="size-4" />
              </Link>
              <VideoButton />
            </div>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* ---- La bannière du comptoir, vivante -------------------------- */}
      <section id="banniere" className="scroll-mt-20 border-t border-border-subtle">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Au comptoir" title="Une petite bannière, à côté de votre logiciel.">
            Elle attend votre prochain scan, pose la bonne question quand il le faut, rappelle les mises en garde — comme 3 g de paracétamol par jour au maximum — et reste là jusqu&apos;à la fin de la vente. Elle ne prend jamais la main sur votre logiciel de gestion.
          </SectionHead>
          <div className="mt-10">
            <BannerDemo />
          </div>
          {/* Pas « fidèle » : la bannière n'a pas encore été vue dessinée sur un poste Windows. */}
          <p className="mt-4 text-center text-[13px] text-text-tertiary">Animation de la bannière du poste de caisse, reproduite pour le site. Médicaments, produits et prix : exemples.</p>
        </div>
      </section>

      {/* ---- La bonne question --------------------------------------- */}
      <section id="questions" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <SectionHead kicker="Une question, puis le conseil" title="Le bon conseil commence par la bonne question.">
              Un paracétamol ne dit pas pourquoi le patient le prend. PharmaBoost vous fait poser la question : fièvre, mal de tête, douleur ? Où a-t-il mal ? Le produit vient ensuite : la poche chaud/froid pour le dos, pas un produit au hasard.
            </SectionHead>
            <ul className="mt-8 flex flex-wrap gap-2">
              {["Pourquoi ?", "Où ?", "Puis le produit"].map((t) => (
                <li key={t} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-app px-4 py-2 text-[14px] font-medium text-text-primary">
                  <Check className="size-4 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-center gap-2.5 text-[15px] text-text-secondary">
              <Thermometer className="size-4 shrink-0 text-brand-600" aria-hidden="true" /> Fièvre ? Un thermomètre, s&apos;il n&apos;en a pas à la maison.
            </p>
          </div>
          <div>
            <QuestionVisual />
            <p className="mt-3 text-center text-[12.5px] text-text-tertiary">
              La bannière, telle qu&apos;elle pose la question · <ExampleTag className="text-[10.5px]" />
            </p>
          </div>
        </div>
      </section>

      {/* ---- Le conseil qui va avec le traitement --------------------- */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead kicker="Exemples" title="Le conseil qui va avec le traitement.">
              Le médecin prescrit. PharmaBoost vous rappelle ce qui accompagne le traitement, et ce qu&apos;il ne faut pas y ajouter.
            </SectionHead>
            <Link href="/decouvrir/pourquoi" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-700 hover:text-brand-800">
              Pourquoi PharmaBoost <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-10 overflow-hidden rounded-3xl border border-border-subtle bg-surface-card">
            <div className="hidden grid-cols-[0.85fr_1.15fr_1.2fr] gap-6 border-b border-border-subtle px-6 py-3 md:grid">
              {["Au scan", "PharmaBoost vous montre", "Pourquoi"].map((h) => (
                <span key={h} className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{h}</span>
              ))}
            </div>
            <ul className="divide-y divide-border-subtle">
              {EXAMPLES.map((e) => (
                <li key={e.scan} className="grid gap-1.5 px-6 py-5 md:grid-cols-[0.85fr_1.15fr_1.2fr] md:items-baseline md:gap-6">
                  <p className="font-mono text-[13px] tracking-[0.02em] text-text-secondary">
                    {e.scan}
                    {e.context && <span className="mt-0.5 block font-sans text-[13.5px] tracking-normal text-text-tertiary">{fr(e.context)}</span>}
                  </p>
                  <div>
                    <p className={cn("flex items-baseline gap-2 text-[16px] leading-snug font-semibold", e.warning ? "text-warning-800" : "text-text-primary")}>
                      {e.warning ? <TriangleAlert className="size-4 shrink-0 translate-y-0.5 text-warning-600" aria-hidden="true" /> : <span className="text-brand-600" aria-hidden="true">+</span>}
                      {e.warning && <span className="sr-only">Mise en garde :</span>}
                      <span>{fr(e.shows)}</span>
                    </p>
                    {e.note && <p className="mt-0.5 pl-5 text-[13.5px] text-text-tertiary">{fr(e.note)}</p>}
                  </div>
                  <p className="text-[14.5px] leading-6 text-text-secondary">{fr(e.why)}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-border-subtle px-6 py-3.5 text-[13px] text-text-tertiary">Au comptoir, vous notez Vendu ou Non vendu. Le conseil reste votre décision.</p>
          </div>
        </div>
      </section>

      {/* ---- Stock et marge ----------------------------------------- */}
      <section id="stock-marge" className="scroll-mt-20">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Le texte est bien plus haut que le visuel : centré, le visuel flottait au milieu d'un grand vide. Il accompagne
              désormais la lecture (collant) ; sur téléphone, il vient après le titre de la section, comme partout ailleurs. */}
          <div className="order-last lg:order-none">
            <div className="lg:sticky lg:top-28">
              <StockMarginVisual />
              {/* Ce que la bannière montre du même produit, au comptoir : les pastilles, dans leur ordre. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border-subtle bg-surface-card px-5 py-3.5">
                <span className="text-[13px] text-text-secondary">Au comptoir, sur la bannière :</span>
                <BannerPillsInline item={{ challenge: true, shortDate: "30/11/26", stock: "IN_STOCK", quantity: 29 }} />
              </div>
            </div>
          </div>
          <div>
            <SectionHead kicker="Stock et marge" title="Votre rayon. Votre marge. Sous les yeux." />
            <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
              {STOCK_POINTS.map((p) => (
                <div key={p.label} className={POINT_ROW}>
                  <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{p.label}</dt>
                  <dd>
                    <span className="block text-[16px] font-semibold text-text-primary">{fr(p.value)}</span>
                    {p.hint && <span className="mt-1.5 block text-[14px] leading-6 font-normal text-text-secondary">{fr(p.hint)}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {live && (
              <div className="mt-8 grid grid-cols-3 gap-4">
                <Figure label="Officines" value={String(live.pharmacies)} />
                <Figure label="Conseils acceptés" value={live.acceptedAdvices.toLocaleString("fr-FR")} />
                <Figure label="Ventes additionnelles" value={formatEuros(live.attributedCents)} />
              </div>
            )}
            <VideoButton film="avantages" label="Voir les avantages" className="mt-8" />
          </div>
        </div>
      </section>

      {/* ---- Votre équipe ------------------------------------------- */}
      <section id="equipe" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <SectionHead kicker="Votre équipe" title="Un comptoir, une personne. Les résultats de chacun." />
            <dl className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
              {TEAM_POINTS.map((p) => (
                <div key={p.label} className={POINT_ROW}>
                  <dt className="font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">{p.label}</dt>
                  <dd className="text-[16px] font-semibold text-text-primary">{fr(p.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-[13.5px] leading-6 text-text-tertiary">Au comptoir, les ventes sont déclarées : Vendu ou Non vendu, en un clic sur la bannière.</p>
          </div>
          <TeamVisual />
        </div>
      </section>

      {/* ---- Sans ordonnance ----------------------------------------- */}
      <section className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 py-20 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <SectionHead kicker="Sans ordonnance" title="Le client décrit. Vous conseillez." />
          <ul className="mt-8 flex flex-wrap gap-2">
            {["Besoin reconnu", "Questions à poser", "Produits en rayon", "Orientation médecin si nécessaire"].map((t) => (
              <li key={t} className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-[14px] font-medium text-text-primary">
                <Check className="size-4 text-brand-600" /> {t}
              </li>
            ))}
          </ul>
          <VideoButton film="sansOrdonnance" label="Voir en vidéo" className="mt-8" />
        </div>
        <RequestVisual />
      </section>

      {/* ---- Sécurité ------------------------------------------------- */}
      <section id="securite" className="scroll-mt-20 border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Sécurité" title="La sécurité avant la suggestion." />
          <dl className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY.map((s) => (
              <KeyCell key={s.label} label={s.label} value={s.value} className="bg-surface-app" />
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Tarif : deux formules, une source (console ou offre officielle) ---- */}
      <PricingSection pricing={pricing} />

      {/* ---- Questions ------------------------------------------------ */}
      <section className="border-y border-border-subtle bg-surface-card">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <SectionHead kicker="Questions" title="L'essentiel, en bref." />
          <dl className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-[17px] font-semibold text-text-primary">{fr(item.q)}</dt>
                <dd className="mt-2 text-[15px] leading-6 text-text-secondary">{fr(item.a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- Appel final ---------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="relative overflow-hidden rounded-[32px] border border-border-subtle bg-surface-card px-7 py-14 text-center sm:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,var(--color-brand-100),transparent_70%)] opacity-70" aria-hidden="true" />
          <div className="relative">
            <Kicker className="justify-center">PharmaBoost</Kicker>
            <h2 className="mx-auto mt-4 max-w-2xl text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[48px]">Voyez-le sur votre comptoir.</h2>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700">
                Réserver une démo <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary tabular">{value}</p>
      <p className="mt-1 font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">{label}</p>
    </div>
  );
}
