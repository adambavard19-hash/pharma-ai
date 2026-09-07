"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  Check,
  Copy,
  FileText,
  Loader2,
  Mail,
  Printer,
  QrCode as QrCodeIcon,
  Receipt,
  Sparkles,
} from "lucide-react";
import { deliverDocumentAction, generateDocumentAction } from "@/server/actions/documents";
import { setPatientEmailAction, updateConsentAction } from "@/server/actions/patients";
import { recordSaleAction } from "@/server/actions/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PatientDocument } from "@/components/document/patient-document";
import { QrCode } from "@/components/document/qr-code";
import { formatCents, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DocumentContent } from "@/core/documents/types";

type AcceptedRecommendation = {
  id: string;
  status: string;
  productId: string | null;
  productName: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  stockQuantity: number;
};

type PatientView = {
  id: string;
  name: string;
  email: string | null;
  hasAdviceConsent: boolean;
};

/**
 * État réel du service d'envoi, tel que le registre le rapporte. L'écran ne
 * décide de rien : il répète ce qui est branché, ou ce qui manque.
 */
export type MessagingState = {
  configured: boolean;
  label: string;
  description: string;
};

/**
 * L'écran de remise.
 *
 * Le plan est déjà là quand on arrive : il a été produit à la fin de la
 * délivrance, à partir des seules lignes confirmées et des seuls conseils
 * acceptés. Il ne reste donc qu'une décision — comment le patient l'emporte —
 * et elle tient en un bouton, choisi par l'application selon ce qu'elle sait
 * du patient : une adresse au dossier, c'est l'e-mail ; pas d'adresse, c'est le
 * papier, tout de suite, sans détour par un formulaire.
 */
export function DocumentWorkspace({
  prescriptionId,
  patient,
  acceptedRecommendations,
  existingDocument,
  canSend,
  canRecordSale,
  canUpdateConsent,
  canUpdatePatient,
  messaging,
  existingSales,
}: {
  prescriptionId: string;
  patient: PatientView | null;
  canUpdateConsent: boolean;
  canUpdatePatient: boolean;
  acceptedRecommendations: AcceptedRecommendation[];
  existingDocument: {
    id: string;
    version: number;
    createdAt: string;
    url: string;
    viewCount: number;
    content: DocumentContent;
    deliveries: {
      id: string;
      channel: string;
      status: string;
      detail: string | null;
      createdAt: string;
    }[];
  } | null;
  canSend: boolean;
  canRecordSale: boolean;
  messaging: MessagingState;
  existingSales: { id: string; reference: string; attributedCents: number }[];
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  // Garde de génération unique. Un `ref` et non un état : elle ne change rien
  // à l'affichage, et la passer par `setState` déclencherait un rendu en
  // cascade depuis l'effet.
  const autoTried = useRef(false);
  const { push } = useToast();

  const generate = () => {
    startTransition(async () => {
      const result = await generateDocumentAction({
        prescriptionId,
        pharmacistNote: note || undefined,
      });
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Plan patient généré") : result.error,
      });
    });
  };

  // Filet de sécurité : on arrive normalement ici avec le plan déjà généré. Si
  // la page est ouverte directement — lien repris, onglet rouvert — on le
  // produit une fois, sans le redemander, plutôt que d'afficher un écran vide.
  useEffect(() => {
    if (existingDocument || autoTried.current) return;
    autoTried.current = true;
    startTransition(async () => {
      await generateDocumentAction({ prescriptionId });
    });
  }, [existingDocument, prescriptionId]);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        {existingDocument ? (
          <Card className="overflow-hidden">
            <CardHeader
              className="no-print"
              title={`Plan patient — version ${existingDocument.version}`}
              description={`Généré le ${formatDateTime(existingDocument.createdAt)} · ${
                existingDocument.viewCount === 0
                  ? "jamais consulté"
                  : `${existingDocument.viewCount} consultation(s)`
              }`}
              action={<Badge tone="success">Prêt</Badge>}
            />
            {/* La zone imprimée. Tout le reste de l'écran porte `no-print` :
                l'impression rend une feuille A4 propre, sans menu ni bouton. */}
            <CardContent className="bg-white p-6 sm:p-8 dark:bg-ink-900">
              <PatientDocument content={existingDocument.content} />
            </CardContent>
          </Card>
        ) : (
          <Card className="no-print">
            <CardContent className="flex items-center gap-3 py-10">
              <Loader2 className="size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              <div>
                <p className="text-[14px] font-medium text-text-primary">
                  Préparation du plan patient…
                </p>
                <p className="text-[12.5px] text-text-secondary">
                  À partir des seules posologies confirmées et des conseils acceptés.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="no-print space-y-5">
        {existingDocument && (
          <>
            <DeliveryPanel
              documentId={existingDocument.id}
              url={existingDocument.url}
              patient={patient}
              canSend={canSend}
              canUpdateConsent={canUpdateConsent}
              canUpdatePatient={canUpdatePatient}
              messaging={messaging}
              deliveries={existingDocument.deliveries}
            />

            <Card>
              <CardHeader
                title="Nouvelle version"
                description="Régénérez le plan après avoir modifié les conseils."
              />
              <CardContent className="space-y-3">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Mot du pharmacien (facultatif)"
                  aria-label="Mot du pharmacien"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  loading={pending}
                  onClick={generate}
                  leadingIcon={<FileText className="size-4" />}
                >
                  Générer la version {existingDocument.version + 1}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {canRecordSale && existingSales.length === 0 && (
          <SalePanel
            prescriptionId={prescriptionId}
            patientId={patient?.id ?? null}
            recommendations={acceptedRecommendations}
            existingSales={existingSales}
          />
        )}
      </div>
    </div>
  );
}

function DeliveryPanel({
  documentId,
  url,
  patient,
  canSend,
  canUpdateConsent,
  canUpdatePatient,
  messaging,
  deliveries,
}: {
  documentId: string;
  url: string;
  patient: PatientView | null;
  canUpdateConsent: boolean;
  canUpdatePatient: boolean;
  canSend: boolean;
  messaging: MessagingState;
  deliveries: {
    id: string;
    channel: string;
    status: string;
    detail: string | null;
    createdAt: string;
  }[];
}) {
  const [copied, setCopied] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [email, setEmail] = useState(patient?.email ?? null);
  const [consentGranted, setConsentGranted] = useState(patient?.hasAdviceConsent ?? false);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const grantAdviceConsent = () => {
    if (!patient) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("patientId", patient.id);
      data.set("type", "ADVICE_SHARING");
      data.set("granted", "true");
      const result = await updateConsentAction(data);
      if (result.ok) {
        setConsentGranted(true);
        push({ tone: "success", title: "Consentement enregistré." });
      } else {
        push({ tone: "error", title: result.error });
      }
    });
  };

  const deliver = (channel: "EMAIL" | "PRINT" | "QR_CODE" | "LINK", target?: string) => {
    startTransition(async () => {
      const result = await deliverDocumentAction({ documentId, channel, target });
      if (result.ok) {
        if (channel === "EMAIL") {
          setEmailResult(result.data.detail);
          setSent(result.data.status === "SENT");
        }
        push({
          tone: result.data.status === "SIMULATED" ? "warning" : "success",
          title: result.message ?? "Enregistré",
          description: result.data.status === "SIMULATED" ? result.data.detail : undefined,
        });
      } else {
        push({ tone: "error", title: result.error });
      }
    });
  };

  const print = () => {
    deliver("PRINT");
    window.print();
  };

  // L'envoi n'est proposé que s'il peut réellement partir. Un bouton
  // « Envoyer » qui n'envoie rien vaut moins que l'impression proposée
  // franchement : au comptoir, le patient repart avec quelque chose.
  const canEmail = Boolean(email) && consentGranted && canSend && messaging.configured;

  return (
    <Card>
      <CardHeader
        title="Remettre au patient"
        description="Le plan est prêt. Un seul geste suffit."
      />
      <CardContent className="space-y-4">
        {/* LE geste principal. Il change selon ce qu'on sait du patient : jamais
            deux boutons pleins côte à côte, jamais de choix à arbitrer pendant
            que quelqu'un attend au comptoir. */}
        {canEmail ? (
          <Button
            size="xl"
            className="w-full"
            loading={pending}
            onClick={() => deliver("EMAIL", email ?? undefined)}
            leadingIcon={sent ? <Check className="size-5" /> : <Mail className="size-5" />}
          >
            {sent ? "Envoyé par e-mail" : "Envoyer par e-mail"}
          </Button>
        ) : (
          <Button
            size="xl"
            className="w-full"
            onClick={print}
            leadingIcon={<Printer className="size-5" />}
          >
            Imprimer le PDF A4
          </Button>
        )}

        {email && canSend && (
          <p className="text-center text-[12.5px] text-text-secondary">
            {canEmail ? `Destinataire : ${email}` : email}
          </p>
        )}

        {/* Pas d'adresse au dossier : le papier est déjà proposé au-dessus, et
            l'adresse se saisit ici en un champ — pas dans la fiche patient. */}
        {patient && !email && (
          <NoEmailBlock
            patientId={patient.id}
            patientName={patient.name}
            canUpdatePatient={canUpdatePatient}
            onSaved={(value) => setEmail(value)}
          />
        )}

        {!patient && (
          <Alert tone="neutral" title="Ordonnance non rattachée">
            Aucun patient n&apos;est rattaché à cette délivrance : le plan ne peut être
            qu&apos;imprimé ou montré par QR code. Rattachez un patient pour l&apos;envoyer et
            le retrouver plus tard dans son historique.
          </Alert>
        )}

        {patient && email && canSend && messaging.configured && !consentGranted && (
          <Alert tone="warning" title="Consentement manquant">
            {patient.name} n&apos;a pas encore accepté de recevoir ses conseils par e-mail. Le
            refus d&apos;envoi est appliqué côté serveur.
            {canUpdateConsent && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={grantAdviceConsent}
                  className="font-medium underline underline-offset-2"
                >
                  Le patient vient de l&apos;accepter au comptoir
                </button>
              </>
            )}
          </Alert>
        )}

        {/* Intégration absente : un état produit, discret, sans jargon. */}
        {Boolean(email) && canSend && !messaging.configured && (
          <p className="text-center text-[12px] text-text-tertiary">
            Envoi par e-mail non activé sur cette officine.
          </p>
        )}

        {emailResult && (
          <p className="text-[11.5px] leading-4 text-warning-700 dark:text-warning-500">
            {emailResult}
          </p>
        )}

        <div className="space-y-2 border-t border-border-subtle pt-4">
          <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">
            Autres remises
          </p>
          <div className="grid gap-2">
            {canEmail && (
              <Button
                variant="outline"
                className="w-full"
                onClick={print}
                leadingIcon={<Printer className="size-4" />}
              >
                Imprimer le PDF A4
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => undefined);
                setCopied(true);
                deliver("LINK");
                setTimeout(() => setCopied(false), 2500);
              }}
              leadingIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            >
              {copied ? "Lien copié" : "Copier le lien sécurisé"}
            </Button>
          </div>
        </div>

        <details className="group">
          <summary className="cursor-pointer list-none text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary">
            <span className="flex items-center gap-1.5">
              <QrCodeIcon className="size-3.5" />
              Montrer le QR code au patient
            </span>
          </summary>
          <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-white p-4 dark:bg-ink-100">
            <QrCode value={url} size={168} />
            <p className="text-center text-[11.5px] leading-4 text-ink-500">
              Le patient scanne ce code pour retrouver son plan sur son téléphone.
            </p>
            <Button variant="ghost" size="sm" onClick={() => deliver("QR_CODE")}>
              Noter « QR code montré »
            </Button>
          </div>
        </details>

        {deliveries.length > 0 && (
          <div className="space-y-1.5 border-t border-border-subtle pt-4">
            <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">
              Historique de remise
            </p>
            <ul className="space-y-1">
              {deliveries.map((delivery) => (
                <li
                  key={delivery.id}
                  className="flex flex-wrap items-center gap-x-2 text-[12px] text-text-secondary"
                >
                  <Badge
                    tone={
                      delivery.status === "SENT"
                        ? "success"
                        : delivery.status === "FAILED"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {CHANNEL_LABELS[delivery.channel] ?? delivery.channel}
                  </Badge>
                  <span className="text-text-tertiary">
                    {formatDateTime(delivery.createdAt)}
                  </span>
                  {/* Un échec et une simulation ne se ressemblent pas : dans un
                      cas le prestataire a refusé, dans l'autre il n'y en a
                      aucun. Les confondre empêcherait de corriger. */}
                  {delivery.status === "FAILED" && (
                    <span className="w-full text-[11px] text-danger-700 dark:text-danger-400">
                      Échec — aucun message n&apos;est parti.
                      {delivery.detail ? ` ${delivery.detail}` : ""}
                    </span>
                  )}
                  {delivery.status === "SIMULATED" && (
                    <span className="w-full text-[11px] text-warning-700 dark:text-warning-500">
                      Non transmis — {delivery.detail ?? "aucun service configuré"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Saisie de l'adresse manquante, au comptoir, en un champ et un bouton. */
function NoEmailBlock({
  patientId,
  patientName,
  canUpdatePatient,
  onSaved,
}: {
  patientId: string;
  patientName: string;
  canUpdatePatient: boolean;
  onSaved: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await setPatientEmailAction({ patientId, email: value });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.data.email);
      push({ tone: "success", title: result.message ?? "Adresse enregistrée." });
      setOpen(false);
    });
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-sunken/60 px-4 py-3.5">
      <p className="text-[13px] leading-5 text-text-secondary">
        {patientName} n&apos;a pas d&apos;adresse e-mail au dossier — le plan s&apos;imprime.
      </p>

      {canUpdatePatient && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 text-[13px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400"
        >
          Ajouter son adresse maintenant
        </button>
      )}

      {open && (
        <div className="mt-3 space-y-2.5">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Adresse e-mail du patient" htmlFor="patient-email">
            <Input
              id="patient-email"
              type="email"
              value={value}
              autoFocus
              placeholder="prenom.nom@exemple.fr"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={submit} disabled={!value}>
              Enregistrer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
          <p className="text-[11.5px] leading-4 text-text-tertiary">
            Enregistrée dans la fiche patient : elle servira aussi aux rappels de traitement.
          </p>
        </div>
      )}
    </div>
  );
}

function SalePanel({
  prescriptionId,
  patientId,
  recommendations,
  existingSales,
}: {
  prescriptionId: string;
  patientId: string | null;
  recommendations: AcceptedRecommendation[];
  existingSales: { id: string; reference: string; attributedCents: number }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const purchasable = recommendations.filter((r) => r.status !== "PURCHASED");
  const total = [...selected].reduce((sum, id) => {
    const recommendation = recommendations.find((r) => r.id === id);
    if (!recommendation) return sum;
    return sum + recommendation.unitPriceCents * (quantities[id] ?? 1);
  }, 0);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    const lines = [...selected]
      .map((id) => {
        const recommendation = recommendations.find((r) => r.id === id);
        if (!recommendation?.productId) return null;
        return {
          productId: recommendation.productId,
          recommendationId: recommendation.id,
          quantity: quantities[id] ?? 1,
          unitPriceCents: recommendation.unitPriceCents,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

    if (lines.length === 0) return;

    const declined = purchasable
      .filter((r) => !selected.has(r.id))
      .map((r) => r.id);

    startTransition(async () => {
      const result = await recordSaleAction({
        prescriptionId,
        patientId,
        lines,
        declinedRecommendationIds: declined,
      });

      if (result.ok) {
        push({
          tone: "success",
          title: "Vente enregistrée",
          description: `${formatCents(result.data.attributedCents)} attribués à Pharma.ai.`,
        });
        setSelected(new Set());
      } else {
        push({ tone: "error", title: result.error });
      }
    });
  };

  if (purchasable.length === 0) return null;

  return (
    <Card id="vente" className="border-accent-200 dark:border-accent-800/60">
      <CardHeader
        title="Vente non enregistrée"
        description="Ces conseils ont été acceptés mais aucune délivrance ne les porte. Cochez ce que le patient emporte."
        action={<Receipt className="size-[18px] text-accent-600 dark:text-accent-400" />}
      />
      <CardContent className="space-y-4">
        {existingSales.length > 0 && (
          <Alert tone="success" title="Vente déjà enregistrée">
            {existingSales.map((sale) => (
              <p key={sale.id}>
                {sale.reference} — {formatCents(sale.attributedCents)} attribués à Pharma.ai.
              </p>
            ))}
          </Alert>
        )}

        <ul className="space-y-2">
          {purchasable.map((recommendation) => {
            const isSelected = selected.has(recommendation.id);
            return (
              <li
                key={recommendation.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2.5 transition-colors",
                  isSelected
                    ? "border-accent-400 bg-accent-50/60 dark:bg-accent-900/20"
                    : "border-border-subtle",
                )}
              >
                <Checkbox
                  id={`sale-${recommendation.id}`}
                  checked={isSelected}
                  onChange={() => toggle(recommendation.id)}
                />
                {recommendation.imageUrl && (
                  <Image
                    src={recommendation.imageUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 shrink-0 rounded-md object-cover"
                  />
                )}
                <label
                  htmlFor={`sale-${recommendation.id}`}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <span className="block truncate text-[13px] font-medium text-text-primary">
                    {recommendation.productName}
                  </span>
                  <span className="block text-[11.5px] text-text-tertiary">
                    {formatCents(recommendation.unitPriceCents)}
                    {recommendation.stockQuantity <= 0 && " · en rupture"}
                  </span>
                </label>
                {isSelected && (
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={quantities[recommendation.id] ?? 1}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [recommendation.id]: Number(event.target.value),
                      }))
                    }
                    className="w-16 shrink-0 text-center"
                    aria-label={`Quantité pour ${recommendation.productName}`}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-baseline justify-between border-t border-border-subtle pt-3">
          <span className="text-[13px] text-text-secondary">Total de la vente</span>
          <span className="text-[18px] font-semibold tabular text-text-primary">
            {formatCents(total)}
          </span>
        </div>

        <Button
          className="w-full"
          variant="accent"
          loading={pending}
          disabled={selected.size === 0}
          onClick={submit}
          leadingIcon={<Sparkles className="size-[18px]" />}
        >
          Enregistrer la vente
        </Button>

        <p className="text-[11.5px] leading-4 text-text-tertiary">
          Les conseils non cochés seront marqués « non retenus par le patient ». C&apos;est
          ce qui permet de mesurer une conversion réelle plutôt qu&apos;un taux flatteur.
        </p>
      </CardContent>
    </Card>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  PRINT: "Imprimée",
  EMAIL: "E-mail",
  SMS: "SMS",
  QR_CODE: "QR code",
  LINK: "Lien",
};
