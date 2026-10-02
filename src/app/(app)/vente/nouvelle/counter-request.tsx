"use client";

import { useState, useTransition } from "react";
import { MessageCircleQuestion, Stethoscope } from "lucide-react";
import { adviseCounterRequestAction } from "@/server/actions/counter-request";
import type { CounterRequestAnswer } from "@/server/services/counter-request";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { ShortDateBadge, VigilanceStrip } from "../[id]/vigilance-strip";

/**
 * La demande sans ordonnance : le client décrit ce qu'il ressent, l'officine
 * propose parmi son stock. Le même moteur que pour une ordonnance — besoins
 * fermés, règles écrites, sécurité avant tout — et aucune donnée patient
 * identifiée : un âge, une situation, pas un nom.
 */
export function CounterRequestCard({ today }: { today: { total: number; withProposal: number } }) {
  const [text, setText] = useState("");
  const [age, setAge] = useState("");
  const [pregnant, setPregnant] = useState(false);
  const [breastfeeding, setBreastfeeding] = useState(false);
  const [treatments, setTreatments] = useState("");
  const [answer, setAnswer] = useState<CounterRequestAnswer | null>(null);
  const [pending, start] = useTransition();
  const { push } = useToast();

  const submit = () =>
    start(async () => {
      const ageYears = age.trim() === "" ? null : Number(age);
      const result = await adviseCounterRequestAction({
        text,
        ageYears: ageYears !== null && Number.isFinite(ageYears) ? Math.round(ageYears) : null,
        isPregnant: pregnant,
        isBreastfeeding: breastfeeding,
        treatments: treatments.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
      });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setAnswer(result.data);
    });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <MessageCircleQuestion className="size-4 text-brand-600 dark:text-brand-400" /> Demande sans ordonnance
          </span>
        }
        description="Le client décrit ce qu'il ressent. PharmaBoost reconnaît le besoin, pose les questions à vérifier, et propose parmi ce que l'officine a en rayon — après le moteur de sécurité, comme pour une ordonnance."
        action={today.total > 0 ? <Badge tone="neutral">{today.total} aujourd&apos;hui · {today.withProposal} avec proposition</Badge> : null}
      />
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex. : nez bouché et mal à la tête depuis hier, adulte. Ou : diarrhée depuis ce matin chez un enfant de 4 ans."
            rows={2}
            aria-label="Ce que le client décrit"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim().length >= 5) submit();
            }}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12.5px] text-text-secondary">
              Âge
              <Input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" placeholder="ans" className="mt-1 w-20" aria-label="Âge en années" />
            </label>
            <div className="space-y-1.5 pb-1">
              <Checkbox id="req-pregnant" label="Enceinte" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} />
              <Checkbox id="req-breastfeeding" label="Allaite" checked={breastfeeding} onChange={(e) => setBreastfeeding(e.target.checked)} />
            </div>
            <Button loading={pending} disabled={text.trim().length < 5} onClick={submit}>
              Conseiller
            </Button>
          </div>
        </div>
        <Input value={treatments} onChange={(e) => setTreatments(e.target.value)} placeholder="Traitements en cours, séparés par des virgules (facultatif)" aria-label="Traitements en cours" />

        {answer && (
          <div className="space-y-4 border-t border-border-subtle pt-4">
            {answer.referToDoctor && (
              <Alert tone="danger" title="Orienter vers le médecin">
                {answer.referReason}
              </Alert>
            )}
            {answer.summary && <p className="text-[13.5px] text-text-secondary">{answer.summary}</p>}
            {answer.needs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {answer.needs.map((need) => (
                  <Badge key={need.key} tone="brand">{need.label}</Badge>
                ))}
              </div>
            )}
            {answer.questions.length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-semibold tracking-wide text-text-tertiary uppercase">À vérifier avant de proposer</p>
                <ul className="list-disc space-y-0.5 pl-5 text-[13.5px] text-text-primary">
                  {answer.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            )}
            {answer.proposals.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {answer.proposals.map((proposal) => (
                  <li key={proposal.productId} className="rounded-xl border border-border-subtle bg-surface-sunken/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-text-primary">{proposal.name}</p>
                        <p className="text-[12.5px] text-text-secondary">{proposal.title}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-semibold text-text-primary tabular">{formatCents(proposal.salePriceCents)}</p>
                        <p className="text-[12px] text-text-tertiary">{proposal.stockQuantity} en stock</p>
                        {proposal.shortDate && (proposal.shortDate.level === "SOON" || proposal.shortDate.level === "URGENT") && (
                          <div className="mt-1"><ShortDateBadge shortDate={{ daysLeft: proposal.shortDate.daysLeft, level: proposal.shortDate.level }} /></div>
                        )}
                      </div>
                    </div>
                    {(proposal.vigilances?.length ?? 0) > 0 && <div className="mt-2"><VigilanceStrip vigilances={proposal.vigilances ?? []} canVerify /></div>}
                    <p className="mt-2 text-[13px] text-text-secondary">{proposal.shortReason}</p>
                    <p className="mt-2 rounded-lg bg-surface-card px-3 py-2 text-[13.5px] text-text-primary italic">{proposal.counterScript}</p>
                    {proposal.precautions.length > 0 && <p className="mt-1 text-[12.5px] text-text-tertiary">{proposal.precautions.join(" ")}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <Alert tone="info" title="Aucune proposition">
                {answer.notes.length > 0 ? answer.notes.join(" ") : "Rien à proposer pour cette demande."}
              </Alert>
            )}
            {answer.blocked.length > 0 && (
              <p className="flex items-start gap-1.5 text-[12.5px] text-text-tertiary">
                <Stethoscope className="mt-0.5 size-3.5 shrink-0" />
                Écarté par la sécurité : {answer.blocked.join(" · ")}
              </p>
            )}
            {answer.warnings.length > 0 && <p className="text-[12px] text-text-tertiary">{answer.warnings.join(" ")}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
