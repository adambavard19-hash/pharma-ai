"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, MapPin, Search } from "lucide-react";
import { chooseHomePharmacyAction, declareOutsidePharmacyAction } from "@/server/actions/app-members";
import { ACCENT, Card, GRAD } from "../_components/ui";

type Choice = { id: string; name: string; city: string };

/**
 * Ma pharmacie : une pharmacie PharmaBoost (ses offres arrivent dans l'appli), ou « elle n'est pas dans la liste » — le nom,
 * la ville, et « je veux qu'elle rejoigne PharmaBoost ». Ces demandes arrivent, regroupées, dans la console de PharmaBoost.
 */
export function PharmacyPicker({
  current,
  declared,
  pharmacies,
}: {
  current: { id: string; name: string; city: string | null } | null;
  declared: { pharmacyName: string; city: string; postalCode: string; wantsJoin: boolean } | null;
  pharmacies: Choice[];
}) {
  const [editing, setEditing] = useState(!current && !declared);
  const [outside, setOutside] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ pharmacyName: declared?.pharmacyName ?? "", city: declared?.city ?? "", postalCode: declared?.postalCode ?? "", wantsJoin: declared?.wantsJoin ?? true });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const found = useMemo(() => {
    const q = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const list = q ? pharmacies.filter((p) => `${p.name} ${p.city}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)) : pharmacies;
    return list.slice(0, 8);
  }, [query, pharmacies]);

  const choose = (id: string) =>
    start(async () => {
      const result = await chooseHomePharmacyAction(id);
      setMessage(result.ok ? { ok: true, text: result.message ?? "C'est noté." } : { ok: false, text: result.error });
      if (result.ok) setEditing(false);
    });
  const declare = () =>
    start(async () => {
      const result = await declareOutsidePharmacyAction(form);
      setMessage(result.ok ? { ok: true, text: result.message ?? "C'est noté." } : { ok: false, text: result.error });
      if (result.ok) { setEditing(false); setOutside(false); }
    });

  if (!editing) {
    return (
      <Card data-app-ma-pharmacie="">
        {current ? (
          <>
            <p className="text-[15.5px] font-bold">{current.name}</p>
            {current.city && <p className="text-[13px] text-[#4B6A62]">{current.city}</p>}
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#E8F3EF] px-3 py-1 text-[12px] font-bold text-[#0B6B5F]"><Check className="size-3.5" aria-hidden="true" /> Pharmacie PharmaBoost</p>
          </>
        ) : declared ? (
          <>
            <p className="text-[15.5px] font-bold">{declared.pharmacyName}</p>
            <p className="text-[13px] text-[#4B6A62]">{declared.postalCode} {declared.city}</p>
            <p className="mt-2 text-[13px] leading-5 text-[#4B6A62]">
              {declared.wantsJoin ? "Pas encore PharmaBoost : nous lui proposons de rejoindre le réseau. En attendant, les offres des laboratoires valent dans toutes les pharmacies PharmaBoost." : "Pas encore PharmaBoost. Les offres des laboratoires valent dans toutes les pharmacies PharmaBoost."}
            </p>
          </>
        ) : null}
        {message?.ok && <p className="mt-2 text-[13px] font-semibold text-[#0B6B5F]">{message.text}</p>}
        <button type="button" onClick={() => { setEditing(true); setMessage(null); }} className="mt-3 text-[13.5px] font-bold" style={{ color: ACCENT }}>
          Changer de pharmacie
        </button>
      </Card>
    );
  }

  if (outside) {
    return (
      <Card data-app-hors-reseau="">
        <p className="text-[15px] font-bold">Ma pharmacie n&apos;est pas dans la liste</p>
        <div className="mt-3 space-y-2">
          <input aria-label="Nom de la pharmacie" placeholder="Nom de la pharmacie" value={form.pharmacyName} onChange={(e) => setForm({ ...form, pharmacyName: e.target.value })} className="h-11 w-full rounded-xl border border-[#E3ECE9] bg-[#F7FBFA] px-3 text-[14.5px] outline-none focus:border-[#0E8A7B]" />
          <div className="flex gap-2">
            <input aria-label="Code postal" placeholder="Code postal" inputMode="numeric" maxLength={5} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} className="h-11 w-28 rounded-xl border border-[#E3ECE9] bg-[#F7FBFA] px-3 text-[14.5px] outline-none focus:border-[#0E8A7B]" />
            <input aria-label="Ville" placeholder="Ville" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-11 flex-1 rounded-xl border border-[#E3ECE9] bg-[#F7FBFA] px-3 text-[14.5px] outline-none focus:border-[#0E8A7B]" />
          </div>
          <label className="flex items-start gap-2.5 rounded-xl bg-[#E8F3EF] p-3 text-[13.5px] leading-5">
            <input type="checkbox" checked={form.wantsJoin} onChange={(e) => setForm({ ...form, wantsJoin: e.target.checked })} className="mt-0.5 size-4 accent-[#0E8A7B]" />
            <span><b>Je veux que ma pharmacie rejoigne PharmaBoost</b> : le conseil personnalisé, le bilan après chaque visite et les offres de l&apos;appli.</span>
          </label>
        </div>
        {message && !message.ok && <p className="mt-2 text-[13px] text-[#B42318]">{message.text}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setOutside(false)} className="h-11 rounded-xl bg-[#F1F5F4] px-4 text-[14px] font-semibold">Retour</button>
          <button type="button" disabled={pending} onClick={declare} className="h-11 flex-1 rounded-xl text-[14px] font-bold text-white disabled:opacity-50" style={{ background: GRAD }}>
            Enregistrer
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card data-app-choisir-pharmacie="">
      <label className="flex h-11 items-center gap-2 rounded-xl border border-[#E3ECE9] bg-[#F7FBFA] px-3">
        <Search className="size-4 text-[#94A3A0]" aria-hidden="true" />
        <input aria-label="Chercher ma pharmacie" placeholder="Nom ou ville de ma pharmacie" value={query} onChange={(e) => setQuery(e.target.value)} className="h-full flex-1 bg-transparent text-[14.5px] outline-none" />
      </label>
      <div className="mt-2 divide-y divide-[#EEF3F1]">
        {found.map((pharmacy) => (
          <button key={pharmacy.id} type="button" disabled={pending} onClick={() => choose(pharmacy.id)} className="flex w-full items-center gap-2.5 py-2.5 text-left">
            <MapPin className="size-4 shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-[14.5px] font-bold">{pharmacy.name}</span>
              <span className="block text-[12.5px] text-[#4B6A62]">{pharmacy.city}</span>
            </span>
            <span className="text-[12.5px] font-bold" style={{ color: ACCENT }}>Choisir</span>
          </button>
        ))}
        {found.length === 0 && <p className="py-3 text-[13.5px] text-[#4B6A62]">Aucune pharmacie PharmaBoost à ce nom.</p>}
      </div>
      {message && !message.ok && <p className="mt-2 text-[13px] text-[#B42318]">{message.text}</p>}
      <button type="button" data-app-pas-dans-la-liste="" onClick={() => setOutside(true)} className="mt-2 w-full rounded-xl bg-[#F1F5F4] py-3 text-[14px] font-bold">
        Ma pharmacie n&apos;est pas dans la liste
      </button>
    </Card>
  );
}
