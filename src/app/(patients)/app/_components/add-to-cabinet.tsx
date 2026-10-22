"use client";

import { useState } from "react";
import { Check, Pill } from "lucide-react";
import { readCabinet, writeCabinet } from "./cabinet";
import { ACCENT, Card } from "./ui";

/** « Ajouter à mon armoire » depuis la fiche, avec le mois de péremption imprimé sur la boîte (rangé sur le téléphone seulement). */
export function AddToCabinet({ name, code }: { name: string; code: string | null }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <Card className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-[#0B6B5F]">
        <Check className="size-4" aria-hidden="true" /> Rangé dans votre armoire.
        <a href="/app/armoire" className="ml-auto font-bold" style={{ color: ACCENT }}>Voir</a>
      </Card>
    );
  }
  if (!open) {
    return (
      <button type="button" data-app-ajouter-armoire="" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[#D5E3DF] bg-white py-3 text-[14px] font-bold">
        <Pill className="size-4" style={{ color: ACCENT }} aria-hidden="true" /> Ajouter à mon armoire
      </button>
    );
  }
  return (
    <Card className="mt-3">
      <label htmlFor="armoire-mois" className="text-[13px] font-bold">Date de péremption (sur la boîte)</label>
      <input id="armoire-mois" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#E3ECE9] bg-[#F7FBFA] px-3 text-[14.5px]" />
      <button
        type="button"
        onClick={() => {
          writeCabinet([{ id: `${Date.now()}`, name, code, expiresOn: month || null, addedAt: new Date().toISOString() }, ...readCabinet()]);
          setDone(true);
        }}
        className="mt-2.5 h-11 w-full rounded-xl text-[14px] font-bold text-white"
        style={{ background: ACCENT }}
      >
        Ranger dans mon armoire
      </button>
      <p className="mt-2 text-[11.5px] leading-4 text-[#94A3A0]">Votre armoire reste sur ce téléphone : PharmaBoost ne la reçoit pas.</p>
    </Card>
  );
}
