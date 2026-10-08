"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Trash2 } from "lucide-react";
import { clearRobotSetupAction, saveRobotSetupAction } from "@/server/actions/connection-hub";
import { ROBOT_LINK_KINDS, ROBOT_MANUFACTURERS, describeRobot, resolveRobotIntegration, type RobotLinkKind, type RobotSetup } from "@/core/robot/integration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { BIG_BUTTON, SetupCard } from "./setup-card";

/**
 * Étape 3 — « Connecter mon robot » (facultatif).
 *
 * Elle enregistre quel robot l'officine utilise et prépare les paramètres d'une future intégration. Elle ne se
 * connecte à rien : tant qu'aucun connecteur n'est validé (`ROBOT_CONNECTORS`, vide), l'état reste « Connexion en
 * préparation », et aucune connexion n'est jamais simulée. Les paramètres techniques sont repliés : ils servent
 * à l'assistance, pas au pharmacien.
 */

const empty = { manufacturer: "", manufacturerOther: "", model: "", linkKind: "unknown" as RobotLinkKind, host: "", port: "", journalPath: "" };

const toForm = (setup: RobotSetup | null) =>
  setup
    ? { manufacturer: setup.manufacturer, manufacturerOther: setup.manufacturerOther ?? "", model: setup.model ?? "", linkKind: setup.linkKind, host: setup.host ?? "", port: setup.port ? String(setup.port) : "", journalPath: setup.journalPath ?? "" }
    : empty;

export function RobotStep({ setup, lgo }: { setup: RobotSetup | null; lgo: string | null }) {
  const uid = useId();
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<RobotSetup | null>(setup);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(toForm(setup));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const integration = resolveRobotIntegration(saved?.manufacturer, lgo);

  const save = () =>
    start(async () => {
      setErrors({});
      const result = await saveRobotSetupAction({ ...form, manufacturer: form.manufacturer });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        return push({ tone: "error", title: result.error });
      }
      setSaved(result.data);
      setForm(toForm(result.data));
      setOpen(false);
      push({ tone: "success", title: "Robot enregistré." });
      router.refresh();
    });

  const clear = () =>
    start(async () => {
      const result = await clearRobotSetupAction();
      if (!result.ok) return push({ tone: "error", title: result.error });
      setSaved(null);
      setForm(empty);
      setErrors({});
      setOpen(false);
      push({ tone: "success", title: "Robot retiré." });
      router.refresh();
    });

  const cancel = () => {
    setForm(toForm(saved));
    setErrors({});
    setOpen(false);
  };

  return (
    <SetupCard icon={Bot} title="3. Connecter mon robot" badge={<Badge tone="neutral">Facultatif</Badge>}>
      <p className="text-[15px] leading-6 text-text-secondary">Sélectionnez le fabricant et le modèle de votre robot pour préparer sa future connexion.</p>

      {saved && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle bg-surface-sunken/60 px-4 py-3">
          <span className="min-w-0 flex-1 basis-40">
            <span className="block text-[16px] leading-6 font-medium text-text-primary">{describeRobot(saved)}</span>
            <span className="block text-[12.5px] leading-5 text-text-secondary">Configuration enregistrée</span>
          </span>
          <Badge tone="info">{integration.stage === "PREPARING" ? "Connexion en préparation" : integration.label}</Badge>
        </div>
      )}

      {!open ? (
        <>
          <Button size="xl" variant="outline" className={BIG_BUTTON} onClick={() => setOpen(true)}>
            {saved ? "Modifier mon robot" : "Configurer mon robot"}
          </Button>
          {saved && (
            <button type="button" disabled={pending} onClick={clear} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-text-secondary underline underline-offset-2 hover:text-danger-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:opacity-50">
              <Trash2 className="size-3.5" aria-hidden="true" />
              Retirer mon robot
            </button>
          )}
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div role="radiogroup" aria-label="Fabricant du robot" className="grid grid-cols-2 gap-2.5">
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
                    maker.id === "autre" && "col-span-2",
                    selected ? "border-success-600 bg-success-50 text-text-primary dark:bg-success-950/30" : "border-border-default bg-surface-sunken/40 text-text-primary hover:border-brand-400",
                  )}
                >
                  <span>{maker.id === "autre" ? "Autre" : maker.label}</span>
                  {selected && <Check className="size-4 shrink-0 text-success-600" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {errors.manufacturer && <p className="text-[12.5px] text-danger-600" role="alert">{errors.manufacturer}</p>}

          {form.manufacturer && (
            <div className="grid gap-3">
              {form.manufacturer === "autre" && (
                <Field label="Nom du fabricant" htmlFor={`${uid}-other`} error={errors.manufacturerOther}>
                  <Input id={`${uid}-other`} value={form.manufacturerOther} maxLength={60} onChange={(e) => setForm({ ...form, manufacturerOther: e.target.value })} placeholder="Comme écrit sur le robot" />
                </Field>
              )}
              <Field label="Modèle (facultatif)" htmlFor={`${uid}-model`} error={errors.model}>
                <Input id={`${uid}-model`} value={form.model} maxLength={60} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Comme écrit sur le robot" />
              </Field>

              <details className="rounded-xl border border-border-subtle px-4 py-3">
                <summary className="cursor-pointer text-[13.5px] font-medium text-text-secondary">Paramètres pour l&apos;assistance</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Comment le logiciel et le robot se parlent" htmlFor={`${uid}-link`} error={errors.linkKind} className="sm:col-span-2">
                    <Select id={`${uid}-link`} value={form.linkKind} onChange={(e) => setForm({ ...form, linkKind: e.target.value as RobotLinkKind })}>
                      {ROBOT_LINK_KINDS.map((kind) => (
                        <option key={kind.id} value={kind.id}>{kind.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ordinateur du robot" htmlFor={`${uid}-host`} error={errors.host}>
                    <Input id={`${uid}-host`} value={form.host} maxLength={80} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="PC-ROBOT ou 192.168.1.20" />
                  </Field>
                  <Field label="Port réseau" htmlFor={`${uid}-port`} error={errors.port}>
                    <Input id={`${uid}-port`} inputMode="numeric" value={form.port} maxLength={5} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="6050" />
                  </Field>
                  <Field label="Dossier ou fichier d'échange" htmlFor={`${uid}-journal`} error={errors.journalPath} className="sm:col-span-2">
                    <Input id={`${uid}-journal`} value={form.journalPath} maxLength={300} onChange={(e) => setForm({ ...form, journalPath: e.target.value })} placeholder="C:\…" className="font-mono text-[13px]" />
                  </Field>
                  <p className="text-[12.5px] leading-5 text-text-secondary sm:col-span-2">Enregistrés pour préparer l&apos;intégration : PharmaBoost ne s&apos;en sert pas pour se connecter. Aucun mot de passe n&apos;est demandé.</p>
                </div>
              </details>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" size="xl" className="rounded-full sm:flex-1" loading={pending} disabled={!form.manufacturer}>
              Enregistrer
            </Button>
            <Button type="button" size="xl" variant="ghost" className="rounded-full" disabled={pending} onClick={cancel}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      <p className="text-[13.5px] leading-5 text-text-secondary">Connexion technique en préparation. Cette étape peut être ignorée.</p>
    </SetupCard>
  );
}
