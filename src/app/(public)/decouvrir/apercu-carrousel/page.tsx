import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeatureCarousel, type Slide } from "./carousel";

export const metadata: Metadata = { title: "Essai de carrousel", robots: { index: false, follow: false } };

/**
 * Essai (fondateur, 26 oct. 2026 : « comme les présentations de limova ») : les fonctions de PharmaBoost en grandes cartes
 * sombres qui défilent. Visible en développement seulement, le temps de choisir.
 */
const SLIDES: Slide[] = [
  {
    name: "le conseil au comptoir",
    tagline: "Je lis l'ordonnance au premier bip et je propose le bon conseil, en stock.",
    ask: "Augmentin 1 g et Doliprane 1000 : je propose quoi à ce patient ?",
    answers: ["Un probiotique à prendre pendant l'antibiotique : vous en avez 12 en stock.", "Je l'ai mis en premier dans la bannière. Bipez-le s'il le prend : je le compte comme vendu."],
    points: ["Les conseils s'affichent par-dessus votre logiciel", "Contrôles de sécurité avant chaque conseil", "Seulement des produits en stock"],
  },
  {
    name: "le bilan patient",
    tagline: "Le patient repart avec ses conseils par e-mail, clairs et à son nom de pharmacie.",
    ask: "Le patient veut garder les conseils, il me donne son e-mail.",
    answers: ["C'est noté. À « Vente terminée », il reçoit son bilan : ses produits, comment les prendre, les précautions.", "Rien ne part sans son accord : il a donné son adresse, il reçoit son bilan."],
    points: ["Bilan envoyé à la fin de la vente", "Avec l'accord du patient"],
  },
  {
    name: "le surstock",
    tagline: "Je fais sortir en priorité les produits achetés en trop.",
    ask: "J'ai 48 boîtes de vitamine C en trop, il faut les écouler avant la facture.",
    answers: ["Je les mets en campagne : proposées en premier sur les antibiotiques et la fatigue.", "Je vous dis chaque jour combien il en reste et l'argent encore immobilisé."],
    points: ["Le produit passe en premier au comptoir", "Arrêt automatique à l'objectif", "Suivi du stock et de l'argent immobilisé"],
  },
  {
    name: "les dates courtes",
    tagline: "Je repère les boîtes qui approchent de leur date avant qu'elles ne soient perdues.",
    ask: "Qu'est-ce qui périme bientôt dans mon stock ?",
    answers: ["Quatre produits conseil arrivent à date dans moins de trois mois.", "Je les propose en priorité au comptoir quand ils conviennent au patient."],
    points: ["Liste des boîtes qui approchent de leur date", "Proposées en priorité, toujours si elles conviennent", "Moins de produits jetés"],
  },
  {
    name: "l'équipe",
    tagline: "Je suis les conseils vendus de chaque collaborateur et j'anime les challenges.",
    ask: "Comment s'en sort l'équipe cette semaine ?",
    answers: ["Les conseils vendus sont en hausse, et le challenge du mois est en cours.", "Le bilan de la semaine arrive dimanche, avec le PDF."],
    points: ["Classement et challenges", "Bilan hebdomadaire par e-mail", "Chacun voit ses propres résultats"],
  },
];

export default function CarouselPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <section className="-mt-16 bg-[#0E1513] pt-28 pb-24">
      <div className="mx-auto mb-10 max-w-3xl px-5 text-center">
        <h2 className="text-[34px] leading-tight font-bold tracking-[-0.035em] text-white md:text-[48px]">Un copilote, toutes les tâches du comptoir</h2>
        <p className="mt-3 text-[16px] text-white/60">Ce que PharmaBoost fait pour vous, une fonction à la fois.</p>
      </div>
      <FeatureCarousel slides={SLIDES} />
    </section>
  );
}
