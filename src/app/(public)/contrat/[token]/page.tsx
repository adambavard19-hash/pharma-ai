import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContractByToken } from "@/server/services/sales/contracts";
import { CONTRACT_STATUS_LABELS, type ContractStatusCode } from "@/core/sales/pipeline";
import { formatCents, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: { absolute: "Votre contrat PharmaBoost" }, robots: { index: false, follow: false, nocache: true } };

/**
 * Le contrat vu par le titulaire, depuis le lien reçu par e-mail. Jeton long
 * et aléatoire, daté ; aucun compte demandé. La page affiche le PDF et l'état ;
 * la signature électronique, quand un prestataire est branché, se fait chez lui.
 */
export default async function ContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contract = await getContractByToken(token);
  if (!contract) notFound();
  const status = contract.status as ContractStatusCode;
  return (
    <div className="min-h-dvh bg-[#eef1f4] py-6">
      <div className="mx-auto max-w-[860px] space-y-4 px-4">
        <header className="rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-[12px] font-bold tracking-[0.1em] text-[#0F766E] uppercase">PharmaBoost</p>
          <h1 className="mt-1 text-[24px] leading-8 font-bold text-[#111827]">Contrat d&apos;abonnement — {contract.prospect.name}</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#374151]">
            Version {contract.version} · {formatCents(contract.monthlyPriceCents)} HT par mois · {contract.durationMonths} mois · statut : <strong>{CONTRACT_STATUS_LABELS[status]}</strong>
            {contract.expiresAt && !contract.finalizedAt ? ` · lien valable jusqu'au ${formatDate(contract.expiresAt)}` : ""}
          </p>
          <p className="mt-2 text-[14px] leading-6 text-[#4b5563]">
            Votre interlocuteur : {contract.prospect.salesRep.firstName} {contract.prospect.salesRep.lastName} — {contract.prospect.salesRep.email}{contract.prospect.salesRep.phone ? ` — ${contract.prospect.salesRep.phone}` : ""}
          </p>
          {status !== "FINALIZED" && contract.signatureProvider === "none" && (
            <p className="mt-3 rounded-lg bg-[#fff7ed] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#9a3412]">La signature électronique vous sera proposée dans un second temps. D&apos;ici là, lisez le contrat et contactez votre interlocuteur pour toute question.</p>
          )}
          <a href={`/api/contrats/${token}`} className="mt-4 inline-flex rounded-xl bg-[#0F766E] px-5 py-3 text-[15px] font-semibold text-white">Télécharger le PDF</a>
        </header>
        <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
          <iframe title="Contrat" src={`/api/contrats/${token}#toolbar=0`} className="h-[80vh] w-full" />
        </div>
      </div>
    </div>
  );
}
