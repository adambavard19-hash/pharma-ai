"use client";

import { useState, useTransition } from "react";
import { adminCreatePostPairingAction } from "@/server/actions/admin-connection";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

/**
 * L'installation d'un comptoir par un code à six chiffres, avec l'archive du programme, quand l'installateur à
 * double-clic ne peut pas servir. Elle ajoute un comptoir « à installer » de plus : à n'utiliser que quand l'assistance
 * en a besoin. Le code n'existe qu'à l'écran, une fois.
 */
export function AssistancePairingCode({ pharmacyId }: { pharmacyId: string }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();
  return (
    <div className="space-y-2 text-[13px] leading-5 text-text-secondary">
      <p>Installation par code : un comptoir de plus, installé avec l&apos;archive du programme et un code à six chiffres.</p>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await adminCreatePostPairingAction({ pharmacyId });
            if (!result.ok) return push({ tone: "error", title: result.error });
            setCode(result.data);
          })
        }
      >
        Générer un code à six chiffres
      </Button>
      {code && (
        <div className="space-y-1.5">
          <p className="text-center text-[30px] font-semibold tracking-[0.3em] text-brand-700 tabular dark:text-brand-400">{code.code}</p>
          <p>
            Valable jusqu&apos;au {formatDateTime(new Date(code.expiresAt))}. Archive : <a href="/api/agent/telecharger" className="font-medium text-brand-700 underline dark:text-brand-400">PharmaBoost Connect</a>, à décompresser, puis dans le dossier :
          </p>
          <pre className="overflow-x-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[12px] text-white">{`powershell -ExecutionPolicy Bypass -File .\\install-poste-windows.ps1 -Code ${code.code}`}</pre>
        </div>
      )}
    </div>
  );
}
