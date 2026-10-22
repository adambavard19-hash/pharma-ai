import type { Metadata } from "next";
import { Dna, PageTitle } from "../_components/ui";
import { CabinetList } from "./cabinet-list";

export const metadata: Metadata = { title: "Mon armoire" };

/** Mon armoire à pharmacie : ce que j'ai chez moi, et ce qui périme bientôt. Rangée sur le téléphone, jamais envoyée. */
export default function CabinetPage() {
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="Ce que vous avez chez vous, et ce qui périme bientôt. Rangée sur ce téléphone seulement.">Mon armoire</PageTitle>
        <CabinetList />
      </div>
    </div>
  );
}
