import Link from "next/link";
import { ArrowRight, Barcode, Check, FileText } from "lucide-react";
import { Feature, Section } from "./_components/site-shell";
import { PilotMock, RequestMock, SafetyMock, ToastMock } from "./_components/mockups";
import { loadLiveProof, loadPublicOffer } from "@/server/services/site-leads";
import { ProofSection } from "./_components/proof";
import { formatEuros } from "@/core/billing/subscription";
import { RoiCalculator } from "./_components/roi-calculator";

/** L'offre affichée quand la console n'en a pas encore publié : à régler dans Admin → Offres. */
const FALLBACK_OFFER = { name: "PharmaBoost Officine", description: "Tous les postes de comptoir de l'officine, toutes les fonctions, les mises à jour comprises.", monthlyPriceCents: 6900, trialDays: 30 };

const FAQ: { q: string; a: string }[] = [
  { q: "PharmaBoost est-il compatible avec mon logiciel de gestion ?", a: "PharmaBoost tourne à côté de votre logiciel, sans le modifier ni l'interroger. Il écoute la douchette du poste et lit l'export de stock que votre logiciel sait déjà produire. Il a été installé en premier sur LGPI ; chaque logiciel a sa recette d'installation, que nous faisons avec vous." },
  { q: "Faut-il scanner l'ordonnance deux fois ?", a: "Non. Les boîtes bipées dans votre logiciel ouvrent la vente dans PharmaBoost à l'instant. Pour une ordonnance manuscrite ou complexe, une photo suffit : elle est lue ligne par ligne et relue par un professionnel avant toute analyse." },
  { q: "Qui décide du conseil donné au patient ?", a: "Le pharmacien ou le préparateur, toujours. Chaque proposition est acceptée, modifiée ou retirée par un professionnel identifié. Rien n'atteint le patient sans cette décision, et chaque décision est tracée." },
  { q: "Que fait PharmaBoost avant de proposer un produit ?", a: "Il vérifie. Interactions documentées, contre-indications selon l'âge, la grossesse ou le terrain, vigilances écrites par un pharmacien, statut réglementaire du médicament. Un produit écarté par la sécurité ne revient jamais, quelle que soit sa marge." },
  { q: "Les recommandations sont-elles rédigées par une IA ?", a: "Non. Les règles de conseil, les phrases de comptoir et les vigilances sont écrites et versionnées, relues par des pharmaciens. L'intelligence artificielle sert à lire l'ordonnance et à comprendre le contexte ; elle ne nomme jamais un produit ni ne rédige un conseil." },
  { q: "Combien de temps prend l'installation ?", a: "Une commande sur chaque poste de comptoir, avec un code donné par PharmaBoost. Quelques minutes par poste, sans toucher au serveur de l'officine. L'équipe travaille dès le premier bip." },
  { q: "Où sont les données, et qui les voit ?", a: "Chiffrées, isolées par officine, journalisées à chaque accès. Aucune donnée n'est revendue ni partagée, et le patient voit sa pharmacie, pas un logiciel. Les détails, hébergeurs compris, sont dans notre page Confidentialité." },
  { q: "Est-ce un dispositif médical ?", a: "Non. PharmaBoost est un outil d'aide au conseil officinal. Il ne diagnostique pas, ne prescrit pas et ne se substitue pas à l'avis du pharmacien." },
  { q: "Puis-je arrêter quand je veux ?", a: "Oui. L'abonnement est mensuel, sans engagement, résiliable à tout moment par simple e-mail. Le premier mois est offert ; le règlement se fait ensuite par prélèvement bancaire, mis en place avec le contrat." },
];

export default async function SitePage() {
  const [offerRow, live] = await Promise.all([loadPublicOffer(), loadLiveProof()]);
  const offer = offerRow ?? FALLBACK_OFFER;
  const trial = offer.trialDays >= 28 ? "Premier mois offert" : offer.trialDays > 0 ? `${offer.trialDays} jours offerts` : null;

  return (
    <>
      {/* ---- Hero ---------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_20%_0%,var(--color-brand-100),transparent_70%),radial-gradient(40%_40%_at_90%_20%,var(--color-accent-100),transparent_70%)] dark:bg-[radial-gradient(60%_50%_at_20%_0%,var(--color-brand-950),transparent_70%)]" aria-hidden="true" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 py-1 text-[12.5px] text-text-secondary">
              <Barcode className="size-3.5 text-brand-600 dark:text-brand-400" /> Avec votre logiciel actuel, sans rien changer
            </p>
            <h1 className="mt-5 text-[40px] leading-[1.08] font-semibold tracking-[-0.025em] text-text-primary text-balance md:text-[52px]">
              Le bon conseil à chaque ordonnance. Le bon plan pour chaque patient.
            </h1>
            <p className="mt-5 text-[17px] leading-7 text-text-secondary">
              Au bip de la douchette, PharmaBoost regarde l&apos;ordonnance et votre rayon, et souffle au pharmacien le conseil juste. Le patient repart avec son plan de prise. Vous voyez ce que ça rapporte.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                Voir en 20 minutes <ArrowRight className="size-4" />
              </Link>
              <Link href="/decouvrir/pourquoi" className="inline-flex h-12 items-center rounded-xl border border-border-default px-6 text-[15px] font-medium text-text-primary hover:bg-surface-sunken">
                Pourquoi PharmaBoost
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <HeroSide
              title="Au comptoir"
              items={[["Lit l'ordonnance", "manuscrite comprise"], ["Vérifie d'abord", "interactions, réglementation"], ["Propose dans votre rayon", "prix et marge visibles"], ["Compte ce que ça rapporte", "à l'euro près"]]}
            />
            <HeroSide
              title="À la maison"
              items={[["Le plan de prise", "matin, midi, soir"], ["Les rappels", "dans l'agenda du téléphone"], ["Le dernier jour", "un signe de la pharmacie"], ["Aucune donnée conservée", "sur le patient"]]}
              accent
            />
          </div>
        </div>
      </section>

      <ProofSection live={live} />

      {/* ---- Au bip -------------------------------------------------- */}
      <Section
        id="bip"
        eyebrow="Au bip · l'avis en coin d'écran"
        title="La boîte passe à la douchette, l'avis apparaît. Rien d'autre à faire."
        lede="La douchette de votre logiciel suffit. L'avis s'affiche par-dessus, et s'efface seul."
        tone="sunken"
      >
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <ul className="space-y-5">
            <Feature title="Trois conseils au plus" body="Produit, prix, marge, et la phrase à dire." />
            <Feature title="Les alertes d'abord" body="Interaction, contre-indication, ordonnance d'exception." />
            <Feature title="Discret" body="Quinze secondes, puis il disparaît. Un clic pour le détail." />
            <Feature title="Un client, une vente" body="Les boîtes se regroupent. « Nouveau patient » remet à zéro." />
          </ul>
          <ToastMock className="mx-auto w-full max-w-lg pb-6" />
        </div>
      </Section>

      {/* ---- Sans ordonnance ---------------------------------------- */}
      <Section
        id="sans-ordonnance"
        eyebrow="Demande sans ordonnance"
        title="« J'ai le nez bouché depuis hier. »"
        lede="Le client décrit. PharmaBoost reconnaît le besoin, pose les bonnes questions, propose dans le rayon."
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <RequestMock />
          <ul className="space-y-5">
            <Feature title="Jamais un produit inventé" body="Le besoin vient d'une liste écrite, le produit de votre rayon." />
            <Feature title="Les questions d'abord" body="Âge, grossesse, fièvre, traitements en cours." />
            <Feature title="Orienter quand il faut" body="Sang, gêne respiratoire, nourrisson : le médecin d'abord." />
            <Feature title="La même sécurité" body="Les mêmes contrôles qu'une ordonnance." />
          </ul>
        </div>
      </Section>

      {/* ---- Sécurité ----------------------------------------------- */}
      <Section
        id="securite"
        eyebrow="Sécurité et réglementation"
        title="Il vérifie avant de conseiller."
        lede="Sécurité, puis traitement, puis rayon. La marge vient en dernier, toujours."
        tone="sunken"
      >
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <ul className="space-y-5">
            <Feature title="L'ordonnance lue en entier" body="Manuscrite comprise, ligne par ligne, confirmée par un professionnel." />
            <Feature title="Interactions et terrain" body="Âge, grossesse, rein, allergies. Ce qui n'est pas couvert est dit." />
            <Feature title="Cent règles de vigilance" body="Écrites par un pharmacien, famille par famille." />
            <Feature title="Ordonnance d'exception, stupéfiants" body="Le statut de chaque boîte, lu sur les bases officielles. Fini le rejet." />
          </ul>
          <SafetyMock />
        </div>
      </Section>

      {/* ---- Pilotage ----------------------------------------------- */}
      <Section
        id="pilotage"
        eyebrow="Pilotage · titulaire"
        title="Vos règles. Vos laboratoires. Votre marge."
        lede="Et le chiffre d'affaires additionnel, lu dans vos ventes."
      >
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <PilotMock />
          <ul className="space-y-5">
            <Feature title="La marge sur chaque conseil" body="Et en total sur le mois." />
            <Feature title="Vos règles" body="Laboratoires préférés, gammes, exclusions. La sécurité, elle, ne se désactive pas." />
            <Feature title="Stock à jour" body="Les ventes au bip, l'inventaire à chaque export." />
            <Feature title="Par collaborateur" body="Qui a proposé quoi, et ce qui a été vendu." />
          </ul>
        </div>
      </Section>

      {/* ---- Pourquoi ----------------------------------------------- */}
      <Section id="pourquoi" eyebrow="Ce que l'officine y gagne" title="Au comptoir, et dans les comptes." tone="sunken">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { t: "Un conseil plus régulier", d: "Au moment utile, sans y penser." },
            { t: "Une équipe qui progresse", d: "Chaque proposition dit pourquoi." },
            { t: "Un patient mieux accompagné", d: "Le conseil sert d'abord à ça." },
            { t: "Les mêmes règles pour tous", d: "Et la liberté de chacun." },
            { t: "La sécurité ne se discute pas", d: "La marge n'a pas voix au chapitre." },
            { t: "Le rythme préservé", d: "Pas de second scan, pas de formation." },
          ].map((item) => (
            <div key={item.t} className="rounded-2xl border border-border-subtle bg-surface-app p-6">
              <p className="text-[15.5px] font-semibold text-text-primary">{item.t}</p>
              <p className="mt-2 text-[14px] leading-6 text-text-secondary">{item.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Tarifs ------------------------------------------------- */}
      <Section id="tarifs" eyebrow="Tarifs" title="Un abonnement simple, sans engagement." lede="Tous les postes, toutes les fonctions, les mises à jour comprises.">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div className="rounded-3xl border border-brand-200 bg-surface-card p-8 shadow-[0_24px_60px_-32px_rgba(15,118,110,0.45)] dark:border-brand-800">
            <p className="text-[13px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">{offer.name}</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-[48px] leading-none font-semibold tracking-[-0.03em] text-text-primary tabular">{formatEuros(offer.monthlyPriceCents)}</span>
              <span className="text-[15px] text-text-secondary">HT / mois</span>
            </p>
            {trial && <p className="mt-2 text-[14px] font-medium text-success-700 dark:text-success-400">{trial}, sans engagement</p>}
            <p className="mt-4 text-[14px] leading-6 text-text-secondary">{offer.description}</p>
            <ul className="mt-6 space-y-2.5 text-[14px] text-text-primary">
              {["L'avis au bip sur chaque poste de comptoir", "Lecture d'ordonnance, photo ou scan", "Sécurité, vigilances et réglementation", "Demande sans ordonnance", "Stock relié, parapharmacie comprise", "Patients, plans de prise, suivis", "Pilotage et traçabilité", "Mises à jour automatiques"].map((item) => (
                <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" /> {item}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/decouvrir/abonnement" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700">
                S&apos;abonner <ArrowRight className="size-4" />
              </Link>
              <Link href="/decouvrir/demo" className="inline-flex h-12 items-center rounded-xl border border-border-default px-6 text-[15px] font-medium text-text-primary hover:bg-surface-sunken">
                Voir le produit d&apos;abord
              </Link>
            </div>
            <p className="mt-4 text-[12.5px] text-text-tertiary">Règlement par prélèvement bancaire mensuel, mis en place avec le contrat. Résiliation à tout moment, par simple e-mail.</p>
          </div>
          <div className="space-y-6 lg:pt-4">
            <div className="rounded-2xl border border-border-subtle bg-surface-card p-6">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary"><FileText className="size-4 text-brand-600 dark:text-brand-400" /> Comment ça se passe</p>
              <ol className="mt-3 space-y-2 text-[14px] leading-6 text-text-secondary">
                <li><strong className="text-text-primary">1.</strong> Vous demandez votre lien d&apos;activation. Nous préparons votre espace sous un jour ouvré.</li>
                <li><strong className="text-text-primary">2.</strong> Vous signez le contrat en ligne et le mandat de prélèvement : {trial ? `${trial.toLowerCase()}, ` : ""}rien n&apos;est prélevé pendant l&apos;essai.</li>
                <li><strong className="text-text-primary">3.</strong> Une commande sur chaque poste de comptoir, avec le code de votre espace. L&apos;équipe travaille dès le premier bip.</li>
              </ol>
            </div>
            <RoiCalculator monthlyPriceCents={offer.monthlyPriceCents} />
            <div className="rounded-2xl border border-border-subtle bg-surface-card p-6">
              <p className="text-[15px] font-semibold text-text-primary">Plusieurs officines ?</p>
              <p className="mt-2 text-[14px] leading-6 text-text-secondary">Un groupement ou plusieurs points de vente partagent un espace, avec un stock et un pilotage par officine. Parlons-en en démonstration.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---- FAQ ---------------------------------------------------- */}
      <Section id="faq" eyebrow="Questions fréquentes" title="Ce que les titulaires demandent avant d'installer." tone="sunken">
        <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-border-subtle bg-surface-app px-5 py-4 open:bg-surface-app">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-text-primary marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-text-tertiary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </span>
              </summary>
              <p className="mt-3 text-[14px] leading-6 text-text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ---- CTA final ---------------------------------------------- */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="relative overflow-hidden rounded-3xl bg-brand-800 px-8 py-14 text-white md:px-14">
            <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "radial-gradient(circle at 18% 22%, white 0, transparent 42%), radial-gradient(circle at 82% 78%, white 0, transparent 38%)" }} aria-hidden="true" />
            <div className="relative max-w-2xl">
              <h2 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance md:text-[38px]">Activez le conseil vérifié dans votre officine.</h2>
              <p className="mt-4 text-[16px] leading-7 text-brand-100">Vingt minutes de démonstration sur votre poste, ou l&apos;abonnement tout de suite avec le premier mois offert. Dans les deux cas, l&apos;équipe garde ses habitudes et le pharmacien garde la main.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/decouvrir/demo" className="inline-flex h-12 items-center rounded-xl bg-white px-6 text-[15px] font-semibold text-brand-800 hover:bg-brand-50">Réserver une démo</Link>
                <Link href="/decouvrir/abonnement" className="inline-flex h-12 items-center rounded-xl border border-white/30 px-6 text-[15px] font-medium text-white hover:bg-white/10">S&apos;abonner</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function HeroSide({ title, items, accent = false }: { title: string; items: [string, string][]; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-2xl bg-brand-800 p-5 text-white" : "rounded-2xl border border-border-subtle bg-surface-card p-5"}>
      <p className={accent ? "text-[12px] font-semibold tracking-[0.08em] text-brand-200 uppercase" : "text-[12px] font-semibold tracking-[0.08em] text-text-tertiary uppercase"}>{title}</p>
      <ul className="mt-3 space-y-2.5">
        {items.map(([t, d]) => (
          <li key={t} className="flex items-start gap-2.5">
            <Check className={accent ? "mt-0.5 size-4 shrink-0 text-accent-300" : "mt-0.5 size-4 shrink-0 text-success-600"} />
            <span className="text-[14px] leading-5"><span className={accent ? "font-semibold text-white" : "font-semibold text-text-primary"}>{t}</span> <span className={accent ? "text-brand-100" : "text-text-secondary"}>· {d}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
