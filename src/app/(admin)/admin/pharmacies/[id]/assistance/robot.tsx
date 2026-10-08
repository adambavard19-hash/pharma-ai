"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { adminSaveRobotTechnicalAction } from "@/server/actions/admin-connection";
import { ROBOT_LINK_KINDS, describeRobot, describeRobotFlows, describeTriggers, resolveRobotIntegration, type RobotLinkKind, type RobotSetup } from "@/core/robot/integration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

/**
 * Le robot, côté assistance : ce que le titulaire a désigné, les deux flux (le logiciel apporte le stock, le robot
 * apportera la délivrance en cours : pas les mêmes informations), ce qui déclenche les conseils aujourd'hui, les
 * paramètres techniques d'une future intégration, et le diagnostic en lecture seule. Aucun état « connecté » :
 * rien n'est lu du robot, et PharmaBoost n'utilise pas ces paramètres pour s'y connecter.
 */
export function AssistanceRobot({ pharmacyId, robot, lgo, postsOnline }: { pharmacyId: string; robot: RobotSetup | null; lgo: string | null; postsOnline: number }) {
  const uid = useId();
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ linkKind: (robot?.linkKind ?? "unknown") as RobotLinkKind, host: robot?.host ?? "", port: robot?.port ? String(robot.port) : "", journalPath: robot?.journalPath ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const integration = resolveRobotIntegration(robot?.manufacturer, lgo);
  const flows = describeRobotFlows(integration);
  const triggers = describeTriggers({ postsOnline, integration });

  const save = () =>
    start(async () => {
      setErrors({});
      const result = await adminSaveRobotTechnicalAction({ pharmacyId, ...form });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        return push({ tone: "error", title: result.error });
      }
      push({ tone: "success", title: result.message ?? "Enregistré." });
      router.refresh();
    });

  return (
    <div className="space-y-4 text-[13.5px] leading-5">
      <p className="text-text-secondary">
        {robot ? <strong className="text-text-primary">{describeRobot(robot)}</strong> : "Aucun robot désigné par le titulaire."}{" "}
        <Badge tone="info">{integration.stage === "PREPARING" ? "Intégration non disponible" : integration.label}</Badge> Rien n&apos;est lu du robot.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {flows.map((flow) => (
          <div key={flow.key} className="rounded-lg border border-border-subtle p-3">
            <p className="font-semibold text-text-primary">
              {flow.title} <span className="font-normal text-text-tertiary">· {flow.stageLabel}</span>
            </p>
            <p className="text-text-primary">{flow.carries}</p>
            <p className="text-text-secondary">{flow.via}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-text-secondary">
        {triggers.map((trigger) => (
          <li key={trigger.source}>
            <strong className="text-text-primary">{trigger.title}</strong> : {trigger.detail}
          </li>
        ))}
      </ul>

      {robot ? (
        <form
          className="space-y-3 rounded-xl border border-border-subtle p-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="font-semibold text-text-primary">Paramètres techniques d&apos;une future intégration</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Comment le logiciel et le robot se parlent" htmlFor={`${uid}-link`} error={errors.linkKind} className="sm:col-span-2">
              <Select id={`${uid}-link`} value={form.linkKind} onChange={(e) => setForm({ ...form, linkKind: e.target.value as RobotLinkKind })}>
                {ROBOT_LINK_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>{kind.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Ordinateur du robot (nom ou adresse)" htmlFor={`${uid}-host`} error={errors.host}>
              <Input id={`${uid}-host`} value={form.host} maxLength={80} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="PC-ROBOT ou 192.168.1.20" />
            </Field>
            <Field label="Port réseau" htmlFor={`${uid}-port`} error={errors.port}>
              <Input id={`${uid}-port`} inputMode="numeric" value={form.port} maxLength={5} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="6050" />
            </Field>
            <Field label="Dossier ou fichier d'échange" htmlFor={`${uid}-journal`} error={errors.journalPath} className="sm:col-span-2">
              <Input id={`${uid}-journal`} value={form.journalPath} maxLength={300} onChange={(e) => setForm({ ...form, journalPath: e.target.value })} placeholder="C:\…" className="font-mono text-[13px]" />
            </Field>
          </div>
          <p className="text-[12.5px] text-text-secondary">Enregistrés pour préparer l&apos;intégration : PharmaBoost ne s&apos;en sert pas pour se connecter. Aucun mot de passe n&apos;est demandé ni gardé.</p>
          <Button type="submit" size="sm" loading={pending}>Enregistrer les paramètres</Button>
        </form>
      ) : (
        <p className="text-text-secondary">Les paramètres techniques se règlent une fois que le titulaire a désigné son robot.</p>
      )}

      <a href="/api/agent/fichiers/diagnostic-robot.cmd" className="inline-flex items-center gap-2 font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
        <FileText className="size-4" aria-hidden="true" />
        Télécharger le diagnostic du robot (lecture seule)
      </a>
      <p className="text-text-secondary">À ouvrir sur l&apos;ordinateur du robot : il écrit un rapport sur le Bureau, n&apos;envoie rien et ne change aucun réglage.</p>
    </div>
  );
}
