"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { depositForPharmacyAction } from "@/server/actions/admin-stock-deposits";
import { DEPOSIT_ACCEPTED_LABEL, DEPOSIT_MAX_BYTES } from "@/core/stock-deposit/rules";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { SEND_FAILED_MESSAGE, formatFileSize } from "./status";

/** Les extensions que le service accepte (voir `DEPOSIT_ACCEPTED`) : le sélecteur de fichier les propose d'abord. */
const ACCEPT = ".csv,.txt,.xlsx,.xls,.pdf";

/**
 * « Déposer son stock » : le titulaire a envoyé son fichier par mail ou
 * WhatsApp, l'équipe le dépose à sa place. Un bouton, puis un petit formulaire
 * sous la ligne de l'officine : un fichier, « Envoyer ». Le stock se met à
 * jour tout seul à la réception ; seul un fichier bien plus petit que le stock
 * connu attend la décision de l'équipe (il le dit alors clairement).
 *
 * À placer dans une ligne qui peut passer à la ligne (flex-wrap) : le
 * formulaire ouvert prend toute la largeur.
 *
 * Le clavier suit : à l'ouverture le focus va au champ fichier (le bouton
 * disparaît), à la fermeture il revient au bouton. Une coupure pendant
 * l'envoi s'affiche dans le formulaire au lieu de faire tomber la page.
 */
export function DepositForPharmacy({ pharmacyId, pharmacyName }: { pharmacyId: string; pharmacyName: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Vrai une fois le formulaire refermé : le bouton qui revient reprend alors le focus (jamais au chargement de la page).
  const [refocusButton, setRefocusButton] = useState(false);
  const [pending, start] = useTransition();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setFile(null);
    setError(null);
    setRefocusButton(true);
  };

  const submit = () => {
    if (!file) {
      setError("Choisissez d'abord le fichier.");
      return;
    }
    if (file.size > DEPOSIT_MAX_BYTES) {
      setError(`Ce fichier fait ${formatFileSize(file.size)} : le maximum est ${formatFileSize(DEPOSIT_MAX_BYTES)}.`);
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("pharmacyId", pharmacyId);
    formData.set("file", file);
    start(async () => {
      let result: Awaited<ReturnType<typeof depositForPharmacyAction>>;
      try {
        result = await depositForPharmacyAction(formData);
      } catch {
        // Coupure réseau, délai dépassé : sans cela l'exception remonterait jusqu'à la frontière d'erreur et la page entière tomberait.
        setError(SEND_FAILED_MESSAGE);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const deposit = result.data;
      // La liste « Fichiers reçus » et la ligne de l'officine changent dans tous les cas : on les relit.
      router.refresh();
      if (deposit.status === "FAILED") {
        setError(deposit.message ?? "Le fichier n'a pas pu être lu : le stock n'a pas changé.");
        return;
      }
      // Le message vient de l'action : il dit si le stock est à jour ou si le fichier attend l'équipe.
      push({ tone: deposit.status === "HELD" ? "warning" : "success", title: result.message ?? (deposit.status === "HELD" ? `Fichier de ${pharmacyName} reçu, pas encore appliqué` : `Stock de ${pharmacyName} mis à jour`) });
      setOpen(false);
      setFile(null);
      setRefocusButton(true);
    });
  };

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" leadingIcon={<Upload className="size-3.5" />} autoFocus={refocusButton} onClick={() => setOpen(true)}>
        Déposer son stock
      </Button>
    );
  }

  const inputId = `depot-${pharmacyId}`;
  return (
    <form
      className="w-full space-y-3 rounded-xl border border-border-subtle bg-surface-sunken/50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="space-y-1">
        <p className="text-[13.5px] font-semibold text-text-primary">Déposer le stock de {pharmacyName}</p>
        <p className="text-[12.5px] leading-5 text-text-secondary">
          Le fichier que le titulaire vous a envoyé : {DEPOSIT_ACCEPTED_LABEL}, {formatFileSize(DEPOSIT_MAX_BYTES)} au plus. Le stock se met à jour tout de suite, sans autre clic. Le fichier doit contenir le stock COMPLET, pas seulement les nouveautés.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-default bg-surface-card px-3 text-[13px] font-medium text-text-primary shadow-xs transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500 hover:bg-surface-sunken">
          {file ? "Changer de fichier" : "Choisir le fichier"}
          <input id={inputId} name="file" type="file" accept={ACCEPT} className="sr-only" autoFocus disabled={pending} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <span className="min-w-0 text-[13px] break-all text-text-secondary">{file ? `${file.name} (${formatFileSize(file.size)})` : "Aucun fichier choisi"}</span>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {pending && (
        <p className="text-[12.5px] text-text-secondary" role="status">
          Lecture du fichier… ça peut prendre jusqu&apos;à une minute.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending} disabled={!file}>
          Envoyer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={close} disabled={pending}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
