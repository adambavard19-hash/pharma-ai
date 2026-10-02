"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/core/partners/status";

/** Le choix de la marque dont on affiche le catalogue ; l'adresse le garde (?marque=…). */
export function BrandPicker({
  brands,
  current,
  basePath,
  allLabel,
}: {
  brands: { id: string; name: string; partnerName: string; status: PublicationStatus; products?: number }[];
  current: string | null;
  basePath: string;
  /** Ajoute un choix « toutes les marques » (valeur vide). */
  allLabel?: string;
}) {
  const router = useRouter();
  return (
    <Select
      aria-label="Marque"
      value={current ?? ""}
      onChange={(event) => router.push(event.target.value ? `${basePath}?marque=${event.target.value}` : basePath)}
    >
      {allLabel && <option value="">{allLabel}</option>}
      {brands.map((brand) => (
        <option key={brand.id} value={brand.id}>
          {`${brand.partnerName} · ${brand.name} (${brand.products !== undefined ? `${brand.products} produit${brand.products > 1 ? "s" : ""}, ` : ""}${PUBLICATION_STATUS_LABELS[brand.status].toLowerCase()})`}
        </option>
      ))}
    </Select>
  );
}
