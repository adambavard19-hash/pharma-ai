"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, ChevronRight, MapPin, Phone, Smartphone } from "lucide-react";
import { Robot } from "@/components/robot";
import { isBilanContent, type BilanContent } from "@/core/documents/bilan";
import { unsealJson } from "@/lib/sealed-client";
import { curesCalendar, saveBilan } from "@/lib/patient-bilans";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "locked" } | { kind: "ready"; content: BilanContent };

const GRAD = "linear-gradient(135deg,#0E8A7B,#0B5560)";

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Le bilan s'ouvre ici, sur le téléphone, avec la clé du QR code ; il se garde dans l'appli, sur ce même téléphone. */
export function BilanViewer({ id, appLive }: { id: string; appLive: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const key = window.location.hash.replace(/^#/, "");
    if (!key) {
      queueMicrotask(() => active && setState({ kind: "locked" }));
      return () => {
        active = false;
      };
    }
    unsealJson(id, key)
      .then((value) => active && setState(isBilanContent(value) ? { kind: "ready", content: value } : { kind: "locked" }))
      .catch((error: unknown) => active && setState(error instanceof Error && error.message === "missing" ? { kind: "missing" } : { kind: "locked" }));
    return () => {
      active = false;
    };
  }, [id]);

  if (state.kind !== "ready") {
    const text = state.kind === "loading" ? "Ouverture de votre bilan…" : state.kind === "missing" ? "Ce bilan n'est plus disponible : demandez-le de nouveau à votre pharmacie." : "Ce lien est incomplet : scannez de nouveau le QR code de votre pharmacie.";
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Robot size={72} mood={state.kind === "loading" ? "thinking" : "concerned"} label="PharmaBoost" />
        <p className="text-[16px] text-[#24423C]">{text}</p>
      </div>
    );
  }

  const { content } = state;
  const keep = () => {
    saveBilan(id, content);
    setSaved(true);
  };
  const addReminders = () => {
    const blob = new Blob([curesCalendar(content)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rappels-de-cure.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-6 pb-16">
      <div className="flex items-center gap-2.5">
        <Robot size={42} mood="happy" label="PharmaBoost" />
        <div>
          <p className="text-[13px] text-[#4B6A62]">Votre bilan conseil · {dayLabel(content.date)}</p>
          <p className="text-[18px] font-extrabold text-[#0F2B26]">{content.pharmacy.name}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {content.products.map((product) => (
          <article key={product.name} className="rounded-[20px] bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- photo du produit, déjà publique
                <img src={product.imageUrl} alt="" className="size-14 shrink-0 rounded-xl bg-[#F2F7F5] object-contain" />
              ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-xl text-white" style={{ background: GRAD }}>
                  <Check className="size-6" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-[16px] leading-5 font-bold text-[#0F2B26]">{product.name}</h2>
                {product.reason && <p className="mt-1 text-[14px] leading-5 text-[#24423C]">{product.reason}</p>}
              </div>
            </div>
            {product.benefits.length > 0 && (
              <ul className="mt-3 space-y-1">
                {product.benefits.map((line) => (
                  <li key={line} className="flex gap-2 text-[13.5px] text-[#24423C]">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#0E8A7B]" aria-hidden="true" /> {line}
                  </li>
                ))}
              </ul>
            )}
            {product.posology && <p className="mt-3 rounded-xl bg-[#F2F7F5] px-3 py-2 text-[13px] text-[#24423C]"><strong>Comment le prendre : </strong>{product.posology}</p>}
            {product.precautions.length > 0 && <p className="mt-2 text-[12.5px] text-[#4B6A62]">Précautions : {product.precautions.join(" · ")}</p>}
          </article>
        ))}
      </div>

      {content.cures.length > 0 && (
        <section className="mt-4 rounded-[20px] bg-white p-4 shadow-sm">
          <h2 className="text-[15px] font-bold text-[#0F2B26]">Vos rappels de fin de cure</h2>
          <ul className="mt-2 space-y-1 text-[13.5px] text-[#24423C]">
            {content.cures.map((cure) => (
              <li key={cure.name}>
                {cure.name} : le {dayLabel(cure.remindOn)}
              </li>
            ))}
          </ul>
          <button type="button" onClick={addReminders} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#CFE3DC] text-[14px] font-semibold text-[#0E8A7B]">
            <CalendarPlus className="size-4" aria-hidden="true" /> Ajouter à mon agenda
          </button>
        </section>
      )}

      <section className="mt-4 rounded-[20px] p-5 text-white shadow-lg" style={{ background: GRAD }}>
        <p className="flex items-center gap-2 text-[16px] font-bold">
          <Smartphone className="size-5" aria-hidden="true" /> Gardez votre bilan dans l&apos;appli PharmaBoost
        </p>
        <p className="mt-1 text-[13.5px] leading-5 text-white/85">Vos conseils, vos cures et les offres de votre pharmacie, sur votre téléphone. Ils restent sur votre téléphone, rien n&apos;est envoyé.</p>
        {appLive ? (
          saved ? (
            <a href="/app/bilans" className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-white text-[14.5px] font-bold text-[#0B5560]">
              <Check className="size-4" aria-hidden="true" /> Gardé — ouvrir l&apos;appli <ChevronRight className="size-4" aria-hidden="true" />
            </a>
          ) : (
            <button type="button" onClick={keep} className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-white text-[14.5px] font-bold text-[#0B5560]">
              Garder dans l&apos;appli PharmaBoost
            </button>
          )
        ) : (
          <p className="mt-3 rounded-2xl bg-white/15 px-3 py-2 text-[13px]">Ajoutez cette page à votre écran d&apos;accueil pour la retrouver.</p>
        )}
      </section>

      <footer className="mt-5 space-y-1 text-center text-[12.5px] text-[#4B6A62]">
        {content.pharmacy.address && (
          <p className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" /> {content.pharmacy.address}
          </p>
        )}
        {content.pharmacy.phone && (
          <p>
            <a href={`tel:${content.pharmacy.phone}`} className="inline-flex items-center gap-1 font-semibold text-[#0E8A7B]">
              <Phone className="size-3.5" aria-hidden="true" /> {content.pharmacy.phone}
            </a>
          </p>
        )}
        <p className="pt-2">Conseils de votre pharmacien, à demander à votre pharmacie en cas de doute.</p>
      </footer>
    </div>
  );
}
