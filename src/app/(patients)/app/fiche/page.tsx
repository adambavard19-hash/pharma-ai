import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, ShoppingBag, Store } from "lucide-react";
import { adviceForSpecialty, lookupProductByCode, lookupSpecialty } from "@/server/services/patient-app";
import type { DrugSheet, ParaSheet, PatientAdvice } from "@/core/patient-app/sheet";
import { ACCENT, Card, Dna, GRAD, NotAdvice, SectionTitle } from "../_components/ui";
import { AddToCabinet } from "../_components/add-to-cabinet";

export const metadata: Metadata = { title: "Fiche" };

/**
 * La fiche d'une boîte : seulement ce que les sources publiées disent (src/core/patient-app/sheet.ts), puis les conseils de
 * parapharmacie (jamais un médicament). Rien n'est enregistré.
 */
export default async function FichePage({ searchParams }: { searchParams: Promise<{ code?: string; id?: string }> }) {
  const params = await searchParams;
  let sheet: DrugSheet | ParaSheet | null = null;
  let specialtyId: string | null = null;
  if (typeof params.id === "string" && params.id.length < 40) {
    sheet = await lookupSpecialty(params.id);
    specialtyId = sheet ? params.id : null;
  } else if (typeof params.code === "string" && params.code.length < 120) {
    const result = await lookupProductByCode(params.code);
    if (result.found) {
      sheet = result.sheet;
      specialtyId = result.specialtyId;
    }
  }
  const advice = specialtyId ? await adviceForSpecialty(specialtyId) : [];

  return (
    <div className="relative">
      <div className="relative px-5 pt-3 pb-5" style={{ background: "linear-gradient(180deg,#DDF1EB,#F3F8F6)" }}>
        <Dna className="opacity-30" />
        <div className="relative">
          <Link href="/app/scanner" className="flex items-center gap-1 text-[14px] font-semibold">
            <ArrowLeft className="size-4" aria-hidden="true" /> Scanner
          </Link>
          {!sheet ? (
            <div className="mt-6">
              <h1 className="text-[24px] leading-[1.15] font-extrabold tracking-[-0.03em]">Produit introuvable</h1>
              <p className="mt-2 text-[14.5px] leading-6 text-[#4B6A62]">Ce code n&apos;est pas dans la base officielle des médicaments ni dans les produits connus de PharmaBoost. Essayez avec son nom.</p>
              <Link href="/app/scanner#saisie" className="mt-4 inline-flex h-11 items-center rounded-full px-5 text-[14px] font-bold text-white" style={{ background: GRAD }}>Chercher par le nom</Link>
            </div>
          ) : sheet.kind === "MEDICINE" ? (
            <>
              <p className="mt-4">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold" style={{ color: ACCENT }}>
                  Médicament · {sheet.delivery === "PRESCRIPTION" ? "sur ordonnance" : "sans ordonnance"}
                </span>
              </p>
              <h1 className="mt-2 text-[24px] leading-[1.15] font-extrabold tracking-[-0.03em]">{sheet.name}</h1>
              {sheet.subtitle && <p className="mt-0.5 text-[13px] text-[#4B6A62]">{sheet.subtitle}</p>}
              {sheet.reimbursement && <p className="mt-1 text-[12.5px] font-semibold" style={{ color: ACCENT }}>{sheet.reimbursement}</p>}
            </>
          ) : (
            <>
              <p className="mt-4">
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold" style={{ color: ACCENT }}>Produit de parapharmacie</span>
              </p>
              <h1 className="mt-2 text-[24px] leading-[1.15] font-extrabold tracking-[-0.03em]">{sheet.name}</h1>
              {sheet.brand && <p className="mt-0.5 text-[13px] text-[#4B6A62]">{sheet.brand}</p>}
            </>
          )}
        </div>
      </div>

      {sheet?.kind === "MEDICINE" && (
        <div className="px-5">
          {sheet.sections.map((section) => (
            <Card key={section.key} className="mt-3">
              <h2 className="text-[13px] font-extrabold">{section.title}</h2>
              <ul className="mt-1.5 space-y-1 text-[14.5px] leading-6 text-[#23413B]">
                {section.lines.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <p className="mt-2 text-[11px] text-[#94A3A0]">Source : {section.source}</p>
            </Card>
          ))}
          {sheet.deliveryDetail.length > 0 && (
            <Card className="mt-3">
              <h2 className="text-[13px] font-extrabold">Conditions de délivrance</h2>
              <ul className="mt-1.5 space-y-1 text-[14px] leading-6 text-[#23413B]">{sheet.deliveryDetail.map((line) => <li key={line}>{line}</li>)}</ul>
              <p className="mt-2 text-[11px] text-[#94A3A0]">Source : Base de données publique des médicaments</p>
            </Card>
          )}
          <a href={sheet.sourceUrl} target="_blank" rel="noopener" className="mt-3 flex items-center justify-center gap-2 rounded-full border border-[#D5E3DF] bg-white py-3 text-[14px] font-bold">
            Notice et fiche officielles <ExternalLink className="size-4" aria-hidden="true" />
          </a>
          <AddToCabinet name={sheet.name} code={typeof params.code === "string" ? params.code.slice(0, 40) : null} />
          <Advice advice={advice} />
          <NotAdvice />
        </div>
      )}
      {sheet?.kind === "PARA" && (
        <div className="px-5">
          <Card className="mt-3 text-[14px] leading-6 text-[#23413B]">Demandez conseil à votre pharmacien pour savoir si ce produit vous convient.</Card>
          <AddToCabinet name={sheet.name} code={typeof params.code === "string" ? params.code.slice(0, 40) : null} />
          <FindButtons />
          <NotAdvice />
        </div>
      )}
    </div>
  );
}

function FindButtons() {
  return (
    <>
      <Link href="/app/pharmacies" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold text-white" style={{ background: GRAD }}>
        <Store className="size-4" aria-hidden="true" /> Le trouver en pharmacie
      </Link>
      {/* L'achat en ligne suivi (rémunération partenaire) n'est pas encore branché : le bouton est là, inactif. */}
      <button type="button" disabled title="Bientôt disponible" className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#D5E3DF] text-[14px] font-bold text-[#94A3A0]">
        <ShoppingBag className="size-4" aria-hidden="true" /> Acheter en ligne · bientôt
      </button>
    </>
  );
}

function Advice({ advice }: { advice: PatientAdvice[] }) {
  if (advice.length === 0) return null;
  return (
    <>
      <SectionTitle>Le conseil qui l&apos;accompagne</SectionTitle>
      {advice.map((item) => (
        <Card key={item.title} className="mt-2.5">
          <p className="text-[15px] font-bold">{item.title}</p>
          {item.reason && <p className="mt-0.5 text-[13px] leading-5 text-[#4B6A62]">{item.reason}</p>}
          {item.products.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {item.products.map((product) => (
                <li key={product.id} className="flex items-center gap-3 rounded-2xl bg-[#F3F8F6] p-2.5">
                  <span className="size-12 shrink-0 rounded-xl bg-white bg-contain bg-center bg-no-repeat" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{product.name}</span>
                    {product.brand && <span className="block text-[12px] text-[#64748B]">{product.brand}</span>}
                  </span>
                  {product.partner && <span className="rounded-full bg-[#F1E8FF] px-2 py-0.5 text-[10px] font-bold text-[#6D28D9] uppercase">Partenaire</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-[#23413B]">Demandez à votre pharmacien le produit adapté.</p>
          )}
        </Card>
      ))}
      <FindButtons />
    </>
  );
}
