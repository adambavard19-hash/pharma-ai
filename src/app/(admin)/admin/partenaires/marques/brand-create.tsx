"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createPartnerBrandAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";
import { BrandFields, brandPayloadOf, EMPTY_BRAND, type BrandFormValues } from "./_components/brand-fields";

/** Nouvelle marque d'un partenaire, créée en brouillon : elle n'est vue par aucune officine avant publication. */
export function CreateBrandButton({ partners }: { partners: { id: string; name: string; status: PublicationStatus }[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [values, setValues] = useState<BrandFormValues>(EMPTY_BRAND);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setError(null);
    setFieldErrors({});
  };

  const submit = () => {
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await createPartnerBrandAction({ partnerId, ...brandPayloadOf(values) });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Marque créée." });
      setValues(EMPTY_BRAND);
      setPartnerId("");
      close();
      router.push(`/admin/partenaires/marques/${result.data.id}`);
    });
  };

  return (
    <>
      <Button leadingIcon={<Plus className="size-4" />} onClick={() => setOpen(true)} disabled={partners.length === 0} title={partners.length === 0 ? "Créez d'abord un partenaire" : undefined}>
        Nouvelle marque
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Nouvelle marque"
        description="Créée en brouillon : aucune officine ne la voit avant sa publication."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Annuler
            </Button>
            <Button loading={pending} onClick={submit}>
              Créer la marque
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Partenaire" htmlFor="brand-partner" required error={fieldErrors.partnerId}>
            <Select id="brand-partner" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
              <option value="">Choisir…</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name} · {PUBLICATION_STATUS_LABELS[partner.status]}
                </option>
              ))}
            </Select>
          </Field>
          <BrandFields values={values} onChange={setValues} errors={fieldErrors} />
        </div>
      </Modal>
    </>
  );
}
