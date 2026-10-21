import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Pill } from "lucide-react";
import { searchPublicProducts } from "@/server/services/patient-app";
import { ACCENT, Card, PageTitle } from "../_components/ui";

export const metadata: Metadata = { title: "Recherche" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = typeof (await searchParams).q === "string" ? (await searchParams).q!.slice(0, 80) : "";
  const results = query.trim().length >= 3 ? await searchPublicProducts(query) : [];
  return (
    <div className="px-5 pt-4">
      <PageTitle sub={query ? `« ${query} »` : undefined}>Recherche</PageTitle>
      {results.length === 0 ? (
        <Card className="mt-4 text-[14px] text-[#4B6A62]">{query.trim().length < 3 ? "Tapez au moins trois lettres." : "Aucun médicament trouvé dans la base officielle."}</Card>
      ) : (
        <Card className="mt-4 divide-y divide-[#EEF3F1] p-0">
          {results.map((row) => (
            <Link key={row.id} href={`/app/fiche?id=${row.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#E8F3EF]"><Pill className="size-4" style={{ color: ACCENT }} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1 text-[14px] font-semibold">{row.name}</span>
              <ChevronRight className="size-4 shrink-0 text-[#94A3A0]" aria-hidden="true" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
