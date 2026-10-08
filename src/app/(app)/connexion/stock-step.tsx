"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Loader2, Upload } from "lucide-react";
import { chooseLgoAction, type OverviewSnapshot } from "@/server/actions/stock-sync";
import { sendStockAction } from "@/server/actions/stock-deposits";
import { SEND_FAILED, ZERO_ABSENT_NOTICE, checkDepositFile, uploadSummary, type SendOutcome } from "@/app/(app)/stock/mise-a-jour/view";
import type { LgoDefinition } from "@/core/stock/connectors";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BIG_BUTTON, SetupCard } from "./setup-card";

/**
 * Étape 2 — « Envoyer mon stock ».
 *
 * Un seul gros bouton : il ouvre le choix du fichier, et le fichier part dès qu'il est choisi. La confirmation
 * dit combien de produits et quand. Les garde-fous sont ceux du serveur (un fichier qui couvrirait trop peu du
 * stock attend l'équipe, un fichier illisible ne change rien) : l'écran les dit, il ne les contourne pas.
 * La mise à jour automatique n'apparaît que si PharmaBoost Connect a réellement lu un export.
 */

type Stock = OverviewSnapshot["overview"]["stock"];
type AutoSync = OverviewSnapshot["overview"]["autoSync"];

export function StockStep({ lgos, lgo, stock, autoSync, onChanged }: { lgos: LgoDefinition[]; lgo: string | null; stock: Stock; autoSync: AutoSync; onChanged: () => void }) {
  return (
    <SetupCard icon={Boxes} title="2. Envoyer mon stock" badge={stock.state === "FRESH" ? <Badge tone="success">À jour</Badge> : undefined}>
      <StockSendBody lgos={lgos} lgo={lgo} stock={stock} autoSync={autoSync} onChanged={onChanged} />
    </SetupCard>
  );
}

/** Le contenu de l'étape, sans son cadre : il sert aussi à l'accueil d'une nouvelle officine. */
export function StockSendBody({ lgos, lgo, stock, autoSync, onChanged }: { lgos: LgoDefinition[]; lgo: string | null; stock: Stock; autoSync: AutoSync; onChanged?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [software, setSoftware] = useState(lgo ?? "");
  const [saving, startSave] = useTransition();

  const changed = () => {
    onChanged?.();
    router.refresh();
  };

  const pick = (file: File | null) => {
    if (!file) return;
    setOutcome(null);
    const problem = checkDepositFile(file);
    if (problem) {
      setOutcome({ tone: "danger", title: "Fichier non envoyé", detail: problem });
      if (input.current) input.current.value = "";
      return;
    }
    start(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        const result = await sendStockAction(body);
        setOutcome(uploadSummary(result, new Date()));
        if (result.ok) changed();
      } catch {
        setOutcome({ tone: "danger", title: "Votre stock n'a pas été mis à jour", detail: SEND_FAILED });
      }
      if (input.current) input.current.value = "";
    });
  };

  const chooseSoftware = (value: string) => {
    setSoftware(value);
    if (!value) return;
    startSave(async () => {
      const result = await chooseLgoAction({ lgo: value });
      if (!result.ok) return push({ tone: "error", title: result.error });
      onChanged?.();
    });
  };

  const guide = `/connexion/guide${software ? `?logiciel=${software}` : ""}`;
  const aged = stock.state === "OLD";

  return (
    <>
      <p className="text-[15px] leading-6 text-text-secondary">Choisissez le fichier exporté de votre logiciel de pharmacie. PharmaBoost l&apos;analyse et vous confirme les produits reçus.</p>

      {stock.state !== "NONE" && stock.productCount !== null && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle bg-surface-sunken/60 px-4 py-3">
          <span className="min-w-0 flex-1 basis-40">
            <span className="block text-[16px] leading-6 font-medium text-text-primary">
              {formatNumber(stock.productCount)} produit{stock.productCount > 1 ? "s" : ""}
            </span>
            <span className="block text-[12.5px] leading-5 text-text-secondary">
              Reçu {stock.receivedLabel}
              {stock.ignored !== null && stock.ignored > 0 && <> · {formatNumber(stock.ignored)} ligne{stock.ignored > 1 ? "s" : ""} illisible{stock.ignored > 1 ? "s" : ""} ignorée{stock.ignored > 1 ? "s" : ""}</>}
            </span>
          </span>
          <Badge tone={aged ? "warning" : "success"}>{aged ? `Ancien · ${stock.ageDays ?? 0} jour${(stock.ageDays ?? 0) > 1 ? "s" : ""}` : "À jour"}</Badge>
        </div>
      )}

      {stock.problem && !outcome && (
        <Alert tone="warning" title="Dernier fichier non appliqué">
          {stock.problem}
        </Alert>
      )}

      <input
        ref={input}
        type="file"
        aria-label="Fichier de stock"
        accept=".csv,.txt,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        tabIndex={-1}
        disabled={pending}
        onChange={(event) => pick(event.target.files?.[0] ?? null)}
      />
      <Button size="xl" variant="outline" className={BIG_BUTTON} loading={pending} onClick={() => input.current?.click()} leadingIcon={<Upload className="size-5" />}>
        Envoyer mon stock
      </Button>

      <div role="status" aria-live="polite" className="space-y-2">
        {pending && (
          <p className="flex items-center gap-2 text-[14px] text-text-secondary">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            Lecture du fichier… cela peut prendre jusqu&apos;à une minute.
          </p>
        )}
        {outcome && (
          <Alert tone={outcome.tone} title={outcome.title}>
            {outcome.detail}
          </Alert>
        )}
      </div>

      <p className="text-[13.5px] leading-5 text-text-secondary">
        Envoyez tout votre stock. {ZERO_ABSENT_NOTICE}
      </p>

      {autoSync.state !== "NONE" && (
        <p className={cn("flex items-start gap-2 text-[13.5px] leading-5", autoSync.state === "ACTIVE" ? "text-success-700 dark:text-success-400" : "text-warning-800 dark:text-warning-400")}>
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", autoSync.state === "ACTIVE" ? "bg-success-600" : "bg-warning-500")} aria-hidden="true" />
          <span>
            <strong className="font-semibold">Mise à jour automatique {autoSync.state === "ACTIVE" ? "active" : "pas encore active"}.</strong> {autoSync.detail}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
        <Link href={guide} className="text-[13.5px] font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-400">
          Comment récupérer mon stock ?
        </Link>
        <label className="flex items-center gap-2 text-[13px] text-text-secondary">
          Mon logiciel
          <select
            value={software}
            disabled={saving}
            onChange={(event) => chooseSoftware(event.target.value)}
            className="h-9 rounded-lg border border-border-default bg-surface-card px-2.5 text-[13.5px] text-text-primary focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            {!software && <option value="">Choisir…</option>}
            {lgos.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id === "autre" ? "Autre" : candidate.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
