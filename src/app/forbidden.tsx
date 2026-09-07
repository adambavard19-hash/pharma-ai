import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Accès réservé.
 *
 * Volontairement bref et sans jargon : la personne n'a rien fait de mal, elle
 * est simplement arrivée sur un écran qui n'est pas le sien. On lui dit à qui
 * il appartient et on la ramène à son travail.
 */
export default function Forbidden() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-sunken text-text-tertiary">
          <Lock className="size-5" />
        </span>
        <h1 className="text-[19px] font-semibold text-text-primary">Accès réservé</h1>
        <p className="text-[13.5px] leading-6 text-text-secondary">
          Cet écran est réservé au titulaire de l&apos;officine.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-5 text-[14px] font-medium text-white transition-colors hover:bg-brand-700"
        >
          Retour au comptoir
        </Link>
      </div>
    </div>
  );
}
