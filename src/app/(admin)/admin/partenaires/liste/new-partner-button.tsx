"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createPartnerAction } from "@/server/actions/platform-partners";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { UniversePicker } from "./_components/universe-picker";

/**
 * Création manuelle d'un partenaire, sans candidature. Il naît en brouillon :
 * invisible des officines jusqu'à une publication explicite depuis sa fiche.
 */
export function NewPartnerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button leadingIcon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
        Nouveau partenaire
      </Button>
      {open && <NewPartnerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewPartnerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [website, setWebsite] = useState("");
  const [universes, setUniverses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await createPartnerAction({ name, legalName, website, universes });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Partenaire créé." });
      onClose();
      router.push(`/admin/partenaires/liste/${result.data.id}`);
    });

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau partenaire"
      description="Il est créé en brouillon : aucune officine ne le voit avant sa publication."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} disabled={name.trim().length < 2} onClick={submit}>
            Créer en brouillon
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2) submit();
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nom affiché" htmlFor="np-name" required error={fieldErrors.name}>
            <Input id="np-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Raison sociale" htmlFor="np-legal" error={fieldErrors.legalName}>
            <Input id="np-legal" value={legalName} onChange={(event) => setLegalName(event.target.value)} maxLength={200} autoComplete="off" />
          </Field>
        </div>
        <Field label="Site" htmlFor="np-website" error={fieldErrors.website}>
          <Input id="np-website" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" inputMode="url" autoComplete="off" />
        </Field>
        <Field label="Univers">
          <UniversePicker idPrefix="np-universe" value={universes} onChange={setUniverses} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
