import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import type { HostEntry, HostItem } from "../../../../../agent/src/notice-center";
import { readCounterSheet } from "../../../../../agent/src/counter-sheet";
import { unitMarginHt } from "@/core/catalog/margin";
import { DonnaAdvicePreview, type DonnaSale } from "./preview";

export const metadata: Metadata = { title: "Les conseils de Donna dans la bannière", robots: { index: false, follow: false } };

type Row = {
  triggerKind: string;
  triggerLabel: string;
  adviceEan: string;
  adviceLabel: string;
  sentence: string | null;
  product: { name: string; salePriceCents: number; purchasePriceCents: number; vatRate: number; quantity: number | null; alertThreshold: number | null } | null;
  candidates?: { ean: string; name: string; salePriceCents: number; purchasePriceCents: number; vatRate: number; quantity: number; alertThreshold: number | null }[];
  pitch: { ask: string[]; pitch: string; answers?: { ask: number; label: string; say: string; ean: string | null }[] } | null;
};

const stockOf = (quantity: number | null, threshold: number | null) => (quantity === null ? "UNKNOWN" : quantity <= 0 ? "OUT_OF_STOCK" : quantity <= (threshold ?? 0) ? "LOW_STOCK" : "IN_STOCK");

/** Les réponses, avec le produit plus précis relu dans le stock de Docteur Nicolas (comme le fait le serveur pour chaque pharmacie). */
function answersOf(row: Row) {
  return (row.pitch?.answers ?? []).map((answer) => {
    const c = answer.ean ? row.candidates?.find((candidate) => candidate.ean === answer.ean) : undefined;
    const margin = c ? unitMarginHt(c) : null;
    return {
      ask: answer.ask,
      label: answer.label,
      say: answer.say,
      ...(c ? { product: { name: c.name, price: euros(c.salePriceCents), ...(margin && margin.marginCents > 0 ? { margin: euros(margin.marginCents) } : {}), stock: stockOf(c.quantity, c.alertThreshold), quantity: c.quantity } } : {}),
    };
  });
}

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

/**
 * La nouvelle bannière (menu déroulant au survol : prix, marge, stock, deux questions, le conseil) essayée sur les VRAIES
 * associations de Donna : `.live/conseils-donna.json`, lu en lecture seule dans la production (associations, prix, marge et
 * stock de Docteur Nicolas), questions et conseil rédigés par le modèle Anthropic. Développement seulement (404 en production).
 */
export default async function DonnaAdvicePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const rows: Row[] = JSON.parse(await readFile(join(process.cwd(), ".live/conseils-donna.json"), "utf8").catch(() => "[]"));
  const byTrigger = new Map<string, Row[]>();
  for (const row of rows) byTrigger.set(row.triggerLabel, [...(byTrigger.get(row.triggerLabel) ?? []), row]);
  const sales: DonnaSale[] = [...byTrigger.entries()].map(([trigger, list], index) => {
    const drug = trigger.split(" · ").pop() ?? trigger;
    const items: HostItem[] = list.map((row, at) => {
      const p = row.product;
      const margin = p ? unitMarginHt(p) : null;
      const quantity = p?.quantity ?? null;
      const availability = p ? stockOf(quantity, p.alertThreshold) : "UNKNOWN";
      const name = p?.name ?? row.adviceLabel;
      return {
        id: `essai-${index}-${at}`,
        drug,
        challenge: "",
        shortDate: "",
        outcome: "NONE",
        name,
        price: p?.salePriceCents ? euros(p.salePriceCents) : "",
        ...(margin && margin.marginCents > 0 ? { margin: euros(margin.marginCents) } : {}),
        reason: row.sentence ?? "",
        availability,
        quantity: quantity === null ? "" : String(quantity),
        image: "",
        sheet: readCounterSheet({ name, reasons: row.sentence ? [row.sentence] : [], script: "", contraindications: [], usage: [], description: "", more: { contraindications: 0, usage: 0 }, cut: false, ...(row.pitch ? { ask: row.pitch.ask, pitch: row.pitch.pitch, answers: answersOf(row) } : {}) }) ?? undefined,
      } as HostItem;
    });
    const entry: HostEntry = {
      id: "essai",
      reference: `DONNA-${index + 1}`,
      label: "Médicament détecté",
      subject: drug,
      url: "",
      signature: `donna-${index}`,
      quiet: false,
      emailSaved: false,
      emailError: "",
      alerts: [],
      notes: [],
      questions: [],
      guidance: [],
      boxes: [{ id: `ligne-${index}`, name: drug }],
      items,
    };
    return { label: drug, kind: list[0].triggerKind, count: list.length, entry };
  });
  return <DonnaAdvicePreview sales={sales} />;
}
