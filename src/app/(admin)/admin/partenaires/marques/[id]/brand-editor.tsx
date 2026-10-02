"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { updatePartnerBrandAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { BrandFields, brandPayloadOf, type BrandFormValues } from "../_components/brand-fields";

export function BrandEditorCard({
  brandId,
  partnerName,
  initial,
}: {
  brandId: string;
  partnerName: string;
  initial: { name: string; slug: string; brandKey: string; logoUrl: string | null; description: string | null; universes: string[] };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [values, setValues] = useState<BrandFormValues>({
    name: initial.name,
    slug: initial.slug,
    slugTouched: true,
    brandKey: initial.brandKey,
    brandKeyTouched: true,
    logoUrl: initial.logoUrl ?? "",
    description: initial.description ?? "",
    universes: initial.universes,
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await updatePartnerBrandAction({ id: brandId, ...brandPayloadOf(values) });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré." });
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader title="Fiche marque" description={`Partenaire : ${partnerName}. Le rattachement au partenaire ne change pas après la création (commandes et offres y renvoient).`} />
      <CardContent className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <BrandFields values={values} onChange={setValues} errors={fieldErrors} />
        <div className="flex justify-end">
          <Button loading={pending} leadingIcon={<Save className="size-4" />} onClick={submit}>
            Enregistrer la fiche
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
