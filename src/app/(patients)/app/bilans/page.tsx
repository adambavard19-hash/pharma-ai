import type { Metadata } from "next";
import { Dna, PageTitle } from "../_components/ui";
import { BilanList } from "./bilan-list";

export const metadata: Metadata = { title: "Mes bilans" };

/** Mes bilans conseil, scannés au comptoir (fondateur, 5 nov. 2026) : gardés sur ce téléphone seulement, jamais envoyés. */
export default function BilansPage() {
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="Les conseils de votre pharmacien, scannés au comptoir. Gardés sur ce téléphone seulement.">Mes bilans</PageTitle>
        <BilanList />
      </div>
    </div>
  );
}
