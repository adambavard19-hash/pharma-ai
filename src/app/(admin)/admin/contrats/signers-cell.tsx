import { CheckCircle2, Clock, PenLine, XCircle } from "lucide-react";
import { signerLines, type FirstParty } from "@/core/contracts/countersignature";
import { formatFrenchDate } from "@/core/billing/subscription";

/**
 * Les deux signataires d'un contrat, dans l'ordre : le titulaire (ou
 * l'affilié), puis PharmaBoost. Pour chacun : signé le…, à son tour, pas
 * encore son tour, ou clos. Le lien de contresignature est donné quand c'est
 * au tour de PharmaBoost.
 */
export function SignersCell({
  status,
  firstParty,
  firstPartySignedAt,
  companySignedAt,
  company,
  companySigningUrl,
}: {
  status: string;
  firstParty: { role: FirstParty; name: string; email: string };
  firstPartySignedAt: Date | null;
  companySignedAt: Date | null;
  company: { name: string; email: string };
  companySigningUrl: string | null;
}) {
  const lines = signerLines({ status, firstPartySignedAt, companySignedAt }, firstParty, company);
  return (
    <ul className="space-y-1.5 text-[12.5px]">
      {lines.map((line) => (
        <li key={line.role} className="flex items-start gap-1.5">
          {line.state === "SIGNED" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden="true" />
          ) : line.state === "WAITING" ? (
            <Clock className="mt-0.5 size-3.5 shrink-0 text-warning-600" aria-hidden="true" />
          ) : line.state === "CLOSED" ? (
            <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger-600" aria-hidden="true" />
          ) : (
            <span className="mt-1 size-2.5 shrink-0 rounded-full border border-border-strong" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="font-medium text-text-primary">{line.label}</span>
            <span className="text-text-secondary">
              {" — "}
              {line.state === "SIGNED" && line.signedAt
                ? `signé le ${formatFrenchDate(line.signedAt)}`
                : line.state === "WAITING"
                  ? line.role === "COMPANY"
                    ? "à contresigner"
                    : "en attente de sa signature"
                  : line.state === "CLOSED"
                    ? "non signé"
                    : line.role === "COMPANY"
                      ? "après le premier signataire"
                      : "pas encore envoyé"}
            </span>
            <span className="block truncate text-[11.5px] text-text-tertiary" title={line.email}>
              {line.email}
            </span>
            {line.role === "COMPANY" && line.state === "WAITING" && companySigningUrl && (
              <a
                href={companySigningUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[12px] font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <PenLine className="size-3.5" aria-hidden="true" /> Contresigner
              </a>
            )}
            {line.role === "COMPANY" && line.state === "WAITING" && !companySigningUrl && (
              <span className="mt-0.5 block text-[11.5px] text-text-tertiary">Lien dans l&apos;e-mail du prestataire (ou « Actualiser »).</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
