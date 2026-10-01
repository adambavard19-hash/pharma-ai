"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Printer } from "lucide-react";
import { PatientDocument } from "@/components/document/patient-document";
import { buildReminderCalendar, planReminderSeries } from "@/core/documents/calendar";
import type { DocumentContent } from "@/core/documents/types";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "locked" } | { kind: "error"; message: string } | { kind: "ready"; content: DocumentContent };

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Le plan se déchiffre ici, dans le téléphone du patient, avec la clé lue
 * après le dièse de l'adresse. Elle n'a jamais quitté ce navigateur ; le
 * serveur n'a servi que le chiffré.
 */
async function unseal(id: string, key: string): Promise<DocumentContent> {
  const response = await fetch(`/api/plan/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (response.status === 404) throw new Error("missing");
  if (!response.ok) throw new Error("Le plan n'a pas pu être chargé.");
  const body = (await response.json()) as { ciphertext: string; iv: string; tag: string };
  const cryptoKey = await crypto.subtle.importKey("raw", fromBase64Url(key), { name: "AES-GCM" }, false, ["decrypt"]);
  const ciphertext = fromBase64Url(body.ciphertext);
  const tag = fromBase64Url(body.tag);
  const joined = new Uint8Array(new ArrayBuffer(ciphertext.length + tag.length));
  joined.set(ciphertext);
  joined.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(body.iv), tagLength: 128 }, cryptoKey, joined);
  return JSON.parse(new TextDecoder().decode(plain)) as DocumentContent;
}

export function PlanViewer({ id, url, autoPrint }: { id: string; url: string; autoPrint: boolean }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    // La clé est lue après le dièse ; une adresse sans elle est un lien tronqué.
    const key = window.location.hash.replace(/^#/, "");
    (key ? unseal(id, key) : Promise.reject(new DOMException("clé absente")))
      .then((content) => {
        if (!active) return;
        setState({ kind: "ready", content });
        if (autoPrint) setTimeout(() => window.print(), 500);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "";
        if (message === "missing") setState({ kind: "missing" });
        else if (error instanceof DOMException) setState({ kind: "locked" });
        else setState({ kind: "error", message: message || "Le plan n'a pas pu être lu." });
      });
    return () => {
      active = false;
    };
  }, [id, autoPrint]);

  if (state.kind === "loading") return <p className="py-16 text-center text-[14px] text-[#6b7280]">Ouverture de votre plan…</p>;
  if (state.kind === "missing") return <Notice title="Ce plan n'est plus disponible">Il a expiré ou a été retiré par votre pharmacie. Elle peut vous en remettre un nouveau.</Notice>;
  if (state.kind === "locked") return <Notice title="Lien incomplet">Ouvrez le plan depuis le lien complet reçu de votre pharmacie, ou en scannant à nouveau le QR code.</Notice>;
  if (state.kind === "error") return <Notice title="Impossible d'ouvrir le plan">{state.message}</Notice>;

  const content = state.content;
  const reminders = planReminderSeries(content);
  const fullUrl = `${url}${window.location.hash}`;

  const addToCalendar = () => {
    const ics = buildReminderCalendar(content, new Date());
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "rappels-de-prise.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[14px] font-semibold text-[#374151]">{content.pharmacy.name}</p>
        <div className="flex flex-wrap gap-2">
          {reminders.length > 0 && (
            <button type="button" onClick={addToCalendar} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0F766E] px-3.5 text-[13.5px] font-medium text-white">
              <CalendarPlus className="size-4" /> Ajouter les rappels à mon agenda
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d1d5db] bg-white px-3.5 text-[13.5px] font-medium text-[#111827]">
            <Printer className="size-4" /> Imprimer
          </button>
        </div>
      </div>
      <div className="rounded-[22px] bg-white p-4 shadow-lg sm:p-8 print:rounded-none print:p-0 print:shadow-none">
        <PatientDocument content={content} qrUrl={fullUrl} />
      </div>
      {reminders.length > 0 && (
        <p className="no-print mt-4 text-center text-[12.5px] leading-5 text-[#6b7280]">
          Les rappels sont créés dans l&apos;agenda de votre téléphone, pour la durée du traitement : {reminders.map((r) => r.label.toLowerCase()).join(", ")}. Vous pouvez en changer l&apos;heure.
        </p>
      )}
      <p className="no-print mt-3 text-center text-[12px] leading-5 text-[#6b7280]">
        Ce lien est personnel. Votre pharmacie ne peut pas lire ce plan sans lui : la clé se trouve dans le lien, pas chez elle. Il expire automatiquement.
      </p>
    </>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-white p-8 text-center shadow-lg">
      <p className="text-[18px] font-semibold text-[#111827]">{title}</p>
      <p className="mt-2 text-[14px] leading-6 text-[#4b5563]">{children}</p>
    </div>
  );
}
