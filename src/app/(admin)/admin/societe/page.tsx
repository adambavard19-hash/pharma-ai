import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, FileLock2 } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { getCompanyProfile } from "@/server/services/sales/contracts";
import { generatedContractCounts } from "@/server/services/admin/contracts-admin";
import { missingCompanyFields } from "@/core/contracts/requirements";
import { formatFrenchDate } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "./form";

export const metadata: Metadata = { title: "Société exploitante" };

/**
 * La société exploitante : la partie signataire de chaque contrat. La fiche
 * ne vaut que pour les contrats à venir ; chaque contrat déjà généré garde la
 * copie des parties imprimée à sa génération.
 */
export default async function CompanyPage() {
  await requirePlatformSession();
  const [profile, counts] = await Promise.all([getCompanyProfile(), generatedContractCounts()]);
  const missing = missingCompanyFields(profile);
  const initial = profile
    ? {
        legalName: profile.legalName,
        legalForm: profile.legalForm ?? "",
        addressLine1: profile.addressLine1 ?? "",
        postalCode: profile.postalCode ?? "",
        city: profile.city ?? "",
        siren: profile.siren ?? "",
        representativeName: profile.representativeName,
        representativeTitle: profile.representativeTitle ?? "",
        representativeEmail: profile.representativeEmail,
      }
    : null;
  const others = counts.total - counts.signed;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Administration", href: "/admin/societe" }}
        title="Société exploitante"
        badge={profile ? missing.length === 0 ? <Badge tone="success">Prête pour les contrats</Badge> : <Badge tone="warning">Incomplète</Badge> : <Badge tone="warning">Non renseignée</Badge>}
        description="Ces informations identifient la société qui exploite PharmaBoost et sont utilisées comme partie signataire dans les contrats générés."
      />

      {/* La clé remonte le formulaire après un enregistrement : il repart des valeurs normalisées par le serveur. */}
      <CompanyForm
        key={profile?.updatedAt.toISOString() ?? "vide"}
        initial={initial}
        aside={
          <>
            <div className="flex gap-3 rounded-2xl border border-border-subtle bg-surface-card p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300" aria-hidden="true">
                <FileLock2 className="size-[18px]" />
              </span>
              <div className="min-w-0 text-[13px] leading-5">
                <p className="font-semibold text-text-primary">Les contrats déjà générés gardent leur copie</p>
                <p className="mt-0.5 text-text-secondary">
                  {counts.signed === 0
                    ? "Aucun contrat signé pour l'instant."
                    : `${counts.signed} contrat${counts.signed > 1 ? "s" : ""} signé${counts.signed > 1 ? "s" : ""} ne ${counts.signed > 1 ? "seront" : "sera"} pas modifié${counts.signed > 1 ? "s" : ""}.`}
                  {others > 0 ? ` Les ${others} autre${others > 1 ? "s" : ""} contrat${others > 1 ? "s" : ""} déjà généré${others > 1 ? "s" : ""} (brouillons, en signature, expirés) ${others > 1 ? "gardent" : "garde"} aussi le texte imprimé.` : ""} Une modification ne vaut que pour les prochains contrats.
                </p>
                {counts.total > 0 && (
                  <Link href="/admin/contrats" className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-300">
                    Voir les contrats <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
            {profile && <p className="px-1 text-[12px] text-text-tertiary">Dernière modification de la fiche le {formatFrenchDate(profile.updatedAt)}.</p>}
          </>
        }
      />

      <AdminSection
        title="Relances des contrats non signés"
        description="La cadence des rappels (premier rappel, second rappel, signalement à l'équipe) se règle désormais dans le centre des relances, avec les autres scénarios automatiques."
        action={
          <Button asChild variant="outline" size="sm" leadingIcon={<BellRing className="size-4" />}>
            <Link href="/admin/relances">Ouvrir le centre des relances</Link>
          </Button>
        }
      >
        <p className="text-[13px] leading-5 text-text-secondary">Une relance ne part jamais après la signature, et jamais deux fois en moins de 24 heures. Un contrat se relance aussi à la main depuis le centre des contrats.</p>
      </AdminSection>
    </div>
  );
}
