import { BadgePercent, ScanLine, Store } from "lucide-react";
import { ean13Modules } from "@/core/patient-app/offers";

/** Un code d'exemple au bon format (préfixe 2990, clé juste) : jamais un code réel. */
const EXAMPLE_CODE = "2990000012340";

/**
 * L'appli des patients, en téléphone d'exemple : une offre de la pharmacie et son code-barres, scanné au comptoir. Aucune
 * pharmacie, aucun laboratoire réel : « Votre pharmacie » et « Gamme solaire ».
 */
export function AppPhoneVisual({ className }: { className?: string }) {
  const modules = ean13Modules(EXAMPLE_CODE);
  return (
    <div className={className} aria-hidden="true">
      <div className="relative mx-auto w-[280px] rounded-[42px] border border-black/10 bg-[#0B0F14] p-2.5 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.6)]">
        <div className="overflow-hidden rounded-[34px] bg-[#F4F7F6]">
          <div className="flex items-center justify-between px-5 pt-4 text-[11px] font-semibold text-[#0F2B26]">
            <span>9:41</span>
            <span className="h-5 w-20 rounded-full bg-[#0B0F14]" />
            <span>100 %</span>
          </div>
          <div className="px-4 pt-4 pb-5">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-[#0E8A7B] uppercase">Mes offres</p>
            <p className="mt-1 text-[19px] leading-6 font-bold text-[#0F2B26]">Votre pharmacie</p>
            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E8FF9C] px-2 py-0.5 text-[10.5px] font-bold text-[#3D4F00]">
                <BadgePercent className="size-3" /> Offre de la pharmacie
              </span>
              <p className="mt-2 text-[22px] leading-7 font-extrabold text-[#0F2B26]">-20 %</p>
              <p className="text-[13px] font-semibold text-[#0F2B26]">Nouvelle gamme solaire</p>
              <svg viewBox="0 0 95 30" preserveAspectRatio="none" className="mt-3 h-14 w-full">
                {modules.split("").map((bit, x) => (bit === "1" ? <rect key={x} x={x} y={0} width={1} height={30} fill="#0F2B26" /> : null))}
              </svg>
              <p className="mt-1 text-center font-mono text-[11px] tracking-[0.18em] text-[#475569]">2990 0000 1234 0</p>
              <p className="mt-2 text-center text-[11px] text-[#64748B]">À montrer au comptoir : scanné une fois</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-[11.5px] font-semibold text-[#0F2B26] shadow-sm">
                <ScanLine className="size-4 text-[#0E8A7B]" /> Scanner
              </span>
              <span className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-[11.5px] font-semibold text-[#0F2B26] shadow-sm">
                <Store className="size-4 text-[#0E8A7B]" /> Pharmacies
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-text-tertiary">Exemple d&apos;écran</p>
    </div>
  );
}

/** Les deux magasins d'applications, sans lien tant que l'appli n'y est pas publiée : « Bientôt », jamais un faux lien. */
export function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-3">
        {["App Store", "Google Play"].map((store) => (
          <span key={store} className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-[#0B0F14] px-4 text-white opacity-90" aria-label={`${store} : bientôt disponible`}>
            <span className="flex flex-col leading-none">
              <span className="text-[10px] text-white/70">Bientôt sur</span>
              <span className="mt-0.5 text-[16px] font-semibold">{store}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
