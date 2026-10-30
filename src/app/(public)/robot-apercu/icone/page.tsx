import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Robot } from "@/components/robot";

export const metadata: Metadata = { title: "Icône", robots: { index: false, follow: false } };

/**
 * L'icône d'onglet (fondateur, 30 oct. 2026 : « le favicon doit être ce logo-là, pas l'ancien avec le casque ») : le robot en
 * blouse, tablette en main, seul et en grand, photographié en 512 px (`[data-icone]`) pour l’icône d’onglet et celle de l’écran d’accueil.
 */
export default function IconePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center gap-10 bg-[#EEF2F6] p-6">
      <div data-icone="" className="flex size-[512px] items-center justify-center overflow-hidden">
        <Robot size={330} mood="happy" />
      </div>
      <div data-icone-fond="" className="flex size-[512px] items-center justify-center overflow-hidden bg-white">
        <Robot size={300} mood="happy" />
      </div>
    </main>
  );
}
