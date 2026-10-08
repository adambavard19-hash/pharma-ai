"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { sendStockAction } from "@/server/actions/stock-deposits";
import { DEPOSIT_CONFIRMATION } from "@/core/stock-deposit/rules";
import { SEND_FAILED, ZERO_ABSENT_NOTICE, checkDepositFile, formatFileSize, uploadSummary, type SendOutcome } from "@/app/(app)/stock/mise-a-jour/view";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { BIG_BUTTON, SetupCard } from "./setup-card";

/**
 * Étape 2 — « Envoyer mon stock ».
 *
 * Un seul gros bouton, l'état du dernier import, un petit guide LGPI. Le bouton ouvre le choix du fichier ; avant
 * tout envoi, la personne CONFIRME explicitement : ce fichier remplace son stock, ce qui n'y figure pas passe à 0.
 * Les contrôles du serveur restent entiers (un fichier incomplet, trop d'absents ou trop de lignes illisibles ne
 * s'applique pas : l'équipe le vérifie d'abord) ; l'écran les dit, il ne les contourne pas.
 */

type Stock = OverviewSnapshot["overview"]["stock"];

export function StockStep({ stock, onChanged }: { stock: Stock; onChanged: () => void }) {
  return (
    <SetupCard icon={Boxes} title="2. Envoyer mon stock" badge={stock.state === "FRESH" ? <Badge tone="success">À jour</Badge> : undefined}>
      <StockSendBody stock={stock} onChanged={onChanged} />
    </SetupCard>
  );
}

/** Le contenu de l'étape, sans son cadre : il sert aussi à l'accueil d'une nouvelle officine. */
export function StockSendBody({ stock, onChanged }: { stock: Stock; onChanged?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);

  const reset = () => {
    setChosen(null);
    if (input.current) input.current.value = "";
  };

  const pick = (file: File | null) => {
    if (!file) return;
    setOutcome(null);
    const problem = checkDepositFile(file);
    if (problem) {
      reset();
      setOutcome({ tone: "danger", title: "Fichier non envoyé", detail: problem });
      return;
    }
    // Rien ne part tant que la personne n'a pas confirmé.
    setChosen(file);
  };

  const confirm = () => {
    const file = chosen;
    if (!file) return;
    start(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        body.set("confirmation", DEPOSIT_CONFIRMATION);
        const result = await sendStockAction(body);
        setOutcome(uploadSummary(result, new Date()));
        if (result.ok) {
          onChanged?.();
          router.refresh();
        }
      } catch {
        setOutcome({ tone: "danger", title: "Votre stock n'a pas été mis à jour", detail: SEND_FAILED });
      }
      reset();
    });
  };

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
              Dernier import : {stock.receivedLabel}
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

      {chosen ? (
        <div role="group" aria-label="Confirmer l'envoi" className="space-y-3 rounded-xl border border-warning-300 bg-warning-50/60 p-4 dark:border-warning-800 dark:bg-warning-950/20">
          <p className="flex items-center gap-2 text-[15px] leading-6 font-semibold text-text-primary">
            <FileSpreadsheet className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="min-w-0 break-words">{chosen.name}</span>
            <span className="shrink-0 text-[13px] font-normal text-text-secondary">{formatFileSize(chosen.size)}</span>
          </p>
          <p className="text-[14px] leading-6 text-text-primary">
            Ce fichier <strong>remplace votre stock</strong> : envoyez tout votre stock. {ZERO_ABSENT_NOTICE} S&apos;il paraît incomplet, PharmaBoost ne l&apos;applique pas : l&apos;équipe le vérifie d&apos;abord.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="rounded-full sm:flex-1" loading={pending} onClick={confirm} leadingIcon={<Upload className="size-[18px]" />}>
              Confirmer et envoyer
            </Button>
            <Button size="lg" variant="ghost" className="rounded-full" disabled={pending} onClick={reset}>
              Choisir un autre fichier
            </Button>
          </div>
        </div>
      ) : (
        <Button size="xl" variant="outline" className={BIG_BUTTON} disabled={pending} onClick={() => input.current?.click()} leadingIcon={<Upload className="size-5" />}>
          Envoyer mon stock
        </Button>
      )}

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

      <Link href="/connexion/guide?logiciel=lgpi" className="inline-block text-[13.5px] font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-400">
        Comment récupérer mon stock dans LGPI ?
      </Link>
    </>
  );
}
