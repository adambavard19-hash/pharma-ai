import type { Metadata } from "next";
import { BadgeCheck, ShieldX, Star } from "lucide-react";
import { findCertificate } from "@/server/services/advisor-sheet";
import { percentLabel } from "@/core/team/advisor-sheet";
import { TIME_ZONE } from "@/config/constants";

export const metadata: Metadata = { title: "Vérifier une fiche Conseiller", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** La page de vérification d'une fiche « Conseiller certifié PharmaBoost » : un recruteur scanne le QR code de la fiche. */
export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cert = await findCertificate(decodeURIComponent(code));
  const day = (date: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, dateStyle: "long" }).format(date);
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      {!cert ? (
        <div className="rounded-3xl border border-border-subtle bg-surface-card p-8 text-center">
          <ShieldX className="mx-auto size-12 text-[#B42318]" aria-hidden="true" />
          <h1 className="mt-4 text-[26px] font-semibold text-text-primary">Fiche introuvable</h1>
          <p className="mt-2 text-[15.5px] text-text-secondary">Ce code ne correspond à aucune fiche émise par PharmaBoost. Vérifiez le code imprimé sur la fiche (« PB-XXXX-XXXX »).</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-border-subtle bg-surface-card p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-[13.5px] font-semibold text-brand-800">
            <BadgeCheck className="size-4" aria-hidden="true" /> Fiche authentique, émise par PharmaBoost
          </p>
          <h1 className="mt-5 text-[32px] leading-tight font-semibold tracking-[-0.02em] text-text-primary">{cert.fullName}</h1>
          <p className="mt-1 text-[16px] text-text-secondary">{cert.roleLabel} · {cert.pharmacyName}{cert.pharmacyCity ? `, ${cert.pharmacyCity}` : ""}</p>
          <p className="mt-4 text-[17px] font-semibold text-brand-700">{cert.stats.level.label}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              [String(cert.stats.sales), "ventes au comptoir"],
              [String(cert.stats.proposed), "conseils proposés"],
              [String(cert.stats.sold), "conseils vendus"],
              [percentLabel(cert.stats.acceptRate), "d'acceptation"],
              [percentLabel(cert.stats.soldRate), "des conseils vendus"],
              [percentLabel(cert.stats.attachRate), "des ventes avec un conseil"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-border-subtle bg-surface-app p-4 text-center">
                <dt className="sr-only">{label}</dt>
                <dd className="text-[24px] font-semibold text-brand-700">{value}</dd>
                <p className="text-[12.5px] text-text-secondary">{label}</p>
              </div>
            ))}
          </dl>
          {cert.stats.domains.length > 0 && <p className="mt-5 text-[15px] text-text-primary"><b>Domaines :</b> {cert.stats.domains.map((d) => d.label).join(", ")}</p>}
          {cert.stats.reviews.average !== null && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[15px] text-text-primary"><Star className="size-4 fill-[#F5A524] text-[#F5A524]" aria-hidden="true" /> {String(cert.stats.reviews.average).replace(".", ",")} / 5 sur {cert.stats.reviews.count} avis de patients</p>
          )}
          <p className="mt-6 text-[13px] text-text-secondary">Fiche n° {cert.code}, émise le {day(cert.issuedAt)}. Chiffres figés à cette date, mesurés par PharmaBoost au comptoir sur les ventes terminées.</p>
        </div>
      )}
    </div>
  );
}
