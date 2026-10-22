import type { HTMLAttributes, ReactNode } from "react";

/** Les couleurs de l'appli des patients : la sarcelle de PharmaBoost, en dégradé vers le bleu. */
export const ACCENT = "#0E8A7B";
export const GRAD = "linear-gradient(135deg,#0E8A7B 0%,#0796B4 100%)";

/** L'hélice d'ADN en filigrane, en haut des écrans : la signature de PharmaBoost. */
export function Dna({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-64 bg-[url(/poste/adn-helice.jpg)] bg-cover bg-[62%_40%] opacity-40 [mask-image:linear-gradient(180deg,#000_30%,transparent)] ${className}`} />;
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div {...rest} className={`rounded-[22px] bg-white p-4 shadow-[0_8px_24px_-16px_rgba(15,47,42,.35)] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 mb-2.5 text-[12px] font-extrabold tracking-[0.08em] text-[#0F2F2A] uppercase">{children}</h2>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] text-[#0F2F2A]">{children}</h1>
      {sub && <p className="mt-1 text-[14.5px] leading-6 text-[#4B6A62]">{sub}</p>}
    </div>
  );
}

/** La phrase qui accompagne chaque fiche : l'appli informe, le pharmacien conseille. */
export function NotAdvice() {
  return <p className="mt-5 text-center text-[11.5px] leading-4 text-[#94A3A0]">Cette fiche ne remplace pas l&apos;avis de votre pharmacien ou de votre médecin.</p>;
}
