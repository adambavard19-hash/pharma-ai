"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ScanLine, Trash2 } from "lucide-react";
import { expiryState, monthLabel, readCabinet, writeCabinet, type CabinetItem } from "../_components/cabinet";
import { Card, GRAD } from "../_components/ui";

const TONE = {
  expired: { label: "Périmé : rapportez-le en pharmacie", color: "#B42318", bg: "#FDECEA" },
  soon: { label: "Périme dans le mois", color: "#8A5300", bg: "#FFF4E5" },
  ok: { label: "", color: "#0B6B5F", bg: "#E8F3EF" },
  unknown: { label: "Date de péremption non indiquée", color: "#94A3A0", bg: "#F1F5F4" },
} as const;

/** La liste de l'armoire : les boîtes périmées et celles qui périment dans le mois d'abord. */
export function CabinetList() {
  const [items, setItems] = useState<CabinetItem[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage du téléphone, une fois au montage
    setItems(readCabinet());
  }, []);
  if (items === null) return null;
  const now = new Date();
  const rank = { expired: 0, soon: 1, unknown: 2, ok: 3 };
  const sorted = [...items].sort((a, b) => rank[expiryState(a.expiresOn, now)] - rank[expiryState(b.expiresOn, now)] || (a.expiresOn ?? "9").localeCompare(b.expiresOn ?? "9"));
  const remove = (id: string) => {
    const next = items.filter((item) => item.id !== id);
    writeCabinet(next);
    setItems(next);
  };
  return (
    <>
      {sorted.length === 0 ? (
        <Card className="mt-5 text-center text-[14px] leading-6 text-[#4B6A62]">Votre armoire est vide. Scannez une boîte, puis « Ajouter à mon armoire ».</Card>
      ) : (
        <div className="mt-5 space-y-2.5">
          {sorted.map((item) => {
            const state = expiryState(item.expiresOn, now);
            const tone = TONE[state];
            return (
              <Card key={item.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{item.name}</p>
                  <p className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-bold" style={{ color: tone.color, background: tone.bg }}>
                    {state === "ok" && item.expiresOn ? `Jusqu'à ${monthLabel(item.expiresOn)}` : state === "soon" && item.expiresOn ? `${tone.label} (${monthLabel(item.expiresOn)})` : tone.label}
                  </p>
                </div>
                <button type="button" aria-label={`Retirer ${item.name}`} onClick={() => remove(item.id)} className="grid size-9 place-items-center rounded-xl bg-[#F1F5F4] text-[#94A3A0]">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </Card>
            );
          })}
        </div>
      )}
      <Link href="/app/scanner" className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white" style={{ background: GRAD }}>
        <ScanLine className="size-5" aria-hidden="true" /> Scanner une boîte
      </Link>
    </>
  );
}
