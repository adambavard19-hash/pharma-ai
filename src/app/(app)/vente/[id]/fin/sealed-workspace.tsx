"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Loader2, Mail, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { emailSealedDocumentAction, generateSealedDocumentAction } from "@/server/actions/sealed-documents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PatientDocument } from "@/components/document/patient-document";
import { QrCode } from "@/components/document/qr-code";
import { formatDate } from "@/lib/format";
import type { DocumentContent } from "@/core/documents/types";
import { SalePanel, type AcceptedRecommendation, type MessagingState } from "./document-workspace";

type Sealed = { documentId: string; url: string; expiresAt: string; content: DocumentContent };

/**
 * La fin de vente en mode sans patient.
 *
 * Le plan est préparé ici, scellé, et remis par QR code, impression ou
 * e-mail. Le serveur n'en garde qu'une version chiffrée dont il n'a pas la
 * clé : ce que cet écran affiche n'existe qu'ici, le temps de la remise. Une
 * page rouverte plus tard prépare un nouveau lien, l'ancien reste valable
 * pour le patient qui l'a reçu.
 */
export function SealedWorkspace({ prescriptionId, acceptedRecommendations, canSend, canRecordSale, messaging, existingSales, publicReach, previousVersions, newsOptInOffered }: {
  prescriptionId: string;
  acceptedRecommendations: AcceptedRecommendation[];
  canSend: boolean;
  canRecordSale: boolean;
  messaging: MessagingState;
  existingSales: { id: string; reference: string; attributedCents: number }[];
  publicReach: "PUBLIC" | "LAN" | "LOCAL";
  previousVersions: number;
  /** L'e-mail du plan propose au patient, en option, de recevoir les nouveautés de la pharmacie. */
  newsOptInOffered: boolean;
}) {
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sent" | "simulated">("idle");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [sending, startSend] = useTransition();
  const tried = useRef(false);
  const { push } = useToast();

  const generate = (withNote: boolean) =>
    start(async () => {
      const result = await generateSealedDocumentAction({ prescriptionId, pharmacistNote: withNote && note ? note : null });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setSealed(result.data);
      setEmailState("idle");
    });

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    if (!sealed) return;
    startSend(async () => {
      const result = await emailSealedDocumentAction({ documentId: sealed.documentId, url: sealed.url, to: email, content: sealed.content });
      if (!result.ok) return push({ tone: "error", title: result.error });
      setEmailState(result.data.status === "SENT" ? "sent" : "simulated");
      setEmail("");
      push({ tone: result.data.status === "SENT" ? "success" : "warning", title: result.message ?? "Envoyé" });
    });
  };

  const print = () => {
    if (!sealed) return;
    const [base, key] = sealed.url.split("#");
    window.open(`${base}?imprimer=1#${key}`, "_blank", "noopener");
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        {sealed ? (
          <Card className="overflow-hidden">
            <CardHeader
              className="no-print"
              title="Plan de prise"
              description={`Valable jusqu'au ${formatDate(sealed.expiresAt)} · chiffré, la clé n'est que dans le lien`}
              action={<Badge tone="success">Prêt</Badge>}
            />
            <CardContent className="bg-white p-5 sm:p-8">
              <PatientDocument content={sealed.content} qrUrl={sealed.url} />
            </CardContent>
          </Card>
        ) : (
          <Card className="no-print">
            <CardContent className="flex items-center gap-3 py-10">
              <Loader2 className="size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
              <div>
                <p className="text-[14px] font-medium text-text-primary">Préparation du plan…</p>
                <p className="text-[12.5px] text-text-secondary">À partir des posologies confirmées et des conseils acceptés.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="no-print space-y-5">
        {sealed && (
          <Card>
            <CardHeader title="Remettre au patient" description="QR code, e-mail ou papier. Rien n'est conservé sur le patient : ni nom, ni adresse." />
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-white p-4">
                <QrCode value={sealed.url} size={220} label="QR code du plan" />
                <p className="text-center text-[12px] leading-4 text-[#4b5563]">Le patient scanne : son plan s&apos;ouvre, avec un bouton pour mettre les rappels de prise dans son agenda.</p>
                {publicReach === "LOCAL" && (
                  <Alert tone="warning" title="Ce QR code ne fonctionnera pas depuis un téléphone">
                    L&apos;adresse de l&apos;application est locale. Renseignez <code className="font-mono text-[11.5px]">PUBLIC_APP_URL</code>.
                  </Alert>
                )}
              </div>

              <p className="text-center">
                <a href={sealed.url} target="_blank" rel="noopener" className="text-[12.5px] font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Voir le plan comme le patient</a>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" className="w-full" onClick={print} leadingIcon={<Printer className="size-[18px]" />}>Imprimer</Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  leadingIcon={copied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}
                  onClick={async () => {
                    await navigator.clipboard.writeText(sealed.url).catch(() => undefined);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  }}
                >
                  {copied ? "Lien copié" : "Copier le lien"}
                </Button>
              </div>

              {canSend && (
                <div className="space-y-2 border-t border-border-subtle pt-4">
                  <p className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Par e-mail, si le patient le demande</p>
                  {messaging.configured ? (
                    <div className="flex gap-2">
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adresse donnée au comptoir" aria-label="Adresse e-mail du patient" onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) send(); }} />
                      <Button loading={sending} disabled={!email.includes("@")} onClick={send} leadingIcon={emailState === "sent" ? <Check className="size-4" /> : <Mail className="size-4" />}>
                        Envoyer
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-text-secondary">L&apos;envoi par e-mail n&apos;est pas activé sur cette officine.</p>
                  )}
                  <AddressNotice newsOptInOffered={newsOptInOffered} />
                  {emailState === "simulated" && <p className="text-[11.5px] text-warning-700 dark:text-warning-500">Envoi simulé : aucun e-mail n&apos;est parti.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {sealed && (
          <Card>
            <CardHeader title="Refaire le plan" description={previousVersions > 0 ? `${previousVersions} version(s) déjà remise(s). Les anciens liens restent valables.` : "Après une correction du traitement ou des conseils."} />
            <CardContent className="space-y-3">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mot du pharmacien (facultatif)" aria-label="Mot du pharmacien" />
              <Button variant="outline" className="w-full" loading={pending} onClick={() => generate(true)} leadingIcon={<RefreshCw className="size-4" />}>Nouveau plan, nouveau lien</Button>
            </CardContent>
          </Card>
        )}

        {canRecordSale && existingSales.length === 0 && <SalePanel prescriptionId={prescriptionId} patientId={null} recommendations={acceptedRecommendations} existingSales={existingSales} />}
      </div>
    </div>
  );
}

/**
 * Ce que le comptoir doit savoir de l'adresse saisie. L'envoi du plan ne
 * l'enregistre pas ; l'abonnement aux nouveautés, quand il est proposé, est un
 * acte à part du patient : il ne se fait que par son clic sur le lien du message.
 */
export function AddressNotice({ newsOptInOffered }: { newsOptInOffered: boolean }) {
  return (
    <div className="space-y-1.5 text-[11.5px] leading-4 text-text-tertiary">
      <p className="flex items-start gap-1.5">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        L&apos;adresse sert à cet envoi et n&apos;est pas enregistrée. L&apos;e-mail ne contient aucun nom de médicament : seulement le lien et le nombre de prises par moment.
      </p>
      {newsOptInOffered && (
        <p className="pl-5">
          Le message propose aussi au patient, en option, de recevoir les nouveautés de la pharmacie. C&apos;est son choix, à part de cet envoi : son adresse n&apos;est conservée que s&apos;il clique sur ce lien et confirme.
        </p>
      )}
    </div>
  );
}
