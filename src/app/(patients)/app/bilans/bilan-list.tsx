"use client";

import { useState, useSyncExternalStore } from "react";
import { CalendarClock, ChevronDown, QrCode, Trash2 } from "lucide-react";
import { readBilans, removeBilan, type SavedBilan } from "@/lib/patient-bilans";

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const subscribe = () => () => undefined;
const EMPTY: SavedBilan[] = [];

/** La liste des bilans gardés sur le téléphone : ouverts un par un, retirables. */
export function BilanList() {
  const stored = useSyncExternalStore(subscribe, () => JSON.stringify(readBilans()), () => "[]");
  const [removed, setRemoved] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const bilans = (stored === "[]" ? EMPTY : (JSON.parse(stored) as SavedBilan[])).filter((item) => !removed.includes(item.id));

  if (bilans.length === 0) {
    return (
      <div className="mt-4 rounded-[20px] bg-white p-5 text-center shadow-sm">
        <QrCode className="mx-auto size-8 text-[#0E8A7B]" aria-hidden="true" />
        <p className="mt-2 text-[14.5px] font-semibold text-[#0F2B26]">Aucun bilan pour l&apos;instant</p>
        <p className="mt-1 text-[13px] text-[#4B6A62]">À la pharmacie, scannez le QR code de votre bilan conseil : il arrive ici.</p>
      </div>
    );
  }
  return (
    <ul className="mt-4 space-y-3">
      {bilans.map((bilan) => {
        const expanded = open === bilan.id;
        return (
          <li key={bilan.id} className="rounded-[20px] bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setOpen(expanded ? null : bilan.id)} className="flex w-full items-center gap-3 text-left" aria-expanded={expanded}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[#0F2B26]">{bilan.content.pharmacy.name}</span>
                <span className="block text-[12.5px] text-[#4B6A62]">
                  {dayLabel(bilan.content.date)} · {bilan.content.products.length} conseil{bilan.content.products.length > 1 ? "s" : ""}
                </span>
              </span>
              <ChevronDown className={`size-5 text-[#4B6A62] transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {expanded && (
              <div className="mt-3 space-y-2 border-t border-[#E3EEEA] pt-3">
                {bilan.content.products.map((product) => (
                  <div key={product.name}>
                    <p className="text-[14px] font-semibold text-[#0F2B26]">{product.name}</p>
                    {product.reason && <p className="text-[13px] text-[#24423C]">{product.reason}</p>}
                    {product.posology && <p className="mt-0.5 text-[12.5px] text-[#4B6A62]">{product.posology}</p>}
                  </div>
                ))}
                {bilan.content.cures.map((cure) => (
                  <p key={cure.name} className="flex items-center gap-1.5 text-[12.5px] text-[#0E8A7B]">
                    <CalendarClock className="size-3.5" aria-hidden="true" /> Fin de cure bientôt : {cure.name}, le {dayLabel(cure.remindOn)}
                  </p>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    removeBilan(bilan.id);
                    setRemoved((list) => [...list, bilan.id]);
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-[#B42318]"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> Retirer de ce téléphone
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
