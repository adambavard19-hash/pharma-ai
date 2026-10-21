import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Accueil : ce qu'on peut améliorer", robots: { index: false, follow: false } };

/**
 * La revue de l'accueil, partie par partie (fondateur, 21 oct. 2026) : la capture d'aujourd'hui et les améliorations
 * proposées, numérotées pour qu'il choisisse. Développement seulement ; les captures sont dans public/apercu-sections (non suivies).
 */
const PARTS: { img: string; title: string; ideas: string[] }[] = [
  {
    img: "s0",
    title: "1 · Le haut de la page (« Scan. Conseil. Bilan. »)",
    ideas: [
      "Aucun bouton dans le haut de la page : ajouter « Réserver une démo » et « Voir l'offre » sous la phrase, le visiteur n'a pas à chercher.",
      "Sous le haut, la vidéo de présentation s'ouvre sur un écran sombre (« AUTRE AUTRE ») peu lisible à l'arrêt : poser une image d'accroche claire et un gros bouton ▶.",
    ],
  },
  {
    img: "s2",
    title: "2 · « PharmaBoost en trois étapes. »",
    ideas: [
      "Le paragraphe sous le titre redit les trois cartes : le retirer, les étapes parlent seules.",
      "La légende sous l'animation (« Animation de la bannière… Médicaments, produits et prix : exemples ») est longue : « Exemple, touchez pour essayer ».",
      "Relier les trois cartes par une flèche ou une ligne qui se dessine, pour montrer l'enchaînement.",
    ],
  },
  {
    img: "s3",
    title: "3 · « Le produit conseil parfait. »",
    ideas: [
      "Les quatre cases (stock, laboratoires, dates courtes, challenges) redisent les pastilles de l'exemple à droite : garder l'un ou l'autre.",
      "La petite carte « Au comptoir, sur la bannière » sous l'exemple fait doublon : la retirer.",
    ],
  },
  {
    img: "s4",
    title: "4 · « Pour la première fois, le patient repart avec un vrai bilan. »",
    ideas: [
      "Titre sur trois lignes : « Le patient repart avec son bilan. » tient sur deux.",
      "Les trois pastilles à gauche peuvent devenir une petite frise : aujourd'hui → 3 semaines → il revient.",
    ],
  },
  {
    img: "s5",
    title: "5 · « Les résultats de chacun. Toute l'équipe motivée. »",
    ideas: [
      "La moitié gauche est vide sous le titre : ajouter une phrase courte ou trois pastilles (classement, challenges, résultats par comptoir).",
      "Faire défiler les chiffres (64, 23, 36 %) à l'arrivée sur la section : plus vivant.",
    ],
  },
  {
    img: "s6",
    title: "6 · « Le client décrit. Vous conseillez. »",
    ideas: [
      "Montrer la demande qui s'écrit lettre à lettre puis les produits qui arrivent : l'exemple se comprend sans lire.",
      "Le bouton « Voir en vidéo » est seul à gauche : ajouter une phrase d'une ligne au-dessus.",
    ],
  },
  {
    img: "s7",
    title: "7 · L'offre",
    ideas: [
      "La carte du simulateur a un grand vide en bas : la raccourcir à sa hauteur, ou y mettre le parrainage.",
      "Sur pharmaboost.app, la mise en service affiche encore 150 € tant que « Publier l'offre officielle » n'est pas cliqué (Console → Abonnements → Offres).",
      "« Rassurez-vous, l'objectif est simple… » : une ligne plus courte, « PharmaBoost vous rapporte plus qu'il ne coûte. »",
    ],
  },
  {
    img: "s8",
    title: "8 · Les questions (« L'essentiel, en bref. »)",
    ideas: [
      "Huit réponses dépliées, c'est beaucoup de texte : les replier, on clique sur une question pour lire sa réponse.",
      "Il reste le petit sur-titre « QUESTIONS » que les autres parties n'ont plus : le retirer.",
      "« Quel engagement ? » parle encore de « paramétrage et formation de l'équipe » alors que l'offre ne les liste plus : à mettre d'accord.",
    ],
  },
  {
    img: "s9",
    title: "9 · La fin (« Voyez-le sur votre comptoir. »)",
    ideas: [
      "Ajouter « S'abonner » à côté de « Réserver une démo ».",
      "Retirer le petit sur-titre « PHARMABOOST », comme ailleurs.",
    ],
  },
];

export default function ImprovementsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-[26px] font-bold text-[#0F2F2A]">L&apos;accueil, partie par partie : ce qu&apos;on peut améliorer</h1>
        <p className="mt-1 text-[14px] text-[#4B6A62]">La capture d&apos;aujourd&apos;hui, puis les idées. Dites les numéros que vous voulez (par exemple « 2b, 5a, 8a ») ; « Le pharmacien ne peut pas penser à tout » n&apos;y est pas, elle vient d&apos;être refaite.</p>
        <div className="mt-8 space-y-10">
          {PARTS.map((part) => (
            <section key={part.img} className="grid gap-6 rounded-3xl border border-[#D9E2DF] p-5 lg:grid-cols-[1.4fr_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element -- capture locale de développement */}
              <img src={`/apercu-sections/${part.img}.png`} alt="" className="w-full rounded-2xl border border-[#E4EBE8]" />
              <div>
                <h2 className="text-[18px] font-bold text-[#0F2F2A]">{part.title}</h2>
                <ol className="mt-3 space-y-3">
                  {part.ideas.map((idea, index) => (
                    <li key={idea} className="flex gap-3 text-[14.5px] leading-6 text-[#23413B]">
                      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1F7A6C] text-[12px] font-bold text-white">{part.title.charAt(0)}{String.fromCharCode(97 + index)}</span>
                      {idea}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
