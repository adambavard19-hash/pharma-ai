import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Réduire la bannière, essais", robots: { index: false, follow: false } };

const FACONS = [
  { key: "a", title: "A · Bouton « Réduire »", text: "Un petit bouton « – Réduire » en haut de la bannière. Elle redevient la petite bannière blanche du début, avec le nombre de conseils. Un clic la rouvre." },
  { key: "b", title: "B · Poignée sous les cartes", text: "Une poignée « Réduire » sous les cartes. Réduite, elle garde le nom des conseils avec l'étoile ou le sablier : on sait ce qui attend sans rien ouvrir." },
  { key: "c", title: "C · Réduire ou ne garder que la croix", text: "Deux petits boutons : « – » pour la petite bannière blanche, « × » pour ne garder qu'une croix verte avec le nombre de conseils." },
  { key: "d", title: "D · Elle se réduit seule", text: "Huit secondes après que la souris l'a quittée, la bannière se réduit d'elle-même ; elle se rouvre dès qu'on passe la souris dessus. Le bouton « Réduire » reste là." },
  { key: "e", title: "E · La croix seule", text: "Le plus petit possible : un « – » discret, et la bannière devient une simple croix verte avec le nombre de conseils." },
];

/**
 * Les façons de réduire la bannière à tout moment, même en plein conseil (fondateur, 29 oct. 2026 : « elle peut gêner le
 * pharmacien par rapport au LGO »), chacune jouée comme sur le poste (`/poste/ile?essai=1&reduire=…`). Développement seulement.
 */
export default function ReduirePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-[#F4F8F6] px-4 py-10">
      <div className="mx-auto max-w-[1500px]">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#0F2F2A]">Réduire la bannière : cinq façons</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#4D6B64]">
          Chaque cadre joue la vraie vente d&apos;exemple du poste (elle arrive au bout d&apos;une dizaine de secondes). Réduisez la bannière, même avec un conseil ouvert, puis rouvrez-la. La vente continue pendant qu&apos;elle est réduite : rien n&apos;est vendu ni refusé.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {FACONS.map((facon) => (
            <article key={facon.key} className="flex flex-col gap-3 rounded-2xl border border-[#DCE7E2] bg-white p-4">
              <div>
                <h2 className="text-[17px] font-bold text-[#0F2F2A]">{facon.title}</h2>
                <p className="mt-1 text-[13px] leading-6 text-[#4D6B64]">{facon.text}</p>
              </div>
              <iframe title={facon.title} src={`/poste/ile?essai=1&reduire=${facon.key}`} className="h-[620px] w-full rounded-xl border border-[#C9D3DE] bg-[#EEF2F6]" />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
