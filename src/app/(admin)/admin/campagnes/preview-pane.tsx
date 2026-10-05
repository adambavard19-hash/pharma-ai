import { Alert } from "@/components/ui/feedback";

export type PreviewResult = { ok: true; subject: string; html: string } | { ok: false; error: string };

/**
 * Le message tel qu'il partirait, rendu par le serveur (même gabarit que
 * l'envoi) dans un cadre isolé : `sandbox=""` interdit tout script et tout
 * lien actif. Les valeurs propres au destinataire sont des exemples, et on le
 * dit ; le montant, la date de fin et les conditions sont ceux du brouillon.
 */
export function PreviewPane({ blockedReason, result }: { blockedReason: string | null; result: PreviewResult | null }) {
  return (
    <div className="min-w-0 space-y-2 lg:sticky lg:top-36 lg:self-start">
      <p className="text-[13px] font-medium text-text-primary">Aperçu du message</p>
      {blockedReason ? (
        <p className="flex min-h-40 items-center justify-center rounded-xl bg-surface-sunken px-5 py-8 text-center text-[13px] leading-5 text-text-tertiary">{blockedReason}</p>
      ) : !result ? (
        <p className="flex min-h-40 items-center justify-center rounded-xl bg-surface-sunken px-5 py-8 text-[13px] text-text-tertiary" role="status">
          Préparation de l&apos;aperçu…
        </p>
      ) : !result.ok ? (
        <Alert tone="danger" title="Aperçu indisponible">
          {result.error}
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <p className="truncate border-b border-border-subtle bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">
            <span className="text-text-tertiary">Objet :</span> {result.subject}
          </p>
          <iframe title="Aperçu du message" srcDoc={result.html} sandbox="" className="h-[480px] w-full bg-white" />
        </div>
      )}
      <p className="text-[12px] leading-4 text-text-tertiary">
        Valeurs d&apos;exemple : prénom, nom de l&apos;officine, code de parrainage et lien de désinscription sont fictifs. Le montant, la date de fin et les conditions de l&apos;offre sont ceux que vous avez saisis.
      </p>
    </div>
  );
}
