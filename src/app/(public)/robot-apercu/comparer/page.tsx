import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { SectionHead } from "../../decouvrir/_components/site-shell";
import { ChoiceVisual, FlowSteps } from "../../decouvrir/_components/story";
import { CureReminderVisual, ExampleTag, HeroVisual, RequestVisual, TeamVisual } from "../../decouvrir/_components/visuals";
import { VideoButton } from "../../decouvrir/_components/video-dialog";
import { PricingSection } from "../../decouvrir/_components/pricing-section";
import { FAQ } from "../../decouvrir/_components/site-content";
import { resolvePublicPricing } from "@/core/pricing/official-offer";

export const metadata: Metadata = { title: "Accueil : avant / après", robots: { index: false, follow: false } };

const GRAD = "bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text font-semibold text-transparent";
const BTN = "inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold";

function Compare({ n, title, changes, img, children }: { n: string; title: string; changes: string[]; img: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[#D9E2DF] bg-white">
      <div className="border-b border-[#D9E2DF] bg-[#F3F7F5] px-6 py-4">
        <p className="text-[18px] font-bold text-[#0F2F2A]">{n} · {title}</p>
        <ul className="mt-1 list-disc pl-5 text-[13.5px] text-[#4B6A62]">
          {changes.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
      <div>
        <div className="border-b border-[#D9E2DF] p-5">
          <p className="mb-3 inline-flex rounded-full bg-[#E4EBE8] px-3 py-1 text-[12px] font-bold text-[#3F5E57]">AUJOURD&apos;HUI</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- capture locale de développement */}
          <img src={`/apercu-sections/${img}.png`} alt="" className="mx-auto w-full max-w-[1200px] rounded-2xl border border-[#E4EBE8]" />
        </div>
        <div className="p-5">
          <p className="mb-3 inline-flex rounded-full bg-[#1F7A6C] px-3 py-1 text-[12px] font-bold text-white">NOUVELLE VERSION</p>
          <div className="mx-auto max-w-[1200px] rounded-2xl border border-[#E4EBE8] bg-surface-app p-8">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** L'accueil, partie par partie : la capture d'aujourd'hui et la nouvelle version, vivante (fondateur, 21 oct. 2026). Développement seulement. */
export default function ComparePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const pricing = resolvePublicPricing(null);
  const faq = FAQ.map((item) => (item.q === "Quel engagement ?" ? { ...item, a: "Un seul abonnement, avec un engagement de 12 mois. La mise en service, l'installation sur tous vos postes, est facturée une seule fois." } : item));
  return (
    <main className="site-public min-h-screen bg-white px-4 py-8">
      <style>{`.nv7 .items-stretch { align-items: start; } .nv7 .h-full { height: auto; } .nv7 .mt-auto { margin-top: 0; }`}</style>
      <div className="mx-auto max-w-[1500px] space-y-10">
        <div>
          <h1 className="text-[26px] font-bold text-[#0F2F2A]">L&apos;accueil : aujourd&apos;hui / nouvelle version</h1>
          <p className="mt-1 text-[14px] text-[#4B6A62]">À gauche la capture du site actuel, à droite la nouvelle version, qui fonctionne (boutons, animations). Dites les numéros à mettre en ligne.</p>
        </div>

        <Compare n="1" title="Le haut de la page" img="s0" changes={["Deux boutons sous la phrase : « Réserver une démo » et « Voir l'offre »."]}>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-[13px] font-medium text-text-secondary"><span className="size-1.5 rounded-full bg-brand-500" /> À côté de votre logiciel de gestion</p>
              <h2 className="mt-4 text-[54px] leading-[0.98] font-bold tracking-[-0.04em] text-text-primary">Scan.<br />Conseil.<br /><span className="bg-gradient-to-r from-brand-600 to-[#0796b4] bg-clip-text text-transparent">Bilan.</span></h2>
              <p className="mt-6 text-[20px] leading-8 font-medium text-text-primary">Au comptoir, vous <span className={GRAD}>scannez</span> les boîtes comme d&apos;habitude. PharmaBoost vous souffle les <span className={GRAD}>conseils</span> parfaits, et le patient repart avec son <span className={GRAD}>bilan</span>.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/decouvrir/demo" className={`${BTN} bg-brand-600 text-white hover:bg-brand-700`}>Réserver une démo <ArrowRight className="size-4" /></Link>
                <Link href="/decouvrir#tarif" className={`${BTN} border border-border-default bg-white text-text-primary`}>Voir l&apos;offre</Link>
              </div>
            </div>
            <HeroVisual glass />
          </div>
        </Compare>

        <Compare n="2" title="PharmaBoost en trois étapes" img="s2" changes={["Plus de paragraphe sous le titre : les trois cartes suffisent.", "Légende de l'animation raccourcie."]}>
          <h2 className="text-center text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary">PharmaBoost en trois étapes.</h2>
          <FlowSteps />
          <p className="mt-6 text-center text-[13px] text-text-tertiary">Exemple : touchez la bannière pour l&apos;essayer.</p>
        </Compare>

        <Compare n="3" title="Le produit conseil parfait" img="s3" changes={["Plus les quatre cases qui redisaient l'exemple, plus la petite carte en dessous.", "Une phrase, le bouton vidéo, l'exemple."]}>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHead title="Le produit conseil parfait.">Parmi les produits qui répondent au besoin du patient, PharmaBoost met en premier celui qui arrange votre pharmacie : en stock, de vos laboratoires, en date courte ou en challenge.</SectionHead>
              <VideoButton film="avantages" label="Voir les avantages" className="mt-8" />
            </div>
            <ChoiceVisual />
          </div>
        </Compare>

        <Compare n="4" title="Le bilan du patient" img="s4" changes={["Titre sur deux lignes au lieu de trois.", "Les trois pastilles deviennent une frise : aujourd'hui → 3 semaines → il revient."]}>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <SectionHead title="Le patient repart avec son bilan." />
              <ol className="mt-8 space-y-4 border-l-2 border-brand-200 pl-6">
                {[["Aujourd'hui", "Le bilan par e-mail, avec son accord"], ["3 semaines plus tard", "Le rappel, 7 jours avant la fin de la cure"], ["Ensuite", "Il revient à la pharmacie"]].map(([when, what]) => (
                  <li key={when} className="relative">
                    <span className="absolute top-1 -left-[33px] size-4 rounded-full border-4 border-white bg-brand-600" />
                    <p className="font-mono text-[11.5px] tracking-[0.12em] text-brand-700 uppercase">{when}</p>
                    <p className="text-[16px] font-semibold text-text-primary">{what}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <CureReminderVisual />
              <p className="mt-4 text-center text-[12.5px] text-text-tertiary">Envoyés au nom de la pharmacie · <ExampleTag className="text-[10.5px]" /></p>
            </div>
          </div>
        </Compare>

        <Compare n="5" title="L'équipe" img="s5" changes={["La moitié gauche n'est plus vide : une phrase et trois points."]}>
          <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <SectionHead title="Les résultats de chacun. Toute l'équipe motivée.">Chacun voit ses conseils proposés et vendus ; le titulaire suit toute l&apos;équipe.</SectionHead>
              <ul className="mt-6 space-y-2.5">
                {["Le classement de l'équipe", "Les challenges des laboratoires", "Les résultats par comptoir"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-[16px] font-semibold text-text-primary"><Check className="size-5 text-brand-600" /> {t}</li>
                ))}
              </ul>
            </div>
            <TeamVisual />
          </div>
        </Compare>

        <Compare n="6" title="Sans ordonnance" img="s6" changes={["Une ligne sous le titre pour dire ce que fait PharmaBoost."]}>
          <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <SectionHead title="Le client décrit. Vous conseillez.">Il dit ce qu&apos;il ressent : PharmaBoost vous donne la question à poser et les produits de votre rayon.</SectionHead>
              <VideoButton film="sansOrdonnance" label="Voir en vidéo" className="mt-8" />
            </div>
            <RequestVisual />
          </div>
        </Compare>

        <Compare n="7" title="L'offre" img="s7" changes={["La carte du simulateur ne s'étire plus : plus de grand vide en bas.", "Les prix de l'offre officielle (126 € et 200 €), ceux du site une fois « Publier l'offre officielle » cliqué."]}>
          <div className="nv7 -mx-5 -my-20">
            <PricingSection pricing={pricing} />
          </div>
        </Compare>

        <Compare n="8" title="Les questions" img="s8" changes={["Les réponses repliées : on clique sur une question pour la lire.", "Plus le petit « QUESTIONS » au-dessus.", "« Quel engagement ? » d'accord avec l'offre (plus de « paramétrage et formation »)."]}>
          <h2 className="text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary">L&apos;essentiel, en bref.</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {faq.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-border-subtle bg-white px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16.5px] font-semibold text-text-primary">
                  {item.q}
                  <ChevronDown className="size-5 shrink-0 text-text-tertiary transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[15px] leading-6 text-text-secondary">{item.a}</p>
              </details>
            ))}
          </div>
        </Compare>

        <Compare n="9" title="La fin" img="s9" changes={["« S'abonner » à côté de « Réserver une démo ».", "Plus le petit « PHARMABOOST » au-dessus."]}>
          <div className="max-w-[38rem] rounded-[32px] border border-white/70 bg-white/70 px-12 py-14">
            <h2 className="text-[48px] leading-[1.05] font-semibold tracking-[-0.03em] text-text-primary">Voyez-le sur votre comptoir.</h2>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/decouvrir/demo" className={`${BTN} bg-brand-600 text-white hover:bg-brand-700`}>Réserver une démo <ArrowRight className="size-4" /></Link>
              <Link href="/decouvrir/abonnement" className={`${BTN} border border-border-default bg-white text-text-primary`}>S&apos;abonner</Link>
            </div>
          </div>
        </Compare>
      </div>
    </main>
  );
}
