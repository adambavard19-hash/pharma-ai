import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "La bannière du poste, variantes", robots: { index: false, follow: false } };

const VARIANTES = [
  { key: "", title: "En ligne aujourd'hui", text: "La bannière menthe telle qu'elle est sur les postes." },
  { key: "a", title: "A · Grandes photos", text: "Photos et initiales plus grandes, nom et prix plus gros : on lit de loin." },
  { key: "b", title: "B · Bandeau « Conseils PharmaBoost »", text: "Un bandeau vert en tête des cartes : on sait tout de suite d'où vient le conseil." },
  { key: "c", title: "C · Cadre vert foncé", text: "Le cadre passe au vert foncé de la marque : la bannière tranche net sur LGPI." },
  { key: "d", title: "D · Cartes séparées", text: "Chaque conseil dans sa propre carte, avec un trait vert : plus lisible quand il y en a plusieurs." },
  { key: "e", title: "E · Repères plus gros", text: "Stock, challenge, date courte et marge en plus grand : l'essentiel saute aux yeux." },
  { key: "f", title: "F · Halo qui respire", text: "Un halo vert qui respire doucement autour de la bannière : elle attire l'œil sans clignoter." },
];

/**
 * Les variantes de la bannière, chacune jouée comme sur le poste (`/poste/ile?essai=1&variante=…`), côte à côte (fondateur,
 * 29 oct. 2026). Seule l'apparence change. Développement seulement (404 en production).
 */
export default function VariantesPostePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <div className="mx-auto max-w-[1500px]">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">La bannière, comme au poste : six améliorations</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Chaque cadre joue la vraie vente d&apos;exemple du poste, en boucle (la vente arrive au bout d&apos;une dizaine de secondes ; cliquez sur une carte pour ouvrir sa fiche). Seule l&apos;apparence change.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {VARIANTES.map((variante) => (
            <article key={variante.key || "actuel"} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-4">
              <div>
                <h2 className="text-[17px] font-bold text-[#0F2F2A]">{variante.title}</h2>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{variante.text}</p>
              </div>
              <iframe title={variante.title} src={`/poste/ile?essai=1${variante.key ? `&variante=${variante.key}` : ""}`} className="h-[620px] w-full rounded-xl border border-[#C9D3DE] bg-[#EEF2F6]" />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
