import type { Metadata } from "next";
import { NewProspectForm } from "./form";

export const metadata: Metadata = { title: { absolute: "Nouvelle pharmacie — PharmaBoost" } };

export default function NewProspectPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div><h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Nouvelle pharmacie</h1><p className="text-[13.5px] text-text-secondary">Le nom suffit pour commencer. Le reste se complète au fil des échanges.</p></div>
      <NewProspectForm />
    </div>
  );
}
