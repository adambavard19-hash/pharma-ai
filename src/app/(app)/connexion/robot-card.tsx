"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Check, FileText, MonitorSmartphone, ScanBarcode, Server, Trash2 } from "lucide-react";
import { clearRobotSetupAction, saveRobotSetupAction } from "@/server/actions/connection-hub";
import {
  ROBOT_LINK_KINDS,
  ROBOT_MANUFACTURERS,
  describeRobot,
  describeRobotFlows,
  describeTriggers,
  resolveRobotIntegration,
  type RobotLinkKind,
  type RobotSetup,
} from "@/core/robot/integration";
import { lgoLabel } from "@/core/stock/connectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { HelpTip } from "./help-tip";

/**
 * « Connecter mon robot » — la rubrique qui prépare l'intégration, sans rien simuler.
 *
 * Elle fait trois choses honnêtes : (1) elle enregistre quel robot et quel logiciel l'officine utilise,
 * pour qu'un connecteur puisse s'y brancher le jour venu ; (2) elle montre que le logiciel et le robot
 * sont DEUX flux qui ne portent pas les mêmes informations ; (3) elle dit ce qui déclenche les conseils
 * aujourd'hui — la douchette — et que la détection de la délivrance en cours par le robot est en
 * préparation. Aucune connexion n'est ouverte, aucun état « connecté » n'est jamais affiché ici.
 */

type Props = {
  setup: RobotSetup | null;
  lgo: string | null;
  postsOnline: number;
  onChangeLgo: () => void;
};

export function RobotCard({ setup, lgo, postsOnline, onChangeLgo }: Props) {
  const uid = useId();
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<RobotSetup | null>(setup);
  const [form, setForm] = useState({
    manufacturer: setup?.manufacturer ?? "",
    manufacturerOther: setup?.manufacturerOther ?? "",
    model: setup?.model ?? "",
    linkKind: (setup?.linkKind ?? "unknown") as RobotLinkKind,
    host: setup?.host ?? "",
    port: setup?.port ? String(setup.port) : "",
    journalPath: setup?.journalPath ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const integration = resolveRobotIntegration(form.manufacturer || null, lgo);
  const [lgoFlow, robotFlow] = describeRobotFlows(integration);
  const triggers = describeTriggers({ postsOnline, integration });
  const dirty = JSON.stringify(form) !== JSON.stringify({ manufacturer: saved?.manufacturer ?? "", manufacturerOther: saved?.manufacturerOther ?? "", model: saved?.model ?? "", linkKind: saved?.linkKind ?? "unknown", host: saved?.host ?? "", port: saved?.port ? String(saved.port) : "", journalPath: saved?.journalPath ?? "" });

  const save = () =>
    start(async () => {
      setErrors({});
      const result = await saveRobotSetupAction({
        manufacturer: form.manufacturer,
        manufacturerOther: form.manufacturerOther,
        model: form.model,
        linkKind: form.linkKind,
        host: form.host,
        port: form.port,
        journalPath: form.journalPath,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        return push({ tone: "error", title: result.error });
      }
      setSaved(result.data);
      push({ tone: "success", title: result.message ?? "Robot enregistré." });
      router.refresh();
    });

  const clear = () =>
    start(async () => {
      const result = await clearRobotSetupAction();
      if (!result.ok) return push({ tone: "error", title: result.error });
      setSaved(null);
      setForm({ manufacturer: "", manufacturerOther: "", model: "", linkKind: "unknown", host: "", port: "", journalPath: "" });
      setErrors({});
      push({ tone: "success", title: result.message ?? "Robot retiré." });
      router.refresh();
    });

  return (
    <section id="robot" aria-label="Connecter mon robot" className="space-y-5 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-sunken">
          <Bot className="size-5 text-text-secondary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[18px] leading-6 font-semibold text-text-primary">
            Connecter mon robot
            <HelpTip label="le robot">
              Un robot de dispensation range et sort les boîtes. Quand le logiciel lui demande une boîte, PharmaBoost pourra afficher les conseils sans que vous bipiez. Ce n&apos;est pas encore branché : cette rubrique prépare le terrain.
            </HelpTip>
          </h2>
          <p className="text-[13.5px] leading-5 text-text-secondary">Facultatif. Sans robot, vos conseils s&apos;affichent au bip de la douchette.</p>
        </div>
        <Badge tone="info">{integration.label}</Badge>
      </div>

      <div className="rounded-xl border border-info-200 bg-info-50/60 px-4 py-3 text-[13.5px] leading-5 text-text-primary dark:border-info-800 dark:bg-info-950/20">
        PharmaBoost <strong>ne se connecte pas encore à un robot</strong>. Désigner le vôtre prépare l&apos;intégration ; rien n&apos;est lu du robot et rien n&apos;y est écrit.
      </div>

      {/* Deux flux, deux informations */}
      <div>
        <p className="mb-2 text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Deux flux, deux informations</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { flow: lgoFlow, Icon: Server },
            { flow: robotFlow, Icon: MonitorSmartphone },
          ].map(({ flow, Icon }) => (
            <article key={flow.key} className="space-y-2 rounded-xl border border-border-subtle p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
                  <Icon className="size-4 text-text-tertiary" aria-hidden="true" />
                  {flow.title}
                </p>
                <Badge tone={flow.stage === "AVAILABLE" ? "success" : "neutral"}>{flow.stageLabel}</Badge>
              </div>
              <p className="text-[13.5px] leading-5 text-text-primary">{flow.carries}</p>
              <p className="text-[12.5px] leading-5 text-text-secondary">{flow.via}</p>
            </article>
          ))}
        </div>
      </div>

      {/* Ce qui déclenche les conseils */}
      <div>
        <p className="mb-2 text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Ce qui affiche les conseils au comptoir</p>
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          {triggers.map((trigger) => (
            <li key={trigger.source} className="flex items-start gap-3 px-4 py-3">
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", trigger.state === "ACTIVE" ? "bg-success-50 text-success-700 dark:bg-success-950/40 dark:text-success-400" : "bg-surface-sunken text-text-tertiary")}>
                {trigger.source === "SCAN" ? <ScanBarcode className="size-4" aria-hidden="true" /> : <Bot className="size-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-text-primary">{trigger.title}</span>
                <span className="block text-[13.5px] leading-5 text-text-secondary">{trigger.detail}</span>
              </span>
              <Badge tone={trigger.state === "ACTIVE" ? "success" : trigger.state === "PREPARING" ? "info" : "neutral"}>{trigger.state === "ACTIVE" ? "Actif" : trigger.state === "PREPARING" ? "En préparation" : "Inactif"}</Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* Mon robot */}
      <div className="space-y-4">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Mon robot</p>
        <div role="radiogroup" aria-label="Fabricant du robot" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {ROBOT_MANUFACTURERS.map((maker) => {
            const selected = form.manufacturer === maker.id;
            return (
              <button
                key={maker.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setForm({ ...form, manufacturer: maker.id })}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-[15px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
                  selected ? "border-success-600 bg-success-50 text-text-primary dark:bg-success-950/30" : "border-border-default bg-surface-sunken/40 text-text-primary hover:border-brand-400",
                )}
              >
                <span>{maker.label}</span>
                {selected && <Check className="size-4 shrink-0 text-success-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {errors.manufacturer && <p className="text-[12.5px] text-danger-600" role="alert">{errors.manufacturer}</p>}

        {form.manufacturer && (
          <div className="grid gap-3 sm:grid-cols-2">
            {form.manufacturer === "autre" && (
              <Field label="Nom du fabricant" htmlFor={`${uid}-other`} error={errors.manufacturerOther}>
                <Input id={`${uid}-other`} value={form.manufacturerOther} maxLength={60} onChange={(e) => setForm({ ...form, manufacturerOther: e.target.value })} placeholder="Comme écrit sur le robot" />
              </Field>
            )}
            <Field label="Modèle (facultatif)" htmlFor={`${uid}-model`} error={errors.model} hint="Comme écrit sur le robot ou dans son logiciel.">
              <Input id={`${uid}-model`} value={form.model} maxLength={60} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Ex. Vmax" />
            </Field>
            <Field label="Logiciel de l'officine" hint="Celui de l'étape 1 : un seul logiciel pour toute la pharmacie.">
              <div className="flex h-11 items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-sunken/50 px-3 text-[14px] text-text-primary">
                <span>{lgo ? lgoLabel(lgo) : "Pas encore choisi"}</span>
                <button type="button" onClick={onChangeLgo} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
                  {lgo ? "Changer" : "Choisir"}
                </button>
              </div>
            </Field>
          </div>
        )}

        {form.manufacturer && (
          <details className="rounded-xl border border-border-subtle px-4 py-3">
            <summary className="cursor-pointer text-[13.5px] font-medium text-text-secondary">Paramètres techniques (pour le technicien)</summary>
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Comment le logiciel et le robot se parlent" htmlFor={`${uid}-link`} error={errors.linkKind} className="sm:col-span-2">
                  <Select id={`${uid}-link`} value={form.linkKind} onChange={(e) => setForm({ ...form, linkKind: e.target.value as RobotLinkKind })}>
                    {ROBOT_LINK_KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>{kind.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Ordinateur du robot (nom ou adresse)" htmlFor={`${uid}-host`} error={errors.host}>
                  <Input id={`${uid}-host`} value={form.host} maxLength={80} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="Ex. PC-ROBOT ou 192.168.1.20" />
                </Field>
                <Field label="Port réseau" htmlFor={`${uid}-port`} error={errors.port}>
                  <Input id={`${uid}-port`} inputMode="numeric" value={form.port} maxLength={5} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="Ex. 6050" />
                </Field>
                <Field label="Dossier ou fichier d'échange" htmlFor={`${uid}-journal`} error={errors.journalPath} className="sm:col-span-2" hint="Là où le logiciel du robot écrit ses échanges, s'il y en a un.">
                  <Input id={`${uid}-journal`} value={form.journalPath} maxLength={300} onChange={(e) => setForm({ ...form, journalPath: e.target.value })} placeholder="C:\…" className="font-mono text-[13px]" />
                </Field>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-5 text-text-secondary">
                <li>Ces valeurs sont enregistrées pour préparer l&apos;intégration. PharmaBoost <strong>ne les utilise pas</strong> pour se connecter.</li>
                <li>Aucun mot de passe n&apos;est demandé ni conservé.</li>
                <li>Vous ne savez pas les remplir ? Laissez vide : un diagnostic en lecture seule les retrouve.</li>
              </ul>
              <a
                href="/api/agent/fichiers/diagnostic-robot.cmd"
                className="inline-flex items-center gap-2 text-[13.5px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400"
              >
                <FileText className="size-4" aria-hidden="true" />
                Télécharger le diagnostic du robot (lecture seule)
              </a>
              <p className="text-[12.5px] leading-5 text-text-secondary">
                À ouvrir sur l&apos;ordinateur du robot : il écrit un rapport sur le Bureau, n&apos;envoie rien et ne change aucun réglage. Vous le relisez avant de nous l&apos;envoyer.
              </p>
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" loading={pending} disabled={!form.manufacturer || !dirty} onClick={save} trailingIcon={<ArrowRight className="size-4" />}>
            {saved ? "Mettre à jour mon robot" : "Enregistrer mon robot"}
          </Button>
          {saved && (
            <Button size="lg" variant="ghost" loading={pending} onClick={clear} leadingIcon={<Trash2 className="size-4" />}>
              Retirer
            </Button>
          )}
        </div>
        {saved && !dirty && <p className="text-[13.5px] text-text-secondary">Enregistré : <strong>{describeRobot(saved)}</strong>. {integration.label}.</p>}
      </div>
    </section>
  );
}
