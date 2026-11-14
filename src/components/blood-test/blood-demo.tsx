"use client";

import { useMemo, useState } from "react";
import { FileText, UserRound } from "lucide-react";
import { validateBloodReading, type ClaimedBloodResult } from "@/core/blood-test/reading";
import { proposeForBloodTest, type BloodProduct } from "@/core/blood-test/propose";
import { BloodExplained } from "./blood-steps";

/**
 * Démonstration de la prise de sang expliquée (fondateur, 14 nov. 2026) : le site et la présentation de Donna montrent
 * la VRAIE carte du corps et les VRAIES jauges, nourries par le vrai moteur (lecture, puis règles de conseil), sur de
 * fausses prises de sang. Rien n'est envoyé ni lu par l'IA : tout est calculé dans le navigateur. Les produits sont des
 * libellés génériques sans marque ni prix.
 */

type Row = Omit<ClaimedBloodResult, "marker" | "labFlag" | "quote"> & { marker?: string };

const r = (analysisId: string, label: string, value: number, unit: string, refLow: number | null, refHigh: number | null, marker = "AUTRE"): Row => ({ analysisId, label, value, unit, refLow, refHigh, marker });

const PROFILES: { key: string; name: string; who: string; rows: Row[] }[] = [
  {
    key: "fatigue",
    name: "Fatigue de l'hiver",
    who: "Femme, 34 ans",
    rows: [
      r("vitd", "25-OH vitamine D", 17, "ng/mL", 30, 100, "VITAMIN_D"),
      r("ferritine", "Ferritine", 13, "µg/L", 15, 150, "FERRITIN"),
      r("b12", "Vitamine B12", 180, "pg/mL", 200, 900, "B12"),
      r("hb", "Hémoglobine", 12.4, "g/dL", 12, 16),
      r("gr", "Hématies", 4.3, "T/L", 3.9, 5.2),
      r("gb", "Leucocytes", 6.1, "G/L", 4, 10),
      r("plaquettes", "Plaquettes", 254, "G/L", 150, 400),
      r("mg", "Magnésium", 0.79, "mmol/L", 0.75, 1, "MAGNESIUM"),
      r("tsh", "TSH", 2.1, "mUI/L", 0.4, 4),
      r("gly", "Glycémie à jeun", 0.86, "g/L", 0.7, 1.1),
      r("alat", "ALAT", 21, "UI/L", null, 35),
      r("creat", "Créatinine", 68, "µmol/L", 45, 90),
      r("dfg", "DFG (CKD-EPI)", 104, "mL/min", 90, null),
      r("ldl", "LDL cholestérol", 1.21, "g/L", null, 1.6),
      r("calcium", "Calcémie", 2.36, "mmol/L", 2.2, 2.6),
    ],
  },
  {
    key: "bilan",
    name: "Bilan annuel",
    who: "Homme, 58 ans",
    rows: [
      r("ldl", "LDL cholestérol", 1.85, "g/L", null, 1.6),
      r("hdl", "HDL cholestérol", 0.47, "g/L", 0.4, null),
      r("cholesterol", "Cholestérol total", 2.38, "g/L", null, 2.4),
      r("tg", "Triglycérides", 1.72, "g/L", null, 1.5),
      r("gly", "Glycémie à jeun", 1.04, "g/L", 0.7, 1.1),
      r("hba1c", "HbA1c", 5.8, "%", 4, 6),
      r("vitd", "25-OH vitamine D", 24, "ng/mL", 30, 100, "VITAMIN_D"),
      r("alat", "ALAT", 31, "UI/L", null, 45),
      r("asat", "ASAT", 27, "UI/L", null, 35),
      r("ggt", "Gamma GT", 49, "UI/L", null, 55),
      r("creat", "Créatinine", 94, "µmol/L", 60, 110),
      r("dfg", "DFG (CKD-EPI)", 81, "mL/min", 60, null),
      r("acide-urique", "Acide urique", 64, "mg/L", 35, 70),
      r("tsh", "TSH", 1.6, "mUI/L", 0.4, 4),
      r("hb", "Hémoglobine", 15.1, "g/dL", 13, 17),
      r("mg", "Magnésium", 0.84, "mmol/L", 0.75, 1, "MAGNESIUM"),
      r("AUTRE", "Vitesse de sédimentation", 12, "mm", null, 20),
    ],
  },
  {
    key: "ok",
    name: "Tout va bien",
    who: "Femme, 27 ans",
    rows: [
      r("vitd", "25-OH vitamine D", 38, "ng/mL", 30, 100, "VITAMIN_D"),
      r("ferritine", "Ferritine", 62, "µg/L", 15, 150, "FERRITIN"),
      r("hb", "Hémoglobine", 13.6, "g/dL", 12, 16),
      r("gb", "Leucocytes", 7.2, "G/L", 4, 10),
      r("tsh", "TSH", 1.4, "mUI/L", 0.4, 4),
      r("gly", "Glycémie à jeun", 0.82, "g/L", 0.7, 1.1),
      r("creat", "Créatinine", 61, "µmol/L", 45, 90),
      r("ldl", "LDL cholestérol", 1.02, "g/L", null, 1.6),
      r("calcium", "Calcémie", 2.4, "mmol/L", 2.2, 2.6),
    ],
  },
];

/** Un petit rayon générique : chaque règle de conseil y trouve sa référence, sans marque ni prix. */
const SHELF: BloodProduct[] = [
  "Vitamine D3 1000 UI, gouttes",
  "Vitamine D3 en ampoule mensuelle",
  "Bisglycinate de fer et vitamine C",
  "Vitamine B12, comprimés à sucer",
  "Magnésium marin et vitamine B6",
  "Zinc et sélénium",
  "Acide folique 0,4 mg",
].map((name, i) => ({ id: `demo-${i}`, name, imageUrl: null, salePriceCents: 0, stockQuantity: 12, prescriptionConditions: [], isActive: true }));

export function BloodDemo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const [profileKey, setProfileKey] = useState(PROFILES[0].key);
  const profile = PROFILES.find((p) => p.key === profileKey) ?? PROFILES[0];

  const { analyses, proposals } = useMemo(() => {
    const reading = validateBloodReading({ isBloodTest: true, results: profile.rows.map((row) => ({ marker: "AUTRE", labFlag: null, quote: row.label, ...row })) });
    if (!reading.ok) return { analyses: [], proposals: [] };
    return { analyses: reading.analyses, proposals: proposeForBloodTest({ findings: reading.findings, validatedRuleKeys: new Set(), products: SHELF, includeUnvalidated: true }) };
  }, [profile]);

  return (
    <div data-int="" style={compact ? { zoom: 0.94 } : undefined} className={`rounded-[28px] border border-[#DCE8E4] bg-white p-3 shadow-[0_30px_60px_-30px_rgba(15,47,42,.35)] sm:p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-[#0E8A7B] uppercase"><FileText className="size-3.5" aria-hidden /> Exemple · fausse prise de sang</p>
        <p className="flex items-center gap-1 text-[12px] font-semibold text-[#7C918C]"><UserRound className="size-3.5" aria-hidden />{profile.who}</p>
      </div>

      <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Choisir une prise de sang">
        {PROFILES.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={p.key === profile.key} onClick={() => setProfileKey(p.key)} className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors ${p.key === profile.key ? "bg-[#0F2F2A] text-white" : "bg-[#F1F5F4] text-[#4B6A62] hover:bg-[#E3ECE9]"}`}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-2 px-0.5">
        <BloodExplained key={profile.key} analyses={analyses} proposals={proposals} audience="counter" />
      </div>
      {!compact && <p className="mt-3 text-center text-[11.5px] leading-4 text-[#94A3A0]">Données fictives. Une explication générale, jamais un diagnostic : le pharmacien décide.</p>}
    </div>
  );
}
