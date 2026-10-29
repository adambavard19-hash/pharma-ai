import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listPharmacyModules } from "@/server/services/advice-modules";
import { ADVICE_MODULES } from "@/core/ai/advice-modules";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PharmacyModules } from "./pharmacy-modules";

export const metadata: Metadata = { title: "Modules de conseil" };

/**
 * Les modules de conseil (fondateur, 29 oct. 2026) : « certains pharmaciens sont plus orientés huiles essentielles et
 * phytothérapie, d'autres médicaments conseils chimiques ». Chaque pharmacie choisit les siens (Paramètres → Laboratoires &
 * gammes → Mes modules) ; ici, l'équipe PharmaBoost les voit tous et peut les régler.
 */
export default async function AdviceModulesPage() {
  await requirePlatformSession();
  const pharmacies = await listPharmacyModules();
  return (
    <>
      <AdminPageHeader
        space={{ label: "Gestion", href: "/admin/conseils" }}
        title="Modules"
        description="Pour un même médicament, le conseil peut venir des plantes, des huiles essentielles ou d'un médicament conseil. Chaque pharmacie coche les modules qu'elle veut travailler : au comptoir, un produit de ses modules passe devant, s'il est adapté et sûr pour le patient et en stock."
      />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {ADVICE_MODULES.map((item) => (
          <div key={item.code} className="rounded-xl border border-border-subtle bg-surface-card p-4">
            <p className="text-[15px] font-semibold text-text-primary">{item.label}</p>
            <p className="mt-1 text-[13px] leading-5 text-text-secondary">{item.description}</p>
            <p className="mt-2 text-[12px] text-text-tertiary tabular-nums">
              {pharmacies.filter((pharmacy) => pharmacy.modules.includes(item.code)).length} pharmacie(s) l&apos;ont choisi
            </p>
          </div>
        ))}
      </div>
      <PharmacyModules pharmacies={pharmacies} />
    </>
  );
}
