"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Download, Droplet, Store } from "lucide-react";
import { readBloodTestForPatientAction } from "@/server/actions/blood-test";
import type { BloodProposal } from "@/core/blood-test/propose";
import type { BloodAnalysis } from "@/core/blood-test/reading";
import { BloodBodyMap } from "@/components/blood-test/body-map";
import { ACCENT, Card, GRAD } from "../_components/ui";

type Pharmacy = { name: string; city: string | null } | null;

const fr = (value: number | null) => (value === null ? "…" : String(value).replace(".", ","));
const valueLine = (f: BloodProposal["finding"]) => `${f.value !== null ? `${fr(f.value)}${f.unit ? ` ${f.unit}` : ""}` : "valeur signalée"}${f.refLow !== null || f.refHigh !== null ? ` (normes ${fr(f.refLow)} – ${fr(f.refHigh)})` : ""}`;

/** La fiche à présenter au pharmacien : un PDF fabriqué dans le téléphone, jamais envoyé ni gardé par PharmaBoost. */
async function buildSheet(proposals: BloodProposal[], pharmacy: Pharmacy): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (text: string) => text.replace(/[^\x20-\x7E -ÿ€–—’«»…œŒ]/g, "");
  const teal = rgb(0.055, 0.541, 0.482);
  let y = 790;
  const write = (text: string, options: { size?: number; font?: typeof regular; color?: ReturnType<typeof rgb>; indent?: number } = {}) => {
    const size = options.size ?? 11;
    const font = options.font ?? regular;
    const maxWidth = 515 - (options.indent ?? 0);
    const words = safe(text).split(" ");
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        page.drawText(line, { x: 40 + (options.indent ?? 0), y, size, font, color: options.color ?? rgb(0.06, 0.18, 0.16) });
        y -= size + 5;
        line = word;
      } else line = next;
    }
    if (line) page.drawText(line, { x: 40 + (options.indent ?? 0), y, size, font, color: options.color ?? rgb(0.06, 0.18, 0.16) });
    y -= size + 7;
  };
  write("PharmaBoost", { size: 22, font: bold, color: teal });
  write("À présenter à votre pharmacien", { size: 15, font: bold });
  write(pharmacy ? `Votre pharmacie PharmaBoost : ${pharmacy.name}${pharmacy.city ? `, ${pharmacy.city}` : ""}` : "Dans votre pharmacie PharmaBoost", { size: 11 });
  y -= 8;
  const advice = proposals.filter((p) => p.kind === "ADVICE");
  const doctor = proposals.filter((p) => p.kind === "DOCTOR");
  if (advice.length > 0) {
    write("Compléments sans ordonnance à demander", { size: 13, font: bold, color: teal });
    for (const p of advice) {
      write(`${p.finding.label} : ${valueLine(p.finding)} — basse`, { font: bold });
      write(p.rule?.patientSentence ?? "", { indent: 12 });
      for (const caution of p.rule?.cautions ?? []) write(`• ${caution}`, { size: 10, indent: 12 });
      y -= 4;
    }
  }
  if (doctor.length > 0) {
    write("À montrer à votre médecin", { size: 13, font: bold, color: teal });
    for (const p of doctor) write(`${p.finding.label} : ${valueLine(p.finding)} — ${p.finding.direction === "LOW" ? "basse" : "élevée"}`);
  }
  y -= 10;
  write("Cette fiche reprend les valeurs signalées hors normes par votre laboratoire. Elle ne remplace pas l'avis de votre médecin, qui interprète vos résultats. PharmaBoost n'a rien enregistré.", { size: 9, color: rgb(0.35, 0.42, 0.4) });
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function BloodTestPatient({ pharmacy }: { pharmacy: Pharmacy }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<BloodProposal[] | null>(null);
  const [analyses, setAnalyses] = useState<BloodAnalysis[]>([]);

  const read = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProposals(null);
    setAnalyses([]);
    const data = new FormData();
    data.set("fichier", file);
    start(async () => {
      const result = await readBloodTestForPatientAction(data);
      if (input.current) input.current.value = "";
      if (!result.ok) setError(result.error);
      else {
        setProposals(result.data.proposals);
        setAnalyses(result.data.analyses);
      }
    });
  };

  const download = async () => {
    if (!proposals) return;
    const blob = await buildSheet(proposals, pharmacy);
    const file = new File([blob], "PharmaBoost-prise-de-sang.pdf", { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Ma fiche PharmaBoost" }).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="mt-5 space-y-4">
      <Card className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#DDF1EB]" style={{ color: ACCENT }}><Droplet className="size-6" aria-hidden="true" /></span>
        <p className="mt-2 text-[14px] leading-6 text-[#4B6A62]">Prenez en photo votre compte rendu d&apos;analyses, bien à plat, ou choisissez le PDF du laboratoire.</p>
        <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" id="ma-prise-de-sang" onChange={(event) => read(event.target.files?.[0])} />
        <button type="button" disabled={pending} onClick={() => input.current?.click()} className="mt-3 inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold text-white disabled:opacity-70" style={{ background: GRAD }}>
          {pending ? "Lecture en cours…" : proposals ? "Lire une autre prise de sang" : "Ajouter ma prise de sang"}
        </button>
        <p className="mt-2 text-[11.5px]" style={{ color: ACCENT }}>Rien n&apos;est enregistré : lue, puis oubliée.</p>
      </Card>

      {error && <Card><p className="text-[14px] font-semibold text-[#B42318]">{error}</p></Card>}
      {proposals && proposals.length === 0 && <Card><p className="text-[14.5px] font-semibold">Votre laboratoire ne signale aucune valeur hors normes sur ce document.</p></Card>}

      {proposals && analyses.length > 0 && (
        <Card>
          <BloodBodyMap analyses={analyses} proposals={proposals} audience="patient" pharmacyName={pharmacy?.name ?? null} title="Votre prise de sang, sur votre corps" />
        </Card>
      )}

      {proposals && proposals.length > 0 && (
        <Card className="text-center">
          <Store className="mx-auto size-6" style={{ color: ACCENT }} aria-hidden="true" />
          <p className="mt-1 text-[15px] font-bold">À récupérer dans votre pharmacie PharmaBoost</p>
          <p className="text-[13px] text-[#4B6A62]">{pharmacy ? `${pharmacy.name}${pharmacy.city ? `, ${pharmacy.city}` : ""}` : "Téléchargez votre fiche et présentez-la au comptoir."}</p>
          {!pharmacy && <Link href="/app/pharmacies" className="mt-1 inline-block text-[13px] font-bold underline" style={{ color: ACCENT }}>Trouver une pharmacie PharmaBoost</Link>}
          <button type="button" onClick={download} className="mt-3 inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold text-white" style={{ background: GRAD }}>
            <Download className="size-5" aria-hidden="true" /> Télécharger ma fiche
          </button>
          <p className="mt-2 text-[11.5px] text-[#4B6A62]">Montrez-la à votre pharmacien : il vous conseille le bon produit.</p>
        </Card>
      )}

      <p className="text-center text-[11.5px] leading-5 text-[#4B6A62]">Ce n&apos;est pas un avis médical : votre médecin interprète vos résultats.</p>
    </div>
  );
}
