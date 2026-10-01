import type { Metadata } from "next";
import { loadCompanyProfile, DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";

export const metadata: Metadata = { title: "Mentions légales" };

/** Les mentions sont lues dans la fiche société de la console : rien n'est inventé ici. */
export default async function LegalPage() {
  const company = await loadCompanyProfile();
  const legalName = company?.legalName ?? "PharmaBoost";
  const address = [company?.addressLine1, [company?.postalCode, company?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const email = company?.representativeEmail ?? DEFAULT_CONTACT_EMAIL;
  return (
    <article className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary">Mentions légales</h1>
      <dl className="mt-8 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-card text-[14.5px]">
        <Row label="Éditeur du site">{legalName}{company?.legalForm ? `, ${company.legalForm}` : ""}</Row>
        {address && <Row label="Siège">{address}</Row>}
        {company?.siren && <Row label="SIREN">{company.siren}</Row>}
        {company?.representativeName && <Row label="Directeur de la publication">{company.representativeName}{company.representativeTitle ? `, ${company.representativeTitle}` : ""}</Row>}
        <Row label="Contact"><a href={`mailto:${email}`} className="text-brand-700 hover:underline">{email}</a></Row>
        <Row label="Hébergement">Application hébergée par Vercel Inc., base de données par Neon Inc.</Row>
      </dl>
      <h2 className="mt-10 text-[20px] font-semibold text-text-primary">Nature du service</h2>
      <p className="mt-3 text-[14.5px] leading-7 text-text-secondary">PharmaBoost est un logiciel d&apos;aide au conseil officinal destiné aux professionnels de la pharmacie. Il ne constitue pas un dispositif médical, ne réalise aucun diagnostic, ne prescrit aucun traitement et ne se substitue pas à l&apos;avis du pharmacien, qui reste seul décisionnaire de ce qui est proposé au patient.</p>
      <h2 className="mt-10 text-[20px] font-semibold text-text-primary">Propriété intellectuelle</h2>
      <p className="mt-3 text-[14.5px] leading-7 text-text-secondary">Le site, l&apos;application, leurs textes, règles de conseil et éléments graphiques sont la propriété de {legalName}. Les informations médicamenteuses proviennent de la Base de données publique des médicaments et des bases de l&apos;Assurance maladie, citées avec leur date de mise à jour dans l&apos;application.</p>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3.5 sm:grid-cols-[180px_1fr]">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-primary">{children}</dd>
    </div>
  );
}
