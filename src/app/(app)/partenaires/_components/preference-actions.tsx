"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, EyeOff, RotateCcw } from "lucide-react";
import { setPartnerPreferenceAction } from "@/server/actions/partners";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Choice = "HIDDEN" | "REFUSED" | null;

/**
 * Masquer, refuser ou rétablir une marque partenaire pour l'officine.
 * Réservé au titulaire : la page ne rend ce composant qu'avec PARTNERS_MANAGE,
 * et l'action le revérifie côté serveur.
 *
 * Masquée : absente du comptoir, toujours consultable au catalogue.
 * Refusée : absente partout, jusqu'à ce qu'on revienne sur ce choix.
 */
export function PreferenceActions({
  brandId,
  brandName,
  preference,
  layout = "inline",
}: {
  brandId: string;
  brandName: string;
  preference: Choice;
  layout?: "inline" | "stack";
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"HIDDEN" | "REFUSED" | "RESTORE" | null>(null);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();
  const { push } = useToast();

  const run = (choice: Choice, why: string | null = null) => {
    setBusy(choice ?? "RESTORE");
    start(async () => {
      const result = await setPartnerPreferenceAction({ brandId, choice, reason: why });
      setBusy(null);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "C'est fait.") : result.error });
      if (!result.ok) return;
      setRefusing(false);
      setReason("");
      router.refresh();
    });
  };

  const stack = layout === "stack";
  const width = stack ? "w-full justify-start" : undefined;

  return (
    <>
      <div className={stack ? "flex flex-col gap-1.5" : "flex flex-wrap items-center gap-1.5"}>
        {preference === null && (
          <Button size="sm" variant="ghost" className={width} leadingIcon={<EyeOff className="size-3.5" />} loading={pending && busy === "HIDDEN"} disabled={pending} onClick={() => run("HIDDEN")}>
            Masquer au comptoir
          </Button>
        )}
        {preference !== null && (
          <Button size="sm" variant="ghost" className={width} leadingIcon={<RotateCcw className="size-3.5" />} loading={pending && busy === "RESTORE"} disabled={pending} onClick={() => run(null)}>
            {preference === "REFUSED" ? "Revenir sur ce choix" : "Rétablir au comptoir"}
          </Button>
        )}
        {preference !== "REFUSED" && (
          <Button size="sm" variant="ghost" className={width} leadingIcon={<Ban className="size-3.5" />} disabled={pending} onClick={() => setRefusing(true)}>
            Refuser
          </Button>
        )}
      </div>

      <Modal
        open={refusing}
        onClose={() => (pending ? undefined : setRefusing(false))}
        size="sm"
        title={`Refuser ${brandName}`}
        description="La marque n'apparaîtra plus ni au comptoir ni dans les gammes partenaires. Vous pourrez revenir sur ce choix."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRefusing(false)} disabled={pending}>
              Annuler
            </Button>
            <Button variant="danger" loading={pending && busy === "REFUSED"} onClick={() => run("REFUSED", reason.trim() || null)}>
              Refuser la marque
            </Button>
          </>
        }
      >
        <Field label="Raison (facultatif)" htmlFor={`refus-${brandId}`} hint="Pour mémoire. 300 caractères au plus, sans information patient.">
          <Textarea id={`refus-${brandId}`} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Par exemple : gamme déjà référencée chez un autre fournisseur" />
        </Field>
      </Modal>
    </>
  );
}
