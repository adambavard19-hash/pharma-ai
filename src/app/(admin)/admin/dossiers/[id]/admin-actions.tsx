"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { adminAddNoteAction, adminSetProspectStatusAction, reassignProspectAction, recordOfflineSignatureAction, setProspectBlockedAction, updateCommissionAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { COMMISSION_STATUS_LABELS, PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";

type Props = {
  prospect: { id: string; status: string; blocked: boolean; salesRepId: string | null; pharmacyId: string | null; contracts: { id: string; version: number; status: string; providerEnvelopeId: string | null }[]; commissions: { id: string; amountCents: number; status: string; dueAt: string; note: string }[] };
  reps: { id: string; firstName: string; lastName: string }[];
};

/** Les contrôles de l'administrateur : tout est possible, tout est tracé. */
export function AdminActionsPanel({ prospect, reps }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rep, setRep] = useState(prospect.salesRepId ?? "");
  const [status, setStatus] = useState(prospect.status);
  const [note, setNote] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [sigStatus, setSigStatus] = useState<"SIGNED_PHARMACY" | "FINALIZED" | "REFUSED" | "EXPIRED">("FINALIZED");
  const [sigReason, setSigReason] = useState("");
  const commission = prospect.commissions[0] ?? null;
  const [comm, setComm] = useState({ amount: commission ? (commission.amountCents / 100).toFixed(2).replace(".", ",") : "", status: commission?.status ?? "EARNED", dueAt: commission?.dueAt ?? "", note: commission?.note ?? "" });
  const router = useRouter();
  const { push } = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Erreur");
      push({ tone: "success", title: r.message ?? "Enregistré" });
      router.refresh();
    });
  };
  const contract = prospect.contracts[0] ?? null;
  const contractOpen = contract && !["DRAFT", "FINALIZED", "REFUSED", "EXPIRED"].includes(contract.status);

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardHeader title="Contrôle du dossier" description="Réassigner, changer l'étape, suspendre : chaque geste est journalisé avec votre nom." />
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Commercial assigné" htmlFor="a-rep"><div className="flex gap-2"><Select id="a-rep" value={rep} onChange={(e) => setRep(e.target.value)}>{!prospect.salesRepId && <option value="">Aucun (console)</option>}{reps.map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}</Select><Button size="sm" variant="outline" disabled={rep === (prospect.salesRepId ?? "")} loading={pending} onClick={() => run(() => reassignProspectAction({ prospectId: prospect.id, salesRepId: rep }))}>OK</Button></div></Field>
          <Field label="Étape" htmlFor="a-status"><div className="flex gap-2"><Select id="a-status" value={status} onChange={(e) => setStatus(e.target.value)}>{PROSPECT_STATUSES.map((s) => <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>)}</Select><Button size="sm" variant="outline" disabled={status === prospect.status} loading={pending} onClick={() => run(() => adminSetProspectStatusAction({ prospectId: prospect.id, status }))}>OK</Button></div></Field>
          <Field label={prospect.blocked ? "Dossier suspendu" : "Suspendre le dossier"} htmlFor="a-block"><div className="flex gap-2">{!prospect.blocked && <Input id="a-block" placeholder="Motif" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />}<Button size="sm" variant={prospect.blocked ? "outline" : "danger"} loading={pending} leadingIcon={<ShieldAlert className="size-4" />} onClick={() => run(() => setProspectBlockedAction({ prospectId: prospect.id, blocked: !prospect.blocked, reason: blockReason || null }))}>{prospect.blocked ? "Réactiver" : "Suspendre"}</Button></div></Field>
          <div className="sm:col-span-3 flex gap-2"><Textarea rows={1} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne (visible du commercial)" /><Button size="sm" variant="outline" disabled={note.trim().length < 2} loading={pending} onClick={() => run(async () => { const r = await adminAddNoteAction({ prospectId: prospect.id, note }); if (r.ok) setNote(""); return r; })}>Noter</Button></div>
        </CardContent>
      </Card>

      {contract && contractOpen && (
        <Card>
          <CardHeader title="Signature reçue hors ligne" description="Uniquement pour une signature papier ou par courriel : ce n'est pas une signature électronique, et le journal le dira. Les statuts électroniques arrivent seuls du prestataire." />
          <CardContent className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={sigStatus} onChange={(e) => setSigStatus(e.target.value as typeof sigStatus)} aria-label="Statut reçu"><option value="SIGNED_PHARMACY">Signé par la pharmacie</option><option value="FINALIZED">Signé par les deux parties (finalisé)</option><option value="REFUSED">Refusé</option><option value="EXPIRED">Expiré</option></Select>
              <Input value={sigReason} onChange={(e) => setSigReason(e.target.value)} placeholder="Comment la signature a été reçue (obligatoire)" />
            </div>
            <div><Button size="sm" variant="outline" loading={pending} disabled={sigReason.trim().length < 5} onClick={() => run(() => recordOfflineSignatureAction({ prospectId: prospect.id, contractId: contract.id, status: sigStatus, reason: sigReason }))}>Enregistrer</Button></div>
          </CardContent>
        </Card>
      )}

      {commission && (
        <Card>
          <CardHeader title="Commission" description="Modifier le montant, valider le paiement." />
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <Field label="Montant (€)" htmlFor="c-amount"><Input id="c-amount" inputMode="decimal" value={comm.amount} onChange={(e) => setComm({ ...comm, amount: e.target.value })} /></Field>
            <Field label="Statut" htmlFor="c-status"><Select id="c-status" value={comm.status} onChange={(e) => setComm({ ...comm, status: e.target.value })}>{Object.entries(COMMISSION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Date de paiement prévue" htmlFor="c-due"><Input id="c-due" type="date" value={comm.dueAt} onChange={(e) => setComm({ ...comm, dueAt: e.target.value })} /></Field>
            <Field label="Note" htmlFor="c-note"><Input id="c-note" value={comm.note} onChange={(e) => setComm({ ...comm, note: e.target.value })} /></Field>
            <div className="sm:col-span-4 flex gap-2">
              <Button size="sm" loading={pending} onClick={() => run(() => updateCommissionAction({ commissionId: commission.id, prospectId: prospect.id, amountCents: Math.round(Number(comm.amount.replace(",", ".")) * 100), status: comm.status as never, dueAt: comm.dueAt || null, note: comm.note || null }))}>Enregistrer</Button>
              {commission.status !== "PAID" && <Button size="sm" variant="accent" loading={pending} onClick={() => run(() => updateCommissionAction({ commissionId: commission.id, prospectId: prospect.id, status: "PAID" }))}>Marquer payée</Button>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
