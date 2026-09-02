"use client";

import { useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import {
  Check,
  Copy,
  FileText,
  Mail,
  Printer,
  QrCode as QrCodeIcon,
  Receipt,
  Sparkles,
} from "lucide-react";
import { deliverDocumentAction, generateDocumentAction } from "@/server/actions/documents";
import { updateConsentAction } from "@/server/actions/patients";
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

/**
 * État réel du service d'envoi, tel que le registre le rapporte. L'écran ne
 * décide de rien : il répète ce qui est branché, ou ce qui manque.
 */
export type MessagingState = {
  configured: boolean;
  label: string;
  description: string;
};

export function DocumentWorkspace({
  prescriptionId,
  patient,
  acceptedRecommendations,
  existingDocument,
  canSend,
  canRecordSale,
  outdated,
  canUpdateConsent,
  messaging,
  existingSales,
  aside,
}: {
  prescriptionId: string;
  patient: {
    id: string;
    name: string;
    email: string | null;
    hasAdviceConsent: boolean;
  } | null;
  canUpdateConsent: boolean;
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
  /** Les conseils retenus ont changé depuis la publication de la fiche. */
  outdated: boolean;
  messaging: MessagingState;
  existingSales: { id: string; reference: string; attributedCents: number }[];
  /** Ce qui vient après la remise — le rappel — dans la même colonne. */
  aside?: ReactNode;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const generate = () => {
    startTransition(async () => {
      const result = await generateDocumentAction({
        prescriptionId,
        pharmacistNote: note || undefined,
      });
      push({
        tone: result.ok ? "success" : "error",
        title: result.ok ? (result.message ?? "Fiche générée") : result.error,
      });
    });
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        {existingDocument ? (
          <Card className="overflow-hidden">
            <CardHeader
              title={`Fiche patient — version ${existingDocument.version}`}
              description={`Générée le ${formatDateTime(existingDocument.createdAt)} · ${
                existingDocument.viewCount === 0
                  ? "jamais consultée"
                  : `${existingDocument.viewCount} consultation(s)`
              }`}
              action={<Badge tone="success">Publiée</Badge>}
            />
            <CardContent className="bg-white p-6 sm:p-8 dark:bg-ink-900">
              <PatientDocument content={existingDocument.content} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title="Générer la fiche patient"
              description="Un document clair reprenant le traitement et les conseils que vous avez validés."
            />
            <CardContent className="space-y-4">
              <Alert tone="info" title="Ce document est un instantané">
                Une fois générée, la fiche ne change plus, même si un prix ou un stock évolue.
                Le patient conserve exactement ce qui lui a été présenté.
              </Alert>

              <Field
                label="Mot du pharmacien (facultatif)"
                htmlFor="pharmacistNote"
                hint="Affiché en tête de la section conseils, sous forme de message personnel."
              >
                <Textarea
                  id="pharmacistNote"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="N'hésitez pas à revenir me voir si vous avez la moindre question."
                />
              </Field>

              <div className="rounded-lg border border-border-subtle p-4">
                <p className="text-[12.5px] font-medium text-text-primary">
                  Conseils qui figureront sur la fiche
                </p>
                {acceptedRecommendations.length === 0 ? (
                  <p className="mt-1 text-[12.5px] text-text-tertiary">
                    Aucun conseil validé — la fiche ne contiendra que le rappel du traitement.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {acceptedRecommendations.map((recommendation) => (
                      <li
                        key={recommendation.id}
                        className="flex items-center gap-2 text-[13px] text-text-secondary"
                      >
                        <Check className="size-3.5 shrink-0 text-success-600 dark:text-success-500" />
                        {recommendation.productName}
                        <span className="ml-auto tabular">
                          {formatCents(recommendation.unitPriceCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button
                size="lg"
                className="w-full"
                loading={pending}
                onClick={generate}
                leadingIcon={<FileText className="size-[18px]" />}
              >
                Générer la fiche patient
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        {existingDocument && (
          <DeliveryPanel
            documentId={existingDocument.id}
            url={existingDocument.url}
            patient={patient}
            canSend={canSend}
            canUpdateConsent={canUpdateConsent}
            messaging={messaging}
            deliveries={existingDocument.deliveries}
          />
        )}

        {/* Le rappel se décide juste après la remise, dans la même colonne et
            sans faire défiler : c'est le moment où le pharmacien pense encore à
            ce patient. Sous la fiche, à deux écrans de là, il n'était proposé
            qu'à ceux qui pensaient à descendre. Il s'affiche même sans fiche
            publiée : un rappel ne dépend pas d'un document. */}
        {aside}

        {existingDocument && (
          <>
            {/* La fiche est préparée à la validation, sans mot du pharmacien :
                il n'y a personne pour l'écrire au moment où le patient attend.
                C'est ici qu'il s'ajoute — et c'est aussi ici qu'on répare une
                fiche devenue incomplète. */}
            <Card
              className={cn(
                outdated && "border-warning-400 dark:border-warning-700/60",
              )}
            >
              <CardHeader
                title={outdated ? "Fiche à regénérer" : "Ajouter un mot, ou regénérer"}
                description={
                  outdated
                    ? "Les conseils retenus ont changé depuis la publication de cette fiche."
                    : "La fiche publiée ne change plus. Un mot personnel, ou un conseil ajouté depuis, demande une nouvelle version."
                }
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
                  variant={outdated ? "primary" : "outline"}
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

        {canRecordSale && (
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
  messaging,
  deliveries,
}: {
  documentId: string;
  url: string;
  patient: {
    id: string;
    name: string;
    email: string | null;
    hasAdviceConsent: boolean;
  } | null;
  canUpdateConsent: boolean;
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
  const [consentGranted, setConsentGranted] = useState(patient?.hasAdviceConsent ?? false);
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  // Le consentement se recueille au comptoir, oralement. Le consigner ici évite
  // au pharmacien d'aller le chercher dans la fiche patient — mais il reste une
  // déclaration horodatée et révocable, pas une case cochée d'avance.
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
        if (channel === "EMAIL") setEmailResult(result.data.detail);
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

  return (
    <Card>
      <CardHeader
        title="Remettre la fiche"
        description="Imprimez, montrez le QR code ou copiez le lien sécurisé."
      />
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-white p-4 dark:bg-ink-100">
          <QrCode value={url} size={168} />
          <p className="text-center text-[11.5px] leading-4 text-ink-500">
            Le patient scanne ce code pour retrouver sa fiche sur son téléphone.
          </p>
        </div>

        <div className="grid gap-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              deliver("PRINT");
              window.print();
            }}
            leadingIcon={<Printer className="size-4" />}
          >
            Imprimer
          </Button>

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

          <Button
            variant="outline"
            className="w-full"
            onClick={() => deliver("QR_CODE")}
            leadingIcon={<QrCodeIcon className="size-4" />}
          >
            Noter « QR code montré au patient »
          </Button>
        </div>

        {canSend && (
          <div className="space-y-2 border-t border-border-subtle pt-4">
            {messaging.configured ? (
              <p className="text-[11.5px] text-text-tertiary">
                Envoi assuré par {messaging.label}.
              </p>
            ) : (
              <Alert tone="warning" title={messaging.label}>
                {messaging.description}
              </Alert>
            )}

            {patient && !consentGranted && (
              <Alert tone="danger" title="Consentement manquant">
                {patient.name} n&apos;a pas consenti à recevoir sa fiche conseil. Le refus
                d&apos;envoi est appliqué côté serveur : la fiche reste imprimable ou
                consultable par QR code.
                {canUpdateConsent && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => grantAdviceConsent()}
                      className="font-medium underline underline-offset-2"
                    >
                      Le patient vient de l&apos;accepter au comptoir
                    </button>
                  </>
                )}
              </Alert>
            )}

            <Button
              variant="outline"
              className="w-full"
              loading={pending}
              disabled={!patient?.email || !consentGranted}
              onClick={() => deliver("EMAIL", patient?.email ?? undefined)}
              leadingIcon={<Mail className="size-4" />}
            >
              {patient?.email
                ? `Envoyer à ${patient.email}`
                : "Aucune adresse e-mail renseignée"}
            </Button>

            {emailResult && (
              <p className="text-[11.5px] leading-4 text-warning-700 dark:text-warning-500">
                {emailResult}
              </p>
            )}
          </div>
        )}

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

  return (
    <Card id="vente" className="border-accent-200 dark:border-accent-800/60">
      <CardHeader
        title="Enregistrer la vente"
        description="Cochez ce que le patient a effectivement acheté. Le reste est marqué comme non retenu."
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

        {purchasable.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">
            Aucun conseil en attente d&apos;achat.
          </p>
        ) : (
          <>
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
          </>
        )}
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
