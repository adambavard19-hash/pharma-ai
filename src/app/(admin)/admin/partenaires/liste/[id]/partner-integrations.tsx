"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cable, KeyRound, Pencil, Plus } from "lucide-react";
import { savePartnerIntegrationAction } from "@/server/actions/platform-partners";
import { b2bLinkFor } from "@/core/partners/attribution";
import { CONNECTOR_CAPABILITIES, CONNECTOR_CAPABILITY_LABELS, MODE_CAPABILITIES } from "@/core/partners/connector";
import { INTEGRATION_MODE_LABELS, INTEGRATION_MODES, type IntegrationMode } from "@/core/partners/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { CapabilityComparison } from "../_components/capabilities";

export type PartnerIntegrationView = {
  id: string;
  mode: IntegrationMode;
  isActive: boolean;
  b2bUrlTemplate: string | null;
  orderEmail: string | null;
  formUrl: string | null;
  capabilities: string[];
  notes: string | null;
  updatedAt: string;
};

/** Code d'exemple, pour montrer la forme du lien : jamais un identifiant réel. */
const SAMPLE_CODE = "PB-ABCD-EFGH";

/** Quelle donnée chaque mode utilise. */
const USES = {
  b2b: (mode: IntegrationMode) => mode === "B2B_LINK",
  form: (mode: IntegrationMode) => mode === "FORM",
  email: (mode: IntegrationMode) => mode === "EMAIL" || mode === "IMPORT_EXPORT" || mode === "MANUAL",
};

/**
 * Les modes d'intégration du partenaire : comment une commande ou une prise
 * de contact lui parvient. Aucun secret n'est saisi ici.
 */
export function PartnerIntegrations({ partnerId, integrations }: { partnerId: string; integrations: PartnerIntegrationView[] }) {
  const [editing, setEditing] = useState<PartnerIntegrationView | "new" | null>(null);

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-1.5 text-[12.5px] text-text-tertiary">
        <KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Les clés d&apos;API ne sont jamais stockées ici : ni dans un champ, ni dans les notes.
      </p>
      {integrations.length === 0 ? (
        <p className="text-[13px] text-text-secondary">Aucune intégration configurée : aucune commande ne peut être transmise à ce partenaire.</p>
      ) : (
        <ul className="space-y-3">
          {integrations.map((integration) => {
            const preview = integration.b2bUrlTemplate ? b2bLinkFor(integration.b2bUrlTemplate, SAMPLE_CODE) : null;
            return (
              <li key={integration.id} className="space-y-2 rounded-lg border border-border-subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-text-primary">
                      <Cable className="size-3.5 text-text-tertiary" aria-hidden="true" />
                      {INTEGRATION_MODE_LABELS[integration.mode]}
                      <Badge tone={integration.isActive ? "success" : "neutral"}>{integration.isActive ? "Active" : "Inactive"}</Badge>
                    </p>
                    <p className="text-[12.5px] leading-5 text-text-secondary">{MODE_CAPABILITIES[integration.mode].howItWorks}</p>
                  </div>
                  <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(integration)}>
                    Modifier
                  </Button>
                </div>
                {integration.mode === "API" && (
                  <Alert tone="neutral" title="En attente de l'API du partenaire">
                    Aucune donnée n&apos;est échangée tant que l&apos;API du partenaire n&apos;est pas branchée. Rien n&apos;est simulé.
                  </Alert>
                )}
                <dl className="grid grid-cols-1 gap-1.5 text-[12.5px]">
                  {integration.b2bUrlTemplate && (
                    <div className="min-w-0">
                      <dt className="text-text-tertiary">Modèle de lien B2B</dt>
                      <dd className="font-mono text-[12px] break-all text-text-primary">{integration.b2bUrlTemplate}</dd>
                      {preview && <dd className="font-mono text-[11.5px] break-all text-text-tertiary">Forme du lien envoyé : {preview}</dd>}
                    </div>
                  )}
                  {integration.orderEmail && (
                    <div className="min-w-0">
                      <dt className="text-text-tertiary">E-mail de commande</dt>
                      <dd className="break-all text-text-primary">{integration.orderEmail}</dd>
                    </div>
                  )}
                  {integration.formUrl && (
                    <div className="min-w-0">
                      <dt className="text-text-tertiary">Formulaire</dt>
                      <dd className="break-all text-text-primary">{integration.formUrl}</dd>
                    </div>
                  )}
                </dl>
                <CapabilityComparison mode={integration.mode} declared={integration.capabilities} isActive={integration.isActive} />
                {integration.notes && <p className="text-[12.5px] break-words whitespace-pre-wrap text-text-secondary">{integration.notes}</p>}
                <p className="text-[11.5px] text-text-tertiary">Modifiée le {formatDate(integration.updatedAt)}</p>
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="outline" leadingIcon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
        Ajouter une intégration
      </Button>
      {editing && <IntegrationModal partnerId={partnerId} integration={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function IntegrationModal({ partnerId, integration, onClose }: { partnerId: string; integration: PartnerIntegrationView | null; onClose: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<IntegrationMode>(integration?.mode ?? "B2B_LINK");
  const [isActive, setIsActive] = useState(integration?.isActive ?? false);
  const [b2bUrlTemplate, setB2bUrlTemplate] = useState(integration?.b2bUrlTemplate ?? "");
  const [orderEmail, setOrderEmail] = useState(integration?.orderEmail ?? "");
  const [formUrl, setFormUrl] = useState(integration?.formUrl ?? "");
  const [capabilities, setCapabilities] = useState<string[]>(integration?.capabilities ?? []);
  const [notes, setNotes] = useState(integration?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const today = MODE_CAPABILITIES[mode].capabilities;
  const preview = USES.b2b(mode) && b2bUrlTemplate.trim() ? b2bLinkFor(b2bUrlTemplate.trim(), SAMPLE_CODE) : null;

  const submit = () =>
    start(async () => {
      setError(null);
      // Seule la donnée du mode choisi est envoyée : changer de mode n'emporte pas l'ancienne.
      const result = await savePartnerIntegrationAction({
        partnerId,
        id: integration?.id ?? null,
        mode,
        isActive,
        b2bUrlTemplate: USES.b2b(mode) ? b2bUrlTemplate : null,
        orderEmail: USES.email(mode) ? orderEmail : null,
        formUrl: USES.form(mode) ? formUrl : null,
        capabilities,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Intégration enregistrée." });
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={integration ? "Modifier l'intégration" : "Nouvelle intégration"}
      description="Comment une commande ou une prise de contact parvient au partenaire. Aucun secret ici."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={pending} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Mode" htmlFor="pg-mode" error={fieldErrors.mode} hint={MODE_CAPABILITIES[mode].howItWorks}>
          <Select id="pg-mode" value={mode} onChange={(event) => setMode(event.target.value as IntegrationMode)}>
            {INTEGRATION_MODES.map((value) => (
              <option key={value} value={value}>
                {INTEGRATION_MODE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "API" && (
          <Alert tone="neutral" title="En attente de l'API du partenaire">
            Le mode API se branchera quand le partenaire publiera son API. D&apos;ici là, rien n&apos;est échangé. Les clés d&apos;API ne sont jamais stockées ici.
          </Alert>
        )}
        <Switch id="pg-active" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} label="Intégration active" description="Inactive, elle est conservée mais ne sert à aucune transmission." />
        {USES.b2b(mode) && (
          <Field
            label="Modèle de lien B2B"
            htmlFor="pg-b2b"
            required={isActive}
            error={fieldErrors.b2bUrlTemplate}
            hint={preview ? `Forme du lien envoyé : ${preview}` : "Adresse https. {code} est remplacé par l'identifiant d'attribution PharmaBoost ; sans {code}, il est ajouté en paramètre « pb »."}
          >
            <Input id="pg-b2b" value={b2bUrlTemplate} onChange={(event) => setB2bUrlTemplate(event.target.value)} placeholder="https://…?ref={code}" inputMode="url" className="font-mono text-[13px]" />
          </Field>
        )}
        {USES.form(mode) && (
          <Field label="Adresse du formulaire" htmlFor="pg-form" required={isActive} error={fieldErrors.formUrl} hint="Adresse https du formulaire du partenaire.">
            <Input id="pg-form" value={formUrl} onChange={(event) => setFormUrl(event.target.value)} placeholder="https://" inputMode="url" />
          </Field>
        )}
        {USES.email(mode) && (
          <Field label="E-mail de commande" htmlFor="pg-email" required={isActive && mode === "EMAIL"} error={fieldErrors.orderEmail} hint={mode === "EMAIL" ? "Adresse qui reçoit les commandes, avec l'identifiant d'attribution." : "Facultatif : adresse du partenaire pour les commandes transmises par l'équipe."}>
            <Input id="pg-email" type="email" value={orderEmail} onChange={(event) => setOrderEmail(event.target.value)} />
          </Field>
        )}
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-text-primary">Capacités annoncées par le partenaire</legend>
          <p className="text-[12.5px] text-text-tertiary">Ce que le partenaire dit savoir faire. Seules celles que le mode assure aujourd&apos;hui fonctionnent ; les autres restent en attente de son API.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CONNECTOR_CAPABILITIES.map((capability) => (
              <Checkbox
                key={capability}
                id={`pg-cap-${capability}`}
                checked={capabilities.includes(capability)}
                onChange={(event) => setCapabilities((current) => (event.target.checked ? [...current, capability] : current.filter((value) => value !== capability)))}
                label={CONNECTOR_CAPABILITY_LABELS[capability]}
                description={today.includes(capability) ? "Assurée par ce mode aujourd'hui" : "En attente de l'API du partenaire"}
              />
            ))}
          </div>
        </fieldset>
        <Field label="Notes" htmlFor="pg-notes" error={fieldErrors.notes} hint="Sans mot de passe ni clé d'API.">
          <Textarea id="pg-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} />
        </Field>
      </div>
    </Modal>
  );
}
