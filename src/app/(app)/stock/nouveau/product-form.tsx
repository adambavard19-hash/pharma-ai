"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Save, X } from "lucide-react";
import { saveProductAction } from "@/server/actions/products";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, VAT_RATES } from "@/config/catalog";
import { centsToInput } from "@/lib/format";
import type { ActionResult } from "@/server/actions/types";

type ProductInput = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  subCategory: string | null;
  reference: string;
  ean: string | null;
  imageUrl: string | null;
  description: string | null;
  commercialClaims: string[];
  precautions: string[];
  matchingTags: string[];
  contraindications: string[];
  purchasePriceCents: number;
  salePriceCents: number;
  vatRate: number;
  isActive: boolean;
  quantity: number;
  alertThreshold: number;
  location: string | null;
};

export function ProductForm({ product }: { product?: ProductInput }) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ productId: string }> | null,
    FormData
  >(saveProductAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/stock/${state.data.productId}`);
  }, [state, router]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [imageError, setImageError] = useState<string | null>(null);

  // La photo de la boîte, prise au téléphone ou choisie sur le poste : réduite
  // dans le navigateur à 480 px, encodée, envoyée avec le formulaire. Aucun
  // stockage externe, rien qui sorte de PharmaBoost.
  const onPhoto = (file: File | undefined) => {
    setImageError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setImageError("Choisissez une image (JPG, PNG, HEIC converti).");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const max = 480;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const context = canvas.getContext("2d");
        if (!context) return setImageError("Impossible de traiter l'image.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImageUrl(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => setImageError("Image illisible.");
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <form action={formAction} className="space-y-6">
      {product && <input type="hidden" name="id" value={product.id} />}

      {state?.ok === false && <Alert tone="danger">{state.error}</Alert>}

      <section className="space-y-4">
        <h2 className="text-[13px] font-semibold tracking-wide text-text-tertiary uppercase">
          Identification
        </h2>

        <Field label="Nom du produit" htmlFor="name" required error={fieldErrors.name}>
          <Input id="name" name="name" required defaultValue={product?.name} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marque" htmlFor="brand">
            <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} />
          </Field>
          <Field label="Sous-catégorie" htmlFor="subCategory">
            <Input
              id="subCategory"
              name="subCategory"
              defaultValue={product?.subCategory ?? ""}
              placeholder="Ferments lactiques, Photoprotection…"
            />
          </Field>
        </div>

        <Field label="Catégorie" htmlFor="category" required>
          <Select id="category" name="category" defaultValue={product?.category ?? "AUTRE"}>
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {PRODUCT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Référence interne"
            htmlFor="reference"
            error={fieldErrors.reference}
            hint={product ? undefined : "Laissez vide pour générer automatiquement."}
          >
            <Input
              id="reference"
              name="reference"
              defaultValue={product?.reference ?? ""}
              disabled={Boolean(product)}
            />
          </Field>
          <Field label="Code EAN" htmlFor="ean" hint="Utilisé pour la disponibilité inter-officines.">
            <Input id="ean" name="ean" defaultValue={product?.ean ?? ""} />
          </Field>
        </div>

        <Field
          label="Photo de la boîte"
          htmlFor="photo"
          hint="Affichée sur la carte du comptoir et sur le plan du patient. Prenez la boîte en photo, ou collez une URL."
          error={imageError ?? fieldErrors.imageUrl?.[0]}
        >
          <div className="flex flex-wrap items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="size-20 rounded-xl border border-border-subtle bg-white object-contain p-1" />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-xl border border-dashed border-border-default text-text-tertiary"><Camera className="size-6" /></span>
            )}
            <div className="flex flex-col gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-default px-3 py-2 text-[13.5px] font-medium text-text-primary hover:bg-surface-sunken">
                <Camera className="size-4" />
                {imageUrl ? "Changer la photo" : "Prendre ou choisir une photo"}
                <input id="photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => onPhoto(event.target.files?.[0])} />
              </label>
              {imageUrl && (
                <button type="button" onClick={() => setImageUrl("")} className="inline-flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-secondary">
                  <X className="size-3.5" /> Retirer
                </button>
              )}
            </div>
          </div>
          <input type="hidden" name="imageUrl" value={imageUrl} />
          {!imageUrl.startsWith("data:") && (
            <Input
              className="mt-2"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="ou une URL : https://…/boite.jpg"
              aria-label="URL de l'image"
            />
          )}
        </Field>

        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={product?.description ?? ""}
          />
        </Field>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-6">
        <div className="space-y-1">
          <h2 className="text-[13px] font-semibold tracking-wide text-text-tertiary uppercase">
            Conseil et sécurité
          </h2>
          <p className="text-[12.5px] text-text-secondary">
            Ces informations gouvernent ce que PharmaBoost peut proposer et écrire au patient.
            Une ligne par élément.
          </p>
        </div>

        <Field
          label="Allégations commerciales autorisées"
          htmlFor="commercialClaims"
          hint="Seules ces formulations peuvent apparaître sur la fiche patient. Elles engagent l'officine."
        >
          <Textarea
            id="commercialClaims"
            name="commercialClaims"
            rows={3}
            defaultValue={product?.commercialClaims.join("\n") ?? ""}
            placeholder="Contribue à l'équilibre de la flore intestinale"
          />
        </Field>

        <Field
          label="Étiquettes d'appariement"
          htmlFor="matchingTags"
          hint="Mots-clés permettant au moteur de rapprocher ce produit d'une opportunité de conseil."
        >
          <Textarea
            id="matchingTags"
            name="matchingTags"
            rows={3}
            defaultValue={product?.matchingTags.join("\n") ?? ""}
            placeholder="probiotique&#10;flore intestinale&#10;tolérance digestive"
          />
        </Field>

        <Field
          label="Précautions d'emploi"
          htmlFor="precautions"
          hint="Affichées au pharmacien lors de la validation, et au patient si pertinent."
        >
          <Textarea
            id="precautions"
            name="precautions"
            rows={2}
            defaultValue={product?.precautions.join("\n") ?? ""}
          />
        </Field>

        <Field
          label="Contre-indications"
          htmlFor="contraindications"
          hint="Écartent automatiquement ce produit. Mots reconnus : grossesse, allaitement, enfant, insuffisance rénale."
        >
          <Textarea
            id="contraindications"
            name="contraindications"
            rows={2}
            defaultValue={product?.contraindications.join("\n") ?? ""}
          />
        </Field>
      </section>

      <section className="space-y-4 border-t border-border-subtle pt-6">
        <h2 className="text-[13px] font-semibold tracking-wide text-text-tertiary uppercase">
          Prix et stock
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Prix d'achat HT" htmlFor="purchasePrice">
            <Input
              id="purchasePrice"
              name="purchasePrice"
              inputMode="decimal"
              defaultValue={product ? centsToInput(product.purchasePriceCents) : ""}
              placeholder="6,20"
            />
          </Field>
          <Field label="Prix de vente TTC" htmlFor="salePrice" error={fieldErrors.salePrice}>
            <Input
              id="salePrice"
              name="salePrice"
              inputMode="decimal"
              defaultValue={product ? centsToInput(product.salePriceCents) : ""}
              placeholder="14,90"
            />
          </Field>
          <Field label="TVA" htmlFor="vatRate">
            <Select id="vatRate" name="vatRate" defaultValue={String(product?.vatRate ?? 20)}>
              {VAT_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} %
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Quantité en stock"
            htmlFor="quantity"
            hint={product ? "Utilisez la fiche produit pour un mouvement tracé." : undefined}
          >
            <Input
              id="quantity"
              name="quantity"
              type="number"
              min={0}
              defaultValue={product?.quantity ?? 0}
              disabled={Boolean(product)}
            />
          </Field>
          <Field label="Seuil d'alerte" htmlFor="alertThreshold">
            <Input
              id="alertThreshold"
              name="alertThreshold"
              type="number"
              min={0}
              defaultValue={product?.alertThreshold ?? 5}
            />
          </Field>
          <Field label="Emplacement" htmlFor="location">
            <Input
              id="location"
              name="location"
              defaultValue={product?.location ?? ""}
              placeholder="Linéaire A2"
            />
          </Field>
        </div>

        {/* Le champ caché précède la case : décochée, seul "false" est envoyé ;
            cochée, "true" arrive ensuite et l'emporte à la lecture. */}
        <input type="hidden" name="isActive" value="false" />
        <Checkbox
          id="isActive"
          name="isActive"
          value="true"
          defaultChecked={product?.isActive ?? true}
          label="Produit actif"
          description="Un produit inactif n'est jamais proposé en conseil."
        />
      </section>

      <div className="flex justify-end border-t border-border-subtle pt-4">
        <Button type="submit" loading={pending} leadingIcon={<Save className="size-[18px]" />}>
          {product ? "Enregistrer les modifications" : "Créer le produit"}
        </Button>
      </div>
    </form>
  );
}
