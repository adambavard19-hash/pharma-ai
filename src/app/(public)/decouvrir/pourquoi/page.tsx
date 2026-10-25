import type { Metadata, ResolvingMetadata } from "next";
import type { ReactNode } from "react";
import { CalendarCheck, CheckCircle2, FileText, HelpCircle, Home, XCircle } from "lucide-react";
import { fr, SectionHead } from "../_components/site-shell";
import { ExampleTag, HERO_ITEMS } from "../_components/visuals";
import { CounterIslandStill } from "@/components/island/counter-island-still";
import { AutoVideo } from "../_components/auto-video";
import { Reveal } from "../_components/story";
import { pageShare } from "../_components/share-metadata";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { cn } from "@/lib/utils";

// La question d'ouverture est celle de la page ; la suite dit ce que fait l'application, sans « chaque ordonnance » : toutes
// n'appellent pas un conseil, et le plan conseil se remet depuis l'écran de vente, quand le pharmacien le décide.
const DESCRIPTION =
  "Et si chaque délivrance révélait tout son potentiel de conseil ? Au comptoir, PharmaBoost propose le conseil qui accompagne le traitement, pris dans votre rayon. À la maison, le patient peut retrouver son plan conseil.";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return {
    // Absolu : « Pourquoi PharmaBoost · PharmaBoost » répétait la marque dans l'onglet.
    title: { absolute: "Pourquoi PharmaBoost" },
    description: DESCRIPTION,
    // Sans cela, un lien vers cette page se partageait avec le titre et la phrase de l'accueil.
    ...(await pageShare(parent, { path: "/decouvrir/pourquoi", title: "Pourquoi PharmaBoost", description: DESCRIPTION })),
  };
}

/**
 * Pourquoi PharmaBoost : deux problèmes, chacun montré sur la même ordonnance
 * « sans » et « avec », côte à côte, pour se comprendre d'un coup d'œil.
 * Aucun jugement sur l'équipe : le sujet est ce qu'on ne peut pas avoir en
 * tête, pas la compétence de ceux qui conseillent.
 */

const SOLAIRE = "/site/produits/creme-solaire-spf50.webp";
const DOXY = "DOXYCYCLINE 100 mg";
const SOLAIRE_NAME = "Crème solaire SPF 50+";

/**
 * La phrase à dire de la règle que montre la bannière (photoprotection sous doxycycline, « Conseil peau — Série 2 », RCP de
 * la doxycycline), remplie comme le fait le moteur : `{drug}` par le nom de la ligne scannée, `{product}` par celui de la
 * référence. Lue dans la règle et non recopiée : la phrase du site ne peut plus s'écarter de celle de l'écran de vente. Une règle
 * disparue : pas de phrase.
 */
const DOXY_COUNTER_SCRIPT = ADVICE_RULES.find((rule) => rule.key === "skin-doxycycline-photoprotection")
  ?.counterScriptTemplate.replaceAll("{drug}", DOXY)
  .replaceAll("{product}", SOLAIRE_NAME);

export default function WhyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      {/* Le Reel « Le Cercle » (9:16, 52 s), lancé de lui-même à côté du titre (fondateur, 25 oct. 2026) : la pharmacie avec
          PharmaBoost et celle d'en face, le patient qui revient. */}
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
        {/* Le titre suit le film (fondateur, 25 oct. 2026) ; le bouton « Voir en vidéo » (film « Pourquoi ») est retiré. */}
        <div className="max-w-3xl">
          <SectionHead as="h1" kicker="Pourquoi PharmaBoost" title="Même rue. Deux pharmacies. Une seule où les patients reviennent.">
            Mêmes boîtes, mêmes ordonnances. Mais dans l&apos;une, l&apos;équipe a un copilote : à chaque boîte scannée, le bon conseil s&apos;affiche. Le patient repart avec le vrai complément de son traitement et son bilan conseil, puis il revient.{" "}
            <span className="font-semibold text-text-primary">C&apos;est un cercle.</span>
          </SectionHead>
        </div>
        <AutoVideo src="/video/pharmaboost-le-cercle.mp4" poster="/video/pharmaboost-le-cercle.jpg" vertical className="max-lg:order-first max-lg:max-w-[320px]" />
      </div>

      {/* ---- 01 · Au comptoir ------------------------------------------ */}
      <section className="mt-20 md:mt-28">
        <SectionHead title="Des milliers de produits. Un patient à la fois." />

        <Compare
          context={<Context icon={<FileText className="size-4" />} label="Ordonnance du patient" value="DOXYCYCLINE 100 mg · PARACÉTAMOL 1000 mg" />}
          without={
            <>
              <p className="text-[13.5px] text-text-tertiary">Ce que le pharmacien doit se rappeler, seul :</p>
              <Questions items={["Cet antibiotique rend-il la peau sensible au soleil ?", "Laquelle ai-je en rayon ?", "Trois patients attendent…"]} />
            </>
          }
          withPb={
            <>
              {/* « propose », pas « affiche » : la bannière montre aussi ses mises en garde, que cette vignette ne reprend pas. */}
              <p className="text-[13.5px] text-text-secondary">Au scan, la bannière propose :</p>
              <CounterIslandStill mix items={[{ ...HERO_ITEMS[0], name: SOLAIRE_NAME, image: SOLAIRE, pitchOpen: false }]} drug={DOXY} className="mt-2.5 flex justify-center [&_section]:max-w-full" />
              {/* La bannière ne dit pas de phrase : celle-ci est sur l'écran de vente (« À dire au patient »). */}
              {DOXY_COUNTER_SCRIPT && (
                <>
                  <p className="mt-4 text-[13.5px] text-text-secondary">Sur l&apos;écran de vente, la phrase à dire :</p>
                  <p className="mt-1.5 rounded-lg bg-brand-50 px-3 py-2 text-[13px] leading-5 text-brand-900">{fr(DOXY_COUNTER_SCRIPT)}</p>
                </>
              )}
            </>
          }
          withoutResult="Le patient repart sans conseil."
          withResult="Le patient repart avec le bon conseil."
        />
      </section>

      {/* ---- 02 · À la maison ------------------------------------------ */}
      <section className="mt-24 md:mt-32">
        <SectionHead title="Plusieurs boîtes. Et beaucoup de questions." />

        <Compare
          context={<Context icon={<Home className="size-4" />} label="De retour à la maison" value="3 boîtes sur la table" />}
          without={
            <>
              <div className="flex flex-wrap gap-2">
                {["DOXYCYCLINE 100 mg", "PARACÉTAMOL 1000 mg", "Crème solaire SPF 50+"].map((box) => (
                  <span key={box} className="rounded-lg border border-border-default bg-surface-card px-2.5 py-1.5 font-mono text-[12px] text-text-primary shadow-sm">{box}</span>
                ))}
              </div>
              <p className="mt-4 text-[13.5px] text-text-tertiary">Les questions du patient, seul :</p>
              <Questions items={["Le matin ou le soir ?", "Combien de jours ?", "Celui-là, il sert à quoi ?"]} />
            </>
          }
          withPb={
            <div className="mx-auto w-full max-w-[330px] rounded-[26px] border-[5px] border-ink-900 bg-surface-card p-3.5 shadow-sm">
              <p className="font-mono text-[10.5px] tracking-[0.12em] text-brand-700 uppercase">Plan conseil patient · votre pharmacie</p>
              <ul className="mt-2.5 divide-y divide-border-subtle">
                <Med name="DOXYCYCLINE 100 mg" why="Antibiotique : traite l'infection" when={["Matin · 1", "Soir · 1"]} until="10 jours" />
                <Med name="PARACÉTAMOL 1000 mg" why="Contre la douleur et la fièvre" when={["Si besoin"]} />
                <Med name="Crème solaire SPF 50+" why="Conseil : protège la peau du soleil pendant le traitement" when={["Avant chaque sortie"]} until="10 jours" advice />
              </ul>
              <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[12px] font-medium text-white">
                <CalendarCheck className="size-3.5" /> 08:00 · Rappel de prise
              </div>
            </div>
          }
          withoutResult="Il hésite, oublie une prise ou arrête trop tôt."
          withResult="Il sait quoi prendre, quand, et pourquoi."
        />

      </section>

    </div>
  );
}

/** La même situation, sans puis avec PharmaBoost, côte à côte, avec ce qu'il en résulte pour le patient. */
function Compare({ context, without, withPb, withoutResult, withResult }: { context: ReactNode; without: ReactNode; withPb: ReactNode; withoutResult: string; withResult: string }) {
  return (
    <Reveal className="mt-10 rounded-[28px] border border-border-subtle bg-surface-card p-4 sm:p-6">
      {context}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Side tone="without" result={withoutResult}>{without}</Side>
        <Side tone="with" result={withResult}>{withPb}</Side>
      </div>
    </Reveal>
  );
}

function Side({ tone, result, children }: { tone: "without" | "with"; result: string; children: ReactNode }) {
  const withPb = tone === "with";
  return (
    <div className={cn("flex flex-col rounded-2xl border p-4 sm:p-5", withPb ? "border-brand-200 bg-brand-50/50" : "border-border-subtle bg-surface-app")}>
      <span className={cn("w-fit rounded-full px-3 py-1 text-[12.5px] font-semibold text-white", withPb ? "bg-brand-600" : "bg-ink-700")}>{withPb ? "Avec PharmaBoost" : "Sans PharmaBoost"}</span>
      <div className="mt-4 flex-1">{children}</div>
      <p className={cn("mt-5 flex items-start gap-2 border-t pt-4 text-[15.5px] leading-snug font-semibold", withPb ? "border-brand-200 text-success-700" : "border-border-subtle text-danger-700")}>
        {withPb ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <XCircle className="mt-0.5 size-5 shrink-0" />}
        {result}
      </p>
    </div>
  );
}

function Context({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-app px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">{label}</p>
        {/* Coupé seulement à partir de sm : sur téléphone, « … » cachait le second médicament de l'ordonnance. */}
        <p className="font-mono text-[13.5px] text-text-primary sm:truncate">{value}</p>
      </div>
      <ExampleTag />
    </div>
  );
}

function Questions({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((text) => (
        <li key={text} className="flex items-center gap-2.5 rounded-xl bg-surface-card px-3 py-2.5 text-[14px] text-text-secondary">
          <HelpCircle className="size-4 shrink-0 text-warning-600" /> {fr(text)}
        </li>
      ))}
    </ul>
  );
}

function Med({ name, why, when, until, advice = false }: { name: string; why: string; when: string[]; until?: string; advice?: boolean }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <p className={cn("text-[13px] font-semibold", advice ? "text-brand-800" : "font-mono text-text-primary")}>{name}</p>
      <p className="text-[12px] text-text-secondary">{why}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px]">
        {when.map((w) => (
          <span key={w} className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-900">{w}</span>
        ))}
        {until && <span className="text-text-tertiary">· {until}</span>}
      </div>
    </li>
  );
}
