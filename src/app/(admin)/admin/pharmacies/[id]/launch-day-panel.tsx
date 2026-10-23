"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Rocket, Send } from "lucide-react";
import { sendLaunchDayAction, sendLaunchDayTrialAction } from "@/server/actions/platform-launch-day";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Member = { membershipId: string; name: string; email: string; roleLabel: string; owner: boolean };
type Sent = { recipient: string; status: string; at: string };

/**
 * L'e-mail du jour J, depuis la fiche de la pharmacie : la date de démarrage, les personnes qui le reçoivent (toutes cochées), un essai à
 * mon adresse d'abord, puis l'envoi — confirmé d'un second clic. Ce qui est déjà parti est listé dessous.
 */
export function LaunchDayPanel({ pharmacyId, defaultDay, members, sent, demo }: { pharmacyId: string; defaultDay: string; members: Member[]; sent: Sent[]; demo: boolean }) {
  const [day, setDay] = useState(defaultDay);
  // Le jour J (démarrage) ou la journée test (23 oct. 2026), et l'adresse de l'essai (vide : celle de l'administrateur).
  const [kind, setKind] = useState<"launch" | "test">("launch");
  const [trialTo, setTrialTo] = useState("");
  const [chosen, setChosen] = useState<string[]>(members.map((m) => m.membershipId));
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }).format(new Date(`${day}T12:00:00Z`));

  const trial = () =>
    start(async () => {
      const result = await sendLaunchDayTrialAction({ pharmacyId, day, kind, to: trialTo });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Essai envoyé.") : result.error });
    });
  const send = () =>
    start(async () => {
      const result = await sendLaunchDayAction({ pharmacyId, day, membershipIds: chosen, kind });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Envoyé.") : result.error });
      setConfirm(false);
      router.refresh();
    });

  return (
    <div className="space-y-4" data-launch-day="">
      <div className="inline-flex rounded-xl border border-border-subtle bg-surface-sunken p-1" role="group" aria-label="Quel e-mail">
        {([["launch", "Jour J (démarrage)"], ["test", "Journée test"]] as const).map(([value, text]) => (
          <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setConfirm(false); }} className={`h-8 rounded-lg px-3 text-[13px] font-semibold ${kind === value ? "bg-surface-card text-text-primary shadow-xs" : "text-text-secondary"}`}>
            {text}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[13px] font-medium text-text-secondary">
          {kind === "test" ? "Jour du test" : "Jour J"}
          <input type="date" value={day} onChange={(event) => { setDay(event.target.value); setConfirm(false); }} className="mt-1 block h-10 rounded-lg border border-border-subtle bg-surface-card px-3 text-[14px] text-text-primary" />
        </label>
        <p className="pb-2 text-[13px] text-text-secondary">
          L&apos;e-mail dira : « {label[0]?.toUpperCase()}{label.slice(1)}{kind === "test" ? " : on teste PharmaBoost" : ", on démarre !"} »
        </p>
      </div>
      {members.length === 0 ? (
        <p className="text-[13px] text-text-secondary">Aucun compte actif dans cette pharmacie : créez d&apos;abord le titulaire et l&apos;équipe.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {members.map((m) => (
            <li key={m.membershipId}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13.5px]">
                <input type="checkbox" checked={chosen.includes(m.membershipId)} onChange={(event) => { setConfirm(false); setChosen((list) => (event.target.checked ? [...list, m.membershipId] : list.filter((id) => id !== m.membershipId))); }} className="size-4 accent-[#0F766E]" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-text-primary">{m.name}</span>
                  <span className="text-text-secondary"> · {m.roleLabel} · {m.email}</span>
                </span>
                <span className="shrink-0 text-[12px] text-text-secondary">{kind === "test" ? "journée test" : m.owner ? "version titulaire" : "version comptoir"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="email" value={trialTo} onChange={(event) => setTrialTo(event.target.value)} placeholder="Adresse de l'essai (sinon la vôtre)" className="h-9 w-64 rounded-lg border border-border-subtle bg-surface-card px-3 text-[13px] text-text-primary" />
        <Button size="sm" variant="outline" loading={pending && !confirm} leadingIcon={<Mail className="size-3.5" />} onClick={trial}>
          M&apos;envoyer un essai
        </Button>
        {demo ? (
          <span className="self-center text-[13px] text-text-secondary">Pharmacie de démonstration : seul l&apos;essai est possible.</span>
        ) : confirm ? (
          <>
            <Button size="sm" loading={pending} leadingIcon={<Send className="size-3.5" />} onClick={send}>
              Oui, envoyer à {chosen.length} personne{chosen.length > 1 ? "s" : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Annuler</Button>
          </>
        ) : (
          <Button size="sm" disabled={chosen.length === 0} leadingIcon={<Rocket className="size-3.5" />} onClick={() => setConfirm(true)}>
            Envoyer à l&apos;équipe ({chosen.length})
          </Button>
        )}
      </div>
      {sent.length > 0 && (
        <div className="text-[13px] text-text-secondary">
          <p className="font-semibold text-text-primary">Déjà envoyé</p>
          <ul className="mt-1 space-y-0.5">
            {sent.map((s) => (
              <li key={`${s.recipient}-${s.at}`}>
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(s.at))} · {s.recipient} · {s.status === "FAILED" ? "échec" : "envoyé"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
